-- TimescaleDB Client - Data Retention Policies Script
-- This script configures automated data retention policies for time-series data management

-- =============================================================================
-- RETENTION POLICY CONFIGURATION
-- =============================================================================

-- Drop existing retention policies if they exist (for re-running script)
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Remove existing retention policies
    FOR pol IN 
        SELECT application_name, hypertable_name 
        FROM timescaledb_information.jobs j
        JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
        WHERE j.application_name LIKE '%retention%'
        AND (j.hypertable_name = 'price_ticks' OR j.hypertable_name = 'ohlc_data')
    LOOP
        PERFORM remove_retention_policy(pol.hypertable_name, if_exists => true);
        RAISE NOTICE 'Removed existing retention policy for %', pol.hypertable_name;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'No existing retention policies to remove or error occurred: %', SQLERRM;
END $$;

-- =============================================================================
-- PRICE TICKS RETENTION POLICIES
-- =============================================================================

-- Retain price tick data for 2 years (configurable based on business needs)
-- This balances storage costs with historical analysis requirements
SELECT add_retention_policy(
    'price_ticks', 
    INTERVAL '2 years',
    if_not_exists => true
);

-- Create a custom retention policy function for more granular control
CREATE OR REPLACE FUNCTION custom_price_ticks_retention(
    symbol_pattern TEXT DEFAULT '%',
    retention_days INTEGER DEFAULT 730 -- 2 years default
) RETURNS TEXT AS $$
DECLARE
    chunk_name TEXT;
    chunks_dropped INTEGER := 0;
    cutoff_time TIMESTAMPTZ;
BEGIN
    cutoff_time := NOW() - (retention_days || ' days')::INTERVAL;
    
    -- Drop chunks older than retention period for specific symbol patterns
    FOR chunk_name IN 
        SELECT chunk_schema || '.' || chunk_name
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'price_ticks'
        AND range_end <= cutoff_time
        AND EXISTS (
            SELECT 1 FROM price_ticks pt 
            WHERE pt.symbol LIKE symbol_pattern
            AND pt.time >= range_start 
            AND pt.time < range_end
        )
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %s CASCADE', chunk_name);
        chunks_dropped := chunks_dropped + 1;
        RAISE NOTICE 'Dropped chunk: %', chunk_name;
    END LOOP;
    
    RETURN format('Dropped %s chunks for symbol pattern %s older than %s days', 
                  chunks_dropped, symbol_pattern, retention_days);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION custom_price_ticks_retention IS 
'Custom retention function allowing selective cleanup by symbol pattern and custom retention periods';

-- =============================================================================
-- OHLC DATA RETENTION POLICIES
-- =============================================================================

-- Retain OHLC data for 5 years (longer than ticks due to aggregated nature)
-- OHLC data is more compact and useful for long-term analysis
SELECT add_retention_policy(
    'ohlc_data', 
    INTERVAL '5 years',
    if_not_exists => true
);

-- Create tiered retention based on interval duration
CREATE OR REPLACE FUNCTION tiered_ohlc_retention() RETURNS TEXT AS $$
DECLARE
    chunk_name TEXT;
    chunks_dropped INTEGER := 0;
    retention_config RECORD;
BEGIN
    -- Define retention periods by interval type
    FOR retention_config IN 
        VALUES 
            ('1m', '30 days'::INTERVAL),    -- 1-minute data: 30 days
            ('5m', '90 days'::INTERVAL),    -- 5-minute data: 3 months
            ('15m', '180 days'::INTERVAL),  -- 15-minute data: 6 months
            ('30m', '365 days'::INTERVAL),  -- 30-minute data: 1 year
            ('1h', '730 days'::INTERVAL),   -- 1-hour data: 2 years
            ('4h', '1095 days'::INTERVAL),  -- 4-hour data: 3 years
            ('1d', '1825 days'::INTERVAL),  -- 1-day data: 5 years
            ('1w', '3650 days'::INTERVAL),  -- 1-week data: 10 years
            ('1M', '3650 days'::INTERVAL)   -- 1-month data: 10 years
    LOOP
        FOR chunk_name IN 
            SELECT c.chunk_schema || '.' || c.chunk_name
            FROM timescaledb_information.chunks c
            WHERE c.hypertable_name = 'ohlc_data'
            AND c.range_end <= NOW() - retention_config.column2
            AND EXISTS (
                SELECT 1 FROM ohlc_data od 
                WHERE od.interval_duration = retention_config.column1
                AND od.time >= c.range_start 
                AND od.time < c.range_end
            )
        LOOP
            EXECUTE format('DROP TABLE IF EXISTS %s CASCADE', chunk_name);
            chunks_dropped := chunks_dropped + 1;
            RAISE NOTICE 'Dropped OHLC chunk: % (interval: %)', chunk_name, retention_config.column1;
        END LOOP;
    END LOOP;
    
    RETURN format('Dropped %s OHLC chunks based on tiered retention policy', chunks_dropped);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION tiered_ohlc_retention IS 
