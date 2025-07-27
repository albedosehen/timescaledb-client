/**
 * TimescaleClient - Main client class for TimescaleDB operations
 *
 * Provides a comprehensive, production-ready interface for TimescaleDB operations
 * including data insertion, querying, aggregations, and analytics.
 */

import type { SqlInstance } from './types/internal.ts'
import type { DatabaseLayer } from './database/client.ts'
import type {
  BatchResult,
  HealthCheckResult,
  SchemaInfo,
  TimeRange,
  TimeSeriesRecord,
} from './types/interfaces.ts'
import type { ClientOptions } from './types/config.ts'
import type { Logger } from './types/logging.ts'
import { BatchError, ConnectionError, QueryError, ValidationError } from './types/errors.ts'
import { resolveLoggerFromOptions } from './logging/resolver.ts'

// Import query operations
import { insertRecord, insertManyRecords, type InsertOptions } from './queries/insert.ts'
import { getRecords, getLatestRecord, getMultiEntityLatest, type SelectOptions } from './queries/select.ts'
import { getTimeBucketAggregation, getMultiValueAggregation, type AggregationOptions } from './queries/aggregate.ts'

/**
 * Database query result interfaces for type safety
 */
interface TableInfoResult {
  table_name: string
}

interface HypertableInfoResult {
  table_name: string
  schema_name: string
  time_column: string
  chunk_time_interval: string
  num_dimensions: number
  compression_enabled: boolean
  created_at: string
}

interface IndexInfoResult {
  index_name: string
  table_name: string
  definition: string
}

/**
 * TimescaleClient configuration extending ClientOptions
 */
export interface TimescaleClientConfig extends ClientOptions {
  /** Whether to automatically ensure schema on initialization */
  readonly autoEnsureSchema?: boolean

  /** Whether to enable query statistics collection */
  readonly enableQueryStats?: boolean

  /** Custom error handlers */
  readonly errorHandlers?: {
    readonly onValidationError?: (error: ValidationError) => void
    readonly onQueryError?: (error: QueryError) => void
    readonly onConnectionError?: (error: ConnectionError) => void
    readonly onBatchError?: (error: BatchError) => void
  }
}

/**
 * Default client configuration
 */
const DEFAULT_CLIENT_CONFIG: Required<Omit<TimescaleClientConfig, 'logger' | 'loggerConfig' | 'errorHandlers'>> = {
  defaultBatchSize: 1000,
  maxRetries: 3,
  retryBaseDelay: 1000,
  queryTimeout: 30000,
  autoCreateTables: false,
  autoCreateIndexes: true,
  defaultLimit: 1000,
  validateInputs: true,
  collectStats: false,
  timezone: 'UTC',
  useStreaming: true,
  streamingThreshold: 1000,
  autoEnsureSchema: false,
  enableQueryStats: false,
}

/**
 * Main TimescaleClient class providing comprehensive TimescaleDB operations
 */
export class TimescaleClient {
  private readonly sql: SqlInstance
  private readonly config: Required<Omit<TimescaleClientConfig, 'logger' | 'loggerConfig' | 'errorHandlers'>>
  private readonly logger: Logger | undefined
  private readonly errorHandlers?: TimescaleClientConfig['errorHandlers']
  private readonly dbLayer?: DatabaseLayer

  private _isInitialized = false
  private _isClosed = false

