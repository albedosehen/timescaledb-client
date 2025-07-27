# TimescaleDB Client

Clean, unopinionated TimescaleDB client for time-series data operations with support for IoT, monitoring, and logging applications.

[![CI](https://github.com/albedosehen/timescaledb-client/workflows/CI/badge.svg)](https://github.com/albedosehen/timescaledb-client/actions) [![JSR](https://jsr.io/badges/@timescale/client)](https://jsr.io/@timescale/client)

## Overview

This is a pure TimescaleDB client focused on time-series data operations. It provides a clean, generic interface for working with time-series data without domain-specific assumptions. Whether you're building IoT sensor networks, system monitoring dashboards, or application logging systems, this client gives you the tools to efficiently store and query time-series data.

## Key Features

### Clean Generic Interface

- **Universal Data Model**: Generic `TimeSeriesRecord` interface suitable for any use case
- **No Domain Assumptions**: Completely unopinionated about your data's meaning
- **Flexible Schema**: Support for multiple values and metadata per record

### TimescaleDB Native

- **Hypertable Management**: Automatic hypertable creation and configuration
- **Compression Support**: Built-in compression policies for efficient storage
- **Continuous Aggregates**: Real-time materialized views for fast queries
- **Retention Policies**: Automated data lifecycle management

### Performance Optimized

- **Batch Operations**: Efficient bulk inserts for high-throughput scenarios
- **Streaming Support**: Handle large datasets without memory issues
- **Connection Pooling**: Optimized postgres.js integration
- **Smart Indexing**: Optimized indexes for time-series query patterns

## Basic Usage

```typescript
import { ClientFactory } from '@timescale/client'

// Create client from connection string
const client = await ClientFactory.fromConnectionString(
  'postgresql://user:pass@localhost:5432/sensor_db',
)

// Insert IoT sensor data
await client.insertRecord({
  entity_id: 'sensor_001',
  time: new Date().toISOString(),
  value: 23.5, // Temperature
  value2: 65.2, // Humidity
  metadata: { location: 'warehouse_a', floor: 2 },
})

// Query recent sensor readings
const recentData = await client.getRecords('sensor_001', {
  from: new Date(Date.now() - 3600000), // Last hour
  to: new Date(),
  limit: 1000,
})

// Get aggregate statistics
const avgTemp = await client.getAggregate('sensor_001', 'avg', 'value', {
  from: new Date(Date.now() - 86400000), // Last 24 hours
  to: new Date(),
})
```

## 📦 Installation

### Using JSR (Recommended)

```bash
deno add jsr:@timescale/client
```

### Import Maps (Deno)

```json
{
  "imports": {
    "@timescale/client": "jsr:@timescale/client"
  }
}
```

## 🏗️ Core Operations

### Data Insertion

| Operation            | Description                              | Example                                  |
| -------------------- | ---------------------------------------- | ---------------------------------------- |
| **Single Insert**    | Insert individual time-series records    | [`insertRecord()`](./src/client.ts)      |
| **Batch Insert**     | Efficient bulk insertion                 | [`insertManyRecords()`](./src/client.ts) |
| **Streaming Insert** | Memory-efficient large dataset insertion | [`insertStream()`](./src/client.ts)      |

### Data Querying

| Operation                | Description                      | Example                                   |
| ------------------------ | -------------------------------- | ----------------------------------------- |
| **Time Range Queries**   | Retrieve data within time bounds | [`getRecords()`](./src/client.ts)         |
| **Latest Values**        | Get most recent data points      | [`getLatestValues()`](./src/client.ts)    |
| **Multi-Entity Queries** | Query across multiple entities   | [`getMultiEntityData()`](./src/client.ts) |

### Aggregation Operations

| Operation                  | Description                         | Example                                 |
| -------------------------- | ----------------------------------- | --------------------------------------- |
| **Time Bucketing**         | Group data by time intervals        | [`getTimeBuckets()`](./src/client.ts)   |
| **Statistical Aggregates** | Calculate min, max, avg, sum, count | [`getAggregate()`](./src/client.ts)     |
| **Custom Aggregations**    | Execute custom aggregate queries    | [`executeAggregate()`](./src/client.ts) |

## Use Cases

### IoT Sensor Networks

```typescript
// Track temperature and humidity from multiple sensors
await client.insertManyRecords([
  {
    entity_id: 'temp_sensor_01',
    time: '2024-01-15T10:00:00Z',
    value: 22.5, // Temperature in Celsius
    value2: 60.3, // Humidity percentage
    metadata: { building: 'warehouse_a', room: 'server_room' },
  },
  {
    entity_id: 'temp_sensor_02',
    time: '2024-01-15T10:00:00Z',
    value: 18.9,
    value2: 45.7,
    metadata: { building: 'warehouse_b', room: 'storage' },
  },
])

// Get hourly averages for the last week
const hourlyAvgs = await client.getTimeBuckets('temp_sensor_01', '1 hour', {
  from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  to: new Date(),
})
```

### System Monitoring

```typescript
// Monitor server performance metrics
await client.insertRecord({
  entity_id: 'server_prod_01',
  time: new Date().toISOString(),
  value: 75.2, // CPU usage percentage
  value2: 8.1, // Memory usage in GB
  value3: 1024.5, // Network throughput in MB/s
  value4: 0.8, // Disk I/O utilization
  metadata: {
    datacenter: 'us-east-1',
    instance_type: 'c5.large',
    availability_zone: 'us-east-1a',
  },
})

// Find servers with high CPU usage in the last hour
const highCpuServers = await client.query(`
  SELECT entity_id, avg(value) as avg_cpu
  FROM time_series_data
  WHERE time > NOW() - INTERVAL '1 hour'
    AND entity_id LIKE 'server_%'
  GROUP BY entity_id
  HAVING avg(value) > 80
  ORDER BY avg_cpu DESC
`)
```

### Application Logging & Metrics

```typescript
// Track application performance metrics
await client.insertRecord({
  entity_id: 'api_gateway',
  time: new Date().toISOString(),
  value: 145.2, // Response time in ms
  value2: 1, // Success count (1 for success, 0 for error)
  value3: 502.1, // Request size in bytes
  value4: 1024.8, // Response size in bytes
  metadata: {
    endpoint: '/api/v1/users',
    method: 'GET',
    status_code: 200,
    user_agent: 'Mozilla/5.0...',
  },
})

// Calculate 95th percentile response times for different endpoints
const p95ResponseTimes = await client.query(`
  SELECT
    metadata->>'endpoint' as endpoint,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY value) as p95_response_time
  FROM time_series_data
  WHERE entity_id = 'api_gateway'
    AND time > NOW() - INTERVAL '24 hours'
  GROUP BY metadata->>'endpoint'
  ORDER BY p95_response_time DESC
`)
```

## 🔧 Configuration

### Basic Configuration

```typescript
import { ClientFactory } from '@timescale/client'

const client = await ClientFactory.fromConfig({
  host: 'localhost',
  port: 5432,
  database: 'timeseries_db',
  username: 'user',
  password: 'password',
  ssl: true,
}, {
  defaultBatchSize: 5000,
  validateInputs: true,
  autoCreateTables: true,
})
```

### Environment Variables

```bash
# Connection
PGHOST=localhost
PGPORT=5432
PGDATABASE=timeseries_db
PGUSER=user
PGPASSWORD=password

# Client Options
TIMESCALE_BATCH_SIZE=5000
TIMESCALE_AUTO_CREATE_TABLES=true
```

### Production Configuration

```typescript
const client = await ClientFactory.production(
  process.env.DATABASE_URL,
  {
    maxRetries: 5,
    queryTimeout: 60000,
    compressionEnabled: true,
    retentionDays: 365,
  },
)
```

## Examples

### Real-time Data Pipeline

```typescript
// Set up a real-time data processing pipeline
class SensorDataPipeline {
  private client: TimescaleClient

  constructor(client: TimescaleClient) {
    this.client = client
  }

  async processSensorBatch(readings: SensorReading[]) {
    // Transform raw sensor data to time-series records
    const records = readings.map((reading) => ({
      entity_id: reading.sensorId,
      time: reading.timestamp,
      value: reading.temperature,
      value2: reading.humidity,
      value3: reading.pressure,
      metadata: {
        location: reading.location,
        sensor_type: reading.type,
        firmware_version: reading.firmwareVersion,
      },
    }))

    // Batch insert for efficiency
    await this.client.insertManyRecords(records)

    // Trigger alerts for anomalous readings
    await this.checkForAnomalies(records)
  }

  private async checkForAnomalies(records: TimeSeriesRecord[]) {
    for (const record of records) {
      if (record.value > 35 || record.value < -10) {
        console.warn(`Temperature anomaly detected: ${record.entity_id} = ${record.value}°C`)
      }
    }
  }
}
```

### Monitoring Dashboard Backend

```typescript
// API endpoint for monitoring dashboard
async function getDashboardMetrics(timeRange: string) {
  const client = await ClientFactory.fromEnvironment()

  const [cpuMetrics, memoryMetrics, diskMetrics] = await Promise.all([
    // Average CPU usage across all servers
    client.getAggregate('server_%', 'avg', 'value', {
      from: new Date(Date.now() - parseTimeRange(timeRange)),
      to: new Date(),
    }),

    // Memory usage trends
    client.getTimeBuckets('server_%', '5 minutes', {
      from: new Date(Date.now() - parseTimeRange(timeRange)),
      to: new Date(),
      aggregateColumn: 'value2',
      aggregateFunction: 'avg',
    }),

    // Disk I/O statistics
    client.query(`
      SELECT
        entity_id,
        max(value4) as peak_disk_io,
        avg(value4) as avg_disk_io
      FROM time_series_data
      WHERE entity_id LIKE 'server_%'
        AND time > NOW() - INTERVAL '${timeRange}'
      GROUP BY entity_id
      ORDER BY peak_disk_io DESC
    `),
  ])

  return {
    cpu: cpuMetrics,
    memory: memoryMetrics,
    disk: diskMetrics,
    timestamp: new Date().toISOString(),
  }
}
```

## TimescaleDB Features

### Hypertables

Automatically creates and manages TimescaleDB hypertables for optimal time-series performance:

```typescript
// Automatic hypertable creation
await client.initialize() // Creates hypertables if they don't exist

// Manual hypertable management
await client.createHypertable('time_series_data', {
  timeColumn: 'time',
  chunkTimeInterval: '1 day',
  partitioningColumn: 'entity_id',
})
```

### Compression

Enable compression for older data to save storage:

```typescript
// Enable compression for data older than 7 days
await client.enableCompression({
  table: 'time_series_data',
  compressAfter: '7 days',
  segmentBy: 'entity_id',
  orderBy: 'time DESC',
})
```

### Continuous Aggregates

Create materialized views for fast dashboard queries:

```typescript
// Create hourly aggregates view
await client.createContinuousAggregate('hourly_metrics', {
  query: `
    SELECT
      time_bucket('1 hour', time) as hour,
      entity_id,
      avg(value) as avg_value,
      max(value) as max_value,
      min(value) as min_value,
      count(*) as data_points
    FROM time_series_data
    GROUP BY hour, entity_id
  `,
  refreshPolicy: {
    startOffset: '1 hour',
    endOffset: '1 minute',
    scheduleInterval: '1 hour',
  },
})
```

## 📚 Documentation

| Document                                         | Description                            |
| ------------------------------------------------ | -------------------------------------- |
| **[Getting Started](./docs/GETTING_STARTED.md)** | Step-by-step setup guide with examples |
| **[API Reference](./docs/API_REFERENCE.md)**     | Complete method documentation          |
| **[Architecture](./docs/ARCHITECTURE.md)**       | System design and architecture         |
| **[Deployment Guide](./docs/DEPLOYMENT.md)**     | Production deployment best practices   |
| **[Troubleshooting](./docs/TROUBLESHOOTING.md)** | Common issues and solutions            |

## Data Model

### TimeSeriesRecord Interface

```typescript
interface TimeSeriesRecord {
  entity_id: string // Unique identifier for the data source
  time: string // ISO 8601 timestamp
  value: number // Primary numeric value
  value2?: number // Optional second value
  value3?: number // Optional third value
  value4?: number // Optional fourth value
  metadata?: Record<string, any> // Optional metadata object
}
```

### Example Use Cases by Field

| Field       | IoT Sensors    | System Monitoring | Application Logging  |
| ----------- | -------------- | ----------------- | -------------------- |
| `entity_id` | `sensor_001`   | `server_prod_01`  | `api_gateway`        |
| `value`     | Temperature    | CPU Usage %       | Response Time        |
| `value2`    | Humidity       | Memory Usage      | Success/Error Flag   |
| `value3`    | Pressure       | Network I/O       | Request Size         |
| `value4`    | Battery Level  | Disk I/O          | Response Size        |
| `metadata`  | Location, Type | Instance Info     | Endpoint, User Agent |

## Performance & Scalability

- **High Throughput**: Handles millions of records per second with batch operations
- **Memory Efficient**: Streaming support for large datasets
- **Query Optimization**: Leverages TimescaleDB's time-based partitioning
- **Compression**: Automatic compression reduces storage by 90%+
- **Retention**: Automated data lifecycle management

## Security

- **SSL/TLS Support**: Encrypted connections to TimescaleDB
- **Input Validation**: Comprehensive data validation and sanitization
- **Parameterized Queries**: Protection against SQL injection
- **Environment Configuration**: Secure credential management

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---
