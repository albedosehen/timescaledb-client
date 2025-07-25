-- TimescaleDB Client - Continuous Aggregates Script
-- Dialect: postgresql
-- This script creates continuous aggregates (materialized views) for pre-computed time-series analytics

-- =============================================================================
-- CONTINUOUS AGGREGATES OVERVIEW
-- =============================================================================

-- Continuous aggregates provide:
-- - Real-time materialized views that are incrementally updated
-- - Significant performance improvements for analytical queries
-- - Automatic refresh policies to keep data current
-- - Space-efficient storage of pre-computed aggregations

-- =============================================================================
-- DROP EXISTING CONTINUOUS AGGREGATES (for script re-runs)
-- =============================================================================

-- Drop existing continuous aggregates and their policies
DO $$
DECLARE
    cagg_name TEXT;
BEGIN
    FOR cagg_name IN 
        SELECT view_name 
        FROM timescaledb_information.continuous_aggregates 
        WHERE view_name IN (
            'price_ticks_1min', 'price_ticks_5min', 'price_ticks_15min', 
            'price_ticks_1hour', 'price_ticks_4hour', 'price_ticks_1day',
            'ohlc_summary_1hour', 'ohlc_summary_1day', 'ohlc_summary_1week',
            'symbol_daily_stats', 'market_volatility_hourly'
        )
    LOOP
        BEGIN
            EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I CASCADE', cagg_name);
            RAISE NOTICE 'Dropped existing continuous aggregate: %', cagg_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error dropping %: %', cagg_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- =============================================================================
-- PRICE TICKS CONTINUOUS AGGREGATES
-- =============================================================================

-- 1-minute OHLCV aggregates from price ticks
CREATE MATERIALIZED VIEW price_ticks_1min
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 minute', time) AS bucket,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume,
    count(*) AS tick_count,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    -- Spread analysis (when bid/ask available)
    avg(CASE WHEN bid_price IS NOT NULL AND ask_price IS NOT NULL 
        THEN ask_price - bid_price ELSE NULL END) AS avg_spread,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- 5-minute aggregates
CREATE MATERIALIZED VIEW price_ticks_5min
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('5 minutes', time) AS bucket,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume,
    count(*) AS tick_count,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median_price,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- 15-minute aggregates
CREATE MATERIALIZED VIEW price_ticks_15min
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('15 minutes', time) AS bucket,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume,
    count(*) AS tick_count,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    -- Volume-weighted average price (VWAP)
    sum(price * COALESCE(volume, 1)) / sum(COALESCE(volume, 1)) AS vwap,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- 1-hour aggregates
CREATE MATERIALIZED VIEW price_ticks_1hour
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume,
    count(*) AS tick_count,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    sum(price * COALESCE(volume, 1)) / sum(COALESCE(volume, 1)) AS vwap,
    -- Price change metrics
    (last(price, time) - first(price, time)) AS price_change,
    ((last(price, time) - first(price, time)) / first(price, time)) * 100 AS price_change_percent,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- 4-hour aggregates
CREATE MATERIALIZED VIEW price_ticks_4hour
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('4 hours', time) AS bucket,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume,
    count(*) AS tick_count,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    sum(price * COALESCE(volume, 1)) / sum(COALESCE(volume, 1)) AS vwap,
    (last(price, time) - first(price, time)) AS price_change,
    ((last(price, time) - first(price, time)) / first(price, time)) * 100 AS price_change_percent,
    -- Trading intensity metrics
    count(*) / EXTRACT(EPOCH FROM '4 hours'::INTERVAL) AS ticks_per_second,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- Daily aggregates
CREATE MATERIALIZED VIEW price_ticks_1day
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 day', time) AS bucket,
    symbol,
    first(price, time) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price, time) AS close,
    sum(volume) AS volume,
    count(*) AS tick_count,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    sum(price * COALESCE(volume, 1)) / sum(COALESCE(volume, 1)) AS vwap,
    (last(price, time) - first(price, time)) AS price_change,
    ((last(price, time) - first(price, time)) / first(price, time)) * 100 AS price_change_percent,
    -- Daily statistics
    (max(price) - min(price)) / min(price) * 100 AS daily_range_percent,
    count(*) / EXTRACT(EPOCH FROM '1 day'::INTERVAL) AS avg_ticks_per_second,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- =============================================================================