'Tiered retention policy with different retention periods based on OHLC interval duration';

-- =============================================================================
-- SUPPORTING TABLE RETENTION POLICIES
-- =============================================================================

-- Cleanup old schema version records (keep last 20 versions)
CREATE OR REPLACE FUNCTION cleanup_schema_versions() RETURNS TEXT AS $$
DECLARE
    versions_deleted INTEGER;
BEGIN
    WITH versions_to_keep AS (
        SELECT version 
        FROM schema_versions 
        ORDER BY applied_at DESC 
        LIMIT 20
    )
    DELETE FROM schema_versions 
    WHERE version NOT IN (SELECT version FROM versions_to_keep);
    
    GET DIAGNOSTICS versions_deleted = ROW_COUNT;
    
    RETURN format('Cleaned up %s old schema version records', versions_deleted);
END;
$$ LANGUAGE plpgsql;

-- Data sources cleanup (soft delete old inactive sources)
CREATE OR REPLACE FUNCTION archive_inactive_data_sources(
    inactive_days INTEGER DEFAULT 365
) RETURNS TEXT AS $$
DECLARE
    sources_archived INTEGER;
BEGIN
    -- Mark data sources as inactive if they haven't been updated recently
    -- and have no associated recent data
    UPDATE data_sources 
    SET is_active = FALSE, 
        updated_at = NOW()
    WHERE is_active = TRUE 
    AND updated_at < NOW() - (inactive_days || ' days')::INTERVAL
    AND NOT EXISTS (
        SELECT 1 FROM price_ticks pt 
        WHERE pt.data_source = data_sources.name 
        AND pt.time > NOW() - INTERVAL '30 days'
        UNION
        SELECT 1 FROM ohlc_data od 
        WHERE od.data_source = data_sources.name 
        AND od.time > NOW() - INTERVAL '30 days'
    );
    
    GET DIAGNOSTICS sources_archived = ROW_COUNT;
    
    RETURN format('Archived %s inactive data sources', sources_archived);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RETENTION POLICY JOBS AND SCHEDULING
-- =============================================================================

-- Create a comprehensive retention job that runs all cleanup functions
CREATE OR REPLACE FUNCTION run_comprehensive_retention() RETURNS TEXT AS $$
DECLARE
    results TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Run all retention functions and collect results
    results := array_append(results, custom_price_ticks_retention());
    results := array_append(results, tiered_ohlc_retention());
    results := array_append(results, cleanup_schema_versions());
    results := array_append(results, archive_inactive_data_sources());
    
    -- Log the retention run
    INSERT INTO schema_versions (version, description) 
    VALUES (
        'retention_run_' || to_char(NOW(), 'YYYY_MM_DD_HH24_MI_SS'),
        'Comprehensive retention policy execution: ' || array_to_string(results, '; ')
    );
    
    RETURN 'Comprehensive retention completed: ' || array_to_string(results, E'\n');
END;
$$ LANGUAGE plpgsql;

-- Schedule the comprehensive retention job to run weekly
SELECT add_job(
    'run_comprehensive_retention',
    '1 week'::INTERVAL,
    config => jsonb_build_object('max_retries', 3),
    if_not_exists => true
);

-- =============================================================================
-- EMERGENCY DATA RECOVERY FUNCTIONS
-- =============================================================================

-- Function to temporarily disable retention policies (for emergency data recovery)
CREATE OR REPLACE FUNCTION disable_all_retention_policies() RETURNS TEXT AS $$
DECLARE
    job_record RECORD;
    jobs_disabled INTEGER := 0;
BEGIN
    FOR job_record IN 
        SELECT job_id, application_name
        FROM timescaledb_information.jobs
        WHERE application_name LIKE '%retention%'
        OR application_name = 'run_comprehensive_retention'
    LOOP
        PERFORM alter_job(job_record.job_id, scheduled => false);
        jobs_disabled := jobs_disabled + 1;
        RAISE NOTICE 'Disabled retention job: % (ID: %)', job_record.application_name, job_record.job_id;
    END LOOP;
    
    RETURN format('Disabled %s retention jobs for emergency data recovery', jobs_disabled);
END;
$$ LANGUAGE plpgsql;

-- Function to re-enable retention policies
CREATE OR REPLACE FUNCTION enable_all_retention_policies() RETURNS TEXT AS $$
DECLARE
    job_record RECORD;
    jobs_enabled INTEGER := 0;
