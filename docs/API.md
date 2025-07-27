# TimescaleDB Client - API Reference

## Overview

This document provides comprehensive API specifications for the TimescaleDB client, including method signatures, usage patterns, and implementation guidelines for generic time-series data operations.

## Client Initialization

### Factory Methods

The client uses a factory pattern for initialization with different configuration approaches:

```typescript
// From connection string
const client = ClientFactory.fromConnectionString(
  'postgresql://user:pass@host:5432/database',
  { defaultBatchSize: 5000 }
)

// From configuration object
const client = ClientFactory.fromConfig({
  host: 'localhost',
  port: 5432,
  database: 'timescale_db',
  username: 'user',
  password: 'password',
  ssl: true
}, {
  validateInputs: true,
  autoCreateTables: false
})

// From environment variables
const client = ClientFactory.fromEnvironment({
  maxRetries: 5,
  queryTimeout: 60000
})

// Using configuration builder
const client = ConfigPresets
  .production('postgresql://...')
  .clientOptions({ collectStats: true })
  .build()
```

### Direct Instantiation

```typescript
import postgres from 'postgres'
import { TimescaleClient } from './mod.ts'

const sql = postgres('postgresql://...')
const client = new TimescaleClient(sql, {
  defaultBatchSize: 1000,
  validateInputs: true
})
```

## Core API Methods

### Single Insert Operations

#### `insertRecord(record: TimeSeriesRecord): Promise<void>`

Inserts a single time-series record into the database.

```typescript
interface TimeSeriesRecord {
  readonly entity_id: string
  readonly time: string  // ISO 8601 format
  readonly value: number
  readonly value2?: number
  readonly value3?: number
  readonly value4?: number
  readonly metadata?: Record<string, any>
}

// Usage examples
await client.insertRecord({
  entity_id: 'sensor_001',
  time: '2024-01-15T10:30:00.000Z',
  value: 23.5,    // temperature
  value2: 65.2,   // humidity
  metadata: { location: 'room_101', unit: 'celsius' }
})

await client.insertRecord({
  entity_id: 'server_web01',
  time: '2024-01-15T10:30:00.000Z',
  value: 85.3,    // cpu_percent
  value2: 1024,   // memory_mb
  value3: 45.2,   // disk_io_mb
  metadata: { datacenter: 'us-east-1', environment: 'production' }
})
```

**Behavior:**

- Validates input data if `validateInputs` is enabled
- Uses ON CONFLICT DO UPDATE for upsert behavior
- Throws `ValidationError` for invalid data
- Throws `QueryError` for database issues

#### `insertAggregateRecord(record: AggregateRecord): Promise<void>`

Inserts a pre-aggregated time-series record.

```typescript
interface AggregateRecord {
  readonly entity_id: string
  readonly time: string
  readonly interval: string  // '1m', '5m', '1h', '1d'
  readonly min_value: number
  readonly max_value: number
  readonly avg_value: number
  readonly count: number
  readonly sum_value?: number
  readonly metadata?: Record<string, any>
}

// Usage
await client.insertAggregateRecord({
  entity_id: 'sensor_001',
  time: '2024-01-15T10:00:00.000Z',
  interval: '1h',
  min_value: 18.5,
  max_value: 25.2,
  avg_value: 21.8,
  count: 3600,
  metadata: { location: 'room_101' }
})
```

**Behavior:**

- Validates aggregate relationships (min ≤ avg ≤ max)
- Automatic upsert on conflict
- Supports multiple aggregation intervals

### Batch Operations

#### `insertManyRecords(records: TimeSeriesRecord[]): Promise<BatchResult>`

Inserts multiple time-series records efficiently in batches.

```typescript
const sensorData: TimeSeriesRecord[] = [
  { entity_id: 'sensor_001', time: '2024-01-15T10:30:00Z', value: 23.5, value2: 65.2 },
  { entity_id: 'sensor_002', time: '2024-01-15T10:30:00Z', value: 24.1, value2: 63.8 },
  { entity_id: 'sensor_003', time: '2024-01-15T10:30:00Z', value: 22.9, value2: 67.1 },
  // ... more records
]

const result = await client.insertManyRecords(sensorData)
console.log(`Processed: ${result.processed}, Failed: ${result.failed}`)
```

**Parameters:**

- `records`: Array of 1-10,000 TimeSeriesRecord objects
- Returns `BatchResult` with processing statistics

**Behavior:**

- Automatically chunks large arrays based on `defaultBatchSize`
- Uses postgres.js bulk insert for optimal performance
- Continues processing on individual failures (partial success)
- Collects errors for failed records

#### `insertManyAggregates(aggregates: AggregateRecord[]): Promise<BatchResult>`

Inserts multiple aggregate records efficiently.

```typescript
const hourlyAggregates: AggregateRecord[] = [
  {
    entity_id: 'sensor_001',
    time: '2024-01-15T09:00:00Z',
    interval: '1h',
    min_value: 18.5,
    max_value: 25.2,
    avg_value: 21.8,
    count: 3600
  },
  // ... more aggregates
]

const result = await client.insertManyAggregates(hourlyAggregates)
```

