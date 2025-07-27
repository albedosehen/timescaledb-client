# TimescaleDB Client - Architecture & Design

## Overview

This document outlines the complete architecture for the TimescaleDB client implementation, following clean, unopinionated design principles for time-series data operations.

## Design Principles

### 1. Domain Agnostic

- **Universal Interface**: Generic `TimeSeriesRecord` suitable for any domain
- **No Business Logic**: Pure data operations without domain assumptions
- **Flexible Schema**: Support for multiple values and arbitrary metadata

### 2. TimescaleDB Native

- **Hypertable Optimization**: Leverages TimescaleDB's time-based partitioning
- **Compression Support**: Automatic compression for efficient storage
- **Continuous Aggregates**: Real-time materialized views for analytics
- **Index Strategy**: Optimized for time-series query patterns

### 3. Performance First

- **Batch Operations**: Efficient bulk operations for high throughput
- **Streaming Support**: Memory-efficient processing of large datasets
- **Connection Pooling**: Optimized postgres.js integration
- **Query Optimization**: Leverages TimescaleDB's built-in functions

## Project Structure

```text
timescaledb-client/
├── mod.ts                      # Main module exports
├── deno.json                   # Deno configuration
├── deno.lock                   # Dependency lock file
├── README.md                   # Project documentation
├── LICENSE                     # MIT license
├── .gitignore                  # Git ignore patterns
├── CHANGELOG.md                # Version history
├── docs/                       # Documentation directory
│   ├── ARCHITECTURE.md         # This file - architecture documentation
│   ├── API_REFERENCE.md        # API reference documentation
│   ├── GETTING_STARTED.md      # Getting started guide
│   ├── TECHNICAL_SPECIFICATION.md # Technical implementation details
│   └── DEPLOYMENT.md           # Production deployment guide
└── src/                        # Source code directory
    ├── mod.ts                  # Internal exports
    ├── client.ts               # Main TimescaleClient class
    ├── factory.ts              # ClientFactory for initialization
    ├── types/                  # TypeScript interfaces and types
    │   ├── mod.ts              # Type exports
    │   ├── interfaces.ts       # Core data interfaces
    │   ├── config.ts           # Configuration interfaces
    │   ├── errors.ts           # Error type definitions
    │   └── internal.ts         # Internal type definitions
    ├── database/               # Database connection and management
    │   ├── mod.ts              # Database exports
    │   ├── connection.ts       # Connection management
    │   ├── health.ts           # Health check functionality
    │   └── pool.ts             # Connection pooling
    ├── queries/                # SQL query builders and operations
    │   ├── mod.ts              # Query exports
    │   ├── insert.ts           # Insert operations
    │   ├── select.ts           # Select operations
    │   └── aggregate.ts        # Aggregation operations
    ├── schema/                 # Database schema management
    │   ├── mod.ts              # Schema exports
    │   ├── create_tables.sql   # Table creation scripts
    │   ├── indexes.sql         # Index creation scripts
    │   ├── compression.sql     # Compression policies
    │   ├── continuous_aggregates.sql # Continuous aggregate views
    │   ├── retention.sql       # Data retention policies
    │   └── migrations/         # Schema migrations
    │       ├── mod.ts          # Migration exports
    │       └── 001_initial_schema.sql # Initial schema
    └── tests/                  # Test suites
        ├── unit/               # Unit tests
        ├── integration/        # Integration tests
        ├── fixtures/           # Test data and mocks
        └── utils/              # Test utilities
```

## Core Architecture Components

### 1. Client Layer

#### TimescaleClient

```typescript
export class TimescaleClient {
  private sql: Sql
  private config: ClientConfig

  constructor(sql: Sql, config?: ClientConfig) {
    this.sql = sql
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // Core operations
  async insertRecord(record: TimeSeriesRecord): Promise<void>
  async insertManyRecords(records: TimeSeriesRecord[]): Promise<BatchResult>
  async getRecords(entityId: string, range: TimeRange): Promise<TimeSeriesRecord[]>
  async getAggregate(entityId: string, func: AggregateFunction, column: ValueColumn, range: TimeRange): Promise<number>
  async getTimeBuckets(entityId: string, interval: string, range: TimeRange): Promise<TimeBucketResult[]>
}
```