-- OHLC DATA CONTINUOUS AGGREGATES
-- =============================================================================

-- Hourly summary from OHLC data (aggregating multiple intervals)
CREATE MATERIALIZED VIEW ohlc_summary_1hour
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    symbol,
    -- Use the most granular interval available for OHLC calculation
    first(open ORDER BY 
        CASE interval_duration 
            WHEN '1m' THEN 1 WHEN '5m' THEN 2 WHEN '15m' THEN 3 WHEN '30m' THEN 4 
            ELSE 5 END, time
    ) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close ORDER BY 
        CASE interval_duration 
            WHEN '1m' THEN 1 WHEN '5m' THEN 2 WHEN '15m' THEN 3 WHEN '30m' THEN 4 
            ELSE 5 END, time
    ) AS close,
    sum(volume) AS volume,
    count(*) AS interval_count,
    avg(price_change_percent) AS avg_price_change_percent,
    stddev(price_change_percent) AS volatility,
    data_source
FROM ohlc_data
WHERE time >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY bucket, symbol, data_source;

-- Daily summary from OHLC data
CREATE MATERIALIZED VIEW ohlc_summary_1day
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    symbol,
    first(open ORDER BY
        CASE interval_duration
            WHEN '1m' THEN 1 WHEN '5m' THEN 2 WHEN '15m' THEN 3 WHEN '30m' THEN 4
            WHEN '1h' THEN 5 WHEN '4h' THEN 6 ELSE 7 END, time
    ) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close ORDER BY
        CASE interval_duration
            WHEN '1m' THEN 1 WHEN '5m' THEN 2 WHEN '15m' THEN 3 WHEN '30m' THEN 4
            WHEN '1h' THEN 5 WHEN '4h' THEN 6 ELSE 7 END, time
    ) AS close,
    sum(volume) AS volume,
    count(*) AS interval_count,
    avg(price_change_percent) AS avg_price_change_percent,
    stddev(price_change_percent) AS volatility,
    data_source
FROM ohlc_data
WHERE time >= CURRENT_DATE - INTERVAL '2 years'
GROUP BY bucket, symbol, data_source;

-- Weekly summary from OHLC data
CREATE MATERIALIZED VIEW ohlc_summary_1week
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 week', time) AS bucket,
    symbol,
    first(open ORDER BY time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close ORDER BY time) AS close,
    sum(volume) AS volume,
    count(*) AS interval_count,
    avg(price_change_percent) AS avg_price_change_percent,
    stddev(price_change_percent) AS volatility,
    data_source
FROM ohlc_data
WHERE interval_duration IN ('1d', '4h', '1h')
GROUP BY bucket, symbol, data_source;

-- =============================================================================
-- SPECIALIZED CONTINUOUS AGGREGATES
-- =============================================================================

-- Daily symbol statistics aggregate
CREATE MATERIALIZED VIEW symbol_daily_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS bucket,
    symbol,
    count(*) AS total_ticks,
    avg(price) AS avg_price,
    stddev(price) AS price_volatility,
    min(price) AS min_price,
    max(price) AS max_price,
    sum(COALESCE(volume, 0)) AS total_volume,
    (max(price) - min(price)) / min(price) * 100 AS daily_range_percent,
    first(price, time) AS open_price,
    last(price, time) AS close_price,
    -- Calculate returns
    (last(price, time) - first(price, time)) / first(price, time) * 100 AS daily_return_percent,
    -- Trading activity metrics
    count(*) / EXTRACT(EPOCH FROM '1 day'::INTERVAL) AS avg_ticks_per_second,
    count(DISTINCT exchange) AS exchange_count,
    count(DISTINCT data_source) AS data_source_count
FROM price_ticks
GROUP BY bucket, symbol;

-- Hourly market volatility aggregate
CREATE MATERIALIZED VIEW market_volatility_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    symbol,
    stddev(price) AS price_volatility,
    avg(price) AS avg_price,
    count(*) AS tick_count,
    -- Calculate price movements
    avg(ABS(price - LAG(price) OVER (PARTITION BY symbol ORDER BY time))) AS avg_price_movement,
    -- Volume-weighted metrics
    CASE
        WHEN sum(COALESCE(volume, 0)) > 0 THEN
            stddev(price * COALESCE(volume, 1)) / sum(COALESCE(volume, 1))
        ELSE NULL
    END AS volume_weighted_volatility,
    exchange,
    data_source
