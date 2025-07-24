# TimescaleDB Client - API Reference

## Overview

This document provides comprehensive API specifications for the TimescaleDB client, including method signatures, usage patterns, and implementation guidelines that match the README.md specification.

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

#### `insertTick(tick: PriceTick): Promise<void>`

Inserts a single price tick into the database.

```typescript
interface PriceTick {
  readonly symbol: string
  readonly price: number
  readonly volume?: number
  readonly timestamp: string // ISO 8601 format
}

// Usage
await client.insertTick({
  symbol: 'BTCUSD',
  price: 45000.50,
  volume: 1.25,
  timestamp: '2024-01-15T10:30:00.000Z'
})
```

**Behavior:**

- Validates input data if `validateInputs` is enabled
- Uses ON CONFLICT DO UPDATE for upsert behavior
- Throws `ValidationError` for invalid data
- Throws `QueryError` for database issues

#### `insertOhlc(candle: Ohlc): Promise<void>`

Inserts a single OHLC candle into the database.

```typescript
interface Ohlc {
  readonly symbol: string
  readonly timestamp: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume?: number
}

// Usage
await client.insertOhlc({
  symbol: 'ETHUSD',
  timestamp: '2024-01-15T10:00:00.000Z',
  open: 3000.00,
  high: 3050.25,
  low: 2980.75,
  close: 3025.50,
  volume: 125.75
})
```

**Behavior:**

- Validates OHLC price relationships (high ≥ max(open,close), low ≤ min(open,close))
- Uses default interval duration ('1m') - can be configured per client
- Automatic upsert on conflict
- Generates derived fields (price_change, price_change_percent)

### Batch Operations

#### `insertManyTicks(ticks: PriceTick[]): Promise<BatchResult>`

Inserts multiple price ticks efficiently in batches.

```typescript
const ticks: PriceTick[] = [
  { symbol: 'BTCUSD', price: 45000, timestamp: '2024-01-15T10:30:00Z' },
  { symbol: 'ETHUSD', price: 3000, timestamp: '2024-01-15T10:30:01Z' },
  // ... more ticks
]

const result = await client.insertManyTicks(ticks)
console.log(`Processed: ${result.processed}, Failed: ${result.failed}`)
```

**Parameters:**

- `ticks`: Array of 1-10,000 PriceTick objects
- Returns `BatchResult` with processing statistics

**Behavior:**

- Automatically chunks large arrays based on `defaultBatchSize`
- Uses postgres.js bulk insert for optimal performance
- Continues processing on individual failures (partial success)
- Collects errors for failed records

#### `insertManyOhlc(candles: Ohlc[]): Promise<BatchResult>`

Inserts multiple OHLC candles efficiently.

```typescript
const candles: Ohlc[] = [
  {
    symbol: 'NVDA',
    timestamp: '2024-01-15T09:30:00Z',
    open: 150.00,
    high: 152.50,
    low: 149.75,
    close: 151.25,
    volume: 1000000
  },
  // ... more candles
]

const result = await client.insertManyOhlc(candles)
```

**Behavior:**

- Similar to `insertManyTicks` but for OHLC data
- Validates each candle's OHLC relationships
- Efficient bulk processing with conflict resolution

### Query Operations

#### `getTicks(symbol: string, range: TimeRange): Promise<PriceTick[]>`

Retrieves price ticks for a specific symbol and time range.

```typescript
interface TimeRange {
  readonly from: Date
  readonly to: Date
  readonly limit?: number // Default: 1000, Max: 10000
}

// Usage
const ticks = await client.getTicks('BTCUSD', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z'),
  limit: 5000
})

// Returns array ordered by time DESC (newest first)
ticks.forEach(tick => {
  console.log(`${tick.timestamp}: ${tick.symbol} = $${tick.price}`)
})
```

**Query Optimization:**

- Uses `ix_price_ticks_symbol_time` index for efficient retrieval
- Automatically applies time-based partitioning
- Returns results ordered by time DESC for recent-first access

#### `getOhlc(symbol: string, interval: TimeInterval, range: TimeRange): Promise<Ohlc[]>`

Retrieves OHLC data for a specific interval.

```typescript
type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

// Usage
const dailyCandles = await client.getOhlc('NVDA', '1d', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31'),
  limit: 31
})
```

**Behavior:**

- Queries `ohlc_data` table with interval filtering
- Includes derived fields (price_change, price_change_percent)
- Optimized for common intervals (1h, 1d) via partial indexes

#### `getOhlcFromTicks(symbol: string, intervalMinutes: number, range: TimeRange): Promise<Ohlc[]>`

Generates OHLC data dynamically from tick data using TimescaleDB aggregation functions.

```typescript
// Generate 15-minute candles from tick data
const candles = await client.getOhlcFromTicks('BTCUSD', 15, {
  from: new Date('2024-01-15T09:00:00Z'),
  to: new Date('2024-01-15T17:00:00Z')
})
```

**Implementation:**

- Uses `time_bucket()` for time-based aggregation
- Employs `first()`, `last()`, `max()`, `min()` functions
- More flexible than pre-stored OHLC data but computationally expensive

### Aggregation Operations

#### `getLatestPrice(symbol: string): Promise<number | null>`

Gets the most recent price for a symbol.

```typescript
const currentPrice = await client.getLatestPrice('BTCUSD')
if (currentPrice !== null) {
  console.log(`Current BTC price: $${currentPrice}`)
} else {
  console.log('No price data available')
}
```

