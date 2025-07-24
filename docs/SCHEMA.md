# TimescaleDB Client - Database Schema Design

## Overview

This document defines the database schema for the TimescaleDB client, including hypertable designs, indexing strategies, and TimescaleDB-specific optimizations for time-series financial data.

## Core Hypertables

### 1. Price Ticks Hypertable

The `price_ticks` table stores individual price tick data with optimal partitioning for time-series queries.

```sql
-- Primary hypertable for tick data
CREATE TABLE price_ticks (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,

  -- Metadata fields (optional)
  exchange TEXT DEFAULT NULL,
  data_source TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite primary key ensuring uniqueness
  PRIMARY KEY (symbol, time)
) WITH (
  tsdb.hypertable,
  tsdb.partition_column='time',
  tsdb.segmentby='symbol',
  tsdb.orderby='time DESC',
  tsdb.chunk_interval='1 day'
);

-- Add table comment
COMMENT ON TABLE price_ticks IS 'Time-series storage for individual price tick data';
COMMENT ON COLUMN price_ticks.time IS 'Timestamp of the price tick (partition key)';
COMMENT ON COLUMN price_ticks.symbol IS 'Financial instrument symbol (segment key)';
COMMENT ON COLUMN price_ticks.price IS 'Price value (must be positive)';
COMMENT ON COLUMN price_ticks.volume IS 'Trading volume (optional, non-negative)';
```

### 2. OHLC Data Hypertable

The `ohlc_data` table stores candlestick data for different time intervals.

```sql
-- Hypertable for OHLC/candlestick data
CREATE TABLE ohlc_data (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  interval_duration TEXT NOT NULL, -- '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,

  -- Derived fields for analysis
  price_change DOUBLE PRECISION GENERATED ALWAYS AS (close - open) STORED,
  price_change_percent DOUBLE PRECISION GENERATED ALWAYS AS (
    CASE WHEN open > 0 THEN ((close - open) / open) * 100 ELSE NULL END
  ) STORED,

  -- Metadata
  data_source TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite primary key
  PRIMARY KEY (symbol, interval_duration, time),

  -- Data integrity constraints
  CONSTRAINT ohlc_price_relationship CHECK (
    high >= GREATEST(open, close) AND
    low <= LEAST(open, close) AND
    open > 0 AND high > 0 AND low > 0 AND close > 0
  ),
  CONSTRAINT ohlc_volume_non_negative CHECK (volume IS NULL OR volume >= 0),
  CONSTRAINT ohlc_valid_interval CHECK (
    interval_duration IN ('1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M')
  )
) WITH (
  tsdb.hypertable,
  tsdb.partition_column='time',
  tsdb.segmentby='symbol',
  tsdb.orderby='time DESC',
  tsdb.chunk_interval='1 day'
);

-- Add table comments
COMMENT ON TABLE ohlc_data IS 'Time-series storage for OHLC candlestick data';
COMMENT ON COLUMN ohlc_data.interval_duration IS 'Time interval for the OHLC data (1m, 5m, 1h, 1d, etc.)';
COMMENT ON CONSTRAINT ohlc_price_relationship ON ohlc_data IS 'Ensures OHLC price relationships are valid';
```

## Optimized Indexing Strategy

### Primary Performance Indexes

```sql
-- Symbol-time index for efficient single-symbol queries
CREATE INDEX ix_price_ticks_symbol_time
ON price_ticks (symbol, time DESC);

CREATE INDEX ix_ohlc_symbol_interval_time
ON ohlc_data (symbol, interval_duration, time DESC);

-- Time-based indexes for cross-symbol queries
CREATE INDEX ix_price_ticks_time
ON price_ticks (time DESC);

CREATE INDEX ix_ohlc_time
ON ohlc_data (time DESC);

-- Volume-based queries (for high-volume analysis)
CREATE INDEX ix_price_ticks_volume_time
ON price_ticks (volume DESC, time DESC)
WHERE volume IS NOT NULL;

-- Exchange-specific queries (if using exchange field)
CREATE INDEX ix_price_ticks_exchange_symbol_time
ON price_ticks (exchange, symbol, time DESC)
WHERE exchange IS NOT NULL;

-- Price range queries
CREATE INDEX ix_price_ticks_price_time
ON price_ticks (price, time DESC);

-- OHLC interval-specific queries
CREATE INDEX ix_ohlc_interval_time
ON ohlc_data (interval_duration, time DESC);
```

