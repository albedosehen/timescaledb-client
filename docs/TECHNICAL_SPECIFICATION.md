# TimescaleDB Client - Technical Specification

## Implementation Strategy

This document provides detailed technical specifications for implementing the TimescaleDB client, covering implementation patterns, technical decisions, and integration strategies.

## 1. Core Architecture Implementation

### 1.1 Client Factory Pattern

The `ClientFactory` implements a factory pattern to handle different initialization scenarios while maintaining a consistent interface.

```typescript
export class ClientFactory {
  /**
   * Create client from connection string
   */
  static fromConnectionString(
    connectionString: string, 
    options?: Partial<ClientOptions>
  ): TimescaleClient {
    const config = this.parseConnectionString(connectionString)
    return this.createClient(config, options)
  }

  /**
   * Create client from connection parameters
   */
  static fromConfig(
    config: ConnectionConfig, 
    options?: Partial<ClientOptions>
  ): TimescaleClient {
    return this.createClient(config, options)
  }

  /**
   * Create client from environment variables
   */
  static fromEnvironment(options?: Partial<ClientOptions>): TimescaleClient {
    const config = this.loadFromEnvironment()
    return this.createClient(config, options)
  }

  private static createClient(
    config: ConnectionConfig, 
    options?: Partial<ClientOptions>
  ): TimescaleClient {
    const sql = this.createSqlInstance(config)
    const clientOptions = { ...DEFAULT_CLIENT_OPTIONS, ...options }
    return new TimescaleClient(sql, clientOptions)
  }
}
```

### 1.2 Connection Management Strategy

**postgres.js Integration:**
- Single `Sql` instance per client for connection pooling
- Leverage postgres.js built-in connection management
- No additional connection pooling layer

**Connection Lifecycle:**
```typescript
export class ConnectionManager {
  private sql: Sql
  private config: ConnectionConfig
  private isConnected = false

  constructor(config: ConnectionConfig) {
    this.config = config
    this.sql = this.createSqlInstance()
  }

  private createSqlInstance(): Sql {
    const postgresConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      username: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      max: this.config.maxConnections ?? 10,
      max_lifetime: this.config.maxLifetime,
      idle_timeout: this.config.idleTimeout,
      connect_timeout: this.config.connectTimeout ?? 30,
      onnotice: this.config.debug ? console.log : false,
      debug: this.config.debug
    }

    return postgres(postgresConfig)
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.sql`SELECT 1`
      this.isConnected = true
      return true
    } catch (error) {
      this.isConnected = false
      throw new ConnectionError('Health check failed', error)
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 })
    this.isConnected = false
  }
}
```

## 2. Database Schema Strategy

### 2.1 Hypertable Design

**Primary Tables:**
```sql
-- Price tick data hypertable
CREATE TABLE price_ticks (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,
  
  -- Composite primary key for uniqueness constraints
  PRIMARY KEY (symbol, time)
) WITH (
  tsdb.hypertable,
  tsdb.partition_column='time',
  tsdb.segmentby='symbol',
  tsdb.orderby='time DESC',
  tsdb.chunk_interval='1 day'
);

-- OHLC candle data hypertable  
CREATE TABLE ohlc_data (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  interval_duration TEXT NOT NULL, -- '1m', '5m', '1h', '1d'
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,
  
  -- Composite primary key
  PRIMARY KEY (symbol, interval_duration, time)
) WITH (
  tsdb.hypertable,
  tsdb.partition_column='time',
  tsdb.segmentby='symbol',
  tsdb.orderby='time DESC',
  tsdb.chunk_interval='1 day'
);
```

**Optimized Indexes:**
```sql
-- Indexes for efficient symbol-based queries
CREATE INDEX ix_price_ticks_symbol_time ON price_ticks (symbol, time DESC);
CREATE INDEX ix_ohlc_symbol_interval_time ON ohlc_data (symbol, interval_duration, time DESC);

-- Indexes for cross-symbol time-based queries
CREATE INDEX ix_price_ticks_time ON price_ticks (time DESC);
CREATE INDEX ix_ohlc_time ON ohlc_data (time DESC);
```

