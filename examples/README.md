# TimescaleDB Client Examples

This directory contains practical examples for using the TimescaleDB client in financial trading applications. All examples focus on realistic trading scenarios using market data.

## 📁 Directory Structure

### [basic/](./basic/) - Getting Started

Essential patterns for market data ingestion and basic queries.

- **[quick_start.ts](./basic/quick_start.ts)** - Minimal setup and first operations
- **[insert_data.ts](./basic/insert_data.ts)** - Market tick and OHLC data insertion
- **[query_data.ts](./basic/query_data.ts)** - Retrieving and filtering market data
- **[aggregations.ts](./basic/aggregations.ts)** - Basic time-series aggregations
- **[error_handling.ts](./basic/error_handling.ts)** - Proper error handling patterns

### [advanced/](./advanced/) - Production Patterns

Complex scenarios and high-performance implementations.

- **[batch_operations.ts](./advanced/batch_operations.ts)** - High-performance batch processing
- **[streaming_data.ts](./advanced/streaming_data.ts)** - Large dataset streaming examples
- **[custom_analytics.ts](./advanced/custom_analytics.ts)** - Advanced financial calculations
- **[schema_management.ts](./advanced/schema_management.ts)** - Database setup and migrations
- **[monitoring.ts](./advanced/monitoring.ts)** - Health checking and performance monitoring

### [real_world/](./real_world/) - Trading Applications

Practical trading system implementations and strategies.

- **[trading_bot.ts](./real_world/trading_bot.ts)** - Simple momentum trading strategy
- **[market_data_ingestion.ts](./real_world/market_data_ingestion.ts)** - Real-time data processing pipeline
- **[portfolio_analytics.ts](./real_world/portfolio_analytics.ts)** - Portfolio performance analysis
- **[risk_management.ts](./real_world/risk_management.ts)** - Risk calculation and monitoring
- **[backtesting.ts](./real_world/backtesting.ts)** - Historical strategy evaluation

### [performance/](./performance/) - Optimization Techniques

Benchmarks and optimization examples for high-frequency trading.

- **[high_frequency_ingestion.ts](./performance/high_frequency_ingestion.ts)** - Ultra-fast tick ingestion
- **[memory_optimization.ts](./performance/memory_optimization.ts)** - Memory-efficient operations
- **[connection_pooling.ts](./performance/connection_pooling.ts)** - Connection pool optimization
- **[benchmarks.ts](./performance/benchmarks.ts)** - Performance measurement tools

## 🚀 Running Examples

### Prerequisites

1. **TimescaleDB Instance**: Running locally or in the cloud
2. **Database Setup**: Tables and indexes created
3. **Environment Variables**: Connection configuration

### Quick Setup

```bash
# Set environment variables
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=trading_db
export PGUSER=trader
export PGPASSWORD=your_password

# Run an example
deno run --allow-net --allow-env examples/basic/quick_start.ts
```

### Database Schema

All examples assume the following tables exist:

```sql
-- Price ticks hypertable
CREATE TABLE price_ticks (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price NUMERIC NOT NULL,
  volume NUMERIC,
  PRIMARY KEY (symbol, time)
);
SELECT create_hypertable('price_ticks', 'time');

-- OHLC data hypertable
CREATE TABLE ohlc_data (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  interval_duration TEXT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC,
  PRIMARY KEY (symbol, interval_duration, time)
);
SELECT create_hypertable('ohlc_data', 'time');
```

## 📊 Sample Data

Most examples use these financial instruments:

- **Cryptocurrencies**: BTCUSD, ETHUSD, ADAUSD
- **Stocks**: NVDA, TSLA, GOOGL, MSFT
- **Forex**: EURUSD, GBPUSD, USDJPY

### Data Generators

Some examples include realistic data generators that create:

- Intraday price movements with volatility clusters
- Volume patterns based on trading sessions
- Market microstructure noise
- Correlation patterns between assets

## 🎯 Learning Path

### 1. Start with Basics

- Run [`quick_start.ts`](./basic/quick_start.ts) to understand client setup
- Explore [`insert_data.ts`](./basic/insert_data.ts) for data ingestion patterns
- Try [`query_data.ts`](./basic/query_data.ts) for data retrieval

### 2. Explore Analytics

- Check [`aggregations.ts`](./basic/aggregations.ts) for time-series operations
- Review [`custom_analytics.ts`](./advanced/custom_analytics.ts) for technical indicators

### 3. Real-World Applications

- Study [`portfolio_analytics.ts`](./real_world/portfolio_analytics.ts) for practical analysis
- Examine [`trading_bot.ts`](./real_world/trading_bot.ts) for strategy implementation

### 4. Optimize Performance

- Learn from [`batch_operations.ts`](./advanced/batch_operations.ts) for high-throughput scenarios
- Review [`high_frequency_ingestion.ts`](./performance/high_frequency_ingestion.ts) for HFT patterns

## 🛠️ Customization

### Adapting Examples

All examples are designed to be easily customizable:

1. **Symbols**: Change instrument symbols to match your data
2. **Time Ranges**: Adjust date ranges for your analysis period
3. **Parameters**: Modify technical indicator parameters
4. **Data Sources**: Adapt to your market data provider format

### Environment Configuration

Create a `.env` file for consistent configuration:

```bash
# Database connection
PGHOST=your-timescale-host
PGPORT=5432
PGDATABASE=trading_db
PGUSER=trader
PGPASSWORD=secure_password
PGSSLMODE=require

# Application settings
LOG_LEVEL=info
BATCH_SIZE=5000
QUERY_TIMEOUT=30000
```

## 📈 Financial Concepts

### Market Data Types

- **Ticks**: Individual price/volume updates
- **OHLC**: Open, High, Low, Close candles
- **Level 2**: Order book depth data
- **Trades**: Executed transaction records

### Technical Indicators

- **Trend**: SMA, EMA, MACD
- **Momentum**: RSI, Stochastic
- **Volatility**: Bollinger Bands, ATR
- **Volume**: VWAP, OBV, Volume Profile

### Risk Metrics

- **Volatility**: Standard deviation, VaR
- **Correlation**: Asset relationships
- **Drawdown**: Peak-to-trough losses
- **Sharpe Ratio**: Risk-adjusted returns

## 🔗 Additional Resources

- **[TimescaleDB Documentation](https://docs.timescale.com/)**
- **[postgres.js Documentation](https://github.com/porsager/postgres)**
- **[Financial Data Standards](https://www.fixtrading.org/)**
- **[Quantitative Finance Resources](https://quantlib.org/)**

---

**Happy Trading!** 📈💰
