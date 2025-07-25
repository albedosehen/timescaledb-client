-- Migration: 001_initial_schema.sql
-- Description: Initial TimescaleDB schema with core hypertables and supporting tables
-- Author: TimescaleDB Client Generator
-- Dialect: postgresql
-- Created: 2024-01-01
-- =============================================================================
-- MIGRATION METADATA
-- =============================================================================

DO $$
BEGIN
    -- Check if this migration has already been applied
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'schema_versions'
    ) AND EXISTS (
        SELECT 1 FROM schema_versions WHERE version = '001_initial_schema'
    ) THEN
        RAISE NOTICE 'Migration 001_initial_schema already applied, skipping...';
        RETURN;
    END IF;

    RAISE NOTICE 'Applying migration: 001_initial_schema';
END $$;

-- =============================================================================
-- ENABLE TIMESCALEDB EXTENSION
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =============================================================================
-- CREATE SUPPORTING TABLES
-- =============================================================================

-- Schema version tracking table
CREATE TABLE IF NOT EXISTS schema_versions (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by TEXT DEFAULT current_user
);

-- Symbol metadata table
CREATE TABLE IF NOT EXISTS symbols (
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
  ),
  CONSTRAINT symbols_symbol_format CHECK (
    symbol ~ '^[A-Z0-9_]{1,20}$'
  )
);

-- Data sources table
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
-- CREATE HYPERTABLES
-- =============================================================================

-- Price ticks hypertable
CREATE TABLE IF NOT EXISTS price_ticks (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION DEFAULT NULL,
  exchange TEXT DEFAULT NULL,
  data_source TEXT DEFAULT NULL,
  bid_price DOUBLE PRECISION DEFAULT NULL,
  ask_price DOUBLE PRECISION DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (symbol, time),

  CONSTRAINT price_ticks_price_positive CHECK (price > 0),
  CONSTRAINT price_ticks_volume_non_negative CHECK (volume IS NULL OR volume >= 0),
  CONSTRAINT price_ticks_bid_positive CHECK (bid_price IS NULL OR bid_price > 0),
  CONSTRAINT price_ticks_ask_positive CHECK (ask_price IS NULL OR ask_price > 0),
  CONSTRAINT price_ticks_bid_ask_relationship CHECK (
    bid_price IS NULL OR ask_price IS NULL OR bid_price <= ask_price
  )
);

-- Convert to hypertable
SELECT create_hypertable(
  'price_ticks',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- OHLC data hypertable
CREATE TABLE IF NOT EXISTS ohlc_data (
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
);

-- Convert to hypertable
SELECT create_hypertable(
  'ohlc_data',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- =============================================================================
-- CREATE BASIC INDEXES
-- =============================================================================

-- Symbols table indexes
CREATE INDEX IF NOT EXISTS ix_symbols_asset_type ON symbols (asset_type);
CREATE INDEX IF NOT EXISTS ix_symbols_exchange ON symbols (exchange) WHERE exchange IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_symbols_active ON symbols (is_active) WHERE is_active = TRUE;

-- Data sources table indexes
CREATE INDEX IF NOT EXISTS ix_data_sources_active ON data_sources (is_active) WHERE is_active = TRUE;

-- Price ticks indexes
CREATE INDEX IF NOT EXISTS ix_price_ticks_symbol_time ON price_ticks (symbol, time DESC);
CREATE INDEX IF NOT EXISTS ix_price_ticks_time ON price_ticks (time DESC);

-- OHLC data indexes
CREATE INDEX IF NOT EXISTS ix_ohlc_symbol_interval_time ON ohlc_data (symbol, interval_duration, time DESC);
CREATE INDEX IF NOT EXISTS ix_ohlc_time ON ohlc_data (time DESC);

-- =============================================================================
-- INSERT SAMPLE DATA
-- =============================================================================

-- Insert sample symbols
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
-- RECORD MIGRATION
-- =============================================================================

INSERT INTO schema_versions (version, description)
VALUES ('001_initial_schema', 'Initial TimescaleDB schema with core hypertables and supporting tables')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 001_initial_schema completed successfully';
  RAISE NOTICE 'Created tables: schema_versions, symbols, data_sources, price_ticks (hypertable), ohlc_data (hypertable)';
  RAISE NOTICE 'Created basic indexes for optimal query performance';
  RAISE NOTICE 'Inserted sample symbols and data sources';
END $$;