### 2.2 Schema Validation Strategy

**Automatic Schema Setup:**
```typescript
export class SchemaManager {
  constructor(private sql: Sql) {}

  async ensureSchemaExists(): Promise<void> {
    await this.createTablesIfNotExist()
    await this.createIndexesIfNotExist()
    await this.validateHypertables()
  }

  private async createTablesIfNotExist(): Promise<void> {
    // Create price_ticks table if not exists
    await this.sql`
      CREATE TABLE IF NOT EXISTS price_ticks (
        time TIMESTAMPTZ NOT NULL,
        symbol TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        volume DOUBLE PRECISION DEFAULT NULL,
        PRIMARY KEY (symbol, time)
      )
    `

    // Convert to hypertable if not already
    const isHypertable = await this.sql`
      SELECT 1 FROM timescaledb_information.hypertables 
      WHERE hypertable_name = 'price_ticks'
    `
    
    if (isHypertable.length === 0) {
      await this.sql`
        SELECT create_hypertable('price_ticks', 'time', 
          chunk_time_interval => INTERVAL '1 day',
          migrate_data => true
        )
      `
    }
  }

  private async validateHypertables(): Promise<void> {
    const hypertables = await this.sql`
      SELECT hypertable_name FROM timescaledb_information.hypertables
      WHERE hypertable_name IN ('price_ticks', 'ohlc_data')
    `

    if (hypertables.length < 2) {
      throw new QueryError('Required hypertables not found or properly configured')
    }
  }
}
```

## 3. Query Implementation Strategy

### 3.1 Insert Operations

**Single Insert Implementation:**
```typescript
export class InsertQueries {
  constructor(private sql: Sql) {}

  async insertTick(tick: PriceTick): Promise<void> {
    await this.sql`
      INSERT INTO price_ticks (time, symbol, price, volume)
      VALUES (${tick.timestamp}, ${tick.symbol}, ${tick.price}, ${tick.volume ?? null})
      ON CONFLICT (symbol, time) DO UPDATE SET
        price = EXCLUDED.price,
        volume = EXCLUDED.volume
    `
  }

  async insertOhlc(candle: Ohlc): Promise<void> {
    await this.sql`
      INSERT INTO ohlc_data (time, symbol, interval_duration, open, high, low, close, volume)
      VALUES (
        ${candle.timestamp}, 
        ${candle.symbol}, 
        '1m', -- Default interval, should be configurable
        ${candle.open}, 
        ${candle.high}, 
        ${candle.low}, 
        ${candle.close}, 
        ${candle.volume ?? null}
      )
      ON CONFLICT (symbol, interval_duration, time) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
    `
  }
}
```

**Batch Insert Implementation:**
```typescript
export class BatchInsertQueries {
  constructor(private sql: Sql) {}

  async insertManyTicks(ticks: PriceTick[]): Promise<void> {
    if (ticks.length === 0) return

    // Use postgres.js bulk insert capability
    await this.sql`
      INSERT INTO price_ticks (time, symbol, price, volume)
      VALUES ${this.sql(ticks.map(tick => [
        tick.timestamp,
        tick.symbol, 
        tick.price,
        tick.volume ?? null
      ]))}
      ON CONFLICT (symbol, time) DO UPDATE SET
        price = EXCLUDED.price,
        volume = EXCLUDED.volume
    `
  }

  async insertManyOhlc(candles: Ohlc[]): Promise<void> {
    if (candles.length === 0) return

    await this.sql`
      INSERT INTO ohlc_data (time, symbol, interval_duration, open, high, low, close, volume)
      VALUES ${this.sql(candles.map(candle => [
        candle.timestamp,
        candle.symbol,
        '1m', // Default interval
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume ?? null
      ]))}
      ON CONFLICT (symbol, interval_duration, time) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume
    `
  }
}
```

### 3.2 Query Operations