### Partial Indexes for Optimization

```sql
-- High-volume ticks only (for performance-sensitive queries)
CREATE INDEX ix_price_ticks_high_volume
ON price_ticks (symbol, time DESC)
WHERE volume > 1000;

-- Recent data optimization (last 30 days)
CREATE INDEX ix_price_ticks_recent
ON price_ticks (symbol, time DESC)
WHERE time > NOW() - INTERVAL '30 days';

-- Daily and hourly OHLC data (most common queries)
CREATE INDEX ix_ohlc_daily_hourly
ON ohlc_data (symbol, time DESC)
WHERE interval_duration IN ('1d', '1h');
```

## Supporting Tables

### 1. Symbol Metadata Table

```sql
-- Relational table for symbol information
CREATE TABLE symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL, -- 'stock', 'crypto', 'forex', 'commodity'
  exchange TEXT,
  currency TEXT DEFAULT 'USD',
  sector TEXT,
  market_cap BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT symbols_asset_type_check CHECK (
    asset_type IN ('stock', 'crypto', 'forex', 'commodity', 'index', 'etf')
  )
);

-- Indexes for symbol queries
CREATE INDEX ix_symbols_asset_type ON symbols (asset_type);
CREATE INDEX ix_symbols_exchange ON symbols (exchange);
CREATE INDEX ix_symbols_active ON symbols (is_active) WHERE is_active = TRUE;

-- Add foreign key relationships (optional, for data integrity)
-- Note: This can impact insert performance, so consider carefully
-- ALTER TABLE price_ticks ADD CONSTRAINT fk_price_ticks_symbol
--   FOREIGN KEY (symbol) REFERENCES symbols(symbol);
-- ALTER TABLE ohlc_data ADD CONSTRAINT fk_ohlc_data_symbol
--   FOREIGN KEY (symbol) REFERENCES symbols(symbol);
```

### 2. Data Sources Table

```sql
-- Track data sources and quality
CREATE TABLE data_sources (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  base_url TEXT,
  api_key_required BOOLEAN DEFAULT FALSE,
  rate_limit_per_minute INTEGER,
  data_delay_seconds INTEGER DEFAULT 0,
  reliability_score DECIMAL(3,2) DEFAULT 1.00, -- 0.00 to 1.00
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_data_sources_active ON data_sources (is_active) WHERE is_active = TRUE;
```

## TimescaleDB-Specific Optimizations

### 1. Compression Policies

```sql
-- Enable compression for older data (7 days and older)
CALL add_compression_policy('price_ticks', INTERVAL '7 days');
CALL add_compression_policy('ohlc_data', INTERVAL '7 days');

-- Custom compression for better ratio on price_ticks
CALL alter_table_set_compression_policy('price_ticks', '{
  "compress_segmentby": "symbol",
  "compress_orderby": "time DESC"
}');
```

### 2. Retention Policies

```sql
-- Retain tick data for 2 years
CALL add_retention_policy('price_ticks', INTERVAL '2 years');

-- Retain OHLC data for 5 years (more compact)
CALL add_retention_policy('ohlc_data', INTERVAL '5 years');
```

### 3. Continuous Aggregates

