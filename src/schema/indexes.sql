-- TimescaleDB Client - Index Creation Script
-- This script creates optimized indexes for time-series queries on financial data

-- =============================================================================
-- SUPPORTING TABLE INDEXES
-- =============================================================================

-- Symbols table indexes
CREATE INDEX IF NOT EXISTS ix_symbols_asset_type 
ON symbols (asset_type);

CREATE INDEX IF NOT EXISTS ix_symbols_exchange 
ON symbols (exchange) 
WHERE exchange IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_symbols_active 
ON symbols (is_active) 
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_symbols_sector 
ON symbols (sector) 
WHERE sector IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_symbols_currency 
ON symbols (currency);

-- Data sources table indexes
CREATE INDEX IF NOT EXISTS ix_data_sources_active 
ON data_sources (is_active) 
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS ix_data_sources_reliability 
ON data_sources (reliability_score DESC) 
WHERE is_active = TRUE;

-- =============================================================================
-- PRICE TICKS HYPERTABLE INDEXES
-- =============================================================================

-- Primary performance indexes for common query patterns

-- Single-symbol time range queries (most common pattern)
CREATE INDEX IF NOT EXISTS ix_price_ticks_symbol_time 
ON price_ticks (symbol, time DESC);

-- Cross-symbol time-based queries
CREATE INDEX IF NOT EXISTS ix_price_ticks_time 
ON price_ticks (time DESC);

-- Volume-based analysis (only where volume exists)
CREATE INDEX IF NOT EXISTS ix_price_ticks_volume_time 
ON price_ticks (volume DESC NULLS LAST, time DESC) 
WHERE volume IS NOT NULL;

-- Exchange-specific queries
CREATE INDEX IF NOT EXISTS ix_price_ticks_exchange_symbol_time 
ON price_ticks (exchange, symbol, time DESC) 
WHERE exchange IS NOT NULL;

-- Price range queries for technical analysis
CREATE INDEX IF NOT EXISTS ix_price_ticks_price_time 
ON price_ticks (price, time DESC);

-- Data source tracking
CREATE INDEX IF NOT EXISTS ix_price_ticks_data_source_time 
ON price_ticks (data_source, time DESC) 
WHERE data_source IS NOT NULL;

-- Bid/Ask spread analysis (when both prices are available)
CREATE INDEX IF NOT EXISTS ix_price_ticks_bid_ask_time 
ON price_ticks (symbol, time DESC) 
WHERE bid_price IS NOT NULL AND ask_price IS NOT NULL;

-- =============================================================================
-- PARTIAL INDEXES FOR OPTIMIZATION
-- =============================================================================

-- High-volume ticks only (for performance-sensitive queries)
CREATE INDEX IF NOT EXISTS ix_price_ticks_high_volume 
ON price_ticks (symbol, time DESC) 
WHERE volume > 1000;

-- Recent data optimization (last 30 days) - most accessed data
CREATE INDEX IF NOT EXISTS ix_price_ticks_recent 
ON price_ticks (symbol, time DESC) 
WHERE time > NOW() - INTERVAL '30 days';

-- Large price movements (for volatility analysis)
CREATE INDEX IF NOT EXISTS ix_price_ticks_large_movements 
ON price_ticks (symbol, price, time DESC) 
WHERE ABS(price - LAG(price) OVER (PARTITION BY symbol ORDER BY time)) / LAG(price) OVER (PARTITION BY symbol ORDER BY time) > 0.05;

-- =============================================================================
-- OHLC DATA HYPERTABLE INDEXES
-- =============================================================================

-- Primary performance indexes

-- Symbol-interval-time queries (most common for OHLC data)
CREATE INDEX IF NOT EXISTS ix_ohlc_symbol_interval_time 
ON ohlc_data (symbol, interval_duration, time DESC);

-- Cross-symbol time-based queries
CREATE INDEX IF NOT EXISTS ix_ohlc_time 
ON ohlc_data (time DESC);

-- Interval-specific queries (e.g., all daily data)
CREATE INDEX IF NOT EXISTS ix_ohlc_interval_time 
ON ohlc_data (interval_duration, time DESC);

-- Volume analysis for OHLC data
CREATE INDEX IF NOT EXISTS ix_ohlc_volume_time 
ON ohlc_data (volume DESC NULLS LAST, time DESC) 
WHERE volume IS NOT NULL;

-- Price change analysis
CREATE INDEX IF NOT EXISTS ix_ohlc_price_change_time 
ON ohlc_data (price_change_percent DESC, time DESC);

-- High/Low analysis
CREATE INDEX IF NOT EXISTS ix_ohlc_high_low_time 
ON ohlc_data (high DESC, low ASC, time DESC);

-- =============================================================================
-- OHLC PARTIAL INDEXES FOR OPTIMIZATION
-- =============================================================================

-- Daily and hourly OHLC data (most commonly queried intervals)
CREATE INDEX IF NOT EXISTS ix_ohlc_daily_hourly 
ON ohlc_data (symbol, time DESC) 
WHERE interval_duration IN ('1d', '1h');

-- Recent OHLC data (last 90 days)
CREATE INDEX IF NOT EXISTS ix_ohlc_recent 
ON ohlc_data (symbol, interval_duration, time DESC) 
WHERE time > NOW() - INTERVAL '90 days';

