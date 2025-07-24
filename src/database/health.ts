/**
 * Health monitoring system for TimescaleDB client
 * 
 * Provides comprehensive health checks, monitoring, and alerting
 * for database connections, schema validation, and performance metrics.
 */

import type { ClientOptions, Logger } from '../types/config.ts'
import type {
  SqlInstance,
  SchemaValidationResult,
  ConnectionHealthMetrics
} from '../types/internal.ts'
import {
  SchemaError,
  TimeoutError
} from '../types/errors.ts'
import { ConnectionPool } from './pool.ts'

/**
 * Health check configuration
 */
interface HealthCheckConfig {
  readonly enabled: boolean
  readonly intervalMs: number
  readonly timeoutMs: number
  readonly failureThreshold: number
  readonly warningThreshold: number
  readonly checkTimescaleDB: boolean
  readonly checkSchema: boolean
  readonly checkPerformance: boolean
}

/**
 * Health check result
 */
interface HealthCheckResult {
  readonly timestamp: Date
  readonly isHealthy: boolean
  readonly score: number // 0-100
  readonly checks: {
    readonly connection: boolean
    readonly timescaleDB: boolean
    readonly schema: boolean
    readonly performance: boolean
  }
  readonly metrics: ConnectionHealthMetrics
  readonly warnings: string[]
  readonly errors: string[]
}

/**
 * Performance thresholds
 */
interface PerformanceThresholds {
  readonly maxQueryTimeMs: number
  readonly maxConnectionTimeMs: number
  readonly minThroughputQps: number
  readonly maxErrorRatePercent: number
}

/**
 * Alert configuration
 */
interface AlertConfig {
  readonly enabled: boolean
  readonly onHealthChange?: (isHealthy: boolean, result: HealthCheckResult) => void
  readonly onError?: (error: Error, context: string) => void
  readonly onWarning?: (warning: string, context: string) => void
  readonly onPerformanceIssue?: (metric: string, value: number, threshold: number) => void
}

/**
 * Comprehensive health monitoring for TimescaleDB connections
 *
 * @public
 */
export class HealthChecker {
  private readonly pool: ConnectionPool
  private readonly config: HealthCheckConfig
  private readonly performanceThresholds: PerformanceThresholds
  private readonly alertConfig: AlertConfig
  private readonly logger?: Logger | undefined

  // State tracking
  private intervalHandle: number | null = null
  private lastHealthCheck: Date | null = null
  private consecutiveFailures = 0
  private isCurrentlyHealthy = true
  private healthHistory: HealthCheckResult[] = []

  /**
   * Create a new HealthChecker instance
   *
   * @param pool Connection pool to monitor
   * @param clientOptions Client options for health check configuration (optional)
   * @param alertConfig Alert configuration for health change notifications (optional)
   * @param logger Optional logger for debugging and monitoring
   */
  constructor(
    pool: ConnectionPool,
    logger?: Logger | undefined,
    clientOptions: ClientOptions = {},
    alertConfig: AlertConfig = { enabled: false }
  ) {
    this.pool = pool
    this.logger = logger
    this.alertConfig = alertConfig
    this.config = this.buildHealthCheckConfig(clientOptions)
    this.performanceThresholds = this.buildPerformanceThresholds(clientOptions)
  }

