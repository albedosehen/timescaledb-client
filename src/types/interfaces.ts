/**
 * Core data interfaces for TimescaleDB client
 *
 * These interfaces define the structure of time-series data that the client handles.
 * They match the API specification from README.md and follow TimescaleDB best practices.
 */

/**
 * Represents a single price tick data point
 */
export interface PriceTick {
  /** Symbol identifier (e.g., 'BTCUSD', 'NVDA') */
  readonly symbol: string

  /** Price value - must be positive */
  readonly price: number

  /** Trading volume - optional, must be non-negative if provided */
  readonly volume?: number | undefined

  /** ISO 8601 timestamp string */
  readonly timestamp: string
}

/**
 * Represents OHLC (Open, High, Low, Close) candle data
 */
export interface Ohlc {
  /** Symbol identifier (e.g., 'BTCUSD', 'NVDA') */
  readonly symbol: string

  /** Opening price for the time period */
  readonly open: number

  /** Highest price during the time period */
  readonly high: number

  /** Lowest price during the time period */
  readonly low: number

  /** Closing price for the time period */
  readonly close: number

  /** Total volume during the time period - optional */
  readonly volume?: number | undefined

  /** ISO 8601 timestamp string representing the start of the time period */
  readonly timestamp: string
}

/**
 * Represents a time range for querying historical data
 */
export interface TimeRange {
  /** Start time (inclusive) */
  readonly from: Date

  /** End time (exclusive) */
  readonly to: Date

  /** Maximum number of records to return (default: 1000, max: 10000) */
  readonly limit?: number
}

/**
 * Time interval specifications for aggregations
 */
export type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

/**
 * Supported aggregation functions
 */
export type AggregationFunction = 'first' | 'last' | 'max' | 'min' | 'avg' | 'sum' | 'count'

/**
 * Result of a price delta calculation
 */
export interface PriceDelta {
  /** Symbol that was analyzed */
  readonly symbol: string

  /** Starting price */
  readonly startPrice: number

  /** Ending price */
  readonly endPrice: number

  /** Absolute price change */
  readonly delta: number

  /** Percentage change */
  readonly percentChange: number

  /** Time range analyzed */
  readonly timeRange: TimeRange
}

/**
 * Volatility calculation result
 */
export interface VolatilityResult {
  /** Symbol that was analyzed */
  readonly symbol: string

  /** Standard deviation of prices */
  readonly standardDeviation: number

  /** Average price during the period */
  readonly averagePrice: number

  /** Number of data points used */
  readonly sampleCount: number

  /** Time period analyzed in hours */
  readonly periodHours: number
}

/**
 * Latest price information
 */
export interface LatestPrice {
  /** Symbol */
  readonly symbol: string

  /** Latest price */
  readonly price: number

  /** Volume of the latest tick */
  readonly volume?: number | undefined

  /** Timestamp of the latest price */
  readonly timestamp: Date
}

/**
 * Batch operation result
 */
export interface BatchResult {
  /** Number of records successfully processed */
  readonly processed: number

  /** Number of records that failed */
  readonly failed: number

  /** Total time taken in milliseconds */
  readonly durationMs: number

  /** Any errors that occurred during processing */
  readonly errors?: Error[] | undefined
}

/**
 * Query options for pagination and filtering
 */
export interface QueryOptions {
  /** Maximum number of records to return (default: 1000, max: 10000) */
  readonly limit?: number

  /** Number of records to skip (for pagination) */
  readonly offset?: number

  /** Sort order for results */
  readonly orderBy?: {
    readonly column: string
    readonly direction: 'asc' | 'desc'
  }

  /** Additional WHERE conditions */
  readonly where?: Record<string, unknown>

  /** Whether to include statistics in response */
  readonly includeStats?: boolean
}

/**
 * Volume profile analysis result
 */
export interface VolumeProfile {
  /** Price level for this profile entry */
  readonly priceLevel: number

  /** Total volume at this price level */
  readonly volume: number

  /** Number of trades at this price level */
  readonly tradeCount: number

  /** Percentage of total volume */
  readonly volumePercent: number
}

/**
 * Schema information for database introspection
 */
export interface SchemaInfo {
  /** TimescaleDB version */
  readonly version: string

  /** List of hypertables in the database */
  readonly hypertables: readonly HypertableInfo[]

  /** List of indexes in the database */
  readonly indexes: readonly IndexInfo[]

  /** Whether compression is enabled */
  readonly compressionEnabled: boolean