**Behavior:**

- Similar to `insertManyRecords` but for aggregate data
- Validates each aggregate's mathematical relationships
- Efficient bulk processing with conflict resolution

### Query Operations

#### `getRecords(entity_id: string, range: TimeRange): Promise<TimeSeriesRecord[]>`

Retrieves time-series records for a specific entity and time range.

```typescript
interface TimeRange {
  readonly from: Date
  readonly to: Date
  readonly limit?: number // Default: 1000, Max: 10000
}

// Usage
const records = await client.getRecords('sensor_001', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z'),
  limit: 5000
})

// Returns array ordered by time DESC (newest first)
records.forEach(record => {
  console.log(`${record.time}: ${record.entity_id} = ${record.value}`)
})
```

**Query Optimization:**

- Uses `ix_time_series_entity_time` index for efficient retrieval
- Automatically applies time-based partitioning
- Returns results ordered by time DESC for recent-first access

#### `getAggregate(entity_id: string, interval: TimeInterval, range: TimeRange): Promise<AggregateRecord[]>`

Retrieves aggregate data for a specific interval.

```typescript
type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

// Usage
const dailyAggregates = await client.getAggregate('sensor_001', '1d', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31'),
  limit: 31
})
```

**Behavior:**

- Queries aggregate table with interval filtering
- Includes calculated fields (min, max, avg, count)
- Optimized for common intervals (1h, 1d) via partial indexes

#### `getAggregateFromRecords(entity_id: string, intervalMinutes: number, range: TimeRange): Promise<AggregateRecord[]>`

Generates aggregate data dynamically from raw records using TimescaleDB aggregation functions.

```typescript
// Generate 15-minute aggregates from raw data
const aggregates = await client.getAggregateFromRecords('sensor_001', 15, {
  from: new Date('2024-01-15T09:00:00Z'),
  to: new Date('2024-01-15T17:00:00Z')
})
```

**Implementation:**

- Uses `time_bucket()` for time-based aggregation
- Employs `min()`, `max()`, `avg()`, `count()` functions
- More flexible than pre-stored aggregates but computationally expensive

### Aggregation Operations

#### `getLatestValue(entity_id: string): Promise<number | null>`

Gets the most recent value for an entity.

```typescript
const currentValue = await client.getLatestValue('sensor_001')
if (currentValue !== null) {
  console.log(`Current sensor value: ${currentValue}`)
} else {
  console.log('No data available')
}
```

**Optimization:**

- Single-row query with time DESC ordering
- Uses covering index for maximum performance
- Returns `null` if no data exists

#### `getValueDelta(entity_id: string, from: Date, to: Date): Promise<number>`

Calculates absolute value change between two time points.

```typescript
const delta = await client.getValueDelta('sensor_001',
  new Date('2024-01-15T09:00:00Z'),
  new Date('2024-01-15T17:00:00Z')
)

console.log(`Value changed by ${delta}`)
```

**Implementation:**

- Uses `first()` and `last()` aggregate functions
- Returns 0 if insufficient data
- Optimized single-query approach

#### `getVariance(entity_id: string, hours: number): Promise<number>`

Calculates value variance (standard deviation) over a time period.

```typescript
// Get 24-hour variance
const variance = await client.getVariance('sensor_001', 24)
console.log(`24h variance: ${variance}`)
```

**Calculation:**

- Uses PostgreSQL `stddev()` aggregate function
- Calculates over value within the time window
- Returns 0 if insufficient data points

### Advanced Query Methods

#### `getMultiEntityLatest(entity_ids: string[]): Promise<LatestValue[]>`

Efficiently retrieves latest values for multiple entities.

```typescript
const entities = ['sensor_001', 'sensor_002', 'sensor_003']
const latestValues = await client.getMultiEntityLatest(entities)

latestValues.forEach(latest => {
  console.log(`${latest.entity_id}: ${latest.value} at ${latest.time}`)
})
```

#### `getTopChanges(limit: number, hours: number): Promise<ValueDelta[]>`

Gets entities with the largest value changes.

```typescript
// Top 10 changes in last 24 hours
const changes = await client.getTopChanges(10, 24)
changes.forEach(change => {
  console.log(`${change.entity_id}: ${change.percentChange.toFixed(2)}%`)
})
```

#### `getValueDistribution(entity_id: string, range: TimeRange, buckets: number): Promise<ValueDistribution[]>`

Analyzes value distribution across ranges.

```typescript
interface ValueDistribution {
  readonly valueRange: string
  readonly count: number
  readonly percentage: number
}

const distribution = await client.getValueDistribution('sensor_001', timeRange, 20)
```

## Streaming Operations

### `getRecordsStream(entity_id: string, range: TimeRange): Promise<AsyncIterable<TimeSeriesRecord>>`

Streams large datasets to avoid memory issues.

```typescript
const recordStream = await client.getRecordsStream('sensor_001', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

for await (const record of recordStream) {
  // Process record without loading entire dataset into memory
  console.log(`${record.time}: ${record.value}`)
}
```

