/**
 * Connection pool management for TimescaleDB client
 * 
 * Provides advanced connection pooling with metrics, health monitoring,
 * retry logic, and graceful shutdown capabilities.
 */



import type { ConnectionConfig, ClientOptions, Logger } from '../types/config.ts'
import type { SqlInstance, ConnectionState, RetryConfig } from '../types/internal.ts'
import {
  ConnectionError,
  TimeoutError,
  ErrorUtils
} from '../types/errors.ts'
import { DatabaseConnection } from './connection.ts'

/**
 * Pool statistics for monitoring
 */
interface PoolStats {
  readonly total: number
  readonly active: number
  readonly idle: number
  readonly waiting: number
  readonly totalConnections: number
  readonly totalQueries: number
  readonly averageQueryTime: number
  readonly errorCount: number
}

/**
 * Pool configuration interface
 */
interface PoolConfig {
  readonly maxConnections: number
  readonly maxLifetime?: number | null
  readonly idleTimeout: number
  readonly connectTimeout: number
  readonly acquireTimeout: number
  readonly retryConfig: RetryConfig
}

/**
 * Connection pool manager with advanced features
 *
 * Wraps postgres.js connection pooling with additional capabilities:
 * - Dynamic password rotation
 * - Advanced metrics collection
 * - Retry logic with exponential backoff
 * - Health monitoring
 * - Graceful shutdown
 *
 * @public
 */
export class ConnectionPool {
  private connection: DatabaseConnection | null = null
  private sql: SqlInstance | null = null
  private readonly config: PoolConfig
  private connectionConfig: ConnectionConfig
  private readonly logger?: Logger | undefined
  
  // Pool state tracking
  private totalQueries = 0
  private totalErrors = 0
  private queryTimes: number[] = []
  private isShuttingDown = false
  private connectionPromise: Promise<SqlInstance> | null = null

  /**
   * Create a new ConnectionPool instance
   *
   * @param connectionConfig Database connection configuration
   * @param clientOptions Client options for pool behavior (optional)
   * @param logger Optional logger for debugging and monitoring
   */
  constructor(
    connectionConfig: ConnectionConfig,
    logger?: Logger | undefined,
    clientOptions: ClientOptions = {}
  ) {
    this.connectionConfig = { ...connectionConfig }
    this.logger = logger
    this.config = this.buildPoolConfig(connectionConfig, clientOptions)
  }

  /**
   * Get or create SQL instance with connection pooling
   *
   * @returns Promise that resolves to a SQL instance for executing queries
   * @throws ConnectionError if the pool is shutting down or connection fails
   */
  async acquire(): Promise<SqlInstance> {
    if (this.isShuttingDown) {
      throw new ConnectionError('Connection pool is shutting down')
    }

    // Return existing connection if available
    if (this.sql) {
      return this.sql
    }

    // Use existing connection promise if one is in progress
    if (this.connectionPromise) {
      return await this.connectionPromise
    }

    // Create new connection with retry logic
    this.connectionPromise = this.createConnectionWithRetry()
    
    try {
      this.sql = await this.connectionPromise
      return this.sql
    } finally {
      this.connectionPromise = null
    }
  }

  /**
   * Execute a query with automatic connection management and metrics
   *
   * @param queryFn Function that receives a SQL instance and returns a promise
   * @returns Promise that resolves to the query result
   * @throws Any error thrown by the query function
   */
  async query<T = Record<string, unknown>>(
    queryFn: (sql: SqlInstance) => Promise<T>
  ): Promise<T> {
    const startTime = Date.now()
    let sql: SqlInstance | null = null

    try {
      sql = await this.acquire()
      const result = await queryFn(sql)
      
      // Record successful query metrics
      const duration = Date.now() - startTime
      this.recordQueryMetrics(duration, false)
      
      return result
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime
      this.recordQueryMetrics(duration, true)
      
      this.logger?.error('Query execution failed', error instanceof Error ? error : new Error(String(error)), {
        duration,
        totalQueries: this.totalQueries
      })

      throw error
    }
  }

