/**
 * Internal type definitions for TimescaleDB client implementation
 *
 * These types are used internally by the client implementation and are not
 * part of the public API. They may change between versions without notice.
 */

/**
 * Type alias for postgres.js Sql instance
 * This will be properly typed when the actual postgres.js implementation is imported
 */
export type SqlInstance = {
  /** Execute a query */
  <T = Record<string, unknown>>(template: TemplateStringsArray, ...args: unknown[]): Promise<T[]> & {
    cursor<T = Record<string, unknown>>(batchSize?: number): AsyncIterable<T[]>
    cursor<T = Record<string, unknown>>(callback: (rows: T[]) => Promise<void>): Promise<void>
    cursor<T = Record<string, unknown>>(batchSize: number, callback: (rows: T[]) => Promise<void>): Promise<void>
  }
  /** Execute with dynamic identifiers/values */
  (values: unknown[] | Record<string, unknown>, ...columns: string[]): Promise<Record<string, unknown>[]>
  /** Close the connection */
  end(): Promise<void>
  /** Reserve a connection */
  reserve(): Promise<SqlInstance>
  /** Release a reserved connection */
  release?(): void
  /** Execute simple queries */
  simple?<T = Record<string, unknown>>(query: string): Promise<T[]>
  /** Begin a transaction */
  begin<T>(callback: (sql: SqlInstance) => Promise<T>): Promise<T>
  begin<T>(mode: string, callback: (sql: SqlInstance) => Promise<T>): Promise<T>
  /** Execute unsafe raw SQL */
  unsafe(query: string): Promise<Record<string, unknown>[]>
}

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
    limit?: number
  ): string

  /**
   * Build a time-bucket aggregation query
   */
  buildTimeBucket(
    table: string,
    interval: string,
    timeColumn: string,
    aggregations: Record<string, string>,
    where?: Record<string, unknown>
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
    durationMs: number
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

/** Raw price tick row from database */
export interface PriceTickRow {
  readonly time: Date
  readonly symbol: string
  readonly price: number
  readonly volume: number | null
}

/** Raw OHLC row from database */
export interface OhlcRow {
  readonly time: Date
  readonly symbol: string
  readonly "interval_minutes": number
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number | null
  readonly "price_change": number | null
  readonly "price_change_percent": number | null
}

/** TimescaleDB hypertable metadata row */
export interface HypertableMetadataRow {
  readonly "hypertable_name": string
  readonly "hypertable_schema": string
  readonly "num_dimensions": number
  readonly "num_chunks": number
  readonly "compression_enabled": boolean
  readonly "table_size": string
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
  readonly "chunk_name": string
  readonly "hypertable_name": string
  readonly "range_start": Date
  readonly "range_end": Date
  readonly "size_bytes": number
  readonly "compressed_chunk_id": number | null
  readonly "num_rows": number
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
    PRICE_TICKS: 'price_ticks',
    OHLC_DATA: 'ohlc_data'
  },
  COLUMNS: {
    TIME: 'time',
    SYMBOL: 'symbol',
    PRICE: 'price',
    VOLUME: 'volume',
    OPEN: 'open',
    HIGH: 'high',
    LOW: 'low',
    CLOSE: 'close'
  },
  INDEXES: {
    PRICE_TICKS_SYMBOL_TIME: 'ix_price_ticks_symbol_time',
    PRICE_TICKS_TIME: 'ix_price_ticks_time',
    OHLC_SYMBOL_TIME: 'ix_ohlc_data_symbol_time'
  }
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