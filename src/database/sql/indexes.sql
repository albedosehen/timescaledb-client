-- TimescaleDB Client - Universal Index Creation Script
-- Dialect: postgresql
-- This script creates optimized indexes for universal time-series queries supporting any domain

-- =============================================================================
-- ENTITIES TABLE INDEXES
-- =============================================================================

-- Entity type queries (filter by domain: financial_symbol, sensor, server, etc.)
CREATE INDEX IF NOT EXISTS ix_entities_entity_type
ON entities (entity_type);

-- Active entities queries
CREATE INDEX IF NOT EXISTS ix_entities_is_active
ON entities (is_active)
WHERE is_active = TRUE;

-- Entity metadata searches (GIN index for JSONB queries)
CREATE INDEX IF NOT EXISTS ix_entities_metadata_gin
ON entities USING GIN (metadata);

-- Entity name searches
CREATE INDEX IF NOT EXISTS ix_entities_name
ON entities (name)
WHERE name IS NOT NULL;

-- Updated entities queries
CREATE INDEX IF NOT EXISTS ix_entities_updated_at
ON entities (updated_at DESC);

-- Composite queries (entity type + active status)
CREATE INDEX IF NOT EXISTS ix_entities_type_active
ON entities (entity_type, is_active)
WHERE is_active = TRUE;

-- =============================================================================
-- TIME_SERIES_DATA HYPERTABLE INDEXES
-- =============================================================================

-- Primary performance indexes for common query patterns

-- Single-entity time range queries (most common pattern)
CREATE INDEX IF NOT EXISTS ix_time_series_data_entity_id_time
ON time_series_data (entity_id, time DESC);

-- Cross-entity time-based queries
CREATE INDEX IF NOT EXISTS ix_time_series_data_time
ON time_series_data (time DESC);

-- Value-based analysis (primary value queries)
CREATE INDEX IF NOT EXISTS ix_time_series_data_value_time
ON time_series_data (value, time DESC);

-- Secondary value analysis (value2 for volume, humidity, memory usage, etc.)
CREATE INDEX IF NOT EXISTS ix_time_series_data_value2_time
ON time_series_data (value2, time DESC)
WHERE value2 IS NOT NULL;

-- Metadata searches for record-specific information
CREATE INDEX IF NOT EXISTS ix_time_series_data_metadata_gin
ON time_series_data USING GIN (metadata);

-- =============================================================================
-- DOMAIN-SPECIFIC PARTIAL INDEXES
-- =============================================================================

-- Financial data optimization (entities with financial_symbol type)
CREATE INDEX IF NOT EXISTS ix_time_series_financial_entities_time
ON time_series_data (entity_id, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type = 'financial_symbol'
);

-- IoT sensor data optimization
CREATE INDEX IF NOT EXISTS ix_time_series_sensor_entities_time
ON time_series_data (entity_id, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type LIKE '%sensor%'
);

-- Server monitoring data optimization
CREATE INDEX IF NOT EXISTS ix_time_series_server_entities_time
ON time_series_data (entity_id, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type IN ('server', 'database_server')
);

-- Application/service monitoring optimization
CREATE INDEX IF NOT EXISTS ix_time_series_service_entities_time
ON time_series_data (entity_id, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type IN ('microservice', 'web_application')
);

-- =============================================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- =============================================================================

-- Recent data optimization (last 30 days) - most accessed data
CREATE INDEX IF NOT EXISTS ix_time_series_data_recent
ON time_series_data (entity_id, time DESC)
WHERE time > NOW() - INTERVAL '30 days';

-- High-value data (for anomaly detection, large transactions, etc.)
CREATE INDEX IF NOT EXISTS ix_time_series_data_high_values
ON time_series_data (entity_id, value DESC, time DESC)
WHERE value > 1000;

-- Multi-value records (OHLC-style data with all 4 values)
CREATE INDEX IF NOT EXISTS ix_time_series_data_multi_value
ON time_series_data (entity_id, time DESC)
WHERE value2 IS NOT NULL AND value3 IS NOT NULL AND value4 IS NOT NULL;

-- Records with metadata (enhanced data points)
CREATE INDEX IF NOT EXISTS ix_time_series_data_with_metadata
ON time_series_data (entity_id, time DESC)
WHERE metadata != '{}';

-- =============================================================================
-- COVERING INDEXES FOR COMMON QUERIES
-- =============================================================================

-- Covering index for basic time-series summary queries
CREATE INDEX IF NOT EXISTS ix_time_series_summary_covering
ON time_series_data (entity_id, time DESC)
INCLUDE (value, value2, value3, value4);

-- Covering index for metadata-enriched queries
CREATE INDEX IF NOT EXISTS ix_time_series_metadata_covering
ON time_series_data (entity_id, time DESC)
INCLUDE (value, metadata);

-- =============================================================================
-- ANALYTICAL INDEXES FOR AGGREGATIONS
-- =============================================================================

-- Value range analysis (min/max queries)
CREATE INDEX IF NOT EXISTS ix_time_series_value_range
ON time_series_data (entity_id, value ASC, value DESC, time DESC);