FROM price_ticks
GROUP BY bucket, symbol, exchange, data_source;

-- =============================================================================
-- CONTINUOUS AGGREGATE REFRESH POLICIES
-- =============================================================================

-- Add refresh policies for all continuous aggregates
-- These policies keep the materialized views up to date

-- Price ticks aggregates refresh policies
SELECT add_continuous_aggregate_policy('price_ticks_1min',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute'
);

SELECT add_continuous_aggregate_policy('price_ticks_5min',
    start_offset => INTERVAL '6 hours',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes'
);

SELECT add_continuous_aggregate_policy('price_ticks_15min',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes'
);

SELECT add_continuous_aggregate_policy('price_ticks_1hour',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes'
);

SELECT add_continuous_aggregate_policy('price_ticks_4hour',
    start_offset => INTERVAL '1 week',
    end_offset => INTERVAL '4 hours',
    schedule_interval => INTERVAL '2 hours'
);

SELECT add_continuous_aggregate_policy('price_ticks_1day',
    start_offset => INTERVAL '1 month',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 hour'
);

-- OHLC aggregates refresh policies
SELECT add_continuous_aggregate_policy('ohlc_summary_1hour',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes'
);

SELECT add_continuous_aggregate_policy('ohlc_summary_1day',
    start_offset => INTERVAL '1 week',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '2 hours'
);

SELECT add_continuous_aggregate_policy('ohlc_summary_1week',
    start_offset => INTERVAL '1 month',
    end_offset => INTERVAL '1 week',
    schedule_interval => INTERVAL '1 day'
);

-- Specialized aggregates refresh policies
SELECT add_continuous_aggregate_policy('symbol_daily_stats',
    start_offset => INTERVAL '1 week',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '2 hours'
);

SELECT add_continuous_aggregate_policy('market_volatility_hourly',
    start_offset => INTERVAL '1 day',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '30 minutes'
);

-- =============================================================================
-- MONITORING AND UTILITY VIEWS
-- =============================================================================

-- View to monitor continuous aggregate status
CREATE OR REPLACE VIEW continuous_aggregates_status AS
SELECT
    ca.view_name,
    ca.hypertable_name,
    ca.materialization_hypertable_name,
    j.job_id,
    j.schedule_interval,
    js.last_start,
    js.last_finish,
    js.last_run_success,
    js.total_runs,
    js.total_successes,
    js.total_failures,
    CASE
        WHEN js.last_run_success THEN 'Healthy'
        WHEN js.total_failures > js.total_successes THEN 'Failing'
        WHEN js.last_start IS NULL THEN 'Never Run'
        ELSE 'Warning'
    END as status
FROM timescaledb_information.continuous_aggregates ca
LEFT JOIN timescaledb_information.jobs j ON ca.view_name = j.hypertable_name
LEFT JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
WHERE ca.view_name LIKE 'price_ticks_%'
   OR ca.view_name LIKE 'ohlc_summary_%'
   OR ca.view_name IN ('symbol_daily_stats', 'market_volatility_hourly')
ORDER BY ca.view_name;

-- =============================================================================
-- HELPER FUNCTIONS FOR CONTINUOUS AGGREGATES
-- =============================================================================

-- Function to manually refresh all continuous aggregates
CREATE OR REPLACE FUNCTION refresh_all_continuous_aggregates(
    window_start TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 day',
    window_end TIMESTAMPTZ DEFAULT NOW()
) RETURNS TEXT AS $$
DECLARE
    cagg_name TEXT;
    refresh_count INTEGER := 0;
BEGIN
    FOR cagg_name IN
        SELECT view_name
        FROM timescaledb_information.continuous_aggregates
        WHERE view_name IN (
            'price_ticks_1min', 'price_ticks_5min', 'price_ticks_15min',
            'price_ticks_1hour', 'price_ticks_4hour', 'price_ticks_1day',
            'ohlc_summary_1hour', 'ohlc_summary_1day', 'ohlc_summary_1week',
            'symbol_daily_stats', 'market_volatility_hourly'
        )
    LOOP
        BEGIN
            PERFORM refresh_continuous_aggregate(cagg_name, window_start, window_end);
            refresh_count := refresh_count + 1;
            RAISE NOTICE 'Refreshed continuous aggregate: %', cagg_name;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error refreshing %: %', cagg_name, SQLERRM;
        END;
    END LOOP;

    RETURN format('Refreshed %s continuous aggregates for window %s to %s',
                  refresh_count, window_start, window_end);
