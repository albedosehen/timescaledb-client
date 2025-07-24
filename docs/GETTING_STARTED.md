# Getting Started with TimescaleDB Client

Welcome to the TimescaleDB Client for Deno! This guide will help you get up and running with the client library for building time-series applications, particularly focused on financial and trading use cases.

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
import { ClientFactory, TimescaleClient } from "jsr:@albedosehen/timescaledb-client";
```

Alternatively, you can import from a URL:

```typescript
import { ClientFactory, TimescaleClient } from "https://deno.land/x/timescaledb_client/mod.ts";
```

## First Connection

### Basic Connection

The simplest way to connect is using a connection string:

```typescript
import { ClientFactory } from "jsr:@albedosehen/timescaledb-client";

// Connect using connection string
const client = await ClientFactory.fromConnectionString(
  "postgresql://username:password@localhost:5432/your_database"
);

// Test the connection
try {
  await client.connect();
  console.log("✅ Connected to TimescaleDB successfully!");
} catch (error) {
  console.error("❌ Connection failed:", error);
}
```

### Connection with Configuration

For more control, you can use the configuration object:

```typescript
import { ClientFactory } from "jsr:@albedosehen/timescaledb-client";

const client = await ClientFactory.fromConfig({
  host: "localhost",
  port: 5432,
  database: "your_database",
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

await client.connect();
```

### Environment Variables

For production applications, use environment variables:

```typescript
import { ClientFactory } from "jsr:@albedosehen/timescaledb-client";

const client = await ClientFactory.fromEnv({
  // Reads from environment variables:
  // TIMESCALE_HOST, TIMESCALE_PORT, TIMESCALE_DATABASE,
  // TIMESCALE_USER, TIMESCALE_PASSWORD, TIMESCALE_SSL
});
```

## Basic Usage

### Creating Your First Hypertable

TimescaleDB's core feature is hypertables - tables optimized for time-series data:

```typescript
// Create a regular table first
await client.execute(`
  CREATE TABLE IF NOT EXISTS market_data (
    timestamp TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    volume BIGINT NOT NULL,
    market_cap DECIMAL(15,2)
  );
`);

// Convert to hypertable
await client.createHypertable('market_data', 'timestamp', {
  chunk_time_interval: '1 day',
  create_default_indexes: true
});

console.log("✅ Hypertable created successfully!");
```

### Inserting Time-Series Data

#### Single Insert

```typescript
await client.insert('market_data', {
  timestamp: new Date(),
  symbol: 'NVDA',
  price: 150.25,
  volume: 1000000,
  market_cap: 2500000000
});
```

#### Batch Insert

```typescript
const marketData = [
  {
    timestamp: new Date('2024-01-01T09:30:00Z'),
    symbol: 'NVDA',
    price: 150.25,
    volume: 1000000,
    market_cap: 2500000000
  },
  {
    timestamp: new Date('2024-01-01T09:31:00Z'),
    symbol: 'NVDA',
    price: 150.50,
    volume: 1200000,
    market_cap: 2502000000
  },
  {
    timestamp: new Date('2024-01-01T09:32:00Z'),
    symbol: 'GOOGL',
    price: 2800.75,
    volume: 500000,
    market_cap: 1800000000
  }
];

await client.batchInsert('market_data', marketData);
console.log(`✅ Inserted ${marketData.length} records`);
```

### Querying Data

#### Basic Query

```typescript
const recentData = await client.query(`
  SELECT * FROM market_data
  WHERE timestamp >= NOW() - INTERVAL '1 hour'
  ORDER BY timestamp DESC
  LIMIT 10;
`);

console.log("Recent market data:", recentData);
```

#### Time-Series Specific Queries

```typescript
// Get OHLC data for the last day
const ohlcData = await client.query(`
  SELECT
    time_bucket('1 minute', timestamp) as bucket,
    symbol,
    FIRST(price, timestamp) as open,
    MAX(price) as high,
    MIN(price) as low,
    LAST(price, timestamp) as close,
    SUM(volume) as volume
  FROM market_data
  WHERE timestamp >= NOW() - INTERVAL '1 day'
  GROUP BY bucket, symbol
  ORDER BY bucket DESC;
`);

console.log("OHLC data:", ohlcData);
```

### Using Built-in Analytics

The client provides built-in methods for common financial calculations:

```typescript
// Calculate Simple Moving Average
const sma = await client.calculateSMA('market_data', 'price', 20, {
  symbol: 'NVDA',
  timeRange: '1 day'
});

// Calculate RSI
const rsi = await client.calculateRSI('market_data', 'price', 14, {
  symbol: 'NVDA',
  timeRange: '1 day'
});

// Calculate Bollinger Bands
const bollinger = await client.calculateBollingerBands('market_data', 'price', 20, 2, {
  symbol: 'NVDA',
  timeRange: '1 day'
});

console.log("SMA:", sma);
console.log("RSI:", rsi);
console.log("Bollinger Bands:", bollinger);
```

## Common Patterns

### 1. Real-Time Data Processing

```typescript
// Set up real-time data processing
class RealTimeProcessor {
  private client: TimescaleClient;

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async processMarketFeed(data: any[]) {
    // Validate data
    const validData = data.filter(d => d.price > 0 && d.volume > 0);

    // Batch insert for performance
    await this.client.batchInsert('market_data', validData);

    // Trigger any analytics
    await this.updateAnalytics(validData);
  }

  private async updateAnalytics(data: any[]) {
    // Calculate real-time indicators
    for (const record of data) {
      const sma = await this.client.calculateSMA('market_data', 'price', 20, {
        symbol: record.symbol,
        timeRange: '1 hour'
      });

      // Store or use the calculated values
      console.log(`SMA for ${record.symbol}: ${sma}`);
    }
  }
}
```

### 2. Error Handling

```typescript
import { ConnectionError, ValidationError, QueryError } from "jsr:@albedosehen/timescaledb-client";

async function robustDataInsertion(data: any[]) {
  try {
    await client.batchInsert('market_data', data);
  } catch (error) {
    if (error instanceof ConnectionError) {
      console.error("Connection issue:", error.message);
      // Implement retry logic
      await retryConnection();
    } else if (error instanceof ValidationError) {
      console.error("Data validation failed:", error.message);
      // Clean and retry with valid data
      const cleanData = data.filter(d => validateRecord(d));
      await client.batchInsert('market_data', cleanData);
    } else if (error instanceof QueryError) {
      console.error("Query failed:", error.message);
      // Log and handle query errors
    } else {
      console.error("Unexpected error:", error);
      throw error;
    }
  }
}
```

### 3. Performance Optimization

```typescript
// Use connection pooling for high-throughput applications
const client = await ClientFactory.fromConnectionString(
  "postgresql://username:password@localhost:5432/your_database",
  {
    pool: {
      min: 5,
      max: 20,
      idle_timeout: 30000,
      connect_timeout: 5000
    }
  }
);

// Use batch operations for bulk data
async function optimizedBulkInsert(data: any[]) {
  const batchSize = 1000;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await client.batchInsert('market_data', batch);
  }
}

// Use transactions for consistency
async function transactionalUpdate() {
  const transaction = await client.beginTransaction();

  try {
    await transaction.execute("UPDATE market_data SET processed = true WHERE id = $1", [123]);
    await transaction.execute("INSERT INTO audit_log (action, timestamp) VALUES ($1, $2)", ["update", new Date()]);

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

### 4. Data Compression and Retention

```typescript
// Enable compression for older data
await client.addCompressionPolicy('market_data', '7 days', {
  segment_by: 'symbol',
  order_by: 'timestamp DESC'
});

// Set up data retention policy
await client.addRetentionPolicy('market_data', '1 year');

// Create continuous aggregates for performance
await client.createContinuousAggregate('market_data_hourly', `
  SELECT
    time_bucket('1 hour', timestamp) as bucket,
    symbol,
    AVG(price) as avg_price,
    SUM(volume) as total_volume
  FROM market_data
  GROUP BY bucket, symbol
`, {
  refresh_policy: {
    start_offset: '1 hour',
    end_offset: '1 minute',
    schedule_interval: '1 hour'
  }
});
```

## Next Steps

Now that you have the basics, explore these areas:

### 1. **Examples Directory**

Check out the comprehensive examples in the `/examples` folder:

- **Basic Examples**: [`examples/basic/`](../examples/basic/) - Simple operations and patterns
- **Advanced Examples**: [`examples/advanced/`](../examples/advanced/) - Complex queries and optimizations
- **Real-World Examples**: [`examples/real_world/`](../examples/real_world/) - Complete trading systems

### 2. **API Reference**

Read the complete API documentation: [`docs/API_REFERENCE.md`](./API_REFERENCE.md)

### 3. **Deployment Guide**

Learn about production deployment: [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md)

### 4. **Troubleshooting**

Common issues and solutions: [`docs/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

### 5. **Sample Applications**

Try building these sample applications:

#### Simple Price Tracker

```typescript
import { ClientFactory } from "jsr:@albedosehen/timescaledb-client";

const client = await ClientFactory.fromConnectionString("your-connection-string");

// Track prices every minute
setInterval(async () => {
  const price = await fetchCurrentPrice('NVDA'); // Your price fetching logic

  await client.insert('market_data', {
    timestamp: new Date(),
    symbol: 'NVDA',
    price: price,
    volume: 0
  });

  console.log(`Recorded NVDA price: $${price}`);
}, 60000);
```

#### Technical Indicator Dashboard

```typescript
class TechnicalIndicatorDashboard {
  private client: TimescaleClient;

  constructor(client: TimescaleClient) {
    this.client = client;
  }

  async getDashboardData(symbol: string) {
    const [sma20, sma50, rsi, bollinger] = await Promise.all([
      this.client.calculateSMA('market_data', 'price', 20, { symbol }),
      this.client.calculateSMA('market_data', 'price', 50, { symbol }),
      this.client.calculateRSI('market_data', 'price', 14, { symbol }),
      this.client.calculateBollingerBands('market_data', 'price', 20, 2, { symbol })
    ]);

    return {
      symbol,
      sma20,
      sma50,
      rsi,
      bollinger,
      signal: this.generateSignal(sma20, sma50, rsi)
    };
  }

  private generateSignal(sma20: number, sma50: number, rsi: number) {
    if (sma20 > sma50 && rsi < 70) return 'BUY';
    if (sma20 < sma50 && rsi > 30) return 'SELL';
    return 'HOLD';
  }
}
```

## Support and Community

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Complete API reference and guides
- **Examples**: Comprehensive example applications
- **Community**: Join our developer community for support

Happy coding with TimescaleDB! 🚀