  /** Active retention policies */
  readonly retentionPolicies: readonly RetentionPolicy[]

  /** Schema validation timestamp */
  readonly validatedAt: Date
}

/**
 * Hypertable metadata information
 */
export interface HypertableInfo {
  /** Table name */
  readonly tableName: string

  /** Schema name */
  readonly schemaName: string

  /** Primary time column */
  readonly timeColumn: string

  /** Chunk time interval */
  readonly chunkTimeInterval: string

  /** Number of dimensions */
  readonly numDimensions: number

  /** Number of chunks */
  readonly numChunks: number

  /** Whether compression is enabled */
  readonly compressionEnabled: boolean

  /** Table size in bytes */
  readonly tableSizeBytes: number

  /** Created timestamp */
  readonly createdAt: Date
}

/**
 * Index information
 */
export interface IndexInfo {
  /** Index name */
  readonly indexName: string

  /** Table name */
  readonly tableName: string

  /** Columns included in index */
  readonly columns: readonly string[]

  /** Whether index is unique */
  readonly isUnique: boolean

  /** Whether index is partial */
  readonly isPartial: boolean

  /** Index size in bytes */
  readonly sizeBytes: number

  /** Index definition SQL */
  readonly definition: string
}

/**
 * Retention policy information
 */
export interface RetentionPolicy {
  /** Hypertable name */
  readonly hypertableName: string

  /** Retention period (e.g., '30 days') */
  readonly retentionPeriod: string

  /** Whether policy is active */
  readonly isActive: boolean

  /** Next scheduled execution */
  readonly nextExecution?: Date

  /** Last execution timestamp */
  readonly lastExecution?: Date
}

/**
 * Streaming query configuration
 */
export interface StreamingOptions {
  /** Batch size for streaming results */
  readonly batchSize?: number

  /** Whether to use cursor-based streaming */
  readonly useCursor?: boolean

  /** Buffer size for streaming */
  readonly bufferSize?: number

  /** Timeout for each batch in milliseconds */
  readonly batchTimeoutMs?: number
}

/**
 * Multi-symbol latest price result
 */
export interface MultiSymbolLatest {
  /** Symbol prices */
  readonly prices: readonly LatestPrice[]

  /** Timestamp when data was retrieved */
  readonly retrievedAt: Date

  /** Number of symbols requested */
  readonly requested: number

  /** Number of symbols found */
  readonly found: number
}

/**
 * Top movers analysis result
 */
export interface TopMover {
  /** Symbol */
  readonly symbol: string

  /** Starting price */
  readonly startPrice: number

  /** Current/ending price */
  readonly currentPrice: number

  /** Absolute price change */
  readonly priceChange: number

  /** Percentage change */
  readonly percentChange: number

  /** Volume during the period */
  readonly volume?: number

  /** Time period analyzed */
  readonly periodHours: number
}

/**
 * Connection health check result
 */
export interface HealthCheckResult {
  /** Whether connection is healthy */
  readonly isHealthy: boolean

  /** Response time in milliseconds */
  readonly responseTimeMs: number

  /** TimescaleDB version */
  readonly version?: string | undefined

  /** Database name */
  readonly database?: string | undefined

  /** Connection details */
  readonly connection: {
    readonly host: string
    readonly port: number
    readonly ssl: boolean
  }

  /** Any errors encountered */
  readonly errors?: readonly string[] | undefined

  /** Check timestamp */
  readonly timestamp: Date
}

/**
 * Query statistics for performance monitoring
 */
export interface QueryStats {
  /** SQL query that was executed */
  readonly query: string

  /** Query execution time in milliseconds */
  readonly executionTimeMs: number

  /** Number of rows returned */
  readonly rowCount: number

  /** Timestamp when query was executed */
  readonly timestamp: Date

  /** Query parameters used */
  readonly parameters?: readonly unknown[]

  /** Cache hit information */
  readonly cacheHit?: boolean
}

/**
 * Validation helper functions interface
 */
export interface ValidationHelpers {
  /** Validate symbol format */
  isValidSymbol(symbol: string): boolean

  /** Validate timestamp format */
  isValidTimestamp(timestamp: string): boolean

  /** Validate price value */
  isValidPrice(price: number): boolean

  /** Validate volume value */
  isValidVolume(volume: number): boolean

  /** Validate OHLC relationships */
  isValidOhlc(ohlc: Ohlc): boolean

  /** Validate time range */
  isValidTimeRange(range: TimeRange): boolean

  /** Validate batch size */
  isValidBatchSize(size: number): boolean
}
