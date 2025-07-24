# timescaledb-client - TimescaleDB Client for Financial Data

A high-performance, type-safe client for TimescaleDB for financial market data analytics and trading applications.

[![JSR](https://jsr.io/badges/@albedosehen/timescaledb-client)](https://jsr.io/@albedosehen/timescaledb-client)
[![CI](https://github.com/albedosehen/timescaledb-client/workflows/CI/badge.svg)](https://github.com/albedosehen/timescaledb-client/actions)
[![Coverage](https://codecov.io/gh/albedosehen/timescaledb-client/branch/main/graph/badge.svg)](https://codecov.io/gh/albedosehen/timescaledb-client)

## 🚀 Quick Start

```typescript
import { ClientFactory } from '@albedosehen/timescaledb-client'

// Create client from connection string
const client = await ClientFactory.fromConnectionString(
  'postgresql://user:pass@localhost:5432/trading_db'
)

// Insert market tick data
await client.insertTick({
  symbol: 'BTCUSD',
  price: 45250.00,
  volume: 1.25,
  timestamp: new Date().toISOString()
})

// Query recent price movements
const recentTicks = await client.getTicks('BTCUSD', {
  from: new Date(Date.now() - 3600000), // Last hour
  to: new Date(),
  limit: 1000
})

// Calculate technical indicators
const sma20 = await client.calculateSMA('BTCUSD', 20, {
  from: new Date(Date.now() - 86400000 * 30), // Last 30 days
  to: new Date()
})
```

## 💡 Why TimescaleDB Client?

### Built for Financial Markets

- **High-Frequency Data**: Optimized for tick-by-tick market data ingestion
- **Real-Time Analytics**: Calculate technical indicators and market metrics
- **Portfolio Management**: Multi-symbol analysis and correlation tracking
- **Risk Management**: Volatility calculations and drawdown analysis

### Production-Ready Performance

- **Batch Operations**: Process millions of ticks efficiently
- **Streaming Support**: Handle large datasets without memory issues
- **Connection Pooling**: Optimized postgres.js integration
- **TimescaleDB Native**: Leverages hypertables, continuous aggregates, and compression

### Developer Experience

- **Type-Safe**: Full TypeScript support with financial data types
- **Easy Setup**: Multiple initialization patterns
- **Comprehensive Testing**: 168 test scenarios with 95%+ coverage
- **Rich Documentation**: Examples, guides, and API reference

## 📦 Installation

### Using JSR (Recommended)

```bash
deno add jsr:@albedosehen/timescaledb-client
```

### Import Maps (Deno)

```json
{
  "imports": {
    "@albedosehen/timescaledb-client": "jsr:@albedosehen/timescaledb-client"
  }
}
```

## 🏗️ Core Features

### Market Data Operations

| Feature | Description | Example |
|---------|-------------|---------|
| **Tick Ingestion** | Store individual price/volume ticks | [`insertTick()`](./src/client.ts#L207), [`insertManyTicks()`](./src/client.ts#L240) |
| **OHLC Candles** | Store and retrieve candlestick data | [`insertOhlc()`](./src/client.ts#L224), [`getOhlc()`](./src/client.ts#L322) |
| **Price Queries** | Retrieve historical price data | [`getTicks()`](./src/client.ts#L298), [`getLatestPrice()`](./src/client.ts#L372) |
| **Multi-Symbol** | Analyze multiple instruments | [`getMultiSymbolLatest()`](./src/client.ts#L388) |

### Technical Analysis

| Indicator | Description | Method |
|-----------|-------------|---------|
| **Moving Averages** | SMA, EMA calculations | [`calculateSMA()`](./src/client.ts#L468), [`calculateEMA()`](./src/client.ts#L486) |
| **RSI** | Relative Strength Index | [`calculateRSI()`](./src/client.ts#L504) |
| **Bollinger Bands** | Price volatility bands | [`calculateBollingerBands()`](./src/client.ts#L522) |
| **VWAP** | Volume Weighted Average Price | [`getVwap()`](./src/client.ts#L443) |
| **Support/Resistance** | Key price levels | [`findSupportResistanceLevels()`](./src/client.ts#L576) |

### Advanced Analytics

| Feature | Description | Method |
|---------|-------------|---------|
| **Volatility** | Price volatility calculations | [`getVolatility()`](./src/client.ts#L427) |
| **Price Delta** | Price change analysis | [`getPriceDelta()`](./src/client.ts#L411) |
| **Correlation** | Asset correlation analysis | [`calculateCorrelation()`](./src/client.ts#L594) |
| **Volume Profile** | Volume distribution analysis | [`getVolumeProfile()`](./src/client.ts#L558) |
| **Top Movers** | Largest price movements | [`getTopMovers()`](./src/client.ts#L540) |

## 🎯 Use Cases

### Algorithmic Trading

- Real-time signal generation
- Strategy backtesting
- Order execution analytics
- Performance attribution

### Market Data Analysis

- Historical price analysis
- Volatility modeling
- Correlation studies
- Market microstructure research

### Risk Management

- Portfolio risk monitoring
- Value-at-Risk calculations
- Stress testing
- Exposure analytics

### Quantitative Research

- Factor analysis
- Alpha generation
- Strategy development
- Performance measurement

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[Getting Started](./docs/GETTING_STARTED.md)** | Step-by-step setup guide |
| **[API Reference](./docs/API_REFERENCE.md)** | Complete method documentation |
| **[Examples](./examples/)** | Practical code examples |
| **[Deployment Guide](./docs/DEPLOYMENT.md)** | Production deployment |
| **[Troubleshooting](./docs/TROUBLESHOOTING.md)** | Common issues and solutions |

## 🔧 Configuration

### Basic Configuration

```typescript
import { ClientFactory } from '@albedosehen/timescaledb-client'

const client = await ClientFactory.fromConfig({
  host: 'localhost',
  port: 5432,
  database: 'trading_db',
  username: 'trader',
  password: 'secure_password',
  ssl: true
}, {
  defaultBatchSize: 5000,
  validateInputs: true,
  autoCreateTables: false
})
```

### Environment Variables

```bash
# Connection
PGHOST=localhost
PGPORT=5432
PGDATABASE=trading_db
PGUSER=trader
PGPASSWORD=secure_password

# TimescaleDB Client
TIMESCALE_DEBUG=false
```

### Production Configuration

```typescript
const client = await ClientFactory.production(
  process.env.DATABASE_URL,
  {
    maxRetries: 5,
    queryTimeout: 60000,
    collectStats: true
  }
)
```

## Examples

### Basic Market Data

```typescript
// Insert real-time tick data
await client.insertManyTicks([
  { symbol: 'BTCUSD', price: 45250.00, volume: 1.25, timestamp: '2024-01-15T10:00:00Z' },
  { symbol: 'ETHUSD', price: 2890.50, volume: 5.50, timestamp: '2024-01-15T10:00:01Z' },
  { symbol: 'NVDA', price: 185.25, volume: 100, timestamp: '2024-01-15T10:00:02Z' }
])

// Generate OHLC candles from tick data
const hourlyCandles = await client.getOhlcFromTicks('BTCUSD', 60, {
  from: new Date('2024-01-15T09:00:00Z'),
  to: new Date('2024-01-15T17:00:00Z')
})
```

### Basic Technical Analysis

```typescript
// Calculate 20-period moving average
const sma20 = await client.calculateSMA('BTCUSD', 20, timeRange)

// RSI for overbought/oversold conditions
const rsi = await client.calculateRSI('BTCUSD', 14, timeRange)

// Bollinger Bands for volatility analysis
const bands = await client.calculateBollingerBands('BTCUSD', 20, 2.0, timeRange)
```

### Basic Portfolio Analysis

```typescript
// Multi-asset latest prices
const portfolio = ['BTCUSD', 'DOGE', 'NVDA', 'TSLA', 'GOOGL', 'SPY']
const latestPrices = await client.getMultiSymbolLatest(portfolio)

// Asset correlation matrix
const correlation = await client.calculateCorrelation('BTCUSD', 'DOGE', timeRange)

// Top movers in the last 24 hours
const topMovers = await client.getTopMovers(10, 24)
```

## Security

### SSL Configuration

```typescript
const client = await ClientFactory.fromConfig({
  host: 'secure-db.example.com',
  ssl: {
    rejectUnauthorized: true,
    ca: await Deno.readTextFile('./certs/ca.pem'),
    cert: await Deno.readTextFile('./certs/client.pem'),
    key: await Deno.readTextFile('./certs/client-key.pem')
  }
})
```

### Connection Security

- SSL/TLS encryption support
- Certificate-based authentication
- Environment variable configuration
- No hardcoded credentials

## Optimizations

- Connection pooling (10-20 connections)
- Prepared statement caching
- Streaming for large datasets
- TimescaleDB compression and retention

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🔗 Links

- **[JSR Package](https://jsr.io/@albedosehen/timescaledb-client)**
- **[GitHub Repository](https://github.com/albedosehen/timescaledb-client)**
- **[Documentation](./docs/)**
- **[Examples](./examples/)**
- **[Contributing Guide](./CONTRIBUTING.md)**
- **[Changelog](./CHANGELOG.md)**

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/albedosehen/timescaledb-client/issues)
- **Discussions**: [GitHub Discussions](https://github.com/albedosehen/timescaledb-client/discussions)
- **Documentation**: [Getting Started Guide](./docs/GETTING_STARTED.md)

---

**Built for traders, by traders** 📈