-- High volatility periods (large percentage changes)
CREATE INDEX IF NOT EXISTS ix_ohlc_high_volatility 
ON ohlc_data (symbol, time DESC) 
WHERE ABS(price_change_percent) > 5.0;

-- High volume periods
CREATE INDEX IF NOT EXISTS ix_ohlc_high_volume 
ON ohlc_data (symbol, interval_duration, time DESC) 
WHERE volume > 1000000;

-- =============================================================================
-- COVERING INDEXES FOR COMMON QUERIES
-- =============================================================================

-- Covering index for price summary queries
CREATE INDEX IF NOT EXISTS ix_price_ticks_summary_covering 
ON price_ticks (symbol, time DESC) 
INCLUDE (price, volume);

-- Covering index for OHLC summary queries
CREATE INDEX IF NOT EXISTS ix_ohlc_summary_covering 
ON ohlc_data (symbol, interval_duration, time DESC) 
INCLUDE (open, high, low, close, volume);

-- =============================================================================
-- SPECIALIZED INDEXES FOR ADVANCED QUERIES
-- =============================================================================

-- Multi-column index for complex filtering
CREATE INDEX IF NOT EXISTS ix_price_ticks_symbol_exchange_time 
ON price_ticks (symbol, exchange, time DESC) 
WHERE exchange IS NOT NULL;

-- Index for spread analysis (bid-ask spread calculations)
CREATE INDEX IF NOT EXISTS ix_price_ticks_spread_analysis 
ON price_ticks (symbol, time DESC) 
INCLUDE (bid_price, ask_price) 
WHERE bid_price IS NOT NULL AND ask_price IS NOT NULL;

-- Index for data quality analysis
CREATE INDEX IF NOT EXISTS ix_price_ticks_data_quality 
ON price_ticks (data_source, created_at DESC) 
WHERE data_source IS NOT NULL;

-- OHLC gap analysis (for detecting missing intervals)
CREATE INDEX IF NOT EXISTS ix_ohlc_gap_analysis 
ON ohlc_data (symbol, interval_duration, time ASC);

-- =============================================================================
-- PERFORMANCE MONITORING INDEXES
-- =============================================================================

-- Index for monitoring data ingestion rates
CREATE INDEX IF NOT EXISTS ix_price_ticks_ingestion_monitoring 
ON price_ticks (created_at DESC, symbol);

CREATE INDEX IF NOT EXISTS ix_ohlc_ingestion_monitoring 
ON ohlc_data (created_at DESC, symbol, interval_duration);

-- =============================================================================
-- BTREE EXPRESSION INDEXES FOR COMPUTED QUERIES
-- =============================================================================

-- Index on date part for daily aggregations
CREATE INDEX IF NOT EXISTS ix_price_ticks_date 
ON price_ticks (DATE(time), symbol);

CREATE INDEX IF NOT EXISTS ix_ohlc_date 
ON ohlc_data (DATE(time), symbol, interval_duration);

-- Index on hour for hourly patterns
CREATE INDEX IF NOT EXISTS ix_price_ticks_hour 
ON price_ticks (EXTRACT(HOUR FROM time), symbol) 
WHERE time > NOW() - INTERVAL '7 days';

-- =============================================================================
-- UNIQUE CONSTRAINTS AND SPECIALIZED INDEXES
-- =============================================================================

-- Ensure data source names are unique (already enforced by table constraint)
-- But create index for fast lookups
CREATE INDEX IF NOT EXISTS ix_data_sources_name_lookup 
ON data_sources (name) 
WHERE is_active = TRUE;

-- =============================================================================
-- INDEX MAINTENANCE COMMENTS
-- =============================================================================

COMMENT ON INDEX ix_price_ticks_symbol_time IS 
'Primary index for single-symbol time range queries - most common access pattern';

COMMENT ON INDEX ix_ohlc_symbol_interval_time IS 
'Primary index for OHLC data retrieval by symbol and interval';

COMMENT ON INDEX ix_price_ticks_recent IS 
'Partial index for recent data optimization - covers 80% of queries';

COMMENT ON INDEX ix_ohlc_daily_hourly IS 
'Partial index for most commonly requested OHLC intervals';

-- =============================================================================
-- INDEX STATISTICS AND MONITORING
-- =============================================================================

-- Create a view to monitor index usage (for performance tuning)
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'Unused'
        WHEN idx_scan < 100 THEN 'Low Usage'
        WHEN idx_scan < 1000 THEN 'Medium Usage'
        ELSE 'High Usage'
    END AS usage_category
FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
    AND (tablename = 'price_ticks' OR tablename = 'ohlc_data')
ORDER BY idx_scan DESC;

COMMENT ON VIEW index_usage_stats IS 
'Monitor index usage patterns for performance optimization';

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'TimescaleDB index creation completed successfully';
    RAISE NOTICE 'Created % indexes for price_ticks table', 
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'price_ticks');
    RAISE NOTICE 'Created % indexes for ohlc_data table', 
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'ohlc_data');
    RAISE NOTICE 'Use index_usage_stats view to monitor index performance';
END $$;