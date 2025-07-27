/**
 * Universal interfaces for TimescaleDB client supporting any time-series domain
 *
 * This module provides generic interfaces that can handle IoT sensor readings,
 * monitoring metrics, logging events, and any other time-series use case. The design follows
 * TimescaleDB best practices with entity-based modeling and flexible value storage.
 */

/**
 * Universal time-series record supporting any domain
 *
 * Maps various data types:
 * - IoT: Sensor → {time, entity_id: "sensor_001", value: temperature, value2: humidity}
 * - Monitoring: Server → {time, entity_id: "server_01", value: cpu_usage, value2: memory_usage}
 * - Logging: Event → {time, entity_id: "service_api", value: error_count, metadata: details}
 * - Custom: Any → {time, entity_id: "entity_123", value: measurement1, value2: measurement2, value3: measurement3, value4: measurement4}
 */
export interface TimeSeriesRecord {
  /** ISO 8601 timestamp string for the data point */
  readonly time: string

  /** Unique identifier for the entity (sensor_id, server_id, service_id, etc.) */
  readonly entity_id: string

  /** Primary numeric value (temperature, cpu_usage, error_count, measurement, etc.) */
  readonly value: number

  /** Secondary numeric value (humidity, memory_usage, response_time, etc.) - optional */
  readonly value2?: number | undefined

  /** Tertiary numeric value (pressure, disk_usage, latency, etc.) - optional */
  readonly value3?: number | undefined

  /** Quaternary numeric value (altitude, network_usage, throughput, etc.) - optional */
  readonly value4?: number | undefined

  /** Additional structured data specific to the domain */
  readonly metadata?: Record<string, unknown> | undefined
}

/**
 * Entity metadata for any domain type
 *
 * Examples:
 * - IoT: {entity_id: "sensor_001", entity_type: "temperature_sensor", metadata: {location: "warehouse_a"}}
 * - Monitoring: {entity_id: "server_01", entity_type: "server", metadata: {datacenter: "us-east-1"}}
 * - Logging: {entity_id: "service_api", entity_type: "microservice", metadata: {version: "1.2.3"}}
 * - Custom: {entity_id: "device_123", entity_type: "measurement_device", metadata: {calibrated_at: "2024-01-01"}}
 */
export interface EntityMetadata {
  /** Unique identifier for the entity */
  readonly entity_id: string

  /** Type/category of the entity (sensor, server, service, device, etc.) */
  readonly entity_type: string

  /** Display name for the entity */
  readonly name?: string | undefined

  /** Detailed description of the entity */
  readonly description?: string | undefined

  /** Domain-specific metadata */
  readonly metadata?: Record<string, unknown> | undefined

  /** Entity creation timestamp */
  readonly created_at?: Date | undefined

  /** Last update timestamp */
  readonly updated_at?: Date | undefined

  /** Whether the entity is currently active */
  readonly is_active?: boolean | undefined
}

/**
 * Time range specification for querying historical data
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
export type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M'

/**
 * Supported aggregation functions for time-series data
 */
export type AggregationFunction = 'first' | 'last' | 'max' | 'min' | 'avg' | 'sum' | 'count' | 'stddev'

/**
 * Aggregated time-series result
 */
export interface AggregationResult {
  /** Time bucket for the aggregation */
  readonly time: Date

  /** Entity that was aggregated */
  readonly entity_id: string

  /** Aggregated value */
  readonly value: number

  /** Aggregated value2 (if applicable) */
  readonly value2?: number | undefined

  /** Aggregated value3 (if applicable) */
  readonly value3?: number | undefined

  /** Aggregated value4 (if applicable) */
  readonly value4?: number | undefined

  /** Number of data points used in aggregation */
  readonly count: number

  /** Aggregation function applied */
  readonly function: AggregationFunction
}

/**
 * Latest record information for any entity
 */
export interface LatestRecord {
  /** Entity identifier */
  readonly entity_id: string

  /** Latest value */
  readonly value: number

  /** Latest value2 (if applicable) */
  readonly value2?: number | undefined

  /** Latest value3 (if applicable) */
  readonly value3?: number | undefined

  /** Latest value4 (if applicable) */
  readonly value4?: number | undefined

  /** Metadata from the latest record */
  readonly metadata?: Record<string, unknown> | undefined

  /** Timestamp of the latest record */
  readonly time: Date
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

  /** Specific entity types to filter */
  readonly entityTypes?: readonly string[]

  /** Entity IDs to filter */
  readonly entityIds?: readonly string[]
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
 * Multi-entity latest records result
 */
export interface MultiEntityLatest {
  /** Entity records */
  readonly records: readonly LatestRecord[]

  /** Timestamp when data was retrieved */
  readonly retrievedAt: Date

  /** Number of entities requested */
  readonly requested: number

  /** Number of entities found */
  readonly found: number
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
 * Statistical analysis result for any numeric values
 */
export interface StatisticalResult {
  /** Entity that was analyzed */
  readonly entity_id: string

  /** Statistical measure name */
  readonly measure: string

  /** Result value */
  readonly value: number

  /** Number of data points used */
  readonly sampleCount: number

  /** Time period analyzed */
  readonly timeRange: TimeRange

  /** Additional context */
  readonly metadata?: Record<string, unknown> | undefined
}

/**
 * Universal validation helper functions interface
 */
export interface ValidationHelpers {
  /** Validate entity ID format */
  isValidEntityId(entityId: string): boolean

  /** Validate timestamp format */
  isValidTimestamp(timestamp: string): boolean

  /** Validate numeric value */
  isValidValue(value: number): boolean

  /** Validate time-series record structure */
  isValidTimeSeriesRecord(record: TimeSeriesRecord): boolean

  /** Validate entity metadata structure */
  isValidEntityMetadata(metadata: EntityMetadata): boolean

  /** Validate time range */
  isValidTimeRange(range: TimeRange): boolean

  /** Validate batch size */
  isValidBatchSize(size: number): boolean

  /** Validate entity type */
  isValidEntityType(entityType: string): boolean
}

/**
 * Filter criteria for advanced querying
 */
export interface FilterCriteria {
  /** Entity ID patterns (supports wildcards) */
  readonly entityIdPattern?: string

  /** Entity types to include */
  readonly entityTypes?: readonly string[]

  /** Value range filters */
  readonly valueRange?: {
    readonly min?: number
    readonly max?: number
  }

  /** Value2 range filters */
  readonly value2Range?: {
    readonly min?: number
    readonly max?: number
  }

  /** Metadata filters (JSON path queries) */
  readonly metadataFilters?: Record<string, unknown>

  /** Time-based filters */
  readonly timeFilters?: {
    readonly minTime?: Date
    readonly maxTime?: Date
    readonly timeOfDay?: {
      readonly start: string // HH:MM format
      readonly end: string // HH:MM format
    }
    readonly daysOfWeek?: readonly number[] // 0-6, Sunday=0
  }
}

/**
 * Bulk operation configuration
 */
export interface BulkOperationConfig {
  /** Batch size for processing */
  readonly batchSize?: number

  /** Whether to continue on errors */
  readonly continueOnError?: boolean

  /** Maximum number of retries per batch */
  readonly maxRetries?: number

  /** Parallel processing workers */
  readonly parallelWorkers?: number

  /** Progress callback */
  readonly onProgress?: (processed: number, total: number) => void

  /** Error callback */
  readonly onError?: (error: Error, recordIndex: number) => void
}