**Optimization:**

- Single-row query with time DESC ordering
- Uses covering index for maximum performance
- Returns `null` if no data exists

#### `getPriceDelta(symbol: string, from: Date, to: Date): Promise<number>`

Calculates absolute price change between two time points.

```typescript
const delta = await client.getPriceDelta('ETHUSD',
  new Date('2024-01-15T09:00:00Z'),
  new Date('2024-01-15T17:00:00Z')
)

console.log(`Price changed by $${delta}`)
```

**Implementation:**

- Uses `first()` and `last()` aggregate functions
- Returns 0 if insufficient data
- Optimized single-query approach

#### `getVolatility(symbol: string, hours: number): Promise<number>`

Calculates price volatility (standard deviation) over a time period.

```typescript
// Get 24-hour volatility
const volatility = await client.getVolatility('BTCUSD', 24)
console.log(`24h volatility: ${volatility}`)
```

**Calculation:**

- Uses PostgreSQL `stddev()` aggregate function
- Calculates over price values within the time window
- Returns 0 if insufficient data points

### Advanced Query Methods

#### `getMultiSymbolLatest(symbols: string[]): Promise<LatestPrice[]>`

Efficiently retrieves latest prices for multiple symbols.

```typescript
const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD']
const latestPrices = await client.getMultiSymbolLatest(symbols)

latestPrices.forEach(latest => {
  console.log(`${latest.symbol}: $${latest.price} at ${latest.timestamp}`)
})
```

#### `getTopMovers(limit: number, hours: number): Promise<PriceDelta[]>`

Gets symbols with the largest price movements.

```typescript
// Top 10 movers in last 24 hours
const movers = await client.getTopMovers(10, 24)
movers.forEach(mover => {
  console.log(`${mover.symbol}: ${mover.percentChange.toFixed(2)}%`)
})
```

#### `getVolumeProfile(symbol: string, range: TimeRange, buckets: number): Promise<VolumeProfile[]>`

Analyzes volume distribution across price levels.

```typescript
interface VolumeProfile {
  readonly priceLevel: number
  readonly volume: number
  readonly tradeCount: number
}

const profile = await client.getVolumeProfile('BTCUSD', timeRange, 20)
```

## Streaming Operations

### `getTicksStream(symbol: string, range: TimeRange): Promise<AsyncIterable<PriceTick>>`

Streams large tick datasets to avoid memory issues.

```typescript
const tickStream = await client.getTicksStream('BTCUSD', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

for await (const tick of tickStream) {
  // Process tick without loading entire dataset into memory
  console.log(`${tick.timestamp}: $${tick.price}`)
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

- Creates `price_ticks` and `ohlc_data` hypertables
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
  await client.insertTick(invalidTick)
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
  defaultBatchSize: 5000 // For high-frequency tick data
})

// Smaller batches for OHLC data
await client.insertManyOhlc(candles, { batchSize: 1000 })
```

### Query Result Limits

```typescript
// Use streaming for large result sets
if (expectedRows > 10000) {
  const stream = await client.getTicksStream(symbol, range)
  // Process streaming
} else {
  const ticks = await client.getTicks(symbol, range)
  // Process in memory
}
```

### Index Utilization

The client is designed to leverage specific indexes for optimal performance:

- Symbol + Time queries: Uses `ix_price_ticks_symbol_time`
- Time range scans: Uses `ix_price_ticks_time`
- Volume analysis: Uses `ix_price_ticks_volume_time`
- Recent data: Uses partial indexes for hot data

## Usage Examples

### Basic Trading Application

```typescript
import { ClientFactory } from 'timescaledb-client'

// Initialize client
const client = ClientFactory.production(process.env.DATABASE_URL!)

// Real-time tick ingestion
async function ingestTick(symbol: string, price: number, volume?: number) {
  await client.insertTick({
    symbol,
    price,
    volume,
    timestamp: new Date().toISOString()
  })
}

// Price monitoring
async function getCurrentPrices(symbols: string[]) {
  return await client.getMultiSymbolLatest(symbols)
}

// Historical analysis
async function analyzePriceMovement(symbol: string, days: number) {
  const range = {
    from: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    to: new Date()
  }

  const [delta, volatility] = await Promise.all([
    client.getPriceDelta(symbol, range.from, range.to),
    client.getVolatility(symbol, days * 24)
  ])

  return { delta, volatility }
}
```

### Data Pipeline Integration

```typescript
// Batch processing pipeline
async function processBatch(ticks: PriceTick[]) {
  const BATCH_SIZE = 10000

  for (let i = 0; i < ticks.length; i += BATCH_SIZE) {
    const batch = ticks.slice(i, i + BATCH_SIZE)
    const result = await client.insertManyTicks(batch)

    if (result.failed > 0) {
      console.warn(`Batch had ${result.failed} failures`)
      // Handle partial failures
    }
  }
}

// OHLC generation from ticks
async function generateOhlcData(symbol: string, date: Date) {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  // Generate hourly candles
  const hourlyCandles = await client.getOhlcFromTicks(symbol, 60, {
    from: dayStart,
    to: dayEnd
  })

  // Store as pre-computed OHLC data
  await client.insertManyOhlc(hourlyCandles.map(candle => ({
    ...candle,
    interval: '1h'
  })))
}
```

This API design provides a comprehensive, type-safe interface for working with time-series financial data in TimescaleDB while maintaining optimal performance and developer experience.