END;
$$ LANGUAGE plpgsql;

-- Function to get continuous aggregate recommendations
CREATE OR REPLACE FUNCTION get_continuous_aggregate_recommendations() RETURNS TABLE(
    recommendation_type TEXT,
    description TEXT,
    sql_command TEXT
) AS $$
BEGIN
    RETURN QUERY
    VALUES
        ('Refresh Frequency',
         'Adjust refresh intervals based on data ingestion patterns',
         'SELECT alter_job(job_id, schedule_interval => ''30 seconds'') FROM timescaledb_information.jobs WHERE hypertable_name = ''price_ticks_1min'';'),
        ('Data Range',
         'Limit continuous aggregates to relevant time ranges for performance',
         'ALTER MATERIALIZED VIEW price_ticks_1day SET (timescaledb.ignore_invalidation_older_than = ''30 days'');'),
        ('Compression',
         'Enable compression on continuous aggregate materialization tables',
         'SELECT add_compression_policy(materialization_hypertable_name, INTERVAL ''7 days'') FROM timescaledb_information.continuous_aggregates;'),
        ('Retention',
         'Set retention policies on continuous aggregates',
         'SELECT add_retention_policy(materialization_hypertable_name, INTERVAL ''1 year'') FROM timescaledb_information.continuous_aggregates;'),
        ('Monitoring',
         'Create alerts for failed continuous aggregate refreshes',
         'SELECT * FROM continuous_aggregates_status WHERE status != ''Healthy'';');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DOCUMENTATION AND COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW price_ticks_1min IS
'1-minute OHLCV aggregates from price ticks with spread analysis';

COMMENT ON MATERIALIZED VIEW price_ticks_1hour IS
'Hourly OHLCV aggregates with price change metrics and VWAP calculations';

COMMENT ON MATERIALIZED VIEW price_ticks_1day IS
'Daily OHLCV aggregates with comprehensive trading statistics';

COMMENT ON MATERIALIZED VIEW ohlc_summary_1hour IS
'Hourly summary aggregating multiple OHLC intervals for comprehensive analysis';

COMMENT ON MATERIALIZED VIEW symbol_daily_stats IS
'Daily comprehensive statistics per symbol including volatility and trading metrics';

COMMENT ON MATERIALIZED VIEW market_volatility_hourly IS
'Hourly volatility analysis with volume-weighted metrics';

COMMENT ON FUNCTION refresh_all_continuous_aggregates IS
'Manually refresh all continuous aggregates for a specified time window';

COMMENT ON FUNCTION get_continuous_aggregate_recommendations IS
'Provides optimization recommendations for continuous aggregate configuration';

COMMENT ON VIEW continuous_aggregates_status IS
'Monitor health and execution status of all continuous aggregate refresh jobs';

-- =============================================================================
-- COMPLETION MESSAGE AND VERIFICATION
-- =============================================================================

DO $$
DECLARE
    cagg_count INTEGER;
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO cagg_count
    FROM timescaledb_information.continuous_aggregates
    WHERE view_name LIKE 'price_ticks_%'
       OR view_name LIKE 'ohlc_summary_%'
       OR view_name IN ('symbol_daily_stats', 'market_volatility_hourly');

    SELECT COUNT(*) INTO policy_count
    FROM timescaledb_information.jobs
    WHERE application_name LIKE '%continuous aggregate%';

    RAISE NOTICE 'TimescaleDB continuous aggregates configuration completed';
    RAISE NOTICE 'Created % continuous aggregates', cagg_count;
    RAISE NOTICE 'Configured % refresh policies', policy_count;
    RAISE NOTICE 'Monitor status with: SELECT * FROM continuous_aggregates_status;';
    RAISE NOTICE 'Get optimization tips: SELECT * FROM get_continuous_aggregate_recommendations();';
    RAISE NOTICE 'Manual refresh: SELECT refresh_all_continuous_aggregates();';
END $$;