  /**
   * Start automated health monitoring
   *
   * @returns void
   */
  start(): void {
    if (this.intervalHandle !== null) {
      this.logger?.warn('Health monitoring is already started')
      return
    }

    if (!this.config.enabled) {
      this.logger?.info('Health monitoring is disabled')
      return
    }

    this.logger?.info('Starting health monitoring', {
      interval: this.config.intervalMs,
      timeout: this.config.timeoutMs
    })

    this.intervalHandle = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.logger?.error('Health check failed', error instanceof Error ? error : new Error(String(error)))
      })
    }, this.config.intervalMs)

    // Perform initial health check
    this.performHealthCheck().catch(error => {
      this.logger?.error('Initial health check failed', error instanceof Error ? error : new Error(String(error)))
    })
  }

  /**
   * Stop automated health monitoring
   *
   * @returns void
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
      this.logger?.info('Health monitoring stopped')
    }
  }

  /**
   * Perform a comprehensive health check
   *
   * @returns Promise that resolves to comprehensive health check results
   * @throws TimeoutError if health check exceeds timeout
   * @throws SchemaError if schema validation fails
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now()
    const timestamp = new Date()

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(
            `Health check timed out after ${this.config.timeoutMs}ms`,
            this.config.timeoutMs,
            'health_check'
          ))
        }, this.config.timeoutMs)
      })

      // Race health check against timeout
      const result = await Promise.race([
        this.runHealthChecks(timestamp),
        timeoutPromise
      ])

      // Update state
      this.updateHealthState(result)
      this.recordHealthResult(result)

      this.logger?.debug('Health check completed', {
        duration: Date.now() - startTime,
        score: result.score,
        isHealthy: result.isHealthy
      })

      return result
    } catch (error) {
      const errorResult = this.createErrorResult(timestamp, error)
      this.updateHealthState(errorResult)
      this.recordHealthResult(errorResult)
      
      throw error
    }
  }

  /**
   * Get the current health status
   *
   * @returns Object containing current health status, last check time, failure count, and score
   */
  getHealthStatus(): {
    isHealthy: boolean
    lastCheck: Date | null
    consecutiveFailures: number
    score: number
  } {
    const lastResult = this.healthHistory[this.healthHistory.length - 1]
    
    return {
      isHealthy: this.isCurrentlyHealthy,
      lastCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures,
      score: lastResult?.score || 0
    }
  }

  /**
   * Get health check history
   *
   * @param limit Maximum number of historical results to return (default: 10)
   * @returns Array of historical health check results
   */
  getHealthHistory(limit = 10): HealthCheckResult[] {
    return this.healthHistory.slice(-limit)
  }

  /**
   * Validate TimescaleDB extension and version
   *
   * @param sql SQL instance to use for validation queries
   * @returns Promise that resolves to validation result with extension info and warnings
   * @throws SchemaError if TimescaleDB validation fails
   */
  async validateTimescaleDB(sql: SqlInstance): Promise<{
    isValid: boolean
    version?: string
    extensions: string[]
    warnings: string[]
  }> {
    const warnings: string[] = []
    const extensions: string[] = []

    try {
      // Check installed extensions
      const extensionResult = await sql`
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname IN ('timescaledb', 'postgis', 'pg_stat_statements')
      `

      for (const ext of extensionResult) {
        extensions.push(`${ext.extname}@${ext.extversion}`)
      }

      // Check if TimescaleDB is installed
      const timescaleExt = extensionResult.find(ext => ext.extname === 'timescaledb')
      if (!timescaleExt) {
        return {
          isValid: false,
          extensions,
          warnings: ['TimescaleDB extension is not installed']
        }
      }

      // Get TimescaleDB version and settings
      const versionResult = await sql`SELECT timescaledb_version()`
      const version = versionResult[0]?.timescaledb_version as string

      // Check for recommended settings
      await this.checkTimescaleDBSettings(sql, warnings)

      return {
        isValid: true,
        version,
        extensions,
        warnings
      }
    } catch (error) {
      throw new SchemaError(
        'Failed to validate TimescaleDB extension',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  /**
   * Validate database schema and hypertables
   *
   * @param sql SQL instance to use for schema validation queries
   * @returns Promise that resolves to schema validation result with missing components and warnings
   * @throws SchemaError if schema validation fails
   */
  async validateSchema(sql: SqlInstance): Promise<SchemaValidationResult> {
    try {
      const missingTables: string[] = []
      const missingIndexes: string[] = []
      const nonHypertables: string[] = []
      const warnings: string[] = []

      // Expected tables
      const expectedTables = ['price_ticks', 'ohlc_data']
      
      // Check if tables exist
      const tableResult = await sql`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = ANY(${expectedTables})
      `

      const existingTables = tableResult.map(row => row.tablename as string)
      missingTables.push(...expectedTables.filter(table => !existingTables.includes(table)))

      // Check hypertables
      if (existingTables.length > 0) {
        const hypertableResult = await sql`
          SELECT hypertable_name 
          FROM timescaledb_information.hypertables 
          WHERE hypertable_name = ANY(${existingTables})
        `

        const hypertables = hypertableResult.map(row => row.hypertable_name as string)
        nonHypertables.push(...existingTables.filter(table => !hypertables.includes(table)))
      }

      // Check indexes
      const expectedIndexes = [
        'ix_price_ticks_symbol_time',
        'ix_price_ticks_time',
        'ix_ohlc_data_symbol_time'
      ]

      const indexResult = await sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = ANY(${expectedIndexes})
      `

      const existingIndexes = indexResult.map(row => row.indexname as string)
      missingIndexes.push(...expectedIndexes.filter(index => !existingIndexes.includes(index)))

      // Add warnings for missing components
      if (missingTables.length > 0) {
        warnings.push(`Missing tables: ${missingTables.join(', ')}`)
      }
      if (nonHypertables.length > 0) {
        warnings.push(`Tables not converted to hypertables: ${nonHypertables.join(', ')}`)
      }
      if (missingIndexes.length > 0) {
        warnings.push(`Missing indexes: ${missingIndexes.join(', ')}`)
      }

      const isValid = missingTables.length === 0 && nonHypertables.length === 0

      return {
        isValid,
        missingTables,
        missingIndexes,
        nonHypertables,
        warnings
      }
    } catch (error) {
      throw new SchemaError(
        'Failed to validate database schema',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  /**
   * Check database performance metrics
   *
   * @param sql SQL instance to use for performance testing
   * @returns Promise that resolves to performance check result with metrics and issues
   */
  async checkPerformance(sql: SqlInstance): Promise<{
    isHealthy: boolean
    metrics: ConnectionHealthMetrics
    issues: string[]
  }> {
    const issues: string[] = []
    
    try {
      const startTime = Date.now()
      
      // Test query performance
      await sql`SELECT 1 as performance_test`
      const queryTime = Date.now() - startTime

      // Get connection stats
      const poolStats = this.pool.getStats()
      
      // Calculate metrics
      const metrics: ConnectionHealthMetrics = {
        connectionTimeMs: queryTime,
        lastQueryTime: new Date(),
        failedQueries: poolStats.errorCount,
        successfulQueries: poolStats.totalQueries - poolStats.errorCount,
        avgQueryTimeMs: poolStats.averageQueryTime,
        uptimeSeconds: 0 // Will be calculated by caller
      }

      // Check against thresholds
      if (queryTime > this.performanceThresholds.maxQueryTimeMs) {
        issues.push(`Query time ${queryTime}ms exceeds threshold ${this.performanceThresholds.maxQueryTimeMs}ms`)
      }

      if (poolStats.averageQueryTime > this.performanceThresholds.maxQueryTimeMs) {
        issues.push(`Average query time ${poolStats.averageQueryTime}ms exceeds threshold`)
      }

      const errorRate = poolStats.totalQueries > 0 
        ? (poolStats.errorCount / poolStats.totalQueries) * 100 
        : 0

      if (errorRate > this.performanceThresholds.maxErrorRatePercent) {
        issues.push(`Error rate ${errorRate.toFixed(2)}% exceeds threshold ${this.performanceThresholds.maxErrorRatePercent}%`)
      }

      return {
        isHealthy: issues.length === 0,
        metrics,
        issues
      }
    } catch (error) {
      issues.push(`Performance check failed: ${error instanceof Error ? error.message : String(error)}`)
      
      const metrics: ConnectionHealthMetrics = {
        connectionTimeMs: -1,
        lastQueryTime: new Date(),
        failedQueries: 0,
        successfulQueries: 0,
        avgQueryTimeMs: -1,
        uptimeSeconds: 0
      }

      return {
        isHealthy: false,
        metrics,
        issues
      }
    }
  }

  /**
   * Run all health checks
   */
  private async runHealthChecks(timestamp: Date): Promise<HealthCheckResult> {
    const errors: string[] = []
    const warnings: string[] = []
    const checks = {
      connection: false,
      timescaleDB: false,
      schema: false,
      performance: false
    }

    let metrics: ConnectionHealthMetrics = {
      connectionTimeMs: -1,
      lastQueryTime: timestamp,
      failedQueries: 0,
      successfulQueries: 0,
      avgQueryTimeMs: -1,
      uptimeSeconds: 0
    }

    try {
      // Basic connection check
      const isConnected = await this.pool.healthCheck()
      checks.connection = isConnected

      if (!isConnected) {
        errors.push('Database connection is not available')
      } else {
        // Get SQL instance for further checks
        const sql = await this.pool.acquire()

        // TimescaleDB validation
        if (this.config.checkTimescaleDB) {
          try {
            const timescaleResult = await this.validateTimescaleDB(sql)
            checks.timescaleDB = timescaleResult.isValid
            warnings.push(...timescaleResult.warnings)
          } catch (error) {
            errors.push(`TimescaleDB validation failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        } else {
          checks.timescaleDB = true
        }

        // Schema validation
        if (this.config.checkSchema) {
          try {
            const schemaResult = await this.validateSchema(sql)
            checks.schema = schemaResult.isValid
            warnings.push(...schemaResult.warnings)
          } catch (error) {
            errors.push(`Schema validation failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        } else {
          checks.schema = true
        }

        // Performance check
        if (this.config.checkPerformance) {
          try {
            const perfResult = await this.checkPerformance(sql)
            checks.performance = perfResult.isHealthy
            metrics = perfResult.metrics
            warnings.push(...perfResult.issues)
          } catch (error) {
            errors.push(`Performance check failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        } else {
          checks.performance = true
        }
      }
    } catch (error) {
      errors.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Calculate health score
    const score = this.calculateHealthScore(checks, errors.length, warnings.length)
    const isHealthy = score >= 70 && errors.length === 0

    return {
      timestamp,
      isHealthy,
      score,
      checks,
      metrics,
      warnings,
      errors
    }
  }

  /**
   * Calculate health score based on checks and issues
   */
  private calculateHealthScore(
    checks: Record<string, boolean>,
    errorCount: number,
    warningCount: number
  ): number {
    const checkCount = Object.keys(checks).length
    const passedChecks = Object.values(checks).filter(Boolean).length
    
    let score = (passedChecks / checkCount) * 100
    
    // Deduct points for errors and warnings
    score -= errorCount * 20
    score -= warningCount * 5
    
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Update health state and trigger alerts
   */
  private updateHealthState(result: HealthCheckResult): void {
    const wasHealthy = this.isCurrentlyHealthy
    this.lastHealthCheck = result.timestamp
    this.isCurrentlyHealthy = result.isHealthy

    if (result.isHealthy) {
      this.consecutiveFailures = 0
    } else {
      this.consecutiveFailures++
    }

    // Trigger alerts if configured
    if (this.alertConfig.enabled) {
      if (wasHealthy !== result.isHealthy && this.alertConfig.onHealthChange) {
        this.alertConfig.onHealthChange(result.isHealthy, result)
      }

      if (result.errors.length > 0 && this.alertConfig.onError) {
        for (const error of result.errors) {
          this.alertConfig.onError(new Error(error), 'health_check')
        }
      }

      if (result.warnings.length > 0 && this.alertConfig.onWarning) {
        for (const warning of result.warnings) {
          this.alertConfig.onWarning(warning, 'health_check')
        }
      }
    }
  }

  /**
   * Record health result in history
   */
  private recordHealthResult(result: HealthCheckResult): void {
    this.healthHistory.push(result)
    
    // Keep only last 100 results
    if (this.healthHistory.length > 100) {
      this.healthHistory.shift()
    }
  }

  /**
   * Create error result for failed health checks
   */
  private createErrorResult(timestamp: Date, error: unknown): HealthCheckResult {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    return {
      timestamp,
      isHealthy: false,
      score: 0,
      checks: {
        connection: false,
        timescaleDB: false,
        schema: false,
        performance: false
      },
      metrics: {
        connectionTimeMs: -1,
        lastQueryTime: timestamp,
        failedQueries: 0,
        successfulQueries: 0,
        avgQueryTimeMs: -1,
        uptimeSeconds: 0
      },
      warnings: [],
      errors: [errorMessage]
    }
  }

  /**
   * Check TimescaleDB settings and add warnings
   */
  private async checkTimescaleDBSettings(sql: SqlInstance, warnings: string[]): Promise<void> {
    try {
      // Check important TimescaleDB settings
      const settingsResult = await sql`
        SELECT name, setting, unit, boot_val, reset_val
        FROM pg_settings 
        WHERE name IN (
          'shared_preload_libraries',
          'max_connections',
          'work_mem',
          'maintenance_work_mem'
        )
      `

      for (const setting of settingsResult) {
        if (setting.name === 'shared_preload_libraries') {
          const libraries = setting.setting as string
          if (!libraries.includes('timescaledb')) {
            warnings.push('TimescaleDB not found in shared_preload_libraries')
          }
        }
      }
    } catch (error) {
      // Non-critical error, just log it
      this.logger?.debug('Could not check TimescaleDB settings', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Build health check configuration
   */
  private buildHealthCheckConfig(clientOptions: ClientOptions): HealthCheckConfig {
    return {
      enabled: true,
      intervalMs: 30000, // 30 seconds
      timeoutMs: clientOptions.queryTimeout || 10000,
      failureThreshold: 3,
      warningThreshold: 1,
      checkTimescaleDB: true,
      checkSchema: true,
      checkPerformance: true
    }
  }

  /**
   * Build performance thresholds
   */
  private buildPerformanceThresholds(clientOptions: ClientOptions): PerformanceThresholds {
    return {
      maxQueryTimeMs: clientOptions.queryTimeout || 5000,
      maxConnectionTimeMs: 2000,
      minThroughputQps: 10,
      maxErrorRatePercent: 5
    }
  }
}

/**
 * Factory function for creating health checkers
 */
export function createHealthChecker(
  pool: ConnectionPool,
  logger?: Logger,
  clientOptions: ClientOptions = {},
  alertConfig: AlertConfig = { enabled: false }
): HealthChecker {
  return new HealthChecker(pool, logger, clientOptions, alertConfig)
}