  /**
   * Create a new TimescaleClient instance
   *
   * @param sql - postgres.js SqlInstance or DatabaseLayer
   * @param config - Client configuration options
   */
  constructor(
    sql: SqlInstance | DatabaseLayer,
    config: TimescaleClientConfig = {},
  ) {
    // Handle both SqlInstance and DatabaseLayer
    if ('pool' in sql) {
      this.dbLayer = sql
      // We'll get the SQL instance lazily when needed
      this.sql = null as unknown as SqlInstance // Will be set on first use
    } else {
      this.sql = sql
    }

    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config }
    this.logger = resolveLoggerFromOptions(config)
    this.errorHandlers = config.errorHandlers
  }

  /**
   * Initialize the client - ensures schema if configured
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return
    }

    try {
      if (this.config.autoEnsureSchema) {
        await this.ensureSchema()
      }

      // Start database layer health monitoring if available
      if (this.dbLayer) {
        this.dbLayer.start()
      }

      this._isInitialized = true
      this.logger?.info('TimescaleClient initialized successfully')
    } catch (error) {
      const err = new ConnectionError(
        'Failed to initialize TimescaleClient',
        error instanceof Error ? error : new Error(String(error)),
      )
      this.handleError(err)
      throw err
    }
  }

  /**
   * Check if client is initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized
  }

  /**
   * Check if client is closed
   */
  get isClosed(): boolean {
    return this._isClosed
  }

  // ==================== INSERTION OPERATIONS ====================

  /**
   * Insert a single time-series record
   */
  async insertRecord(record: TimeSeriesRecord, options?: InsertOptions): Promise<void> {
    this.validateNotClosed()

    try {
      const sql = await this.getSqlInstance()
      const insertOptions = this.mergeInsertOptions(options)
      await insertRecord(sql, record, insertOptions)
      this.logger?.debug('Inserted time-series record', {
        entity_id: record.entity_id,
        value: record.value,
        time: record.time
      })
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Insert multiple time-series records efficiently
   */
  async insertManyRecords(records: TimeSeriesRecord[], options?: InsertOptions): Promise<BatchResult> {
    this.validateNotClosed()

    if (records.length === 0) {
      return { processed: 0, failed: 0, durationMs: 0, errors: [] }
    }

    try {
      const sql = await this.getSqlInstance()
      const insertOptions = this.mergeInsertOptions(options)
      const result = await insertManyRecords(sql, records, insertOptions)

      this.logger?.info('Batch inserted time-series records', {
        total: records.length,
        processed: result.processed,
        failed: result.failed,
        durationMs: result.durationMs,
      })

      return result
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== QUERY OPERATIONS ====================

  /**
   * Get time-series records for an entity and time range
   */
  async getRecords(entityId: string, range: TimeRange, options?: SelectOptions): Promise<TimeSeriesRecord[]> {
    this.validateNotClosed()

    try {
      const sql = await this.getSqlInstance()
      const selectOptions = this.mergeSelectOptions(options)

      // Use query layer function instead of embedded SQL
      const records = await getRecords(sql, entityId, range, selectOptions)

      this.logger?.debug('Retrieved time-series records', {
        entityId,
        count: records.length,
        from: range.from,
        to: range.to,
      })

      return records
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get the latest value for an entity
   */
  async getLatestValue(entityId: string): Promise<number | null> {
    this.validateNotClosed()

    try {
      const sql = await this.getSqlInstance()

      // Use query layer function instead of embedded SQL
      const latestRecord = await getLatestRecord(sql, entityId)
      const value = latestRecord?.value ?? null

      this.logger?.debug('Retrieved latest value', { entityId, value })
      return value
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get latest values for multiple entities
   */
  async getMultiEntityLatest(entityIds: string[]): Promise<Record<string, number | null>> {
    this.validateNotClosed()

    try {
      const sql = await this.getSqlInstance()

      // Use query layer function instead of embedded SQL
      const result = await getMultiEntityLatest(sql, entityIds)

      // Transform query layer result to match current API contract
      const valueMap: Record<string, number | null> = {}
      entityIds.forEach(id => valueMap[id] = null)
      result.records.forEach(record => {
        valueMap[record.entity_id] = record.value
      })

      this.logger?.debug('Retrieved multi-entity latest values', {
        requested: result.requested,
        found: result.found,
      })

      return valueMap
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== AGGREGATION OPERATIONS ====================

  /**
   * Get basic aggregated statistics for an entity over a time range
   */
  async getAggregatedData(
    entityId: string,
    range: TimeRange,
    // deno-lint-ignore default-param-last
    bucketInterval: string = '1h',
    options?: AggregationOptions
  ): Promise<Array<{
    bucket: Date
    count: number
    avg: number | null
    min: number | null
    max: number | null
    sum: number | null
  }>> {
    this.validateNotClosed()

    try {
      const sql = await this.getSqlInstance()
      const aggregationOptions = this.mergeAggregationOptions(options)

      // Use query layer function instead of embedded SQL
      const result = await getTimeBucketAggregation(sql, entityId, bucketInterval, range, aggregationOptions)

      this.logger?.debug('Retrieved aggregated data', {
        entityId,
        bucketInterval,
        count: result.length,
        from: range.from,
        to: range.to,
      })

      // Transform result to match current API contract
      return result.map((row) => ({
        bucket: row.bucket,
        count: row.count,
        avg: row.avg ?? null,
        min: row.min ?? null,
        max: row.max ?? null,
        sum: row.sum ?? null,
      }))
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get multi-value aggregated statistics for an entity
   */
  async getMultiValueAggregation(
    entityId: string,
    range: TimeRange,
    // deno-lint-ignore default-param-last
    bucketInterval: string = '1h',
    options?: AggregationOptions
  ): Promise<Array<{
    bucket: Date
    count: number
    value_stats: { avg: number | null; min: number | null; max: number | null; sum: number | null }
    value2_stats: { avg: number | null; min: number | null; max: number | null; sum: number | null }
    value3_stats: { avg: number | null; min: number | null; max: number | null; sum: number | null }
    value4_stats: { avg: number | null; min: number | null; max: number | null; sum: number | null }
  }>> {
    this.validateNotClosed()

    try {
      const sql = await this.getSqlInstance()
      const aggregationOptions = this.mergeAggregationOptions(options)

      // Use query layer function instead of embedded SQL
      const result = await getMultiValueAggregation(sql, entityId, bucketInterval, range, aggregationOptions)

      this.logger?.debug('Retrieved multi-value aggregated data', {
        entityId,
        bucketInterval,
        count: result.length,
      })

      // Transform result to match current API contract
      return result.map((row) => ({
        bucket: row.bucket,
        count: row.count,
        value_stats: {
          avg: row.value_stats.avg ?? null,
          min: row.value_stats.min ?? null,
          max: row.value_stats.max ?? null,
          sum: row.value_stats.sum ?? null,
        },
        value2_stats: {
          avg: row.value2_stats?.avg ?? null,
          min: row.value2_stats?.min ?? null,
          max: row.value2_stats?.max ?? null,
          sum: row.value2_stats?.sum ?? null,
        },
        value3_stats: {
          avg: row.value3_stats?.avg ?? null,
          min: row.value3_stats?.min ?? null,
          max: row.value3_stats?.max ?? null,
          sum: row.value3_stats?.sum ?? null,
        },
        value4_stats: {
          avg: row.value4_stats?.avg ?? null,
          min: row.value4_stats?.min ?? null,
          max: row.value4_stats?.max ?? null,
          sum: row.value4_stats?.sum ?? null,
        },
      }))
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== STREAMING OPERATIONS ====================

  /**
   * Stream time-series records for large datasets
   */
  getRecordsStream(entityId: string, range: TimeRange, options?: { batchSize?: number }): AsyncIterable<TimeSeriesRecord[]> {
    this.validateNotClosed()

    try {
      const streamingOptions = { batchSize: options?.batchSize || this.config.defaultBatchSize }

      // For now, we'll implement a simple streaming approach
      // In the future, this could use cursor-based pagination
      const records = this.getRecords(entityId, range, { limit: streamingOptions.batchSize })

      this.logger?.debug('Started records stream', { entityId, batchSize: streamingOptions.batchSize })

      return (async function* () {
        yield await records
      })()
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== MANAGEMENT OPERATIONS ====================

  /**
   * Check database connectivity and health
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const startTime = performance.now()
      const sql = await this.getSqlInstance()

      // Basic connectivity test
      const result = await sql`SELECT 1 as test, NOW() as timestamp`
      const responseTime = Math.round(performance.now() - startTime)

      // Check TimescaleDB extension
      const versionResult = await sql`
        SELECT
          extversion as version,
          current_database() as database
        FROM pg_extension
        WHERE extname = 'timescaledb'
      `

      const isHealthy = result.length > 0 && versionResult.length > 0
      const version = versionResult[0]?.version as string
      const database = versionResult[0]?.database as string

      // Get database layer health if available
      const dbLayerHealth = this.dbLayer?.getHealthStatus()

      return {
        isHealthy: isHealthy && (!dbLayerHealth || dbLayerHealth.isHealthy),
        responseTimeMs: responseTime,
        version,
        database,
        connection: {
          host: 'unknown', // Would need connection info from postgres.js
          port: 5432,
          ssl: false,
        },
        errors: isHealthy ? undefined : ['TimescaleDB extension not available'],
        timestamp: new Date(),
      }
    } catch (error) {
      this.handleError(error)

      return {
        isHealthy: false,
        responseTimeMs: 0,
        connection: {
          host: 'unknown',
          port: 5432,
          ssl: false,
        },
        errors: [error instanceof Error ? error.message : String(error)],
        timestamp: new Date(),
      }
    }
  }

  /**
   * Ensure database schema exists and is up to date
   */
  async ensureSchema(): Promise<void> {
    this.validateNotClosed()

    try {
      // This would typically read and execute SQL files from src/schema/
      // For now, we'll implement basic table creation

      // Check if essential tables exist
      const tables = await this.sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('entities', 'time_series_data')
      `

      const existingTables = (tables as unknown as TableInfoResult[]).map((t) => t.table_name)

      // Create entities table if it doesn't exist
      if (!existingTables.includes('entities')) {
        await this.sql`
          CREATE TABLE IF NOT EXISTS entities (
            entity_id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            name TEXT,
            description TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            is_active BOOLEAN DEFAULT TRUE,

            CONSTRAINT entities_entity_id_format CHECK (
              entity_id ~ '^[A-Za-z0-9_.-]{1,100}$'
            ),
            CONSTRAINT entities_entity_type_format CHECK (
              entity_type ~ '^[a-z_]{1,50}$'
            )
          )
        `

        this.logger?.info('Created entities table')
      }

      // Create time_series_data hypertable if it doesn't exist
      if (!existingTables.includes('time_series_data')) {
        await this.sql`
          CREATE TABLE IF NOT EXISTS time_series_data (
            time TIMESTAMPTZ NOT NULL,
            entity_id TEXT NOT NULL,
            value DOUBLE PRECISION NOT NULL,
            value2 DOUBLE PRECISION DEFAULT NULL,
            value3 DOUBLE PRECISION DEFAULT NULL,
            value4 DOUBLE PRECISION DEFAULT NULL,
            metadata JSONB DEFAULT '{}',

            PRIMARY KEY (entity_id, time),

            CONSTRAINT fk_entity_id FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,
            CONSTRAINT time_series_value_finite CHECK (value IS NOT NULL AND value = value),
            CONSTRAINT time_series_value2_finite CHECK (value2 IS NULL OR value2 = value2),
            CONSTRAINT time_series_value3_finite CHECK (value3 IS NULL OR value3 = value3),
            CONSTRAINT time_series_value4_finite CHECK (value4 IS NULL OR value4 = value4)
          )
        `

        // Convert to hypertable with optimized partitioning
        await this.sql`
          SELECT create_hypertable(
            'time_series_data',
            'time',
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE
          )
        `

        // Add space partitioning by entity_id for better performance
        await this.sql`
          SELECT add_dimension(
            'time_series_data',
            'entity_id',
            number_partitions => 4,
            if_not_exists => TRUE
          )
        `

        this.logger?.info('Created time_series_data hypertable')
      }

      // Create indexes if autoCreateIndexes is enabled
      if (this.config.autoCreateIndexes) {
        await this.createIndexes()
      }

      this.logger?.info('Schema ensured successfully')
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get schema information
   */
  async getSchemaInfo(): Promise<SchemaInfo> {
    this.validateNotClosed()

    try {
      // Get TimescaleDB version
      const versionResult = await this.sql`SELECT timescaledb_version()`
      const version = versionResult[0]?.timescaledb_version as string

      // Get hypertables info
      const hypertablesResult = await this.sql`
        SELECT 
          hypertable_name as table_name,
          hypertable_schema as schema_name,
          main_dimension_column as time_column,
          chunk_time_interval,
          num_dimensions,
          compression_enabled,
          created as created_at
        FROM timescaledb_information.hypertables
        WHERE hypertable_schema = 'public'
      `

      const hypertables = (hypertablesResult as unknown as HypertableInfoResult[]).map((h) => ({
        tableName: String(h.table_name),
        schemaName: String(h.schema_name),
        timeColumn: String(h.time_column),
        chunkTimeInterval: String(h.chunk_time_interval),
        numDimensions: Number(h.num_dimensions) || 1,
        numChunks: 0, // Would need additional query
        compressionEnabled: Boolean(h.compression_enabled),
        tableSizeBytes: 0, // Would need additional query
        createdAt: new Date(String(h.created_at)),
      }))

      // Get indexes info
      const indexesResult = await this.sql`
        SELECT
          indexname as index_name,
          tablename as table_name,
          indexdef as definition
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('entities', 'time_series_data')
      `

      const indexes = (indexesResult as unknown as IndexInfoResult[]).map((idx) => ({
        indexName: String(idx.index_name),
        tableName: String(idx.table_name),
        columns: [], // Would need to parse from definition
        isUnique: String(idx.definition).includes('UNIQUE'),
        isPartial: String(idx.definition).includes('WHERE'),
        sizeBytes: 0, // Would need additional query
        definition: String(idx.definition),
      }))

      return {
        version,
        hypertables,
        indexes,
        compressionEnabled: hypertables.some((h) => h.compressionEnabled),
        retentionPolicies: [], // Would need additional query
        validatedAt: new Date(),
      }
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Close the client and all connections
   */
  async close(): Promise<void> {
    if (this._isClosed) {
      return
    }

    try {
      // Stop database layer if available
      if (this.dbLayer) {
        await this.dbLayer.stop()
      } else if (this.sql) {
        // Close postgres.js connection
        await this.sql.end()
      }

      this._isClosed = true
      this.logger?.info('TimescaleClient closed successfully')
    } catch (error) {
      this.logger?.error('Error closing TimescaleClient', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get SQL instance from either database layer pool or direct connection
   * @returns Promise resolving to SQL instance
   * @throws ConnectionError if no SQL instance is available
   */
  private async getSqlInstance(): Promise<SqlInstance> {
    if (this.dbLayer) {
      // Get SQL instance from database layer pool
      return await this.dbLayer.pool.acquire()
    } else if (this.sql) {
      return this.sql
    } else {
      throw new ConnectionError('No SQL instance available')
    }
  }

  /**
   * Validate that the client has not been closed
   * @throws ConnectionError if client has been closed
   */
  private validateNotClosed(): void {
    if (this._isClosed) {
      throw new ConnectionError('TimescaleClient has been closed')
    }
  }

  /**
   * Create database indexes for optimizing query performance
   * @throws Error if index creation fails (logged but not thrown)
   */
  private async createIndexes(): Promise<void> {
    try {
      // Entity-related indexes
      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_entities_entity_type
        ON entities(entity_type)
      `

      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_entities_is_active
        ON entities(is_active) WHERE is_active = TRUE
      `

      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_entities_metadata_gin
        ON entities USING GIN (metadata)
      `

      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_entities_updated_at
        ON entities(updated_at)
      `

      // Time-series data indexes
      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_time_series_data_entity_id_time
        ON time_series_data(entity_id, time DESC)
      `

      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_time_series_data_time
        ON time_series_data(time DESC)
      `

      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_time_series_data_metadata_gin
        ON time_series_data USING GIN (metadata)
      `

      this.logger?.debug('Created database indexes')
    } catch (error) {
      this.logger?.warn('Failed to create some indexes', {
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw - indexes are optional optimization
    }
  }

  /**
   * Merge user-provided insert options with client defaults
   * @param options - User-provided insert options (optional)
   * @returns Merged insert options with defaults applied
   */
  private mergeInsertOptions(options?: InsertOptions): InsertOptions {
    return {
      upsert: true,
      batchSize: this.config.defaultBatchSize,
      useTransaction: true,
      timeoutMs: this.config.queryTimeout,
      validate: this.config.validateInputs,
      ...options,
    }
  }

  /**
   * Merge user-provided select options with client defaults
   * @param options - User-provided select options (optional)
   * @returns Merged select options with defaults applied
   */
  private mergeSelectOptions(options?: SelectOptions): SelectOptions {
    return {
      limit: this.config.defaultLimit,
      offset: 0,
      orderBy: { column: 'time', direction: 'desc' },
      where: {},
      includeStats: this.config.collectStats,
      includeMetadata: false,
      customOrderBy: '',
      useStreaming: this.config.useStreaming,
      ...options,
    }
  }

  /**
   * Merge user-provided aggregation options with client defaults
   * @param options - User-provided aggregation options (optional)
   * @returns Merged aggregation options with defaults applied
   */
  private mergeAggregationOptions(options?: AggregationOptions): AggregationOptions {
    return {
      limit: this.config.defaultLimit,
      offset: 0,
      orderBy: { column: 'bucket', direction: 'desc' },
      where: {},
      includeStats: this.config.collectStats,
      fillGaps: false,
      fillValue: null,
      includeMetadata: false,
      ...options,
    }
  }


  /**
   * Handle errors by calling appropriate error handlers and logging
   * @param error - The error to handle (unknown type)
   */
  private handleError(error: unknown): void {
    if (error instanceof ValidationError && this.errorHandlers?.onValidationError) {
      this.errorHandlers.onValidationError(error)
    } else if (error instanceof QueryError && this.errorHandlers?.onQueryError) {
      this.errorHandlers.onQueryError(error)
    } else if (error instanceof ConnectionError && this.errorHandlers?.onConnectionError) {
      this.errorHandlers.onConnectionError(error)
    } else if (error instanceof BatchError && this.errorHandlers?.onBatchError) {
      this.errorHandlers.onBatchError(error)
    }

    // Log all errors
    this.logger?.error(
      'TimescaleClient operation failed',
      error instanceof Error ? error : new Error(String(error)),
    )
  }
}
