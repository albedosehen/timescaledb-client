/**
 * Internal type definitions for TimescaleDB client implementation
 *
 * These types are used internally by the client implementation and are not
 * part of the public API. They may change between versions without notice.
 */

import postgres from 'postgres'

/**
 * Type alias for postgres.js Sql instance
 * This represents a postgres.js SQL instance with default configuration
 */
export type SqlInstance = ReturnType<typeof postgres>

/**
 * Query builder interface for constructing SQL queries
 */
export interface QueryBuilder {
  /**
   * Build an INSERT query for the given table and data
   */
  buildInsert(table: string, data: Record<string, unknown>): string

  /**
   * Build a SELECT query with optional WHERE, ORDER BY, and LIMIT clauses
   */
  buildSelect(
    table: string,
    columns?: string[],
    where?: Record<string, unknown>,
    orderBy?: string,
    limit?: number,
  ): string

  /**
   * Build a time-bucket aggregation query
   */
  buildTimeBucket(
    table: string,
    interval: string,
    timeColumn: string,
    aggregations: Record<string, string>,
    where?: Record<string, unknown>,
  ): string
}

/**
 * Batch insert operation configuration
 */
export interface BatchInsertOptions {
  /** Target table name */
  readonly table: string

  /** Column names to insert */
  readonly columns: readonly string[]

  /** Whether to use ON CONFLICT DO UPDATE (upsert) */
  readonly upsert: boolean

  /** Conflict resolution columns for upsert */
  readonly conflictColumns?: readonly string[]

  /** Batch size for chunking large operations */
  readonly batchSize: number

  /** Whether to use a transaction for the entire batch */
  readonly useTransaction: boolean
}

/**
 * Internal connection state
 */
export interface ConnectionState {
  /** Whether the connection is currently active */
  readonly isConnected: boolean

  /** Last successful health check timestamp */
  readonly lastHealthCheck?: Date

  /** Number of active queries */
  readonly activeQueries: number

  /** Connection pool statistics */
  readonly poolStats: {
    readonly total: number
    readonly idle: number
    readonly active: number
    readonly waiting: number
  }
}

/**
 * Query execution context for internal operations
 */
export interface QueryContext {
  /** Operation name for logging/debugging */
  readonly operation: string

  /** Table being operated on */
  readonly table?: string

  /** Query parameters */
  readonly parameters?: readonly unknown[]

  /** Expected row count range */
  readonly expectedRows?: {
    readonly min?: number
    readonly max?: number
  }

  /** Query timeout in milliseconds */
  readonly timeoutMs?: number

  /** Whether to retry on failure */
  readonly retryable: boolean
}

/**
 * Internal metrics collection interface
 */
export interface MetricsCollector {
  /** Record query execution time */
  recordQueryTime(operation: string, durationMs: number): void

  /** Record connection pool usage */
  recordPoolUsage(active: number, idle: number, waiting: number): void

  /** Record error occurrence */
  recordError(operation: string, error: Error): void

  /** Record batch operation statistics */
  recordBatchOperation(
    operation: string,
    recordCount: number,
    successCount: number,
    durationMs: number,
  ): void
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  /** Whether the schema is valid */
  readonly isValid: boolean

  /** Missing tables */
  readonly missingTables: readonly string[]

  /** Missing indexes */
  readonly missingIndexes: readonly string[]

  /** Tables that are not hypertables but should be */
  readonly nonHypertables: readonly string[]

  /** Validation warnings (non-blocking issues) */
  readonly warnings: readonly string[]
}

/**
 * Hypertable information from TimescaleDB metadata
 */
export interface HypertableInfo {
  /** Hypertable name */
  readonly tableName: string

  /** Schema name */
  readonly schemaName: string

  /** Time column name */
  readonly timeColumn: string

  /** Chunk time interval */
  readonly chunkTimeInterval: string

  /** Number of dimensions */
  readonly numDimensions: number

  /** Compression enabled */
  readonly compressionEnabled: boolean

  /** Created timestamp */
  readonly createdAt: Date
}

/**
 * Time-series chunk information
 */
export interface ChunkInfo {
  /** Chunk name */
  readonly chunkName: string

  /** Hypertable name */
  readonly hypertableName: string

  /** Time range start */
  readonly rangeStart: Date

  /** Time range end */
  readonly rangeEnd: Date

  /** Chunk size in bytes */
  readonly sizeBytes: number

  /** Whether chunk is compressed */
  readonly isCompressed: boolean

  /** Number of rows in chunk */
  readonly rowCount: number
}

/**
 * SQL query preparation result
 */
export interface PreparedQuery {
  /** SQL query string */
  readonly sql: string

  /** Query parameters */
  readonly parameters: readonly unknown[]

  /** Expected result type */
  readonly resultType: 'rows' | 'count' | 'void'

  /** Query hash for caching */
  readonly hash: string
}

/**
 * Connection pool configuration for postgres.js
 */
export interface PoolConfig {
  /** Maximum number of connections */
  readonly max: number

  /** Maximum connection lifetime in seconds */
  readonly maxLifetime?: number | null

  /** Idle timeout in seconds */
  readonly idleTimeout: number

  /** Connect timeout in seconds */
  readonly connectTimeout: number

  /** Whether to use prepared statements */
  readonly prepare: boolean
}