#### ClientFactory

```typescript
export class ClientFactory {
  static async fromConnectionString(connectionString: string, options?: ClientConfig): Promise<TimescaleClient>
  static async fromConfig(config: ConnectionConfig, options?: ClientConfig): Promise<TimescaleClient>
  static async fromEnvironment(options?: ClientConfig): Promise<TimescaleClient>
}
```

### 2. Data Layer

#### Core Data Model

```typescript
interface TimeSeriesRecord {
  entity_id: string      // Universal entity identifier
  time: string          // ISO 8601 timestamp
  value: number         // Primary numeric value
  value2?: number       // Optional secondary value
  value3?: number       // Optional tertiary value
  value4?: number       // Optional quaternary value
  metadata?: Record<string, any> // Optional structured metadata
}

interface Entity {
  entity_id: string
  entity_type: string   // e.g., 'sensor', 'server', 'application'
  name?: string
  is_active: boolean
  metadata?: Record<string, any>
  created_at: Date
  updated_at: Date
}
```

#### Database Schema

**Core Tables:**

```sql
-- Time-series data hypertable
CREATE TABLE time_series_data (
  time TIMESTAMPTZ NOT NULL,
  entity_id TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  value2 DOUBLE PRECISION,
  value3 DOUBLE PRECISION,
  value4 DOUBLE PRECISION,
  metadata JSONB,
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
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Optimized Indexes:**

```sql
-- Primary time-series indexes
CREATE INDEX ix_time_series_data_entity_id_time
  ON time_series_data (entity_id, time DESC);

CREATE INDEX ix_time_series_data_time
  ON time_series_data (time DESC);

-- Value-based indexes for analytics
CREATE INDEX ix_time_series_data_value_time
  ON time_series_data (value, time DESC);

-- Metadata search index
CREATE INDEX ix_time_series_data_metadata_gin
  ON time_series_data USING GIN (metadata);

-- Entity indexes
CREATE INDEX ix_entities_entity_type ON entities (entity_type);
CREATE INDEX ix_entities_is_active ON entities (is_active);
```

### 3. Query Layer

#### Insert Operations

```typescript
export class InsertQueries {
  constructor(private sql: Sql) {}

  async insertRecord(record: TimeSeriesRecord): Promise<void> {
    await this.sql`
      INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
      VALUES (${record.time}, ${record.entity_id}, ${record.value}, ${record.value2 ?? null},
              ${record.value3 ?? null}, ${record.value4 ?? null}, ${record.metadata ?? null})
      ON CONFLICT (entity_id, time) DO UPDATE SET
        value = EXCLUDED.value,
        value2 = EXCLUDED.value2,
        value3 = EXCLUDED.value3,
        value4 = EXCLUDED.value4,
        metadata = EXCLUDED.metadata
    `
  }

  async insertManyRecords(records: TimeSeriesRecord[]): Promise<void> {
    if (records.length === 0) return

    await this.sql`
      INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
      VALUES ${this.sql(records.map(r => [
        r.time, r.entity_id, r.value, r.value2 ?? null,
        r.value3 ?? null, r.value4 ?? null, r.metadata ?? null
      ]))}
      ON CONFLICT (entity_id, time) DO UPDATE SET
        value = EXCLUDED.value,
        value2 = EXCLUDED.value2,
        value3 = EXCLUDED.value3,
        value4 = EXCLUDED.value4,
        metadata = EXCLUDED.metadata
    `
  }
}
```

#### Select Operations

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

    return rows.map(this.mapRowToRecord)
  }

  async getLatestValues(entityIds: string[]): Promise<TimeSeriesRecord[]> {
    const rows = await this.sql`
      SELECT DISTINCT ON (entity_id)
        time, entity_id, value, value2, value3, value4, metadata
      FROM time_series_data
      WHERE entity_id = ANY(${entityIds})
      ORDER BY entity_id, time DESC
    `

    return rows.map(this.mapRowToRecord)
  }
}
```

