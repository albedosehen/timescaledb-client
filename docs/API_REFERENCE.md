# TimescaleDB Client - API Reference

## Table of Contents

1. [Client Initialization](#client-initialization)
2. [Connection Management](#connection-management)
3. [Data Insertion](#data-insertion)
4. [Data Querying](#data-querying)
5. [Aggregation Operations](#aggregation-operations)
6. [Analytics Operations](#analytics-operations)
7. [Streaming Operations](#streaming-operations)
8. [Schema Management](#schema-management)
9. [Error Handling](#error-handling)
10. [Type Definitions](#type-definitions)
11. [Configuration Options](#configuration-options)
12. [Performance Considerations](#performance-considerations)

---

## Client Initialization

### Factory Pattern (Recommended)

The [`ClientFactory`](src/factory.ts:1) provides multiple ways to create [`TimescaleClient`](src/client.ts:124) instances:

#### `ClientFactory.fromConnectionString()`

```typescript
import { ClientFactory } from 'timescaledb-client'

const client = await ClientFactory.fromConnectionString(
  'postgresql://user:pass@host:5432/database',
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
  database: 'timescale_db',
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
import { TimescaleClient } from 'timescaledb-client'

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

- [`ConnectionError`](src/types/errors.ts:1) if initialization fails

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

### `insertTick()`

Inserts a single price tick into the database.

```typescript
await client.insertTick({
  symbol: 'BTCUSD',
  price: 45000.50,
  volume: 1.25,
  timestamp: '2024-01-15T10:30:00.000Z'
})
```

**Parameters:**

- `tick` (PriceTick): Price tick data
- `options` (InsertOptions, optional): Insert configuration

**Returns:** `Promise<void>`

**Throws:**

- [`ValidationError`](src/types/errors.ts:1) for invalid data
- [`QueryError`](src/types/errors.ts:1) for database issues

### `insertOhlc()`

Inserts a single OHLC candle into the database.

```typescript
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

**Parameters:**

- `candle` (Ohlc): OHLC candle data
- `options` (InsertOptions, optional): Insert configuration

**Returns:** `Promise<void>`

**Validation:**

- Validates OHLC price relationships (high ≥ max(open,close), low ≤ min(open,close))
- Automatic upsert on conflict

### `insertManyTicks()`

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

- `ticks` (PriceTick[]): Array of 1-10,000 price ticks
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

### `insertManyOhlc()`

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

**Parameters:**

- `candles` (Ohlc[]): Array of OHLC candles
- `options` (InsertOptions, optional): Insert configuration

**Returns:** `Promise<BatchResult>`

---

## Data Querying

### `getTicks()`

Retrieves price ticks for a specific symbol and time range.

```typescript
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

**Parameters:**

- `symbol` (string): Symbol to query
- `range` (TimeRange): Time range for query
- `options` (SelectOptions, optional): Query configuration

**Returns:** `Promise<PriceTick[]>`

**Query Optimization:**

- Uses `ix_price_ticks_symbol_time` index for efficient retrieval
- Automatically applies time-based partitioning
- Returns results ordered by time DESC

### `getOhlc()`

Retrieves OHLC data for a specific interval.

```typescript
const dailyCandles = await client.getOhlc('NVDA', '1d', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31'),
  limit: 31
})
```

**Parameters:**

- `symbol` (string): Symbol to query
- `interval` (TimeInterval): Time interval ('1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w')
- `range` (TimeRange): Time range for query
- `options` (SelectOptions, optional): Query configuration

**Returns:** `Promise<Ohlc[]>`

**Behavior:**

- Queries `ohlc_data` table with interval filtering
- Includes derived fields (price_change, price_change_percent)
- Optimized for common intervals via partial indexes

### `getOhlcFromTicks()`

Generates OHLC data dynamically from tick data using TimescaleDB aggregation functions.

```typescript
// Generate 15-minute candles from tick data
const candles = await client.getOhlcFromTicks('BTCUSD', 15, {
  from: new Date('2024-01-15T09:00:00Z'),
  to: new Date('2024-01-15T17:00:00Z')
})
```

**Parameters:**

- `symbol` (string): Symbol to query
- `intervalMinutes` (number): Interval in minutes
- `range` (TimeRange): Time range for query
- `options` (SelectOptions, optional): Query configuration

**Returns:** `Promise<Ohlc[]>`

**Implementation:**

- Uses `time_bucket()` for time-based aggregation
- Employs `first()`, `last()`, `max()`, `min()` functions
- More flexible than pre-stored OHLC data but computationally expensive

### `getLatestPrice()`

Gets the most recent price for a symbol.

```typescript
const currentPrice = await client.getLatestPrice('BTCUSD')
if (currentPrice !== null) {
  console.log(`Current BTC price: $${currentPrice}`)
}
```

**Parameters:**

- `symbol` (string): Symbol to query

**Returns:** `Promise<number | null>`

**Optimization:**

- Single-row query with time DESC ordering
- Uses covering index for maximum performance
- Returns `null` if no data exists

### `getMultiSymbolLatest()`

Efficiently retrieves latest prices for multiple symbols.

```typescript
const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD']
const result = await client.getMultiSymbolLatest(symbols)

console.log(`Found ${result.found} of ${result.requested} symbols`)
result.prices.forEach(latest => {
  console.log(`${latest.symbol}: $${latest.price} at ${latest.timestamp}`)
})
```

**Parameters:**

- `symbols` (string[]): Array of symbols to query

**Returns:** `Promise<MultiSymbolLatest>`

```typescript
interface MultiSymbolLatest {
  readonly requested: number
  readonly found: number
  readonly prices: LatestPrice[]
}
```

---

## Aggregation Operations

### `getPriceDelta()`

Calculates absolute price change between two time points.

```typescript
const delta = await client.getPriceDelta('ETHUSD',
  new Date('2024-01-15T09:00:00Z'),
  new Date('2024-01-15T17:00:00Z')
)

console.log(`Price changed by $${delta.delta} (${delta.percentChange}%)`)
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `from` (Date): Start time
- `to` (Date): End time

**Returns:** `Promise<PriceDeltaResult>`

```typescript
interface PriceDeltaResult {
  readonly delta: number
  readonly percentChange: number
  readonly startPrice: number
  readonly endPrice: number
}
```

### `getVolatility()`

Calculates price volatility (standard deviation) over a time period.

```typescript
// Get 24-hour volatility
const volatility = await client.getVolatility('BTCUSD', 24)
console.log(`24h volatility: ${volatility}`)
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `hours` (number): Time period in hours

**Returns:** `Promise<number>`

**Calculation:**

- Uses PostgreSQL `stddev()` aggregate function
- Calculates over price values within the time window
- Returns 0 if insufficient data points

### `getVwap()`

Get VWAP (Volume Weighted Average Price) for time buckets.

```typescript
const vwapData = await client.getVwap('BTCUSD', '1h', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z')
})

vwapData.forEach(bucket => {
  console.log(`${bucket.bucket}: VWAP = $${bucket.vwap}, Volume = ${bucket.volume}`)
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `bucketInterval` (string): Time bucket interval ('1m', '5m', '1h', etc.)
- `range` (TimeRange): Time range for analysis
- `options` (AggregationOptions, optional): Aggregation configuration

**Returns:** `Promise<VwapResult[]>`

---

## Analytics Operations

### `calculateSMA()`

Calculate Simple Moving Average.

```typescript
const sma = await client.calculateSMA('BTCUSD', 20, {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

sma.forEach(point => {
  console.log(`${point.timestamp}: SMA(20) = $${point.value}`)
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `period` (number): Period for moving average
- `range` (TimeRange): Time range for analysis
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<TechnicalIndicatorResult[]>`

### `calculateEMA()`

Calculate Exponential Moving Average.

```typescript
const ema = await client.calculateEMA('BTCUSD', 20, {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `period` (number): Period for moving average
- `range` (TimeRange): Time range for analysis
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<TechnicalIndicatorResult[]>`

### `calculateRSI()`

Calculate RSI (Relative Strength Index).

```typescript
const rsi = await client.calculateRSI('BTCUSD', 14, {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

rsi.forEach(point => {
  console.log(`${point.timestamp}: RSI = ${point.rsi}`)
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `period` (number): Period for RSI calculation
- `range` (TimeRange): Time range for analysis
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<RSIResult[]>`

### `calculateBollingerBands()`

Calculate Bollinger Bands.

```typescript
const bands = await client.calculateBollingerBands('BTCUSD', 20, 2, {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

bands.forEach(point => {
  console.log(`${point.timestamp}: Upper=${point.upper}, Middle=${point.middle}, Lower=${point.lower}`)
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `period` (number): Period for calculation
- `stdDevMultiplier` (number): Standard deviation multiplier
- `range` (TimeRange): Time range for analysis
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<BollingerBandsResult[]>`

### `getTopMovers()`

Get symbols with the largest price movements.

```typescript
// Top 10 movers in last 24 hours
const movers = await client.getTopMovers(10, 24)
movers.forEach(mover => {
  console.log(`${mover.symbol}: ${mover.percentChange.toFixed(2)}%`)
})
```

**Parameters:**

- `limit` (number, default: 10): Maximum number of results
- `hours` (number, default: 24): Time period in hours
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<TopMover[]>`

### `getVolumeProfile()`

Analyzes volume distribution across price levels.

```typescript
const profile = await client.getVolumeProfile('BTCUSD', {
  from: new Date('2024-01-15T00:00:00Z'),
  to: new Date('2024-01-15T23:59:59Z')
}, 20)

profile.forEach(level => {
  console.log(`Price $${level.priceLevel}: Volume ${level.volume}`)
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `range` (TimeRange): Time range for analysis
- `buckets` (number, default: 20): Number of price levels
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<VolumeProfile[]>`

### `findSupportResistanceLevels()`

Find support and resistance levels.

```typescript
const levels = await client.findSupportResistanceLevels('BTCUSD', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
}, 0.005, 3)

levels.forEach(level => {
  console.log(`${level.type} level at $${level.price} (${level.touches} touches)`)
})
```

**Parameters:**

- `symbol` (string): Symbol to analyze
- `range` (TimeRange): Time range for analysis
- `tolerance` (number, default: 0.005): Price tolerance (0.5%)
- `minTouches` (number, default: 3): Minimum touches for level
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<SupportResistanceLevel[]>`

### `calculateCorrelation()`

Calculate correlation between two symbols.

```typescript
const correlation = await client.calculateCorrelation('BTCUSD', 'ETHUSD', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

console.log(`Correlation: ${correlation.correlation}`)
console.log(`Samples: ${correlation.sampleSize}`)
```

**Parameters:**

- `symbol1` (string): First symbol
- `symbol2` (string): Second symbol
- `range` (TimeRange): Time range for analysis
- `options` (AnalyticsOptions, optional): Analytics configuration

**Returns:** `Promise<CorrelationResult>`

---

## Streaming Operations

### `getTicksStream()`

Streams large tick datasets to avoid memory issues.

```typescript
const tickStream = await client.getTicksStream('BTCUSD', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

for await (const tickBatch of tickStream) {
  // Process batch of ticks without loading entire dataset into memory
  console.log(`Processing batch of ${tickBatch.length} ticks`)

  tickBatch.forEach(tick => {
    console.log(`${tick.timestamp}: $${tick.price}`)
  })
}
```

**Parameters:**

- `symbol` (string): Symbol to stream
- `range` (TimeRange): Time range for streaming
- `options` (object, optional): Streaming options
  - `batchSize` (number): Size of each batch

**Returns:** `Promise<AsyncIterable<PriceTick[]>>`

**Benefits:**

- Memory-efficient processing of large datasets
- Uses postgres.js cursor functionality
- Backpressure handling for rate-limited processing

### `getOhlcStream()`

Stream OHLC data for large datasets.

```typescript
const ohlcStream = await client.getOhlcStream('BTCUSD', '1h', {
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
})

for await (const candleBatch of ohlcStream) {
  console.log(`Processing batch of ${candleBatch.length} candles`)

  candleBatch.forEach(candle => {
    console.log(`${candle.timestamp}: O=${candle.open}, H=${candle.high}, L=${candle.low}, C=${candle.close}`)
  })
}
```

**Parameters:**

- `symbol` (string): Symbol to stream
- `interval` (TimeInterval): Time interval
- `range` (TimeRange): Time range for streaming
- `options` (object, optional): Streaming options
  - `batchSize` (number): Size of each batch

**Returns:** `Promise<AsyncIterable<Ohlc[]>>`

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

- Creates `price_ticks` and `ohlc_data` hypertables
- Sets up optimized indexes
- Configures TimescaleDB-specific settings
- Validates existing schema compatibility

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
} from 'timescaledb-client'

try {
  await client.insertTick(invalidTick)
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
import { ErrorUtils } from 'timescaledb-client'

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
interface PriceTick {
  readonly symbol: string
  readonly price: number
  readonly volume?: number
  readonly timestamp: string // ISO 8601 format
  readonly exchange?: string
  readonly dataSource?: string
}

interface Ohlc {
  readonly symbol: string
  readonly timestamp: string
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume?: number
  readonly interval?: TimeInterval
}

interface TimeRange {
  readonly from: Date
  readonly to: Date
  readonly limit?: number // Max: 10000
}

type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w'
```

### Result Types

```typescript
interface BatchResult {
  readonly processed: number
  readonly failed: number
  readonly durationMs: number
  readonly errors: Error[]
}

interface LatestPrice {
  readonly symbol: string
  readonly price: number
  readonly timestamp: Date
  readonly volume?: number
}

interface MultiSymbolLatest {
  readonly requested: number
  readonly found: number
  readonly prices: LatestPrice[]
}

interface VolumeProfile {
  readonly priceLevel: number
  readonly volume: number
  readonly tradeCount: number
  readonly percentageOfTotal: number
}

interface TopMover {
  readonly symbol: string
  readonly currentPrice: number
  readonly previousPrice: number
  readonly absoluteChange: number
  readonly percentChange: number
  readonly volume: number
}
```

### Analytics Types

```typescript
interface TechnicalIndicatorResult {
  readonly timestamp: Date
  readonly value: number
  readonly symbol: string
}

interface RSIResult {
  readonly timestamp: Date
  readonly rsi: number
  readonly signal: 'oversold' | 'overbought' | 'neutral'
  readonly symbol: string
}

interface BollingerBandsResult {
  readonly timestamp: Date
  readonly upper: number
  readonly middle: number
  readonly lower: number
  readonly bandwidth: number
  readonly symbol: string
}

interface SupportResistanceLevel {
  readonly type: 'support' | 'resistance'
  readonly price: number
  readonly touches: number
  readonly strength: number
  readonly firstTouch: Date
  readonly lastTouch: Date
}

interface CorrelationResult {
  readonly correlation: number
  readonly sampleSize: number
  readonly significance: number
  readonly symbol1: string
  readonly symbol2: string
}
```

---

## Configuration Options

### TimescaleClientConfig

```typescript
interface TimescaleClientConfig extends ClientOptions {
  /** Whether to automatically ensure schema on initialization */
  readonly autoEnsureSchema?: boolean

  /** Custom interval duration for OHLC data (default: '1m') */
  readonly defaultInterval?: TimeInterval

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
  readonly customOrderBy?: string
  readonly useStreaming?: boolean
}

interface AggregationOptions {
  readonly limit?: number
  readonly offset?: number
  readonly orderBy?: {
    readonly column: string
    readonly direction: 'asc' | 'desc'
  }
  readonly where?: Record<string, any>
  readonly includeStats?: boolean
  readonly fillGaps?: boolean
  readonly fillValue?: number | null
  readonly includeMetadata?: boolean
}

interface AnalyticsOptions {
  readonly limit?: number
  readonly offset?: number
  readonly orderBy?: {
    readonly column: string
    readonly direction: 'asc' | 'desc'
  }
  readonly where?: Record<string, any>
  readonly includeStats?: boolean
  readonly minVolume?: number
  readonly smoothingFactor?: number
}
```

---

## Performance Considerations

### Batch Size Optimization

```typescript
// Optimal batch sizes by operation type
const client = new TimescaleClient(sql, {
  defaultBatchSize: 5000 // For high-frequency tick data
})

// Smaller batches for OHLC data
const result = await client.insertManyOhlc(candles, { batchSize: 1000 })
```

### Query Result Limits

```typescript
// Use streaming for large result sets
const STREAMING_THRESHOLD = 10000

if (expectedRows > STREAMING_THRESHOLD) {
  const stream = await client.getTicksStream(symbol, range)
  // Process streaming
  for await (const batch of stream) {
    // Process batch
  }
} else {
  const ticks = await client.getTicks(symbol, range)
  // Process in memory
}
```

### Index Utilization

The client is designed to leverage specific indexes for optimal performance:

- **Symbol + Time queries**: Uses `ix_price_ticks_symbol_time`
- **Time range scans**: Uses `ix_price_ticks_time`
- **Volume analysis**: Uses `ix_price_ticks_volume_time`
- **Recent data**: Uses partial indexes for hot data

### Memory Management

```typescript
// For large datasets, use streaming
const stream = await client.getTicksStream('BTCUSD', {
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
import { ValidationError, QueryError, ConnectionError } from 'timescaledb-client'

try {
  await client.insertTick(tick)
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

This API reference provides comprehensive documentation for all public methods and types in the TimescaleDB client. For additional examples and use cases, see the [Getting Started Guide](GETTING_STARTED.md) and the [examples directory](../examples/).