/**
 * Database row interfaces for internal operations
 */

/** Raw time-series record row from database */
export interface TimeSeriesRow {
  readonly time: Date
  readonly entity_id: string
  readonly value: number
  readonly value2: number | null
  readonly value3: number | null
  readonly value4: number | null
  readonly metadata: Record<string, unknown> | null
}

/** Raw entity metadata row from database */
export interface EntityRow {
  readonly entity_id: string
  readonly entity_type: string
  readonly name: string | null
  readonly description: string | null
  readonly metadata: Record<string, unknown> | null
  readonly created_at: Date
  readonly updated_at: Date
  readonly is_active: boolean
}

/** TimescaleDB hypertable metadata row */
export interface HypertableMetadataRow {
  readonly 'hypertable_name': string
  readonly 'hypertable_schema': string
  readonly 'num_dimensions': number
  readonly 'num_chunks': number
  readonly 'compression_enabled': boolean
  readonly 'table_size': string
  readonly created: Date
}

/** Database index metadata row */
export interface IndexMetadataRow {
  readonly indexname: string
  readonly tablename: string
  readonly schemaname: string
  readonly indexdef: string
  readonly size: string
}

/** Chunk information row from TimescaleDB */
export interface ChunkMetadataRow {
  readonly 'chunk_name': string
  readonly 'hypertable_name': string
  readonly 'range_start': Date
  readonly 'range_end': Date
  readonly 'size_bytes': number
  readonly 'compressed_chunk_id': number | null
  readonly 'num_rows': number
}

/**
 * Query result wrapper for typed results
 */
export interface TypedQueryResult<T = Record<string, unknown>> {
  /** Query results */
  readonly rows: readonly T[]

  /** Number of rows affected/returned */
  readonly count: number

  /** Query execution time in milliseconds */
  readonly executionTime?: number

  /** Command type (SELECT, INSERT, UPDATE, etc.) */
  readonly command: string
}

/**
 * Prepared statement cache entry
 */
export interface PreparedStatementCache {
  /** Cache key (query hash) */
  readonly key: string

  /** Prepared statement name */
  readonly name: string

  /** Original SQL query */
  readonly sql: string

  /** Parameter types */
  readonly parameterTypes: readonly string[]

  /** Last used timestamp */
  readonly lastUsed: Date

  /** Usage count */
  readonly usageCount: number
}

/**
 * Retry configuration for failed operations
 */
export interface RetryConfig {
  /** Maximum number of retries */
  readonly maxRetries: number

  /** Base delay in milliseconds */
  readonly baseDelay: number

  /** Maximum delay in milliseconds */
  readonly maxDelay: number

  /** Backoff multiplier */
  readonly backoffMultiplier: number

  /** Whether to use jitter */
  readonly useJitter: boolean
}

/**
 * Connection health metrics
 */
export interface ConnectionHealthMetrics {
  /** Connection establishment time */
  readonly connectionTimeMs: number

  /** Last successful query timestamp */
  readonly lastQueryTime: Date

  /** Number of failed queries */
  readonly failedQueries: number

  /** Number of successful queries */
  readonly successfulQueries: number

  /** Average query time in milliseconds */
  readonly avgQueryTimeMs: number

  /** Connection uptime in seconds */
  readonly uptimeSeconds: number
}

/**
 * Internal validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  readonly isValid: boolean

  /** Validation errors */
  readonly errors: readonly string[]

  /** Field-specific errors */
  readonly fieldErrors: Record<string, string[]>

  /** Warnings (non-blocking issues) */
  readonly warnings: readonly string[]
}

/**
 * Database schema constants
 */
export const SCHEMA_CONSTANTS = {
  TABLES: {
    TIME_SERIES_DATA: 'time_series_data',
    ENTITIES: 'entities',
  },
  COLUMNS: {
    TIME: 'time',
    ENTITY_ID: 'entity_id',
    ENTITY_TYPE: 'entity_type',
    VALUE: 'value',
    VALUE2: 'value2',
    VALUE3: 'value3',
    VALUE4: 'value4',
    METADATA: 'metadata',
    NAME: 'name',
    DESCRIPTION: 'description',
    CREATED_AT: 'created_at',
    UPDATED_AT: 'updated_at',
    IS_ACTIVE: 'is_active',
  },
  INDEXES: {
    TIME_SERIES_ENTITY_TIME: 'ix_time_series_data_entity_id_time',
    TIME_SERIES_TIME: 'ix_time_series_data_time',
    ENTITIES_TYPE: 'ix_entities_entity_type',
    ENTITIES_ACTIVE: 'ix_entities_is_active',
  },
} as const

/**
 * Internal client state
 */
export interface ClientState {
  /** Connection state */
  readonly connection: ConnectionState

  /** Last schema validation result */
  readonly lastSchemaValidation?: SchemaValidationResult

  /** Metrics collector instance */
  readonly metrics?: MetricsCollector

  /** Client configuration snapshot */
  readonly config: {
    readonly validateInputs: boolean
    readonly autoCreateTables: boolean
    readonly collectStats: boolean
    readonly defaultBatchSize: number
    readonly maxRetries: number
  }

  /** Prepared statement cache */
  readonly preparedStatements: Map<string, PreparedStatementCache>

  /** Connection health metrics */
  readonly healthMetrics: ConnectionHealthMetrics
}