**Time-Series Queries:**
```typescript
export class SelectQueries {
  constructor(private sql: Sql) {}

  async getTicks(symbol: string, range: TimeRange): Promise<PriceTick[]> {
    const rows = await this.sql`
      SELECT time, symbol, price, volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY time DESC
      LIMIT ${range.limit ?? 1000}
    `

    return rows.map(row => ({
      timestamp: row.time.toISOString(),
      symbol: row.symbol,
      price: row.price,
      volume: row.volume
    }))
  }

  async getOhlc(symbol: string, interval: string, range: TimeRange): Promise<Ohlc[]> {
    const rows = await this.sql`
      SELECT time, symbol, open, high, low, close, volume
      FROM ohlc_data
      WHERE symbol = ${symbol}
        AND interval_duration = ${interval}
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY time DESC
      LIMIT ${range.limit ?? 1000}
    `

    return rows.map(row => ({
      timestamp: row.time.toISOString(),
      symbol: row.symbol,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    }))
  }
}
```

**Aggregation Queries:**
```typescript
export class AggregationQueries {
  constructor(private sql: Sql) {}

  async getLatestPrice(symbol: string): Promise<number | null> {
    const rows = await this.sql`
      SELECT price
      FROM price_ticks
      WHERE symbol = ${symbol}
      ORDER BY time DESC
      LIMIT 1
    `

    return rows.length > 0 ? rows[0].price : null
  }

  async getPriceDelta(symbol: string, from: Date, to: Date): Promise<number> {
    const rows = await this.sql`
      WITH price_points AS (
        SELECT 
          first(price, time) as start_price,
          last(price, time) as end_price
        FROM price_ticks
        WHERE symbol = ${symbol}
          AND time >= ${from}
          AND time <= ${to}
      )
      SELECT 
        COALESCE(end_price - start_price, 0) as delta
      FROM price_points
    `

    return rows.length > 0 ? rows[0].delta : 0
  }

  async getVolatility(symbol: string, hours: number): Promise<number> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000)

    const rows = await this.sql`
      SELECT stddev(price) as volatility
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${cutoffTime}
    `

    return rows.length > 0 ? rows[0].volatility ?? 0 : 0
  }

  async getOhlcFromTicks(
    symbol: string, 
    intervalMinutes: number, 
    range: TimeRange
  ): Promise<Ohlc[]> {
    const rows = await this.sql`
      SELECT 
        time_bucket(${intervalMinutes} * INTERVAL '1 minute', time) as bucket_time,
        symbol,
        first(price, time) as open,
        max(price) as high,
        min(price) as low,
        last(price, time) as close,
        sum(volume) as volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from}
        AND time < ${range.to}
      GROUP BY bucket_time, symbol
      ORDER BY bucket_time DESC
      LIMIT ${range.limit ?? 1000}
    `

    return rows.map(row => ({
      timestamp: row.bucket_time.toISOString(),
      symbol: row.symbol,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    }))
  }
}
```

## 4. Error Handling Implementation

### 4.1 Error Type Hierarchy

```typescript
export class TimescaleClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'TimescaleClientError'
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimescaleClientError)
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack
    }
  }
}

export class ConnectionError extends TimescaleClientError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause)
    this.name = 'ConnectionError'
  }
}

export class ValidationError extends TimescaleClientError {
  constructor(message: string, public readonly field?: string, value?: unknown) {
    super(message, 'VALIDATION_ERROR', undefined, { field, value })
    this.name = 'ValidationError'
  }
}

export class QueryError extends TimescaleClientError {
  constructor(message: string, cause?: Error, query?: string) {
    super(message, 'QUERY_ERROR', cause, { query })
    this.name = 'QueryError'
  }
}
```

### 4.2 Error Handling Strategy

