-- TimescaleDB Client - Core Table Creation Script
-- This script creates the main hypertables and supporting tables for time-series financial data storage

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =============================================================================
-- SUPPORTING TABLES (Create these first for foreign key relationships)
-- =============================================================================

-- Schema version tracking table
CREATE TABLE IF NOT EXISTS schema_versions (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT DEFAULT current_user
);

-- Symbol metadata table for financial instruments
CREATE TABLE IF NOT EXISTS symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL, -- 'stock', 'crypto', 'forex', 'commodity', 'index', 'etf'
  exchange TEXT,
  currency TEXT DEFAULT 'USD',
  sector TEXT,
  market_cap BIGINT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Data integrity constraints
  CONSTRAINT symbols_asset_type_check CHECK (
    asset_type IN ('stock', 'crypto', 'forex', 'commodity', 'index', 'etf')
  ),
  CONSTRAINT symbols_symbol_format CHECK (
    symbol ~ '^[A-Z0-9_]{1,20}$' -- Alphanumeric and underscore, max 20 chars
  )
);

-- Data sources tracking table
CREATE TABLE IF NOT EXISTS data_sources (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  base_url TEXT,
  api_key_required BOOLEAN DEFAULT FALSE,
  rate_limit_per_minute INTEGER CHECK (rate_limit_per_minute > 0),
  data_delay_seconds INTEGER DEFAULT 0 CHECK (data_delay_seconds >= 0),
  reliability_score DECIMAL(3,2) DEFAULT 1.00 CHECK (reliability_score >= 0.00 AND reliability_score <= 1.00),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- HYPERTABLES - Main time-series data storage
-- =============================================================================

-- Price ticks hypertable for individual price tick data
CREATE TABLE IF NOT EXISTS price_ticks (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,

  -- Optional metadata fields
  exchange TEXT DEFAULT NULL,
  data_source TEXT DEFAULT NULL,
  bid_price DOUBLE PRECISION DEFAULT NULL,
  ask_price DOUBLE PRECISION DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite primary key ensuring uniqueness per symbol and time
  PRIMARY KEY (symbol, time),

  -- Data integrity constraints
  CONSTRAINT price_ticks_price_positive CHECK (price > 0),
  CONSTRAINT price_ticks_volume_non_negative CHECK (volume IS NULL OR volume >= 0),
  CONSTRAINT price_ticks_bid_positive CHECK (bid_price IS NULL OR bid_price > 0),
  CONSTRAINT price_ticks_ask_positive CHECK (ask_price IS NULL OR ask_price > 0),
  CONSTRAINT price_ticks_bid_ask_relationship CHECK (
    bid_price IS NULL OR ask_price IS NULL OR bid_price <= ask_price
  )
);

-- Convert to hypertable with optimized partitioning
SELECT create_hypertable(
  'price_ticks',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- OHLC data hypertable for candlestick data
CREATE TABLE IF NOT EXISTS ohlc_data (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  interval_duration TEXT NOT NULL, -- '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,

  -- Computed columns for analysis
  price_change DOUBLE PRECISION GENERATED ALWAYS AS (close - open) STORED,
  price_change_percent DOUBLE PRECISION GENERATED ALWAYS AS (
    CASE WHEN open > 0 THEN ((close - open) / open) * 100 ELSE NULL END
  ) STORED,

  -- Metadata fields
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
);

-- Convert to hypertable with optimized partitioning
SELECT create_hypertable(
  'ohlc_data',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- =============================================================================
-- TABLE COMMENTS AND DOCUMENTATION
-- =============================================================================

-- Schema version table comments
COMMENT ON TABLE schema_versions IS 'Tracks database schema versions and migration history';
COMMENT ON COLUMN schema_versions.version IS 'Semantic version of the schema (e.g., 1.0.0)';
COMMENT ON COLUMN schema_versions.description IS 'Human-readable description of changes in this version';

-- Symbols table comments
COMMENT ON TABLE symbols IS 'Metadata storage for financial instrument symbols';
COMMENT ON COLUMN symbols.symbol IS 'Unique identifier for the financial instrument (e.g., BTCUSD, NVDA)';
COMMENT ON COLUMN symbols.asset_type IS 'Type of financial instrument: stock, crypto, forex, commodity, index, etf';
COMMENT ON COLUMN symbols.market_cap IS 'Market capitalization in USD (for applicable asset types)';
COMMENT ON CONSTRAINT symbols_asset_type_check ON symbols IS 'Ensures asset_type is one of the supported types';

-- Data sources table comments
COMMENT ON TABLE data_sources IS 'Configuration and metadata for data feed sources';
COMMENT ON COLUMN data_sources.reliability_score IS 'Quality score from 0.00 to 1.00 (1.00 being highest quality)';
COMMENT ON COLUMN data_sources.data_delay_seconds IS 'Expected delay in seconds for real-time data';

-- Price ticks table comments
COMMENT ON TABLE price_ticks IS 'Time-series storage for individual price tick data';
COMMENT ON COLUMN price_ticks.time IS 'Timestamp of the price tick (partition key)';
COMMENT ON COLUMN price_ticks.symbol IS 'Financial instrument symbol';
COMMENT ON COLUMN price_ticks.price IS 'Primary price value (usually last trade or mid price)';
COMMENT ON COLUMN price_ticks.volume IS 'Trading volume (optional, may be NULL for some data sources)';
COMMENT ON COLUMN price_ticks.bid_price IS 'Best bid price (optional, for orderbook data)';
COMMENT ON COLUMN price_ticks.ask_price IS 'Best ask price (optional, for orderbook data)';
COMMENT ON CONSTRAINT price_ticks_price_positive ON price_ticks IS 'Ensures price values are positive';
COMMENT ON CONSTRAINT price_ticks_bid_ask_relationship ON price_ticks IS 'Ensures bid <= ask when both are present';

-- OHLC data table comments
COMMENT ON TABLE ohlc_data IS 'Time-series storage for OHLC candlestick data at various intervals';
COMMENT ON COLUMN ohlc_data.time IS 'Start timestamp of the time interval (partition key)';
COMMENT ON COLUMN ohlc_data.interval_duration IS 'Time interval duration (1m, 5m, 1h, 1d, etc.)';
COMMENT ON COLUMN ohlc_data.price_change IS 'Computed: close - open';
COMMENT ON COLUMN ohlc_data.price_change_percent IS 'Computed: ((close - open) / open) * 100';
COMMENT ON CONSTRAINT ohlc_price_relationship ON ohlc_data IS 'Ensures OHLC price relationships are mathematically valid';
COMMENT ON CONSTRAINT ohlc_valid_interval ON ohlc_data IS 'Restricts interval_duration to supported time periods';

-- =============================================================================
-- SAMPLE DATA INSERTION
-- =============================================================================

-- Insert initial schema version
INSERT INTO schema_versions (version, description)
VALUES ('1.0.0', 'Initial schema with price_ticks and ohlc_data hypertables')
ON CONFLICT (version) DO NOTHING;

-- Insert sample symbols for testing and development
INSERT INTO symbols (symbol, name, asset_type, exchange, currency, sector) VALUES
  ('BTCUSD', 'Bitcoin', 'crypto', 'Binance', 'USD', 'Cryptocurrency'),
  ('ETHUSD', 'Ethereum', 'crypto', 'Binance', 'USD', 'Cryptocurrency'),
  ('NVDA', 'Apple Inc.', 'stock', 'NASDAQ', 'USD', 'Technology'),
  ('TSLA', 'Tesla Inc.', 'stock', 'NASDAQ', 'USD', 'Automotive'),
  ('EURUSD', 'Euro/US Dollar', 'forex', 'FOREX', 'USD', 'Currency'),
  ('GBPUSD', 'British Pound/US Dollar', 'forex', 'FOREX', 'USD', 'Currency'),
  ('SPY', 'SPDR S&P 500 ETF', 'etf', 'NYSE', 'USD', 'Broad Market'),
  ('GOLD', 'Gold Futures', 'commodity', 'COMEX', 'USD', 'Precious Metals')
ON CONFLICT (symbol) DO NOTHING;

-- Insert sample data sources
INSERT INTO data_sources (name, description, data_delay_seconds, reliability_score, rate_limit_per_minute) VALUES
  ('Real-time Feed', 'Primary real-time data source with minimal delay', 0, 0.99, 6000),
  ('Backup Feed', 'Secondary backup data source', 5, 0.95, 3000),
  ('Historical API', 'Historical data backfill source', 300, 0.98, 1000),
  ('Market Data Vendor', 'Professional market data provider', 1, 0.995, 10000)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- SECURITY AND PERMISSIONS
-- =============================================================================

-- Revoke public access and grant specific permissions as needed
-- (These commands should be customized based on your security requirements)

-- Example: Grant read-only access to a reporting role
-- GRANT SELECT ON symbols, data_sources, price_ticks, ohlc_data TO readonly_role;

-- Example: Grant insert permissions to a data ingestion role
-- GRANT SELECT, INSERT ON price_ticks, ohlc_data TO data_writer_role;
-- GRANT SELECT ON symbols, data_sources TO data_writer_role;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'TimescaleDB schema creation completed successfully';
  RAISE NOTICE 'Created tables: schema_versions, symbols, data_sources, price_ticks (hypertable), ohlc_data (hypertable)';
  RAISE NOTICE 'Next steps: Run indexes.sql, retention.sql, compression.sql, continuous_aggregates.sql';
END $$;