#### Aggregation Operations

```typescript
export class AggregateQueries {
  constructor(private sql: Sql) {}

  async getAggregate(
    entityId: string,
    func: AggregateFunction,
    column: ValueColumn,
    range: TimeRange
  ): Promise<number> {
    const rows = await this.sql`
      SELECT ${this.sql(func)}(${this.sql(column)}) as result
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from}
        AND time < ${range.to}
    `

    return rows[0]?.result ?? 0
  }

  async getTimeBuckets(
    entityId: string,
    interval: string,
    range: TimeRange,
    options: AggregationOptions = {}
  ): Promise<TimeBucketResult[]> {
    const column = options.aggregateColumn ?? 'value'
    const func = options.aggregateFunction ?? 'avg'

    const rows = await this.sql`
      SELECT
        time_bucket(${interval}, time) as bucket,
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

### 4. Schema Management

#### Automatic Schema Creation

```typescript
export class SchemaManager {
  constructor(private sql: Sql) {}

  async ensureSchema(): Promise<void> {
    await this.createTablesIfNotExist()
    await this.createIndexesIfNotExist()
    await this.setupCompressionIfNeeded()
    await this.validateSchema()
  }

  private async createTablesIfNotExist(): Promise<void> {
    // Create time_series_data table
    await this.sql.file(path.join(import.meta.dirname, 'schema/create_tables.sql'))

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

  private async createIndexesIfNotExist(): Promise<void> {
    await this.sql.file(path.join(import.meta.dirname, 'schema/indexes.sql'))
  }
}
```

### 5. Connection Management

#### Connection Strategy

```typescript
export class ConnectionManager {
  private sql: Sql
  private config: ConnectionConfig

  constructor(config: ConnectionConfig) {
    this.config = config
    this.sql = this.createConnection()
  }

  private createConnection(): Sql {
    return postgres({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      username: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl,
      max: this.config.maxConnections ?? 10,
      max_lifetime: this.config.maxLifetime ?? 3600,
      idle_timeout: this.config.idleTimeout ?? 0,
      connect_timeout: this.config.connectTimeout ?? 30,
      transform: {
        undefined: null
      }
    })
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now()

    try {
      const result = await this.sql`
        SELECT version() as version,
               current_database() as database,
               current_timestamp as timestamp
      `

      const responseTime = Date.now() - startTime

      return {
        isHealthy: true,
        responseTimeMs: responseTime,
        version: result[0].version,
        database: result[0].database,
        timestamp: new Date(),
        connection: {
          host: this.config.host,
          port: this.config.port,
          ssl: !!this.config.ssl
        }
      }
    } catch (error) {
      return {
        isHealthy: false,
        responseTimeMs: Date.now() - startTime,
        timestamp: new Date(),
        errors: [error.message],
        connection: {
          host: this.config.host,
          port: this.config.port,
          ssl: !!this.config.ssl
        }
      }
    }
  }
}
```

## Use Case Adaptability

### IoT Sensor Networks

```typescript
// Temperature/Humidity sensors
const sensorRecord: TimeSeriesRecord = {
  entity_id: 'temp_sensor_01',
  time: '2024-01-15T10:30:00Z',
  value: 23.5,      // Temperature °C
  value2: 65.2,     // Humidity %
  value3: 1013.25,  // Pressure hPa
  metadata: {
    location: 'warehouse_a',
    room: 'server_room',
    sensor_type: 'DHT22',
    battery_level: 85
  }
}
```

### System Monitoring