```typescript
export class ErrorHandler {
  static wrapPostgresError(error: unknown, context?: string): TimescaleClientError {
    if (error instanceof TimescaleClientError) {
      return error
    }

    const pgError = error as PostgresError
    const message = context ? `${context}: ${pgError.message}` : pgError.message

    // Map specific postgres error codes
    switch (pgError.code) {
      case '08000': // connection_exception
      case '08003': // connection_does_not_exist
      case '08006': // connection_failure
        return new ConnectionError(message, pgError)
      
      case '23505': // unique_violation
      case '23502': // not_null_violation
      case '23514': // check_violation
        return new ValidationError(message, undefined, pgError)
      
      case '42P01': // undefined_table
      case '42703': // undefined_column
        return new QueryError(message, pgError)
      
      default:
        return new QueryError(message, pgError)
    }
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        // Don't retry validation errors
        if (error instanceof ValidationError) {
          throw error
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw this.wrapPostgresError(lastError!, `Failed after ${maxRetries + 1} attempts`)
  }
}
```

## 5. Validation Implementation

### 5.1 Input Validation Strategy

```typescript
export class Validator {
  static validateTick(tick: unknown): asserts tick is PriceTick {
    if (!tick || typeof tick !== 'object') {
      throw new ValidationError('Tick must be an object')
    }

    const t = tick as Record<string, unknown>

    // Validate timestamp
    if (!t.timestamp || typeof t.timestamp !== 'string') {
      throw new ValidationError('Timestamp must be a string', 'timestamp', t.timestamp)
    }

    const timestamp = new Date(t.timestamp)
    if (isNaN(timestamp.getTime())) {
      throw new ValidationError('Invalid timestamp format', 'timestamp', t.timestamp)
    }

    // Validate symbol
    if (!t.symbol || typeof t.symbol !== 'string') {
      throw new ValidationError('Symbol must be a non-empty string', 'symbol', t.symbol)
    }

    if (!/^[A-Z0-9_]{1,20}$/.test(t.symbol)) {
      throw new ValidationError(
        'Symbol must be 1-20 characters, alphanumeric and underscore only', 
        'symbol', 
        t.symbol
      )
    }

    // Validate price
    if (typeof t.price !== 'number' || !isFinite(t.price) || t.price <= 0) {
      throw new ValidationError('Price must be a positive finite number', 'price', t.price)
    }

    // Validate volume (optional)
    if (t.volume !== undefined && t.volume !== null) {
      if (typeof t.volume !== 'number' || !isFinite(t.volume) || t.volume < 0) {
        throw new ValidationError('Volume must be a non-negative finite number', 'volume', t.volume)
      }
    }
  }

  static validateOhlc(ohlc: unknown): asserts ohlc is Ohlc {
    if (!ohlc || typeof ohlc !== 'object') {
      throw new ValidationError('OHLC must be an object')
    }

    const o = ohlc as Record<string, unknown>

    // Validate timestamp
    if (!o.timestamp || typeof o.timestamp !== 'string') {
      throw new ValidationError('Timestamp must be a string', 'timestamp', o.timestamp)
    }

    const timestamp = new Date(o.timestamp)
    if (isNaN(timestamp.getTime())) {
      throw new ValidationError('Invalid timestamp format', 'timestamp', o.timestamp)
    }

    // Validate symbol
    if (!o.symbol || typeof o.symbol !== 'string') {
      throw new ValidationError('Symbol must be a non-empty string', 'symbol', o.symbol)
    }

    if (!/^[A-Z0-9_]{1,20}$/.test(o.symbol)) {
      throw new ValidationError(
        'Symbol must be 1-20 characters, alphanumeric and underscore only', 
        'symbol', 
        o.symbol
      )
    }

    // Validate OHLC prices
    const prices = ['open', 'high', 'low', 'close'] as const
    for (const field of prices) {
      if (typeof o[field] !== 'number' || !isFinite(o[field]) || o[field] <= 0) {
        throw new ValidationError(
          `${field} must be a positive finite number`, 
          field, 
          o[field]
        )
      }
    }

    // Validate OHLC relationships
    const { open, high, low, close } = o as Record<string, number>
    if (high < Math.max(open, close) || low > Math.min(open, close)) {
      throw new ValidationError('Invalid OHLC relationship: high must be >= max(open, close) and low must be <= min(open, close)')
    }

    // Validate volume (optional)
    if (o.volume !== undefined && o.volume !== null) {
      if (typeof o.volume !== 'number' || !isFinite(o.volume) || o.volume < 0) {
        throw new ValidationError('Volume must be a non-negative finite number', 'volume', o.volume)
      }
    }
  }

  static validateTimeRange(range: unknown): asserts range is TimeRange {
    if (!range || typeof range !== 'object') {
      throw new ValidationError('TimeRange must be an object')
    }

    const r = range as Record<string, unknown>

    // Validate from date
    if (!r.from || !(r.from instanceof Date)) {
      throw new ValidationError('TimeRange.from must be a Date object', 'from', r.from)
    }

    // Validate to date
    if (!r.to || !(r.to instanceof Date)) {
      throw new ValidationError('TimeRange.to must be a Date object', 'to', r.to)
    }

    // Validate date relationship
    if (r.from >= r.to) {
      throw new ValidationError('TimeRange.from must be before TimeRange.to')
    }

    // Validate limit (optional)
    if (r.limit !== undefined) {
      if (typeof r.limit !== 'number' || !Number.isInteger(r.limit) || r.limit <= 0) {
        throw new ValidationError('TimeRange.limit must be a positive integer', 'limit', r.limit)
      }

      if (r.limit > 10000) {
        throw new ValidationError('TimeRange.limit cannot exceed 10,000 records', 'limit', r.limit)
      }
    }
  }

  static validateBatchSize(items: unknown[]): void {
    if (!Array.isArray(items)) {
      throw new ValidationError('Batch items must be an array')
    }

    if (items.length === 0) {
      throw new ValidationError('Batch cannot be empty')
    }

    if (items.length > 10000) {
      throw new ValidationError('Batch size cannot exceed 10,000 items')
    }
  }
}
```