```sql
-- Hourly OHLC from tick data
CREATE MATERIALIZED VIEW ohlc_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS hour,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS tick_count
FROM price_ticks
GROUP BY hour, symbol;

-- Add refresh policy for continuous aggregate
CALL add_continuous_aggregate_policy('ohlc_hourly',
  start_offset => INTERVAL '1 day',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes'
);

-- Daily aggregates for faster reporting
CREATE MATERIALIZED VIEW ohlc_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS day,
  symbol,
  first(price, time) AS open,
  max(price) AS high,
  min(price) AS low,
  last(price, time) AS close,
  sum(volume) AS volume,
  count(*) AS tick_count,
  stddev(price) AS volatility
FROM price_ticks
GROUP BY day, symbol;

CALL add_continuous_aggregate_policy('ohlc_daily',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour'
);
```

## Schema Creation Script

```sql
-- Complete schema creation script for TimescaleDB client

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create supporting tables first
CREATE TABLE symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  exchange TEXT,
  currency TEXT DEFAULT 'USD',
  sector TEXT,
  market_cap BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT symbols_asset_type_check CHECK (
    asset_type IN ('stock', 'crypto', 'forex', 'commodity', 'index', 'etf')
  )
);

CREATE TABLE data_sources (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  base_url TEXT,
  api_key_required BOOLEAN DEFAULT FALSE,
  rate_limit_per_minute INTEGER,
  data_delay_seconds INTEGER DEFAULT 0,
  reliability_score DECIMAL(3,2) DEFAULT 1.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create main hypertables
CREATE TABLE price_ticks (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,
  exchange TEXT DEFAULT NULL,
  data_source TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (symbol, time),

  CONSTRAINT price_ticks_price_positive CHECK (price > 0),
  CONSTRAINT price_ticks_volume_non_negative CHECK (volume IS NULL OR volume >= 0)
) WITH (
  tsdb.hypertable,
  tsdb.partition_column='time',
  tsdb.segmentby='symbol',
  tsdb.orderby='time DESC',
  tsdb.chunk_interval='1 day'
);

CREATE TABLE ohlc_data (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  interval_duration TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,

  price_change DOUBLE PRECISION GENERATED ALWAYS AS (close - open) STORED,
  price_change_percent DOUBLE PRECISION GENERATED ALWAYS AS (
    CASE WHEN open > 0 THEN ((close - open) / open) * 100 ELSE NULL END
  ) STORED,

  data_source TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (symbol, interval_duration, time),

  CONSTRAINT ohlc_price_relationship CHECK (
    high >= GREATEST(open, close) AND
    low <= LEAST(open, close) AND
    open > 0 AND high > 0 AND low > 0 AND close > 0
  ),
  CONSTRAINT ohlc_volume_non_negative CHECK (volume IS NULL OR volume >= 0),
  CONSTRAINT ohlc_valid_interval CHECK (
    interval_duration IN ('1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M')
  )
) WITH (
  tsdb.hypertable,
  tsdb.partition_column='time',
  tsdb.segmentby='symbol',
  tsdb.orderby='time DESC',
  tsdb.chunk_interval='1 day'
);

-- Create indexes
CREATE INDEX ix_symbols_asset_type ON symbols (asset_type);
CREATE INDEX ix_symbols_exchange ON symbols (exchange);
CREATE INDEX ix_symbols_active ON symbols (is_active) WHERE is_active = TRUE;

CREATE INDEX ix_data_sources_active ON data_sources (is_active) WHERE is_active = TRUE;

CREATE INDEX ix_price_ticks_symbol_time ON price_ticks (symbol, time DESC);
CREATE INDEX ix_price_ticks_time ON price_ticks (time DESC);
CREATE INDEX ix_price_ticks_volume_time ON price_ticks (volume DESC, time DESC) WHERE volume IS NOT NULL;

CREATE INDEX ix_ohlc_symbol_interval_time ON ohlc_data (symbol, interval_duration, time DESC);
CREATE INDEX ix_ohlc_time ON ohlc_data (time DESC);
CREATE INDEX ix_ohlc_interval_time ON ohlc_data (interval_duration, time DESC);

-- Insert sample symbols
INSERT INTO symbols (symbol, name, asset_type, exchange, currency) VALUES
  ('BTCUSD', 'Bitcoin', 'crypto', 'Binance', 'USD'),
  ('ETHUSD', 'Ethereum', 'crypto', 'Binance', 'USD'),
  ('NVDA', 'Apple Inc.', 'stock', 'NASDAQ', 'USD'),
  ('TSLA', 'Tesla Inc.', 'stock', 'NASDAQ', 'USD'),
  ('EURUSD', 'Euro/US Dollar', 'forex', 'FOREX', 'USD'),
  ('GBPUSD', 'British Pound/US Dollar', 'forex', 'FOREX', 'USD')
ON CONFLICT (symbol) DO NOTHING;

-- Insert sample data sources
INSERT INTO data_sources (name, description, data_delay_seconds, reliability_score) VALUES
  ('Real-time Feed', 'Primary real-time data source', 0, 0.99),
  ('Backup Feed', 'Secondary backup data source', 5, 0.95),
  ('Historical API', 'Historical data backfill source', 300, 0.98)
ON CONFLICT (name) DO NOTHING;
```