  /**
   * Execute a query with timeout and retry logic
   *
   * @param queryFn Function that receives a SQL instance and returns a promise
   * @param timeoutMs Optional timeout in milliseconds (defaults to configured timeout)
   * @returns Promise that resolves to the query result
   * @throws TimeoutError if query exceeds timeout
   * @throws ConnectionError if all retry attempts are exhausted
   */
  async queryWithRetry<T = Record<string, unknown>>(
    queryFn: (sql: SqlInstance) => Promise<T>,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs || this.config.acquireTimeout
    const retryConfig = this.config.retryConfig

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new TimeoutError(
              `Query timed out after ${timeout}ms`,
              timeout,
              'query_execution'
            ))
          }, timeout)
        })

        // Race between query and timeout
        return await Promise.race([
          this.query(queryFn),
          timeoutPromise
        ])
      } catch (error) {
        const isLastAttempt = attempt === retryConfig.maxRetries
        
        if (isLastAttempt || !ErrorUtils.isRetryableError(error)) {
          throw error
        }

        // Calculate retry delay with exponential backoff
        const delay = this.calculateRetryDelay(attempt, retryConfig)
        this.logger?.warn(`Query attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries
        })

        await this.sleep(delay)
      }
    }

    throw new ConnectionError('All retry attempts exhausted')
  }

  /**
   * Get current pool statistics
   *
   * @returns Object containing pool statistics including total, active, idle connections and retry count
   */
  getStats(): PoolStats {
    const avgQueryTime = this.queryTimes.length > 0
      ? this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length
      : 0

    return {
      total: this.config.maxConnections,
      active: this.sql ? 1 : 0,
      idle: this.sql ? this.config.maxConnections - 1 : this.config.maxConnections,
      waiting: 0, // postgres.js handles this internally
      totalConnections: this.sql ? 1 : 0,
      totalQueries: this.totalQueries,
      averageQueryTime: avgQueryTime,
      errorCount: this.totalErrors
    }
  }

  /**
   * Get current connection state
   *
   * @returns Current connection state indicating pool status
   */
  getConnectionState(): ConnectionState {
    const stats = this.getStats()
    
    return {
      isConnected: this.sql !== null,
      activeQueries: 0, // postgres.js tracks this internally
      poolStats: {
        total: stats.total,
        idle: stats.idle,
        active: stats.active,
        waiting: stats.waiting
      }
    }
  }

  /**
   * Test connection health
   *
   * @returns Promise that resolves to true if connection is healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.sql) {
        return false
      }

      await this.sql`SELECT 1 as health_check`
      return true
    } catch (error) {
      this.logger?.error('Health check failed', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  /**
   * Refresh connection with new password (for password rotation)
   *
   * @param newPassword Optional new password for password rotation
   * @returns Promise that resolves when connection is refreshed
   * @throws ConnectionError if connection refresh fails
   */
  async refreshConnection(newPassword?: string): Promise<void> {
    this.logger?.info('Refreshing database connection')

    try {
      // Close existing connection
      await this.close()

      // Update password if provided
      if (newPassword) {
        this.connectionConfig = {
          ...this.connectionConfig,
          password: newPassword
        }
      }

      // Re-establish connection
      await this.acquire()
      
      this.logger?.info('Database connection refreshed successfully')
    } catch (error) {
      this.logger?.error('Failed to refresh connection', error instanceof Error ? error : new Error(String(error)))
      throw new ConnectionError(
        'Failed to refresh database connection',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Gracefully shutdown the connection pool
   *
   * @param timeoutMs Timeout in milliseconds for shutdown process (default: 30000)
   * @returns Promise that resolves when shutdown is complete
   * @throws Error if shutdown times out or fails
   */
  async shutdown(timeoutMs = 30000): Promise<void> {
    if (this.isShuttingDown) {
      return
    }

    this.isShuttingDown = true
    this.logger?.info('Initiating connection pool shutdown')

    try {
      // Wait for any pending connection attempts to complete
      if (this.connectionPromise) {
        await Promise.race([
          this.connectionPromise,
          this.sleep(timeoutMs)
        ])
      }

      // Close the connection
      await this.close()
      
      this.logger?.info('Connection pool shutdown completed')
    } catch (error) {
      this.logger?.error('Error during shutdown', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Close the current connection
   */
  private async close(): Promise<void> {
    if (this.connection) {
      await this.connection.disconnect()
      this.connection = null
    }
    this.sql = null
  }

  /**
   * Create connection with retry logic
   */
  private async createConnectionWithRetry(): Promise<SqlInstance> {
    const retryConfig = this.config.retryConfig

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        this.connection = new DatabaseConnection(this.connectionConfig, this.logger)
        return await this.connection.connect()
      } catch (error) {
        const isLastAttempt = attempt === retryConfig.maxRetries
        
        if (isLastAttempt || !ErrorUtils.isRetryableError(error)) {
          throw error
        }

        // Calculate retry delay
        const delay = this.calculateRetryDelay(attempt, retryConfig)
        this.logger?.warn(`Connection attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries
        })

        await this.sleep(delay)
      }
    }

    throw new ConnectionError('All connection attempts failed')
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt)
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay)
    
    if (config.useJitter) {
      // Add random jitter (±25%)
      const jitter = cappedDelay * 0.25 * (Math.random() - 0.5)
      return Math.max(0, cappedDelay + jitter)
    }
    
    return cappedDelay
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(duration: number, isError: boolean): void {
    this.totalQueries++
    
    if (isError) {
      this.totalErrors++
    }

    // Keep rolling window of query times (last 100)
    this.queryTimes.push(duration)
    if (this.queryTimes.length > 100) {
      this.queryTimes.shift()
    }
  }

  /**
   * Build pool configuration from connection and client options
   */
  private buildPoolConfig(
    connectionConfig: ConnectionConfig,
    clientOptions: ClientOptions
  ): PoolConfig {
    const maxLifetime = connectionConfig.maxLifetime
    return {
      maxConnections: connectionConfig.maxConnections || 10,
      idleTimeout: connectionConfig.idleTimeout || 0,
      connectTimeout: connectionConfig.connectTimeout || 30,
      acquireTimeout: clientOptions.queryTimeout || 30000,
      retryConfig: {
        maxRetries: clientOptions.maxRetries || 3,
        baseDelay: clientOptions.retryBaseDelay || 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        useJitter: true
      },
      ...(maxLifetime !== undefined && { maxLifetime })
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Factory function for creating connection pools
 */
export function createConnectionPool(
  connectionConfig: ConnectionConfig,
  logger?: Logger,
  clientOptions: ClientOptions = {}
): ConnectionPool {
  return new ConnectionPool(connectionConfig, logger, clientOptions)
}