## 6. Performance Optimization Strategy

### 6.1 Connection Pooling

**postgres.js Configuration:**
```typescript
const optimizedConfig = {
  max: 10,                    // Connection pool size
  max_lifetime: 60 * 60,      // 1 hour max connection lifetime
  idle_timeout: 0,            // Keep connections alive
  connect_timeout: 30,        // 30 second connect timeout
  prepare: true,              // Use prepared statements
  transform: {
    undefined: null           // Transform undefined to null for PostgreSQL
  }
}
```

### 6.2 Query Optimization

**Prepared Statements:**
- postgres.js automatically handles prepared statement caching
- Repeated queries with different parameters benefit from preparation
- Tagged template literals automatically parameterize queries

**Batch Operations:**
```typescript
// Optimized batch insert using postgres.js native bulk support
await sql`
  INSERT INTO price_ticks (time, symbol, price, volume)
  VALUES ${sql(ticks.map(tick => [
    tick.timestamp,
    tick.symbol,
    tick.price,
    tick.volume ?? null
  ]))}
`
```

**Index Strategy:**
- Primary indexes on (symbol, time) for uniqueness and performance
- Covering indexes for common query patterns
- Avoid over-indexing to maintain insert performance

### 6.3 Memory Management

**Streaming Large Results:**
```typescript
async getTicksStream(symbol: string, range: TimeRange): Promise<AsyncIterable<PriceTick>> {
  const cursor = sql`
    SELECT time, symbol, price, volume
    FROM price_ticks
    WHERE symbol = ${symbol}
      AND time >= ${range.from}
      AND time < ${range.to}
    ORDER BY time DESC
  `.cursor()

  return {
    async *[Symbol.asyncIterator]() {
      for await (const [row] of cursor) {
        yield {
          timestamp: row.time.toISOString(),
          symbol: row.symbol,
          price: row.price,
          volume: row.volume
        }
      }
    }
  }
}
```

This technical specification provides the foundation for implementing a robust, performant TimescaleDB client that follows established patterns and best practices while leveraging postgres.js capabilities effectively.