**Benefits:**

- Memory-efficient processing of large datasets
- Uses postgres.js cursor functionality
- Backpressure handling for rate-limited processing

## Connection Management

### `healthCheck(): Promise<boolean>`

Verifies database connectivity and TimescaleDB extension availability.

```typescript
const isHealthy = await client.healthCheck()
if (!isHealthy) {
  console.error('Database connection issues detected')
}
```

### `close(): Promise<void>`

Gracefully closes all database connections.

```typescript
// Cleanup on application shutdown
await client.close()
```

**Behavior:**

- Waits for pending queries to complete (with timeout)
- Closes postgres.js connection pool
- Prevents new queries from being initiated

## Schema Management

### `ensureSchema(): Promise<void>`

Automatically creates required tables and indexes if they don't exist.

```typescript
// Call once during application initialization
await client.ensureSchema()
```

**Operations:**

- Creates `time_series_records` and `aggregate_records` hypertables
- Sets up optimized indexes
- Configures TimescaleDB-specific settings
- Validates existing schema compatibility

### `getSchemaInfo(): Promise<SchemaInfo>`

Returns information about the current database schema.

```typescript
interface SchemaInfo {
  readonly version: string
  readonly hypertables: HypertableInfo[]
  readonly indexes: IndexInfo[]
  readonly compressionEnabled: boolean
  readonly retentionPolicies: RetentionPolicy[]
}

const info = await client.getSchemaInfo()
console.log(`Schema version: ${info.version}`)
```

## Error Handling Patterns

### Standard Error Types

All client methods can throw these error types:

```typescript
try {
  await client.insertRecord(invalidRecord)
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Validation failed: ${error.field} = ${error.value}`)
  } else if (error instanceof ConnectionError) {
    console.error('Database connection issue')
  } else if (error instanceof QueryError) {
    console.error('Query execution failed')
  }
}
```

### Retry Logic

Built-in retry handling for transient errors:

```typescript
// Automatically retries connection errors with exponential backoff
const client = new TimescaleClient(sql, {
  maxRetries: 3,
  retryBaseDelay: 1000
})

// Manual retry check
if (ErrorUtils.isRetryableError(error)) {
  // Error can be safely retried
}
```

## Performance Considerations

### Batch Size Optimization

```typescript
// Optimal batch sizes by operation type
const client = new TimescaleClient(sql, {
  defaultBatchSize: 5000 // For high-frequency sensor data
})

// Smaller batches for aggregate data
await client.insertManyAggregates(aggregates, { batchSize: 1000 })
```

### Query Result Limits

```typescript
// Use streaming for large result sets
if (expectedRows > 10000) {
  const stream = await client.getRecordsStream(entity_id, range)
  // Process streaming
} else {
  const records = await client.getRecords(entity_id, range)
  // Process in memory
}
```

### Index Utilization

The client is designed to leverage specific indexes for optimal performance:

- Entity + Time queries: Uses `ix_time_series_entity_time`
- Time range scans: Uses `ix_time_series_time`
- Value analysis: Uses `ix_time_series_value_time`
- Recent data: Uses partial indexes for hot data

## Usage Examples

### IoT Sensor Monitoring

```typescript
import { ClientFactory } from 'timescaledb-client'

// Initialize client
const client = ClientFactory.production(process.env.DATABASE_URL!)

// Real-time sensor data ingestion
async function ingestSensorData(entity_id: string, temperature: number, humidity: number) {
  await client.insertRecord({
    entity_id,
    time: new Date().toISOString(),
    value: temperature,
    value2: humidity,
    metadata: { sensor_type: 'dht22', location: 'warehouse_a' }
  })
}

// Monitor current sensor values
async function getCurrentSensorValues(sensor_ids: string[]) {
  return await client.getMultiEntityLatest(sensor_ids)
}

// Analyze sensor trends
async function analyzeSensorTrends(entity_id: string, days: number) {
  const range = {
    from: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    to: new Date()
  }

  const [delta, variance] = await Promise.all([
    client.getValueDelta(entity_id, range.from, range.to),
    client.getVariance(entity_id, days * 24)
  ])

  return { delta, variance }
}
```

### System Monitoring Pipeline

```typescript
// Batch processing pipeline
async function processBatch(records: TimeSeriesRecord[]) {
  const BATCH_SIZE = 10000

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const result = await client.insertManyRecords(batch)

    if (result.failed > 0) {
      console.warn(`Batch had ${result.failed} failures`)
      // Handle partial failures
    }
  }
}

// Generate hourly aggregates from raw data
async function generateHourlyAggregates(entity_id: string, date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  // Generate hourly aggregates
  const hourlyAggregates = await client.getAggregateFromRecords(entity_id, 60, {
    from: dayStart,
    to: dayEnd
  })

  // Store as pre-computed aggregate data
  await client.insertManyAggregates(hourlyAggregates.map(aggregate => ({
    ...aggregate,
    interval: '1h'
  })))
}
```

This API design provides a comprehensive, type-safe interface for working with generic time-series data in TimescaleDB while maintaining optimal performance and developer experience.