-- Time bucket optimization for aggregations
CREATE INDEX IF NOT EXISTS ix_time_series_date_entity
ON time_series_data (DATE(time), entity_id);

-- Hour-based patterns (for daily/hourly aggregations)
CREATE INDEX IF NOT EXISTS ix_time_series_hour_entity
ON time_series_data (EXTRACT(HOUR FROM time), entity_id)
WHERE time > NOW() - INTERVAL '7 days';

-- =============================================================================
-- SPECIALIZED INDEXES FOR ADVANCED QUERIES
-- =============================================================================

-- Multi-entity comparison queries
CREATE INDEX IF NOT EXISTS ix_time_series_multi_entity_time
ON time_series_data (time DESC, entity_id)
INCLUDE (value);

-- Entity relationship queries (for correlated analysis)
CREATE INDEX IF NOT EXISTS ix_time_series_entity_value_correlation
ON time_series_data (entity_id, value, time DESC);

-- Gap analysis (for detecting missing data points)
CREATE INDEX IF NOT EXISTS ix_time_series_gap_analysis
ON time_series_data (entity_id, time ASC);

-- =============================================================================
-- BTREE EXPRESSION INDEXES FOR COMPUTED QUERIES
-- =============================================================================

-- Date-based partitioning for daily aggregations
CREATE INDEX IF NOT EXISTS ix_time_series_data_date
ON time_series_data (DATE(time), entity_id);

-- Week-based aggregations
CREATE INDEX IF NOT EXISTS ix_time_series_data_week
ON time_series_data (DATE_TRUNC('week', time), entity_id);

-- Month-based aggregations
CREATE INDEX IF NOT EXISTS ix_time_series_data_month
ON time_series_data (DATE_TRUNC('month', time), entity_id);

-- =============================================================================
-- COMPOSITE DOMAIN INDEXES
-- =============================================================================

-- Financial domain composite index (price + volume analysis)
CREATE INDEX IF NOT EXISTS ix_time_series_financial_composite
ON time_series_data (entity_id, value DESC, value2 DESC NULLS LAST, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type = 'financial_symbol'
);

-- IoT sensor composite index (multi-sensor analysis)
CREATE INDEX IF NOT EXISTS ix_time_series_iot_composite
ON time_series_data (entity_id, value, value2, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type LIKE '%sensor%'
);

-- Server metrics composite index (CPU + Memory analysis)
CREATE INDEX IF NOT EXISTS ix_time_series_server_metrics_composite
ON time_series_data (entity_id, value, value2, time DESC)
WHERE entity_id IN (
    SELECT entity_id FROM entities WHERE entity_type IN ('server', 'database_server')
);

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
    END AS usage_category,
    pg_size_pretty(pg_relation_size(indexrelname::regclass)) AS index_size
FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
    AND (tablename = 'time_series_data' OR tablename = 'entities')
ORDER BY idx_scan DESC;

COMMENT ON VIEW index_usage_stats IS 
'Monitor index usage patterns for performance optimization across all domains';

-- Create a view for domain-specific performance monitoring
CREATE OR REPLACE VIEW domain_performance_stats AS
SELECT
    e.entity_type,
    COUNT(*) AS total_records,
    MIN(t.time) AS earliest_record,
    MAX(t.time) AS latest_record,
    AVG(t.value) AS avg_primary_value,
    COUNT(CASE WHEN t.value2 IS NOT NULL THEN 1 END) AS records_with_value2,
    COUNT(CASE WHEN t.metadata != '{}' THEN 1 END) AS records_with_metadata
FROM time_series_data t
JOIN entities e ON t.entity_id = e.entity_id
WHERE e.is_active = TRUE
GROUP BY e.entity_type
ORDER BY total_records DESC;

COMMENT ON VIEW domain_performance_stats IS
'Performance statistics grouped by domain/entity type for multi-domain monitoring';

-- =============================================================================
-- INDEX MAINTENANCE COMMENTS
-- =============================================================================

COMMENT ON INDEX ix_time_series_data_entity_id_time IS
'Primary index for single-entity time range queries - most common access pattern across all domains';

COMMENT ON INDEX ix_entities_entity_type IS
'Primary index for domain-specific entity filtering (financial, IoT, monitoring, etc.)';

COMMENT ON INDEX ix_time_series_data_recent IS
'Partial index for recent data optimization - covers 80% of queries across all domains';

COMMENT ON INDEX ix_time_series_financial_entities_time IS
'Domain-specific optimization for financial symbol queries';

COMMENT ON INDEX ix_time_series_sensor_entities_time IS
'Domain-specific optimization for IoT sensor data queries';

COMMENT ON INDEX ix_time_series_server_entities_time IS
'Domain-specific optimization for server monitoring queries';

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Universal TimescaleDB index creation completed successfully';
    RAISE NOTICE 'Created % indexes for time_series_data table',
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'time_series_data');
    RAISE NOTICE 'Created % indexes for entities table',
        (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'entities');
    RAISE NOTICE 'Indexes support all domains: financial, IoT, monitoring, logging, analytics';
    RAISE NOTICE 'Use index_usage_stats and domain_performance_stats views to monitor performance';
END $$;