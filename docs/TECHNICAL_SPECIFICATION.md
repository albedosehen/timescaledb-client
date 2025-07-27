# TimescaleDB Client - Technical Specification

## Implementation Strategy

This document provides detailed technical specifications for implementing the TimescaleDB client, covering implementation patterns, technical decisions, and integration strategies for generic time-series data operations.

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
-- Time-series data hypertable
CREATE TABLE time_series_data (
  time TIMESTAMPTZ NOT NULL,
  entity_id TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  value2 DOUBLE PRECISION DEFAULT NULL,
  value3 DOUBLE PRECISION DEFAULT NULL,
  value4 DOUBLE PRECISION DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  
  -- Composite primary key for uniqueness constraints
  PRIMARY KEY (entity_id, time)
);

-- Convert to hypertable
SELECT create_hypertable('time_series_data', 'time',
  chunk_time_interval => INTERVAL '1 day',
  partitioning_column => 'entity_id',
  number_partitions => 4
);

-- Entity metadata table
CREATE TABLE entities (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_entity_id CHECK (entity_id ~ '^[A-Za-z0-9_.-]{1,100}$'),
  CONSTRAINT valid_entity_type CHECK (entity_type ~ '^[a-z_]{1,50}$')
);
```

**Optimized Indexes:**

```sql
-- Indexes for efficient entity-based queries
CREATE INDEX ix_time_series_data_entity_id_time ON time_series_data (entity_id, time DESC);
CREATE INDEX ix_entities_entity_type ON entities (entity_type);

-- Indexes for cross-entity time-based queries
CREATE INDEX ix_time_series_data_time ON time_series_data (time DESC);
CREATE INDEX ix_entities_is_active ON entities (is_active);

-- Indexes for value-based analytics
CREATE INDEX ix_time_series_data_value_time ON time_series_data (value, time DESC);
CREATE INDEX ix_time_series_data_value2_time ON time_series_data (value2, time DESC);

