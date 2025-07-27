# TimescaleDB Client - API Reference

## Table of Contents

1. [Client Initialization](#client-initialization)
2. [Connection Management](#connection-management)
3. [Data Insertion](#data-insertion)
4. [Data Querying](#data-querying)
5. [Aggregation Operations](#aggregation-operations)
6. [Streaming Operations](#streaming-operations)
7. [Schema Management](#schema-management)
8. [Error Handling](#error-handling)
9. [Type Definitions](#type-definitions)
10. [Configuration Options](#configuration-options)
11. [Performance Considerations](#performance-considerations)

---

## Client Initialization

### Factory Pattern (Recommended)

The [`ClientFactory`](../src/factory.ts:1) provides multiple ways to create [`TimescaleClient`](../src/client.ts:124) instances:

#### `ClientFactory.fromConnectionString()`

```typescript
import { ClientFactory } from '@timescale/client'

const client = await ClientFactory.fromConnectionString(
  'postgresql://user:pass@host:5432/iot_database',
  {
    defaultBatchSize: 5000,
    validateInputs: true,
    autoCreateTables: true
  }
)
```

**Parameters:**

- `connectionString` (string): PostgreSQL connection string
- `options` (TimescaleClientConfig, optional): Client configuration options

**Returns:** `Promise<TimescaleClient>`

#### `ClientFactory.fromConfig()`

```typescript
const client = await ClientFactory.fromConfig({
  host: 'localhost',
  port: 5432,
  database: 'sensor_data',
  username: 'user',
  password: 'password',
  ssl: true
}, {
  validateInputs: true,
  autoCreateTables: false
})
```

**Parameters:**

- `config` (ConnectionConfig): Database connection configuration
- `options` (TimescaleClientConfig, optional): Client configuration options

**Returns:** `Promise<TimescaleClient>`

#### `ClientFactory.fromEnvironment()`

```typescript
// Uses DATABASE_URL environment variable
const client = await ClientFactory.fromEnvironment({
  maxRetries: 5,
  queryTimeout: 60000
})
```

**Parameters:**

- `options` (TimescaleClientConfig, optional): Client configuration options

**Returns:** `Promise<TimescaleClient>`

### Direct Instantiation

```typescript
import postgres from 'postgres'
import { TimescaleClient } from '@timescale/client'

const sql = postgres('postgresql://...')
const client = new TimescaleClient(sql, {
  defaultBatchSize: 1000,
  validateInputs: true
})
```

---

## Connection Management

### `initialize()`

Initializes the client and optionally ensures schema exists.

```typescript
await client.initialize()
```

**Returns:** `Promise<void>`

**Throws:**

- [`ConnectionError`](../src/types/errors.ts:1) if initialization fails

### `healthCheck()`

Verifies database connectivity and TimescaleDB extension availability.

```typescript
const health = await client.healthCheck()

if (health.isHealthy) {
  console.log(`Connected to TimescaleDB ${health.version}`)
  console.log(`Response time: ${health.responseTimeMs}ms`)
}
```

**Returns:** `Promise<HealthCheckResult>`

```typescript
interface HealthCheckResult {
  readonly isHealthy: boolean
  readonly responseTimeMs: number
  readonly version?: string
  readonly database?: string
  readonly connection: {
    readonly host: string
    readonly port: number
    readonly ssl: boolean
  }
  readonly errors?: string[]
  readonly timestamp: Date
}
```

### `close()`

Gracefully closes all database connections.

```typescript
await client.close()
```

**Returns:** `Promise<void>`

**Behavior:**

- Waits for pending queries to complete
- Closes postgres.js connection pool
- Prevents new queries from being initiated

---

## Data Insertion

### `insertRecord()`

Inserts a single time-series record into the database.

```typescript
await client.insertRecord({
  entity_id: 'sensor_001',
  time: '2024-01-15T10:30:00.000Z',
  value: 23.5,      // Temperature
  value2: 65.2,     // Humidity
  metadata: { location: 'warehouse_a', type: 'DHT22' }
})
```

**Parameters:**

- `record` (TimeSeriesRecord): Time-series data record
- `options` (InsertOptions, optional): Insert configuration

**Returns:** `Promise<void>`

**Throws:**

- [`ValidationError`](../src/types/errors.ts:1) for invalid data
- [`QueryError`](../src/types/errors.ts:1) for database issues

### `insertManyRecords()`

Inserts multiple time-series records efficiently in batches.

```typescript
const records: TimeSeriesRecord[] = [
  {
    entity_id: 'temp_sensor_01',
    time: '2024-01-15T10:30:00Z',
    value: 22.1,
    value2: 58.3,
    metadata: { room: 'server_room' }
  },
  {
    entity_id: 'temp_sensor_02',
    time: '2024-01-15T10:30:01Z',
    value: 19.8,
    value2: 62.1,
    metadata: { room: 'storage' }
  },
  // ... more records
]

const result = await client.insertManyRecords(records)
console.log(`Processed: ${result.processed}, Failed: ${result.failed}`)
```

**Parameters:**

- `records` (TimeSeriesRecord[]): Array of 1-10,000 time-series records
- `options` (InsertOptions, optional): Insert configuration

**Returns:** `Promise<BatchResult>`

```typescript
interface BatchResult {
  readonly processed: number
  readonly failed: number
  readonly durationMs: number
  readonly errors: Error[]
}
```

**Behavior:**

- Automatically chunks large arrays based on `defaultBatchSize`
- Uses postgres.js bulk insert for optimal performance
- Continues processing on individual failures (partial success)

---

## Data Querying

### `getRecords()`

Retrieves time-series records for a specific entity and time range.

```typescript
const records = await client.getRecords('temp_sensor_01', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z'),
  limit: 5000
})

// Returns array ordered by time DESC (newest first)
records.forEach(record => {
  console.log(`${record.time}: ${record.entity_id} = ${record.value}°C`)
})
```

**Parameters:**

- `entity_id` (string): Entity identifier to query
- `range` (TimeRange): Time range for query
- `options` (SelectOptions, optional): Query configuration

**Returns:** `Promise<TimeSeriesRecord[]>`

**Query Optimization:**

- Uses `ix_time_series_data_entity_id_time` index for efficient retrieval
- Automatically applies time-based partitioning
- Returns results ordered by time DESC

### `getLatestValues()`

Gets the most recent values for one or more entities.

```typescript
const latest = await client.getLatestValues(['temp_sensor_01', 'humidity_sensor_01'])
latest.forEach(record => {
  console.log(`${record.entity_id}: ${record.value} (${record.time})`)
})
```

**Parameters:**

- `entity_ids` (string | string[]): Entity identifier(s) to query

**Returns:** `Promise<TimeSeriesRecord[]>`

**Optimization:**

- Single-row query per entity with time DESC ordering
- Uses covering index for maximum performance
- Returns empty array if no data exists

### `getMultiEntityData()`

Efficiently retrieves data for multiple entities within a time range.

```typescript
const entities = ['sensor_001', 'sensor_002', 'sensor_003']
const result = await client.getMultiEntityData(entities, {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z'),
  limit: 1000
})

console.log(`Found ${result.length} records across ${entities.length} entities`)
```

**Parameters:**

- `entity_ids` (string[]): Array of entity identifiers to query
- `range` (TimeRange): Time range for query
- `options` (SelectOptions, optional): Query configuration

**Returns:** `Promise<TimeSeriesRecord[]>`

---

## Aggregation Operations

### `getAggregate()`

Calculates aggregate statistics over a time period.

```typescript
const avgTemp = await client.getAggregate('temp_sensor_01', 'avg', 'value', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z')
})

console.log(`Average temperature: ${avgTemp}°C`)
```

**Parameters:**

- `entity_id` (string): Entity identifier to analyze
- `aggregateFunction` ('avg' | 'min' | 'max' | 'sum' | 'count'): Aggregate function
- `column` ('value' | 'value2' | 'value3' | 'value4'): Column to aggregate
- `range` (TimeRange): Time range for analysis

**Returns:** `Promise<number>`

### `getTimeBuckets()`

Groups data into time buckets with aggregation.

```typescript
const hourlyData = await client.getTimeBuckets('cpu_monitor', '1 hour', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z'),
  aggregateColumn: 'value',
  aggregateFunction: 'avg'
})

hourlyData.forEach(bucket => {
  console.log(`${bucket.bucket}: Avg CPU = ${bucket.value}%`)
})
```

**Parameters:**

- `entity_id` (string): Entity identifier to analyze
- `bucketInterval` (string): Time bucket interval ('1m', '5m', '1h', etc.)
- `range` (TimeRange): Time range for analysis
- `options` (AggregationOptions, optional): Aggregation configuration

**Returns:** `Promise<TimeBucketResult[]>`

```typescript
interface TimeBucketResult {
  readonly bucket: Date
  readonly entity_id: string
  readonly value: number
  readonly count: number
}
```

**Implementation:**

- Uses `time_bucket()` for time-based aggregation
- Employs `first()`, `last()`, `max()`, `min()`, `avg()` functions
- Optimized for TimescaleDB's continuous aggregates

### `getStatistics()`

Get comprehensive statistics for an entity over a time period.

```typescript
const stats = await client.getStatistics('sensor_001', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z')
})

console.log(`Min: ${stats.min}, Max: ${stats.max}, Avg: ${stats.avg}`)
console.log(`Std Dev: ${stats.stddev}, Count: ${stats.count}`)
```

**Parameters:**

- `entity_id` (string): Entity identifier to analyze
- `range` (TimeRange): Time range for analysis
- `options` (StatisticsOptions, optional): Statistics configuration

**Returns:** `Promise<StatisticsResult>`

```typescript
interface StatisticsResult {
  readonly entity_id: string
  readonly min: number
  readonly max: number
  readonly avg: number
  readonly sum: number
  readonly count: number
  readonly stddev: number
  readonly variance: number
}
```

---

## Streaming Operations

### `getRecordStream()`

Streams large datasets to avoid memory issues.

```typescript
const recordStream = await client.getRecordStream('sensor_001', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

for await (const recordBatch of recordStream) {
  // Process batch of records without loading entire dataset into memory
  console.log(`Processing batch of ${recordBatch.length} records`)

  recordBatch.forEach(record => {
    console.log(`${record.time}: ${record.value}`)
  })
}
```

**Parameters:**

- `entity_id` (string): Entity identifier to stream
- `range` (TimeRange): Time range for streaming
- `options` (object, optional): Streaming options
  - `batchSize` (number): Size of each batch

**Returns:** `Promise<AsyncIterable<TimeSeriesRecord[]>>`

**Benefits:**

- Memory-efficient processing of large datasets
- Uses postgres.js cursor functionality
- Backpressure handling for rate-limited processing

### `insertRecordStream()`

Stream large datasets for insertion without memory issues.

```typescript
async function* generateSensorData() {
  for (let i = 0; i < 1000000; i++) {
    yield {
      entity_id: 'sensor_001',
      time: new Date(Date.now() + i * 1000).toISOString(),
      value: Math.random() * 100,
      value2: Math.random() * 50
    }
  }
}

await client.insertRecordStream(generateSensorData())
```

**Parameters:**

- `recordStream` (`AsyncIterable<TimeSeriesRecord>`): Stream of records to insert
- `options` (StreamInsertOptions, optional): Insert configuration

**Returns:** `Promise<StreamResult>`

---

## Schema Management

### `ensureSchema()`

Automatically creates required tables and indexes if they don't exist.

```typescript
// Call once during application initialization
await client.ensureSchema()
```

**Returns:** `Promise<void>`

**Operations:**

- Creates `time_series_data` and `entities` hypertables
- Sets up optimized indexes
- Configures TimescaleDB-specific settings
- Validates existing schema compatibility

### `createHypertable()`

Creates a TimescaleDB hypertable with specified configuration.

```typescript
await client.createHypertable('custom_metrics', {
  timeColumn: 'timestamp',
  chunkTimeInterval: '1 day',
  partitioningColumn: 'device_id'
})
```

**Parameters:**

- `tableName` (string): Name of the table to convert
- `options` (HypertableOptions): Hypertable configuration

**Returns:** `Promise<void>`

### `enableCompression()`

Enables compression for a hypertable to reduce storage usage.

```typescript
await client.enableCompression('time_series_data', {
  compressAfter: '7 days',
  segmentBy: 'entity_id',
  orderBy: 'time DESC'
})
```

**Parameters:**

- `tableName` (string): Name of the hypertable
- `options` (CompressionOptions): Compression configuration

**Returns:** `Promise<void>`

### `getSchemaInfo()`

Returns information about the current database schema.

```typescript
const info = await client.getSchemaInfo()
console.log(`Schema version: ${info.version}`)
console.log(`Compression enabled: ${info.compressionEnabled}`)

info.hypertables.forEach(table => {
  console.log(`Table: ${table.tableName}, Chunks: ${table.numChunks}`)
})
```

**Returns:** `Promise<SchemaInfo>`

```typescript
interface SchemaInfo {
  readonly version: string
  readonly hypertables: HypertableInfo[]
  readonly indexes: IndexInfo[]
  readonly compressionEnabled: boolean
  readonly retentionPolicies: RetentionPolicy[]
  readonly validatedAt: Date
}
```

---

## Error Handling

### Error Types

All client methods can throw these error types:

```typescript
import {
  ValidationError,
  QueryError,
  ConnectionError,
  BatchError
} from '@timescale/client'

try {
  await client.insertRecord(invalidRecord)
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Validation failed: ${error.field} = ${error.value}`)
  } else if (error instanceof ConnectionError) {
    console.error('Database connection issue')
  } else if (error instanceof QueryError) {
    console.error('Query execution failed')
  } else if (error instanceof BatchError) {
    console.error('Batch operation failed')
  }
}
```

### Error Utilities

```typescript
import { ErrorUtils } from '@timescale/client'

// Check if error is retryable
if (ErrorUtils.isRetryableError(error)) {
  // Safe to retry the operation
}

// Get error context
const context = ErrorUtils.getErrorContext(error)
console.log(`Error type: ${context.type}`)
console.log(`Retryable: ${context.retryable}`)
```

### Custom Error Handlers

```typescript
const client = new TimescaleClient(sql, {
  errorHandlers: {
    onValidationError: (error) => {
      console.warn(`Validation error: ${error.message}`)
    },
    onQueryError: (error) => {
      console.error(`Query failed: ${error.message}`)
    },
    onConnectionError: (error) => {
      console.error(`Connection issue: ${error.message}`)
    },
    onBatchError: (error) => {
      console.error(`Batch operation failed: ${error.message}`)
    }
  }
})
```

---

## Type Definitions

### Core Data Types

```typescript
interface TimeSeriesRecord {
  readonly entity_id: string
  readonly time: string // ISO 8601 format
  readonly value: number
  readonly value2?: number
  readonly value3?: number
  readonly value4?: number
  readonly metadata?: Record<string, any>
}

interface TimeRange {
  readonly from: Date
  readonly to: Date
  readonly limit?: number // Max: 10000
}

interface Entity {
  readonly entity_id: string
  readonly entity_type: string
  readonly name?: string
  readonly is_active: boolean
  readonly metadata?: Record<string, any>
  readonly created_at: Date
  readonly updated_at: Date
}
```

### Result Types

```typescript
interface BatchResult {
  readonly processed: number
  readonly failed: number
  readonly durationMs: number
  readonly errors: Error[]
}

interface TimeBucketResult {
  readonly bucket: Date
  readonly entity_id: string
  readonly value: number
  readonly count: number
}

interface StatisticsResult {
  readonly entity_id: string
  readonly min: number
  readonly max: number
  readonly avg: number
  readonly sum: number
  readonly count: number
  readonly stddev: number
  readonly variance: number
}

interface StreamResult {
  readonly totalProcessed: number
  readonly totalFailed: number
  readonly durationMs: number
  readonly errors: Error[]
}
```

---

## Configuration Options

### TimescaleClientConfig

```typescript
interface TimescaleClientConfig extends ClientOptions {
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
```

### ClientOptions

```typescript
interface ClientOptions {
  /** Default batch size for bulk operations */
  readonly defaultBatchSize?: number        // Default: 1000

  /** Maximum number of retries for failed operations */
  readonly maxRetries?: number             // Default: 3

  /** Base delay between retries in milliseconds */
  readonly retryBaseDelay?: number         // Default: 1000

  /** Query timeout in milliseconds */
  readonly queryTimeout?: number           // Default: 30000

  /** Whether to automatically create tables if they don't exist */
  readonly autoCreateTables?: boolean      // Default: false

  /** Whether to automatically create indexes */
  readonly autoCreateIndexes?: boolean     // Default: true

  /** Default limit for query results */
  readonly defaultLimit?: number           // Default: 1000

  /** Whether to validate input data before insertion */
  readonly validateInputs?: boolean        // Default: true

  /** Whether to collect query statistics */
  readonly collectStats?: boolean          // Default: false

  /** Timezone for time-based operations */
  readonly timezone?: string               // Default: 'UTC'

  /** Whether to use streaming for large result sets */
  readonly useStreaming?: boolean          // Default: true

  /** Threshold for switching to streaming mode */
  readonly streamingThreshold?: number     // Default: 1000

  /** Logger instance for debugging */
  readonly logger?: Logger
}
```

### Operation Options

```typescript
interface InsertOptions {
  readonly upsert?: boolean               // Default: true
  readonly batchSize?: number
  readonly useTransaction?: boolean       // Default: true
  readonly timeoutMs?: number
  readonly validate?: boolean
}

interface SelectOptions {
  readonly limit?: number
  readonly offset?: number
  readonly orderBy?: {
    readonly column: string
    readonly direction: 'asc' | 'desc'
  }
  readonly where?: Record<string, any>
  readonly includeStats?: boolean
  readonly includeMetadata?: boolean
  readonly useStreaming?: boolean
}

interface AggregationOptions {
  readonly aggregateColumn?: 'value' | 'value2' | 'value3' | 'value4'
  readonly aggregateFunction?: 'avg' | 'min' | 'max' | 'sum' | 'count'
  readonly fillGaps?: boolean
  readonly fillValue?: number | null
  readonly includeMetadata?: boolean
}
```

---

## Performance Considerations

### Batch Size Optimization

```typescript
// Optimal batch sizes by operation type
const client = new TimescaleClient(sql, {
  defaultBatchSize: 5000 // For high-frequency sensor data
})

// Smaller batches for complex records with metadata
const result = await client.insertManyRecords(records, { batchSize: 1000 })
```

### Query Result Limits

```typescript
// Use streaming for large result sets
const STREAMING_THRESHOLD = 10000

if (expectedRows > STREAMING_THRESHOLD) {
  const stream = await client.getRecordStream(entity_id, range)
  // Process streaming
  for await (const batch of stream) {
    // Process batch
  }
} else {
  const records = await client.getRecords(entity_id, range)
  // Process in memory
}
```

### Index Utilization

The client is designed to leverage specific indexes for optimal performance:

- **Entity + Time queries**: Uses `ix_time_series_data_entity_id_time`
- **Time range scans**: Uses `ix_time_series_data_time`
- **Value analysis**: Uses `ix_time_series_data_value_time`
- **Recent data**: Uses partial indexes for hot data

### Memory Management

```typescript
// For large datasets, use streaming
const stream = await client.getRecordStream('sensor_001', {
  from: new Date('2024-01-01'),
  to: new Date('2024-12-31')
})

// Process in chunks to avoid memory issues
for await (const batch of stream) {
  // Process batch of reasonable size
  await processBatch(batch)
}
```

### Connection Pooling

```typescript
// Configure connection pool for high-throughput applications
const client = await ClientFactory.fromConnectionString(connectionString, {
  maxRetries: 5,
  retryBaseDelay: 500,
  queryTimeout: 60000,
  defaultBatchSize: 10000
})
```

---

## Best Practices

### 1. Initialization

```typescript
// Initialize client once at application startup
const client = await ClientFactory.fromConnectionString(process.env.DATABASE_URL!, {
  autoEnsureSchema: true,
  validateInputs: true,
  collectStats: true
})

// Always initialize
await client.initialize()

// Check health before use
const health = await client.healthCheck()
if (!health.isHealthy) {
  throw new Error('Database not healthy')
}
```

### 2. Error Handling

```typescript
// Implement comprehensive error handling
import { ValidationError, QueryError, ConnectionError } from '@timescale/client'

try {
  await client.insertRecord(record)
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors
    console.error('Invalid data:', error.field, error.value)
  } else if (error instanceof ConnectionError) {
    // Handle connection issues
    console.error('Connection failed:', error.message)
    // Implement retry logic
  } else if (error instanceof QueryError) {
    // Handle query errors
    console.error('Query failed:', error.message)
  }
}
```

### 3. Cleanup

```typescript
// Always close client on application shutdown
process.on('SIGINT', async () => {
  await client.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await client.close()
  process.exit(0)
})
```

### 4. Production Configuration

```typescript
// Production-ready configuration
const client = await ClientFactory.fromConnectionString(connectionString, {
  maxRetries: 5,
  retryBaseDelay: 1000,
  queryTimeout: 60000,
  defaultBatchSize: 5000,
  validateInputs: false,  // Disable in production for performance
  collectStats: false,    // Disable in production for performance
  autoCreateTables: false, // Don't auto-create in production
  logger: productionLogger
})
```

---

This API reference provides comprehensive documentation for all public methods and types in the clean TimescaleDB client. For additional examples and use cases, see the [Getting Started Guide](GETTING_STARTED.md) and explore the generic time-series interface for your specific domain needs.