```typescript
// Server performance metrics
const serverRecord: TimeSeriesRecord = {
  entity_id: 'server_prod_01',
  time: '2024-01-15T10:30:00Z',
  value: 75.2,      // CPU usage %
  value2: 8.1,      // Memory usage GB
  value3: 1024.5,   // Network I/O MB/s
  value4: 0.8,      // Disk I/O utilization
  metadata: {
    hostname: 'prod-web-01',
    datacenter: 'us-east-1',
    instance_type: 'c5.large',
    os_version: 'Ubuntu 22.04'
  }
}
```

### Application Logging

```typescript
// Application performance metrics
const appRecord: TimeSeriesRecord = {
  entity_id: 'api_gateway',
  time: '2024-01-15T10:30:00Z',
  value: 145.2,     // Response time ms
  value2: 1,        // Success flag (1=success, 0=error)
  value3: 502.1,    // Request size bytes
  value4: 1024.8,   // Response size bytes
  metadata: {
    endpoint: '/api/v1/users',
    method: 'GET',
    status_code: 200,
    user_agent: 'monitoring-agent/1.0'
  }
}
```

### Industrial IoT

```typescript
// Manufacturing equipment metrics
const equipmentRecord: TimeSeriesRecord = {
  entity_id: 'machine_001',
  time: '2024-01-15T10:30:00Z',
  value: 2850,      // RPM
  value2: 98.5,     // Efficiency %
  value3: 75.2,     // Temperature °C
  value4: 42.1,     // Vibration level
  metadata: {
    production_line: 'line_a',
    shift: 'morning',
    operator_id: 'op_123',
    maintenance_due: '2024-02-01'
  }
}
```

## Performance Optimization

### Indexing Strategy

- **Primary Access Pattern**: Entity + Time queries via `ix_time_series_data_entity_id_time`
- **Time Range Scans**: Cross-entity time queries via `ix_time_series_data_time`
- **Value Analytics**: Value-based analysis via `ix_time_series_data_value_time`
- **Metadata Search**: JSON queries via GIN index on metadata

### Compression Configuration

```sql
-- Enable compression for data older than 7 days
ALTER TABLE time_series_data SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'entity_id',
  timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy
SELECT add_compression_policy('time_series_data', INTERVAL '7 days');
```

### Retention Policies

```sql
-- Retain data for 1 year
SELECT add_retention_policy('time_series_data', INTERVAL '1 year');
```

### Continuous Aggregates

```sql
-- Hourly aggregates for fast dashboard queries
CREATE MATERIALIZED VIEW hourly_metrics
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) as hour,
  entity_id,
  avg(value) as avg_value,
  max(value) as max_value,
  min(value) as min_value,
  count(*) as data_points
FROM time_series_data
GROUP BY hour, entity_id;

-- Refresh policy
SELECT add_continuous_aggregate_policy('hourly_metrics',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 hour'
);
```

## Error Handling Architecture

### Error Hierarchy

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
  }
}

export class ConnectionError extends TimescaleClientError {}
export class ValidationError extends TimescaleClientError {}
export class QueryError extends TimescaleClientError {}
export class BatchError extends TimescaleClientError {}
```

### Error Recovery Strategies

- **Connection Errors**: Automatic retry with exponential backoff
- **Validation Errors**: Immediate failure with detailed field information
- **Query Errors**: Context-aware error reporting with query details
- **Batch Errors**: Partial success handling with detailed error tracking

## Scalability Considerations

### Horizontal Scaling

- **Hypertable Partitioning**: Automatic partitioning by time and entity
- **Distributed Hypertables**: Support for multi-node TimescaleDB clusters
- **Read Replicas**: Query routing to read replicas for analytics workloads

### Vertical Scaling

- **Connection Pooling**: Optimized connection management
- **Batch Operations**: Efficient bulk processing
- **Streaming**: Memory-efficient processing of large datasets
- **Index Optimization**: Strategic indexing for query patterns

### Storage Optimization

- **Compression**: 90%+ storage reduction for historical data
- **Retention**: Automated lifecycle management
- **Partitioning**: Efficient chunk management and pruning

This architecture provides a clean, scalable foundation for time-series data operations across any domain while leveraging TimescaleDB's powerful features for optimal performance.
