/// <reference lib="deno.ns" />

/**
 * Database layer exports for TimescaleDB client
 *
 * Provides clean public API for database connection management,
 * pooling, and health monitoring while hiding implementation details.
 */

// Core database classes
export { DatabaseConnection, createDatabaseConnection } from './connection.ts'
export { ConnectionPool, createConnectionPool } from './pool.ts'
export { HealthChecker, createHealthChecker } from './health.ts'

// Re-export types explicitly for public API
export type { SqlInstance, ConnectionState } from '../types/internal.ts'
export type { ConnectionConfig, ClientOptions, Logger } from '../types/config.ts'

// Factory function for complete database setup
import type { ConnectionConfig, ClientOptions, Logger } from '../types/config.ts'
import { ConnectionPool, createConnectionPool } from './pool.ts'
import { HealthChecker, createHealthChecker } from './health.ts'

/**
 * Database layer configuration for factory
 */
export interface DatabaseLayerConfig {
  readonly connection: ConnectionConfig
  readonly client?: ClientOptions
  readonly enableHealthChecking?: boolean
  readonly healthCheckConfig?: {
    readonly enabled: boolean
    readonly onHealthChange?: (isHealthy: boolean, result: unknown) => void
    readonly onError?: (error: Error, context: string) => void
    readonly onWarning?: (warning: string, context: string) => void
  }
  readonly logger?: Logger
}

/**
 * Complete database layer with pool and health monitoring
 */
export interface DatabaseLayer {
  /** Connection pool for managing database connections */
  readonly pool: ConnectionPool
  /** Optional health checker for monitoring database health */
  readonly healthChecker?: HealthChecker | undefined
  
  /**
   * Start the database layer (health monitoring if enabled)
   */
  start(): void
  
  /**
   * Stop the database layer gracefully
   */
  stop(): Promise<void>
  
  /**
   * Get current health status
   */
  getHealthStatus(): {
    isHealthy: boolean
    lastCheck: Date | null
    consecutiveFailures: number
    score: number
  } | null
}

/**
 * Complete database layer implementation
 */
class DatabaseLayerImpl implements DatabaseLayer {
  readonly pool: ConnectionPool
  readonly healthChecker?: HealthChecker | undefined
  
  constructor(
    pool: ConnectionPool,
    healthChecker?: HealthChecker | undefined
  ) {
    this.pool = pool
    this.healthChecker = healthChecker
  }
  
  start(): void {
    if (this.healthChecker) {
      this.healthChecker.start()
    }
  }
  
  async stop(): Promise<void> {
    if (this.healthChecker) {
      this.healthChecker.stop()
    }
    await this.pool.shutdown()
  }
  
  getHealthStatus(): {
    isHealthy: boolean
    lastCheck: Date | null
    consecutiveFailures: number
    score: number
  } | null {
    return this.healthChecker?.getHealthStatus() || null
  }
}

/**
 * Factory function to create a complete database layer
 * 
 * @param config Database layer configuration
 * @returns Complete database layer with pool and optional health monitoring
 * 
 * @example
 * ```typescript
 * import { createDatabaseLayer } from './database/mod.ts'
 * 
 * const dbLayer = createDatabaseLayer({
 *   connection: {
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'timescale_dev',
 *     username: 'postgres',
 *     password: 'password'
 *   },
 *   client: {
 *     maxRetries: 3,
 *     queryTimeout: 30000
 *   },
 *   enableHealthChecking: true,
 *   healthCheckConfig: {
 *     enabled: true,
 *     onHealthChange: (isHealthy, result) => {
 *       console.log(`Database health changed: ${isHealthy}`)
 *     }
 *   }
 * })
 * 
 * // Start monitoring
 * dbLayer.start()
 * 
 * // Use the pool
 * const result = await dbLayer.pool.query(sql => sql`SELECT 1`)
 * 
 * // Cleanup
 * await dbLayer.stop()
 * ```
 */
export function createDatabaseLayer(config: DatabaseLayerConfig): DatabaseLayer {
  // Create connection pool
  const pool = createConnectionPool(
    config.connection,
    config.logger,
    config.client
  )
  
  // Create health checker if enabled
  let healthChecker: HealthChecker | undefined
  if (config.enableHealthChecking !== false) {
    const alertConfig = {
      enabled: Boolean(config.healthCheckConfig?.enabled),
      ...(config.healthCheckConfig?.onHealthChange && { onHealthChange: config.healthCheckConfig.onHealthChange }),
      ...(config.healthCheckConfig?.onError && { onError: config.healthCheckConfig.onError }),
      ...(config.healthCheckConfig?.onWarning && { onWarning: config.healthCheckConfig.onWarning })
    }
    
    healthChecker = createHealthChecker(
      pool,
      config.logger,
      config.client,
      alertConfig
    )
  }
  
  return new DatabaseLayerImpl(pool, healthChecker)
}

/**
 * Simple factory for just a connection pool (no health monitoring)
 * 
 * @param connectionConfig Connection configuration
 * @param clientOptions Client options
 * @param logger Optional logger
 * @returns Connection pool instance
 * 
 * @example
 * ```typescript
 * import { createSimplePool } from './database/mod.ts'
 * 
 * const pool = createSimplePool({
 *   connectionString: 'postgresql://user:pass@localhost:5432/db'
 * })
 * 
 * const result = await pool.query(sql => sql`SELECT NOW()`)
 * ```
 */