-- Metadata search indexes
CREATE INDEX ix_entities_metadata_gin ON entities USING GIN (metadata);
CREATE INDEX ix_time_series_data_metadata_gin ON time_series_data USING GIN (metadata);
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
    // Create time_series_data table if not exists
    await this.sql`
      CREATE TABLE IF NOT EXISTS time_series_data (
        time TIMESTAMPTZ NOT NULL,
        entity_id TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        value2 DOUBLE PRECISION DEFAULT NULL,
        value3 DOUBLE PRECISION DEFAULT NULL,
        value4 DOUBLE PRECISION DEFAULT NULL,
        metadata JSONB DEFAULT NULL,
        PRIMARY KEY (entity_id, time)
      )
    `

    // Convert to hypertable if not already
    const isHypertable = await this.sql`
      SELECT 1 FROM timescaledb_information.hypertables 
      WHERE hypertable_name = 'time_series_data'
    `
    
    if (isHypertable.length === 0) {
      await this.sql`
        SELECT create_hypertable('time_series_data', 'time',
          chunk_time_interval => INTERVAL '1 day',
          partitioning_column => 'entity_id',
          number_partitions => 4
        )
      `
    }
  }

  private async validateHypertables(): Promise<void> {
    const hypertables = await this.sql`
      SELECT hypertable_name FROM timescaledb_information.hypertables
      WHERE hypertable_name IN ('time_series_data')
    `

    if (hypertables.length < 1) {
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

  async insertRecord(record: TimeSeriesRecord): Promise<void> {
    await this.sql`
      INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
      VALUES (${record.time}, ${record.entity_id}, ${record.value},
              ${record.value2 ?? null}, ${record.value3 ?? null},
              ${record.value4 ?? null}, ${record.metadata ?? null})
      ON CONFLICT (entity_id, time) DO UPDATE SET
        value = EXCLUDED.value,
        value2 = EXCLUDED.value2,
        value3 = EXCLUDED.value3,
        value4 = EXCLUDED.value4,
        metadata = EXCLUDED.metadata
    `
  }

  async insertEntity(entity: Entity): Promise<void> {
    await this.sql`
      INSERT INTO entities (entity_id, entity_type, name, is_active, metadata)
      VALUES (${entity.entity_id}, ${entity.entity_type}, ${entity.name ?? null},
              ${entity.is_active}, ${entity.metadata ?? null})
      ON CONFLICT (entity_id) DO UPDATE SET
        entity_type = EXCLUDED.entity_type,
        name = EXCLUDED.name,
        is_active = EXCLUDED.is_active,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `
  }
}
```

**Batch Insert Implementation:**

```typescript
export class BatchInsertQueries {
  constructor(private sql: Sql) {}

  async insertManyRecords(records: TimeSeriesRecord[]): Promise<void> {
    if (records.length === 0) return

    // Use postgres.js bulk insert capability
    await this.sql`
      INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
      VALUES ${this.sql(records.map(record => [
        record.time,
        record.entity_id,
        record.value,
        record.value2 ?? null,
        record.value3 ?? null,
        record.value4 ?? null,
        record.metadata ?? null
      ]))}
      ON CONFLICT (entity_id, time) DO UPDATE SET
        value = EXCLUDED.value,
        value2 = EXCLUDED.value2,
        value3 = EXCLUDED.value3,
        value4 = EXCLUDED.value4,
        metadata = EXCLUDED.metadata
    `
  }

  async insertManyEntities(entities: Entity[]): Promise<void> {
    if (entities.length === 0) return

    await this.sql`
      INSERT INTO entities (entity_id, entity_type, name, is_active, metadata)
      VALUES ${this.sql(entities.map(entity => [
        entity.entity_id,
        entity.entity_type,
        entity.name ?? null,
        entity.is_active,
        entity.metadata ?? null
      ]))}
      ON CONFLICT (entity_id) DO UPDATE SET
        entity_type = EXCLUDED.entity_type,
        name = EXCLUDED.name,
        is_active = EXCLUDED.is_active,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `
  }
}
```

### 3.2 Query Operations

**Time-Series Queries:**

```typescript
export class SelectQueries {
  constructor(private sql: Sql) {}

  async getRecords(entityId: string, range: TimeRange): Promise<TimeSeriesRecord[]> {
    const rows = await this.sql`
      SELECT time, entity_id, value, value2, value3, value4, metadata
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY time DESC
      LIMIT ${range.limit ?? 1000}
    `

    return rows.map(row => ({
      time: row.time.toISOString(),
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2,
      value3: row.value3,
      value4: row.value4,
      metadata: row.metadata
    }))
  }

  async getLatestValues(entityIds: string[]): Promise<TimeSeriesRecord[]> {
    const rows = await this.sql`
      SELECT DISTINCT ON (entity_id)
        time, entity_id, value, value2, value3, value4, metadata
      FROM time_series_data
      WHERE entity_id = ANY(${entityIds})
      ORDER BY entity_id, time DESC
    `

    return rows.map(row => ({
      time: row.time.toISOString(),
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2,
      value3: row.value3,
      value4: row.value4,
      metadata: row.metadata
    }))
  }

  async getEntities(entityType?: string): Promise<Entity[]> {
    const rows = await this.sql`
      SELECT entity_id, entity_type, name, is_active, metadata, created_at, updated_at
      FROM entities
      WHERE (${entityType ?? null} IS NULL OR entity_type = ${entityType ?? null})
        AND is_active = true
      ORDER BY entity_id
    `

    return rows.map(row => ({
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      name: row.name,
      is_active: row.is_active,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  }
}
```

**Aggregation Queries:**

```typescript
export class AggregationQueries {
  constructor(private sql: Sql) {}

  async getAggregate(
    entityId: string,
    aggregateFunction: AggregateFunction,
    column: ValueColumn,
    range: TimeRange
  ): Promise<number> {
    const rows = await this.sql`
      SELECT ${this.sql(aggregateFunction)}(${this.sql(column)}) as result
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from}
        AND time <= ${range.to}
    `

    return rows.length > 0 ? rows[0].result : 0
  }

  async getStatistics(entityId: string, range: TimeRange): Promise<StatisticsResult> {
    const rows = await this.sql`
      SELECT 
        min(value) as min_value,
        max(value) as max_value,
        avg(value) as avg_value,
        sum(value) as sum_value,
        count(*) as count,
        stddev(value) as stddev,
        variance(value) as variance
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from}
        AND time <= ${range.to}
    `

    return rows.length > 0 ? {
      entity_id: entityId,
      min: rows[0].min_value ?? 0,
      max: rows[0].max_value ?? 0,
      avg: rows[0].avg_value ?? 0,
      sum: rows[0].sum_value ?? 0,
      count: rows[0].count ?? 0,
      stddev: rows[0].stddev ?? 0,
      variance: rows[0].variance ?? 0
    } : {
      entity_id: entityId,
      min: 0, max: 0, avg: 0, sum: 0, count: 0, stddev: 0, variance: 0
    }
  }

  async getTimeBuckets(
    entityId: string,
    intervalMinutes: number,
    range: TimeRange,
    options: AggregationOptions = {}
  ): Promise<TimeBucketResult[]> {
    const column = options.aggregateColumn ?? 'value'
    const func = options.aggregateFunction ?? 'avg'

    const rows = await this.sql`
      SELECT 
        time_bucket(${intervalMinutes} * INTERVAL '1 minute', time) as bucket,
        entity_id,
        ${this.sql(func)}(${this.sql(column)}) as value,
        count(*) as count
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from}
        AND time < ${range.to}
      GROUP BY bucket, entity_id
      ORDER BY bucket DESC
      LIMIT ${range.limit ?? 1000}
    `

    return rows.map(row => ({
      bucket: row.bucket,
      entity_id: row.entity_id,
      value: row.value,
      count: row.count
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
  static validateTimeSeriesRecord(record: unknown): asserts record is TimeSeriesRecord {
    if (!record || typeof record !== 'object') {
      throw new ValidationError('Record must be an object')
    }

    const r = record as Record<string, unknown>

    // Validate entity_id
    if (!r.entity_id || typeof r.entity_id !== 'string') {
      throw new ValidationError('entity_id must be a non-empty string', 'entity_id', r.entity_id)
    }

    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(r.entity_id)) {
      throw new ValidationError(
        'entity_id must be 1-100 characters, alphanumeric, underscore, dot, dash only',
        'entity_id',
        r.entity_id
      )
    }

    // Validate time
    if (!r.time || typeof r.time !== 'string') {
      throw new ValidationError('time must be a string', 'time', r.time)
    }

    const timestamp = new Date(r.time)
    if (isNaN(timestamp.getTime())) {
      throw new ValidationError('Invalid time format', 'time', r.time)
    }

    // Validate value
    if (typeof r.value !== 'number' || !isFinite(r.value)) {
      throw new ValidationError('value must be a finite number', 'value', r.value)
    }

    // Validate optional values
    for (const field of ['value2', 'value3', 'value4']) {
      if (r[field] !== undefined && r[field] !== null) {
        if (typeof r[field] !== 'number' || !isFinite(r[field] as number)) {
          throw new ValidationError(`${field} must be a finite number`, field, r[field])
        }
      }
    }

    // Validate metadata (optional)
    if (r.metadata !== undefined && r.metadata !== null) {
      if (typeof r.metadata !== 'object') {
        throw new ValidationError('metadata must be an object', 'metadata', r.metadata)
      }
    }
  }

  static validateEntity(entity: unknown): asserts entity is Entity {
    if (!entity || typeof entity !== 'object') {
      throw new ValidationError('Entity must be an object')
    }

    const e = entity as Record<string, unknown>

    // Validate entity_id
    if (!e.entity_id || typeof e.entity_id !== 'string') {
      throw new ValidationError('entity_id must be a non-empty string', 'entity_id', e.entity_id)
    }

    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(e.entity_id)) {
      throw new ValidationError(
        'entity_id must be 1-100 characters, alphanumeric, underscore, dot, dash only',
        'entity_id',
        e.entity_id
      )
    }

    // Validate entity_type
    if (!e.entity_type || typeof e.entity_type !== 'string') {
      throw new ValidationError('entity_type must be a non-empty string', 'entity_type', e.entity_type)
    }

    if (!/^[a-z_]{1,50}$/.test(e.entity_type)) {
      throw new ValidationError(
        'entity_type must be 1-50 characters, lowercase and underscore only',
        'entity_type',
        e.entity_type
      )
    }

    // Validate is_active
    if (typeof e.is_active !== 'boolean') {
      throw new ValidationError('is_active must be a boolean', 'is_active', e.is_active)
    }

    // Validate name (optional)
    if (e.name !== undefined && e.name !== null) {
      if (typeof e.name !== 'string') {
        throw new ValidationError('name must be a string', 'name', e.name)
      }
    }

    // Validate metadata (optional)
    if (e.metadata !== undefined && e.metadata !== null) {
      if (typeof e.metadata !== 'object') {
        throw new ValidationError('metadata must be an object', 'metadata', e.metadata)
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
  INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
  VALUES ${sql(records.map(record => [
    record.time,
    record.entity_id,
    record.value,
    record.value2 ?? null,
    record.value3 ?? null,
    record.value4 ?? null,
    record.metadata ?? null
  ]))}
`
```

**Index Strategy:**

- Primary indexes on (entity_id, time) for entity-specific queries
- Time-based indexes for cross-entity temporal queries
- Value indexes for analytics and filtering
- GIN indexes for JSON metadata searches

### 6.3 Memory Management

**Streaming Large Results:**

```typescript
async getRecordStream(entityId: string, range: TimeRange): Promise<AsyncIterable<TimeSeriesRecord>> {
  const cursor = sql`
    SELECT time, entity_id, value, value2, value3, value4, metadata
    FROM time_series_data
    WHERE entity_id = ${entityId}
      AND time >= ${range.from}
      AND time < ${range.to}
    ORDER BY time DESC
  `.cursor()

  return {
    async *[Symbol.asyncIterator]() {
      for await (const [row] of cursor) {
        yield {
          time: row.time.toISOString(),
          entity_id: row.entity_id,
          value: row.value,
          value2: row.value2,
          value3: row.value3,
          value4: row.value4,
          metadata: row.metadata
        }
      }
    }
  }
}
```

## 7. TimescaleDB Feature Integration

### 7.1 Compression Implementation

```typescript
export class CompressionManager {
  constructor(private sql: Sql) {}

  async enableCompression(
    tableName: string,
    options: CompressionOptions = {}
  ): Promise<void> {
    const {
      compressAfter = '7 days',
      segmentBy = 'entity_id',
      orderBy = 'time DESC'
    } = options

    // Enable compression
    await this.sql`
      ALTER TABLE ${this.sql(tableName)} SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = ${segmentBy},
        timescaledb.compress_orderby = ${orderBy}
      )
    `

    // Add compression policy
    await this.sql`
      SELECT add_compression_policy(${tableName}, INTERVAL '${compressAfter}')
    `
  }

  async getCompressionStats(tableName: string): Promise<CompressionStats> {
    const rows = await this.sql`
      SELECT
        pg_size_pretty(before_compression_total_bytes) as uncompressed_size,
        pg_size_pretty(after_compression_total_bytes) as compressed_size,
        ROUND(
          (before_compression_total_bytes::float / after_compression_total_bytes::float),
          2
        ) as compression_ratio
      FROM timescaledb_information.compression_settings
      WHERE hypertable_name = ${tableName}
    `

    return rows[0] || {
      uncompressed_size: '0 bytes',
      compressed_size: '0 bytes',
      compression_ratio: 1.0
    }
  }
}
```

### 7.2 Continuous Aggregates

```typescript
export class ContinuousAggregateManager {
  constructor(private sql: Sql) {}

  async createContinuousAggregate(
    viewName: string,
    query: string,
    options: ContinuousAggregateOptions = {}
  ): Promise<void> {
    // Create materialized view
    await this.sql`
      CREATE MATERIALIZED VIEW ${this.sql(viewName)}
      WITH (timescaledb.continuous) AS
      ${this.sql.unsafe(query)}
    `

    // Add refresh policy if specified
    if (options.refreshPolicy) {
      const { startOffset, endOffset, scheduleInterval } = options.refreshPolicy

      await this.sql`
        SELECT add_continuous_aggregate_policy(${viewName},
          start_offset => INTERVAL '${startOffset}',
          end_offset => INTERVAL '${endOffset}',
          schedule_interval => INTERVAL '${scheduleInterval}'
        )
      `
    }
  }

  async refreshContinuousAggregate(
    viewName: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<void> {
    if (startTime && endTime) {
      await this.sql`
        CALL refresh_continuous_aggregate(${viewName}, ${startTime}, ${endTime})
      `
    } else {
      await this.sql`
        CALL refresh_continuous_aggregate(${viewName}, NULL, NULL)
      `
    }
  }
}
```

### 7.3 Retention Policies

```typescript
export class RetentionManager {
  constructor(private sql: Sql) {}

  async addRetentionPolicy(
    tableName: string,
    retentionPeriod: string
  ): Promise<void> {
    await this.sql`
      SELECT add_retention_policy(${tableName}, INTERVAL '${retentionPeriod}')
    `
  }

  async removeRetentionPolicy(tableName: string): Promise<void> {
    await this.sql`
      SELECT remove_retention_policy(${tableName})
    `
  }

  async getRetentionStats(tableName: string): Promise<RetentionStats> {
    const rows = await this.sql`
      SELECT
        policy_name,
        drop_after,
        schedule_interval,
        max_runtime,
        timezone
      FROM timescaledb_information.drop_chunks_policies
      WHERE hypertable_name = ${tableName}
    `

    return rows[0] || {
      policy_name: null,
      drop_after: null,
      schedule_interval: null,
      max_runtime: null,
      timezone: null
    }
  }
}
```

## 8. Domain-Specific Implementations

### 8.1 IoT Sensor Data

```typescript
// Example: Temperature and humidity sensor data
interface SensorReading {
  sensorId: string
  timestamp: string
  temperature: number
  humidity: number
  pressure?: number
  batteryLevel?: number
  location: string
  sensorType: string
}

function transformSensorReading(reading: SensorReading): TimeSeriesRecord {
  return {
    entity_id: reading.sensorId,
    time: reading.timestamp,
    value: reading.temperature,
    value2: reading.humidity,
    value3: reading.pressure,
    value4: reading.batteryLevel,
    metadata: {
      location: reading.location,
      sensor_type: reading.sensorType
    }
  }
}
```

### 8.2 System Monitoring

```typescript
// Example: Server performance metrics
interface ServerMetrics {
  serverId: string
  timestamp: string
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  networkIO: number
  hostname: string
  datacenter: string
}

function transformServerMetrics(metrics: ServerMetrics): TimeSeriesRecord {
  return {
    entity_id: metrics.serverId,
    time: metrics.timestamp,
    value: metrics.cpuUsage,
    value2: metrics.memoryUsage,
    value3: metrics.diskUsage,
    value4: metrics.networkIO,
    metadata: {
      hostname: metrics.hostname,
      datacenter: metrics.datacenter
    }
  }
}
```

### 8.3 Application Performance Monitoring

```typescript
// Example: API endpoint performance
interface APIMetrics {
  endpoint: string
  timestamp: string
  responseTime: number
  statusCode: number
  requestSize: number
  responseSize: number
  method: string
  userAgent: string
}

function transformAPIMetrics(metrics: APIMetrics): TimeSeriesRecord {
  return {
    entity_id: 'api_gateway',
    time: metrics.timestamp,
    value: metrics.responseTime,
    value2: metrics.statusCode === 200 ? 1 : 0, // Success flag
    value3: metrics.requestSize,
    value4: metrics.responseSize,
    metadata: {
      endpoint: metrics.endpoint,
      method: metrics.method,
      status_code: metrics.statusCode,
      user_agent: metrics.userAgent
    }
  }
}
```

This technical specification provides the foundation for implementing a robust, performant TimescaleDB client that follows established patterns and best practices while remaining completely domain-agnostic and suitable for any time-series use case.