## Migration Strategy

### Version Management

```sql
-- Schema version tracking
CREATE TABLE schema_versions (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT DEFAULT current_user
);

-- Track current schema version
INSERT INTO schema_versions (version, description)
VALUES ('1.0.0', 'Initial schema with price_ticks and ohlc_data hypertables');
```

### Migration Scripts

```sql
-- Example migration: Add new column to price_ticks
-- Migration: 1.0.0 -> 1.1.0
DO $migration$
BEGIN
  -- Check if migration is needed
  IF NOT EXISTS (
    SELECT 1 FROM schema_versions WHERE version = '1.1.0'
  ) THEN

    -- Add new column
    ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS bid_price DOUBLE PRECISION;
    ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS ask_price DOUBLE PRECISION;

    -- Add constraints
    ALTER TABLE price_ticks ADD CONSTRAINT price_ticks_bid_positive
      CHECK (bid_price IS NULL OR bid_price > 0);
    ALTER TABLE price_ticks ADD CONSTRAINT price_ticks_ask_positive
      CHECK (ask_price IS NULL OR ask_price > 0);

    -- Add index for bid/ask queries
    CREATE INDEX ix_price_ticks_bid_ask_time
    ON price_ticks (symbol, time DESC)
    WHERE bid_price IS NOT NULL AND ask_price IS NOT NULL;

    -- Record migration
    INSERT INTO schema_versions (version, description)
    VALUES ('1.1.0', 'Added bid_price and ask_price columns to price_ticks');

    RAISE NOTICE 'Migration to version 1.1.0 completed successfully';
  ELSE
    RAISE NOTICE 'Migration to version 1.1.0 already applied';
  END IF;
END;
$migration$;
```

## Performance Considerations

### Query Patterns

1. **Single Symbol Time Range**: Use `ix_price_ticks_symbol_time` index
2. **Cross-Symbol Analysis**: Use `ix_price_ticks_time` for time-based scanning
3. **Volume Analysis**: Use `ix_price_ticks_volume_time` for volume-based queries
4. **Recent Data**: Partial indexes on recent data improve hot-path performance

### Chunking Strategy

- **Chunk Interval**: 1 day provides good balance for financial data
- **Segment By**: Symbol ensures related data is co-located
- **Order By**: Time DESC optimizes for recent-data queries

### Memory and Storage

- **Compression**: Achieves 10-20x compression ratio for older chunks
- **Retention**: Automatic cleanup of old data reduces storage costs
- **Continuous Aggregates**: Pre-computed aggregations improve query performance

This schema design provides a robust foundation for time-series financial data storage with TimescaleDB optimization features.