export function createSimplePool(
  connectionConfig: ConnectionConfig,
  logger?: Logger,
  clientOptions: ClientOptions = {}
): ConnectionPool {
  return createConnectionPool(connectionConfig, logger, clientOptions)
}

/**
 * Factory for creating a database layer from environment variables
 * 
 * @param overrides Optional configuration overrides
 * @param logger Optional logger
 * @returns Database layer configured from environment variables
 * 
 * @example
 * ```typescript
 * import { createDatabaseLayerFromEnv } from './database/mod.ts'
 * 
 * // Uses TIMESCALE_CONNECTION_STRING or PGHOST, PGPORT, etc.
 * const dbLayer = createDatabaseLayerFromEnv({
 *   client: { maxRetries: 5 },
 *   enableHealthChecking: true
 * })
 * ```
 */
export function createDatabaseLayerFromEnv(
  logger?: Logger,
  overrides: Partial<DatabaseLayerConfig> = {}
): DatabaseLayer {
  // Build connection config from environment variables
  const baseConnectionConfig = {
    host: Deno.env.get('PGHOST') || 'localhost',
    port: parseInt(Deno.env.get('PGPORT') || '5432', 10),
    database: Deno.env.get('PGDATABASE') || 'postgres',
    username: Deno.env.get('PGUSER') || 'postgres',
    ssl: Deno.env.get('PGSSLMODE') === 'require',
    applicationName: Deno.env.get('PGAPPNAME') || 'timescaledb-client',
    debug: Deno.env.get('TIMESCALE_DEBUG') === 'true',
    ...overrides.connection
  }

  const connectionString = Deno.env.get('TIMESCALE_CONNECTION_STRING')
  const password = Deno.env.get('PGPASSWORD')

  const connectionConfig: ConnectionConfig = {
    ...baseConnectionConfig,
    ...(connectionString && { connectionString }),
    ...(password && { password })
  }
  
  const effectiveLogger = logger || overrides.logger
  const config: DatabaseLayerConfig = {
    connection: connectionConfig,
    enableHealthChecking: overrides.enableHealthChecking !== false,
    ...(overrides.client && { client: overrides.client }),
    ...(overrides.healthCheckConfig && { healthCheckConfig: overrides.healthCheckConfig }),
    ...(effectiveLogger && { logger: effectiveLogger })
  }
  
  return createDatabaseLayer(config)
}

/**
 * Utility to test database connectivity
 * 
 * @param connectionConfig Connection configuration
 * @param logger Optional logger
 * @returns Promise that resolves if connection is successful
 * 
 * @example
 * ```typescript
 * import { testConnection } from './database/mod.ts'
 * 
 * try {
 *   await testConnection({
 *     host: 'localhost',
 *     database: 'test_db',
 *     username: 'postgres',
 *     password: 'password'
 *   })
 *   console.log('Connection successful!')
 * } catch (error) {
 *   console.error('Connection failed:', error)
 * }
 * ```
 */
export async function testConnection(
  connectionConfig: ConnectionConfig,
  logger?: Logger
): Promise<void> {
  const pool = createConnectionPool(connectionConfig, logger, { maxRetries: 1 })
  
  try {
    await pool.query(sql => sql`SELECT 1 as test`)
    logger?.info('Database connection test successful')
  } finally {
    await pool.shutdown(5000) // 5 second timeout for test cleanup
  }
}

/**
 * Utility to check TimescaleDB availability
 * 
 * @param connectionConfig Connection configuration
 * @param logger Optional logger
 * @returns Promise with TimescaleDB version info
 * 
 * @example
 * ```typescript
 * import { checkTimescaleDB } from './database/mod.ts'
 * 
 * const info = await checkTimescaleDB(config)
 * console.log(`TimescaleDB version: ${info.version}`)
 * ```
 */
export async function checkTimescaleDB(
  connectionConfig: ConnectionConfig,
  logger?: Logger
): Promise<{
  isAvailable: boolean
  version?: string
  extensions: string[]
}> {
  const pool = createConnectionPool(connectionConfig, logger, { maxRetries: 1 })
  
  try {
    const result = await pool.query(async sql => {
      // Check extensions
      const extensionResult = await sql`
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname = 'timescaledb'
      `
      
      if (extensionResult.length === 0) {
        return { isAvailable: false, extensions: [] }
      }
      
      // Get version
      const versionResult = await sql`SELECT timescaledb_version()`
      const version = versionResult[0]?.timescaledb_version as string
      
      // Get all extensions
      const allExtensions = await sql`
        SELECT extname, extversion 
        FROM pg_extension
      `
      
      const extensions = allExtensions.map(ext => 
        `${ext.extname}@${ext.extversion}`
      )
      
      return {
        isAvailable: true,
        version,
        extensions
      }
    })
    
    logger?.info('TimescaleDB check completed', result)
    return result
  } finally {
    await pool.shutdown(5000)
  }
}