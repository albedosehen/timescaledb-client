# Getting Started with TimescaleDB Client

Welcome to the TimescaleDB Client for Deno! This guide will help you get up and running with the client library for building time-series applications, including IoT sensor networks, system monitoring dashboards, and application logging systems.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [First Connection](#first-connection)
- [Basic Usage](#basic-usage)
- [Common Patterns](#common-patterns)
- [Next Steps](#next-steps)

## Prerequisites

Before getting started, ensure you have the following:

### System Requirements

- **Deno**: Version 1.40.0 or later
- **TimescaleDB**: Version 2.0 or later
- **PostgreSQL**: Version 12 or later (TimescaleDB extension)

### Database Setup

1. Install PostgreSQL and TimescaleDB extension
2. Create a database for your application
3. Enable the TimescaleDB extension:

   ```sql
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   ```

## Installation

The TimescaleDB Client is available on JSR (JavaScript Registry). You can import it directly in your Deno applications:

```typescript
import { ClientFactory, TimescaleClient } from "jsr:@timescale/client";
```

Alternatively, you can import from a URL:

```typescript
import { ClientFactory, TimescaleClient } from "https://deno.land/x/timescaledb_client/mod.ts";
```

## First Connection

### Basic Connection

The simplest way to connect is using a connection string:

```typescript
import { ClientFactory } from "jsr:@timescale/client";

// Connect using connection string
const client = await ClientFactory.fromConnectionString(
  "postgresql://username:password@localhost:5432/sensor_database"
);

// Test the connection
try {
  await client.initialize();
  console.log("✅ Connected to TimescaleDB successfully!");
} catch (error) {
  console.error("❌ Connection failed:", error);
}
```

### Connection with Configuration

For more control, you can use the configuration object:

```typescript
import { ClientFactory } from "jsr:@timescale/client";

const client = await ClientFactory.fromConfig({
  host: "localhost",
  port: 5432,
  database: "iot_database",
  username: "username",
  password: "password",
  ssl: false,
  pool: {
    min: 1,
    max: 10,
    idle_timeout: 30000,
    connect_timeout: 5000
  }
});

await client.initialize();
```

### Environment Variables

For production applications, use environment variables:

```typescript
import { ClientFactory } from "jsr:@timescale/client";

const client = await ClientFactory.fromEnvironment({
  // Reads from environment variables:
  // DATABASE_URL or PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
});
```

## Basic Usage

### Creating Your First Hypertable

TimescaleDB's core feature is hypertables - tables optimized for time-series data:

```typescript
// The client automatically creates the required schema
await client.ensureSchema()

console.log("✅ Hypertables created successfully!");
```

The client creates two main tables:

- `time_series_data`: For storing time-series records
- `entities`: For managing entity metadata

### Inserting Time-Series Data

#### Single Insert

```typescript
await client.insertRecord({
  entity_id: 'temp_sensor_01',
  time: new Date().toISOString(),
  value: 23.5,      // Temperature in Celsius
  value2: 65.2,     // Humidity percentage
  metadata: {
    location: 'warehouse_a',
    room: 'server_room',
    sensor_type: 'DHT22'
  }
});
```

#### Batch Insert

```typescript
const sensorReadings = [
  {
    entity_id: 'temp_sensor_01',
    time: new Date('2024-01-01T09:30:00Z').toISOString(),
    value: 22.1,      // Temperature
    value2: 58.3,     // Humidity
    metadata: { location: 'warehouse_a', room: 'server_room' }
  },
  {
    entity_id: 'temp_sensor_02',
    time: new Date('2024-01-01T09:30:00Z').toISOString(),
    value: 19.8,      // Temperature
    value2: 62.1,     // Humidity
    metadata: { location: 'warehouse_b', room: 'storage' }
  },
  {
    entity_id: 'cpu_monitor_01',
    time: new Date('2024-01-01T09:30:00Z').toISOString(),
    value: 75.2,      // CPU usage %
    value2: 8.1,      // Memory usage GB
    value3: 1024.5,   // Network throughput MB/s
    metadata: { server: 'prod-web-01', datacenter: 'us-east-1' }
  }
];

await client.insertManyRecords(sensorReadings);
console.log(`✅ Inserted ${sensorReadings.length} records`);
```

### Querying Data

#### Basic Query

```typescript
const recentData = await client.getRecords('temp_sensor_01', {
  from: new Date(Date.now() - 3600000), // Last hour
  to: new Date(),
  limit: 100
});

console.log("Recent sensor data:", recentData);
```

#### Time-Series Specific Queries

```typescript
// Get hourly averages for the last day
const hourlyAvgs = await client.getTimeBuckets('temp_sensor_01', '1 hour', {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
  to: new Date(),
  aggregateColumn: 'value',
  aggregateFunction: 'avg'
});

hourlyAvgs.forEach(bucket => {
  console.log(`${bucket.bucket}: Avg temp = ${bucket.value.toFixed(1)}°C`);
});
```

### Using Built-in Analytics

The client provides built-in methods for common time-series calculations:

```typescript
// Calculate average temperature over the last day
const avgTemp = await client.getAggregate('temp_sensor_01', 'avg', 'value', {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000),
  to: new Date()
});

// Get comprehensive statistics
const stats = await client.getStatistics('cpu_monitor_01', {
  from: new Date(Date.now() - 24 * 60 * 60 * 1000),
  to: new Date()
});

console.log(`Average temperature: ${avgTemp}°C`);
console.log(`CPU stats - Min: ${stats.min}%, Max: ${stats.max}%, Avg: ${stats.avg}%`);
```

## Common Patterns

### 1. IoT Sensor Data Pipeline

```typescript
// Set up IoT sensor data processing
class IoTDataProcessor {
  private client: TimescaleClient;

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async processSensorBatch(readings: SensorReading[]) {
    // Transform sensor readings to time-series records
    const records = readings.map(reading => ({
      entity_id: reading.sensorId,
      time: reading.timestamp,
      value: reading.temperature,
      value2: reading.humidity,
      value3: reading.pressure,
      metadata: {
        location: reading.location,
        sensor_type: reading.type,
        battery_level: reading.batteryLevel
      }
    }));

    // Batch insert for performance
    await this.client.insertManyRecords(records);

    // Check for anomalies
    await this.detectAnomalies(records);
  }

  private async detectAnomalies(records: TimeSeriesRecord[]) {
    for (const record of records) {
      // Temperature anomaly detection
      if (record.value > 40 || record.value < -20) {
        console.warn(`🚨 Temperature anomaly: ${record.entity_id} = ${record.value}°C`);
      }

      // Humidity anomaly detection
      if (record.value2 && (record.value2 > 95 || record.value2 < 5)) {
        console.warn(`🚨 Humidity anomaly: ${record.entity_id} = ${record.value2}%`);
      }
    }
  }
}
```

### 2. System Monitoring

```typescript
// Monitor server performance metrics
class SystemMonitor {
  private client: TimescaleClient;

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async recordSystemMetrics(serverId: string) {
    const metrics = await this.collectSystemMetrics(serverId);

    await this.client.insertRecord({
      entity_id: serverId,
      time: new Date().toISOString(),
      value: metrics.cpuUsage,        // CPU usage %
      value2: metrics.memoryUsage,    // Memory usage %
      value3: metrics.diskUsage,      // Disk usage %
      value4: metrics.networkIO,      // Network I/O MB/s
      metadata: {
        hostname: metrics.hostname,
        os_type: metrics.osType,
        datacenter: metrics.datacenter,
        instance_type: metrics.instanceType
      }
    });
  }

  async getServerHealth(serverId: string) {
    // Get recent CPU and memory usage
    const recentMetrics = await this.client.getRecords(serverId, {
      from: new Date(Date.now() - 300000), // Last 5 minutes
      to: new Date(),
      limit: 50
    });

    const avgCpu = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;
    const avgMemory = recentMetrics.reduce((sum, m) => sum + (m.value2 || 0), 0) / recentMetrics.length;

    return {
      serverId,
      avgCpuUsage: avgCpu,
      avgMemoryUsage: avgMemory,
      isHealthy: avgCpu < 80 && avgMemory < 85,
      lastUpdated: new Date()
    };
  }

  private async collectSystemMetrics(serverId: string) {
    // This would integrate with your actual system monitoring
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      diskUsage: Math.random() * 100,
      networkIO: Math.random() * 1000,
      hostname: `server-${serverId}`,
      osType: 'linux',
      datacenter: 'us-east-1',
      instanceType: 'c5.large'
    };
  }
}
```

### 3. Application Performance Monitoring

```typescript
// Track application performance metrics
class APMCollector {
  private client: TimescaleClient;

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async recordAPICall(endpoint: string, method: string, responseTime: number, statusCode: number) {
    await this.client.insertRecord({
      entity_id: 'api_gateway',
      time: new Date().toISOString(),
      value: responseTime,           // Response time in ms
      value2: statusCode === 200 ? 1 : 0,  // Success flag
      value3: Math.random() * 1000,  // Request size (bytes)
      value4: Math.random() * 2000,  // Response size (bytes)
      metadata: {
        endpoint,
        method,
        status_code: statusCode,
        user_agent: 'monitoring-agent'
      }
    });
  }

  async getPerformanceMetrics(hours = 24) {
    const timeRange = {
      from: new Date(Date.now() - hours * 60 * 60 * 1000),
      to: new Date()
    };

    // Get average response time
    const avgResponseTime = await this.client.getAggregate(
      'api_gateway', 'avg', 'value', timeRange
    );

    // Get success rate
    const successRate = await this.client.getAggregate(
      'api_gateway', 'avg', 'value2', timeRange
    );

    // Get 95th percentile response time
    const p95ResponseTime = await this.client.query(`
      SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY value) as p95
      FROM time_series_data
      WHERE entity_id = 'api_gateway'
        AND time > NOW() - INTERVAL '${hours} hours'
    `);

    return {
      avgResponseTime,
      successRate: successRate * 100, // Convert to percentage
      p95ResponseTime: p95ResponseTime[0]?.p95 || 0,
      timeRange
    };
  }
}
```

### 4. Error Handling

```typescript
import { ConnectionError, ValidationError, QueryError } from "jsr:@timescale/client";

async function robustDataInsertion(records: TimeSeriesRecord[]) {
  try {
    await client.insertManyRecords(records);
  } catch (error) {
    if (error instanceof ConnectionError) {
      console.error("Connection issue:", error.message);
      // Implement retry logic with exponential backoff
      await retryWithBackoff(() => client.insertManyRecords(records));
    } else if (error instanceof ValidationError) {
      console.error("Data validation failed:", error.message);
      // Filter out invalid records and retry
      const validRecords = records.filter(r => validateRecord(r));
      await client.insertManyRecords(validRecords);
    } else if (error instanceof QueryError) {
      console.error("Query failed:", error.message);
      // Log and handle query errors
    } else {
      console.error("Unexpected error:", error);
      throw error;
    }
  }
}

async function retryWithBackoff(operation: () => Promise<void>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await operation();
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}

function validateRecord(record: any): boolean {
  return record &&
         typeof record.entity_id === 'string' &&
         typeof record.time === 'string' &&
         typeof record.value === 'number' &&
         !isNaN(record.value);
}
```

### 5. Performance Optimization

```typescript
// Use connection pooling for high-throughput applications
const client = await ClientFactory.fromConnectionString(
  "postgresql://username:password@localhost:5432/iot_database",
  {
    pool: {
      min: 5,
      max: 20,
      idle_timeout: 30000,
      connect_timeout: 5000
    }
  }
);

// Use batch operations for bulk sensor data
async function optimizedBulkInsert(sensorData: SensorReading[]) {
  const batchSize = 1000;

  for (let i = 0; i < sensorData.length; i += batchSize) {
    const batch = sensorData.slice(i, i + batchSize);
    const records = batch.map(transformToTimeSeriesRecord);
    await client.insertManyRecords(records);
  }
}

// Use streaming for large datasets
async function processLargeDataset(entityId: string, timeRange: TimeRange) {
  const stream = await client.getRecordStream(entityId, timeRange);

  for await (const batch of stream) {
    // Process each batch without loading everything into memory
    await processBatch(batch);
  }
}
```

### 6. TimescaleDB Optimization

```typescript
// Enable compression for older data (saves 90%+ storage)
await client.enableCompression('time_series_data', {
  compressAfter: '7 days',
  segmentBy: 'entity_id',
  orderBy: 'time DESC'
});

// Set up data retention policy
await client.addRetentionPolicy('time_series_data', '1 year');

// Create continuous aggregates for fast dashboard queries
await client.createContinuousAggregate('hourly_sensor_data', `
  SELECT
    time_bucket('1 hour', time) as hour,
    entity_id,
    avg(value) as avg_temperature,
    avg(value2) as avg_humidity,
    max(value) as max_temperature,
    min(value) as min_temperature,
    count(*) as reading_count
  FROM time_series_data
  WHERE entity_id LIKE 'temp_sensor_%'
  GROUP BY hour, entity_id
`, {
  refreshPolicy: {
    start_offset: '1 hour',
    end_offset: '1 minute',
    schedule_interval: '1 hour'
  }
});
```

## Next Steps

Now that you have the basics, explore these areas:

### 1. **Examples Directory**

Check out comprehensive examples for different use cases:

- **IoT Sensor Networks**: Temperature, humidity, air quality monitoring
- **System Monitoring**: Server metrics, application performance, log analysis
- **Industrial IoT**: Manufacturing equipment, energy consumption, predictive maintenance

### 2. **API Reference**

Read the complete API documentation: [`docs/API_REFERENCE.md`](./API_REFERENCE.md)

### 3. **Deployment Guide**

Learn about production deployment: [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md)

### 4. **Troubleshooting**

Common issues and solutions: [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

### 5. **Sample Applications**

Try building these sample applications:

#### Simple Temperature Monitor

```typescript
import { ClientFactory } from "jsr:@timescale/client";

const client = await ClientFactory.fromConnectionString("your-connection-string");

// Simulate temperature readings every minute
setInterval(async () => {
  const temperature = 20 + Math.random() * 10; // Random temp 20-30°C
  const humidity = 40 + Math.random() * 20;    // Random humidity 40-60%

  await client.insertRecord({
    entity_id: 'office_sensor',
    time: new Date().toISOString(),
    value: temperature,
    value2: humidity,
    metadata: { location: 'office', floor: 3 }
  });

  console.log(`Recorded: ${temperature.toFixed(1)}°C, ${humidity.toFixed(1)}%`);
}, 60000);
```

#### System Health Dashboard

```typescript
class HealthDashboard {
  private client: TimescaleClient;

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async getDashboardData() {
    const timeRange = {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      to: new Date()
    };

    const [cpuMetrics, memoryMetrics, diskMetrics] = await Promise.all([
      // Average CPU usage across all servers
      this.client.query(`
        SELECT
          entity_id,
          avg(value) as avg_cpu
        FROM time_series_data
        WHERE entity_id LIKE 'server_%'
          AND time > NOW() - INTERVAL '24 hours'
        GROUP BY entity_id
        ORDER BY avg_cpu DESC
      `),

      // Memory usage trends (hourly buckets)
      this.client.getTimeBuckets('server_%', '1 hour', {
        ...timeRange,
        aggregateColumn: 'value2',
        aggregateFunction: 'avg'
      }),

      // Peak disk usage
      this.client.query(`
        SELECT
          entity_id,
          max(value3) as peak_disk_usage
        FROM time_series_data
        WHERE entity_id LIKE 'server_%'
          AND time > NOW() - INTERVAL '24 hours'
        GROUP BY entity_id
        HAVING max(value3) > 80
        ORDER BY peak_disk_usage DESC
      `)
    ]);

    return {
      serverMetrics: cpuMetrics,
      memoryTrends: memoryMetrics,
      diskAlerts: diskMetrics,
      timestamp: new Date().toISOString()
    };
  }
}
```

#### IoT Sensor Alerting System

```typescript
class SensorAlertSystem {
  private client: TimescaleClient;
  private alertThresholds = {
    temperature: { min: -10, max: 40 },
    humidity: { min: 10, max: 95 },
    pressure: { min: 980, max: 1050 }
  };

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async processRealtimeData(sensorData: SensorReading[]) {
    // Insert the data
    const records = sensorData.map(reading => ({
      entity_id: reading.sensorId,
      time: reading.timestamp,
      value: reading.temperature,
      value2: reading.humidity,
      value3: reading.pressure,
      metadata: reading.metadata
    }));

    await this.client.insertManyRecords(records);

    // Check for threshold violations
    for (const record of records) {
      await this.checkThresholds(record);
    }

    // Check for sensor connectivity issues
    await this.checkSensorHealth();
  }

  private async checkThresholds(record: TimeSeriesRecord) {
    const alerts = [];

    if (record.value < this.alertThresholds.temperature.min ||
        record.value > this.alertThresholds.temperature.max) {
      alerts.push(`Temperature alert: ${record.entity_id} = ${record.value}°C`);
    }

    if (record.value2 && (record.value2 < this.alertThresholds.humidity.min ||
        record.value2 > this.alertThresholds.humidity.max)) {
      alerts.push(`Humidity alert: ${record.entity_id} = ${record.value2}%`);
    }

    if (alerts.length > 0) {
      console.warn('🚨 ALERTS:', alerts);
      // Send notifications, update dashboard, etc.
    }
  }

  private async checkSensorHealth() {
    // Find sensors that haven't reported in the last 10 minutes
    const staleSensors = await this.client.query(`
      SELECT DISTINCT entity_id
      FROM time_series_data t1
      WHERE entity_id LIKE 'sensor_%'
        AND NOT EXISTS (
          SELECT 1 FROM time_series_data t2
          WHERE t2.entity_id = t1.entity_id
            AND t2.time > NOW() - INTERVAL '10 minutes'
        )
    `);

    if (staleSensors.length > 0) {
      console.warn('📡 Stale sensors:', staleSensors.map(s => s.entity_id));
    }
  }
}
```

## Support and Community

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Complete API reference and guides
- **Examples**: Comprehensive example applications
- **Community**: Join our developer community for support

Happy building with TimescaleDB! 🚀