BEGIN
    FOR job_record IN 
        SELECT job_id, application_name
        FROM timescaledb_information.jobs
        WHERE application_name LIKE '%retention%'
        OR application_name = 'run_comprehensive_retention'
    LOOP
        PERFORM alter_job(job_record.job_id, scheduled => true);
        jobs_enabled := jobs_enabled + 1;
        RAISE NOTICE 'Enabled retention job: % (ID: %)', job_record.application_name, job_record.job_id;
    END LOOP;
    
    RETURN format('Enabled %s retention jobs', jobs_enabled);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- RETENTION MONITORING AND REPORTING
-- =============================================================================

-- Create a view to monitor retention policy status and effectiveness
CREATE OR REPLACE VIEW retention_policy_status AS
SELECT 
    j.job_id,
    j.application_name,
    j.schedule_interval,
    j.max_retries,
    j.max_runtime,
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
FROM timescaledb_information.jobs j
LEFT JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
WHERE j.application_name LIKE '%retention%' 
   OR j.application_name = 'run_comprehensive_retention'
ORDER BY j.job_id;

-- Create a view to show data distribution and retention effectiveness
CREATE OR REPLACE VIEW data_retention_summary AS
SELECT 
    'price_ticks' as table_name,
    COUNT(*) as total_rows,
    MIN(time) as oldest_data,
    MAX(time) as newest_data,
    EXTRACT(DAYS FROM (MAX(time) - MIN(time))) as data_span_days,
    COUNT(DISTINCT symbol) as unique_symbols,
    pg_size_pretty(pg_total_relation_size('price_ticks')) as table_size
FROM price_ticks
UNION ALL
SELECT 
    'ohlc_data' as table_name,
    COUNT(*) as total_rows,
    MIN(time) as oldest_data,
    MAX(time) as newest_data,
    EXTRACT(DAYS FROM (MAX(time) - MIN(time))) as data_span_days,
    COUNT(DISTINCT symbol) as unique_symbols,
    pg_size_pretty(pg_total_relation_size('ohlc_data')) as table_size
FROM ohlc_data;

-- =============================================================================
-- RETENTION POLICY DOCUMENTATION AND COMMENTS
-- =============================================================================

COMMENT ON FUNCTION custom_price_ticks_retention IS 
'Flexible retention function allowing custom retention periods and symbol-specific cleanup';

COMMENT ON FUNCTION tiered_ohlc_retention IS 
'Implements tiered retention where higher frequency data is retained for shorter periods';

COMMENT ON FUNCTION run_comprehensive_retention IS 
'Master retention function that executes all cleanup policies in sequence';

COMMENT ON FUNCTION disable_all_retention_policies IS 
'Emergency function to disable all retention policies for data recovery scenarios';

COMMENT ON FUNCTION enable_all_retention_policies IS 
'Re-enables all retention policies after emergency data recovery';

COMMENT ON VIEW retention_policy_status IS 
'Monitoring view showing health and execution status of all retention policies';

COMMENT ON VIEW data_retention_summary IS 
'Summary view showing data distribution and storage utilization for retention planning';

-- =============================================================================
-- COMPLETION MESSAGE AND VERIFICATION
-- =============================================================================

DO $$
DECLARE
    price_ticks_policy_exists BOOLEAN;
    ohlc_policy_exists BOOLEAN;
    retention_job_exists BOOLEAN;
BEGIN
    -- Verify retention policies are in place
    SELECT EXISTS(
        SELECT 1 FROM timescaledb_information.jobs 
        WHERE application_name LIKE '%retention%' 
        AND hypertable_name = 'price_ticks'
    ) INTO price_ticks_policy_exists;
    
    SELECT EXISTS(
        SELECT 1 FROM timescaledb_information.jobs 
        WHERE application_name LIKE '%retention%' 
        AND hypertable_name = 'ohlc_data'
    ) INTO ohlc_policy_exists;
    
    SELECT EXISTS(
        SELECT 1 FROM timescaledb_information.jobs 
        WHERE application_name = 'run_comprehensive_retention'
    ) INTO retention_job_exists;
    
    RAISE NOTICE 'TimescaleDB retention policies configuration completed';
    RAISE NOTICE 'Price ticks retention policy: %', 
        CASE WHEN price_ticks_policy_exists THEN 'ACTIVE (2 years)' ELSE 'NOT FOUND' END;
    RAISE NOTICE 'OHLC data retention policy: %', 
        CASE WHEN ohlc_policy_exists THEN 'ACTIVE (5 years)' ELSE 'NOT FOUND' END;
    RAISE NOTICE 'Comprehensive retention job: %', 
        CASE WHEN retention_job_exists THEN 'SCHEDULED (weekly)' ELSE 'NOT FOUND' END;
    RAISE NOTICE 'Monitor retention with: SELECT * FROM retention_policy_status;';
    RAISE NOTICE 'View data summary with: SELECT * FROM data_retention_summary;';
END $$;