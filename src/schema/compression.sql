-- TimescaleDB Client - Compression Policies Script
-- This script configures TimescaleDB compression policies for optimal storage and query performance

-- =============================================================================
-- COMPRESSION POLICY OVERVIEW
-- =============================================================================

-- TimescaleDB compression provides significant benefits:
-- - Reduces storage by 10-20x for time-series data
-- - Maintains query performance for analytical workloads
-- - Automatically compresses older chunks based on policies
-- - Uses columnar storage for better compression ratios

-- =============================================================================
-- PRICE TICKS COMPRESSION CONFIGURATION
-- =============================================================================

-- Remove existing compression policies if they exist (for re-running script)
DO $$
BEGIN
    BEGIN
        PERFORM remove_compression_policy('price_ticks', if_exists => true);
        RAISE NOTICE 'Removed existing compression policy for price_ticks';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'No existing compression policy for price_ticks or error occurred: %', SQLERRM;
    END;
END $$;

-- Configure compression settings for price_ticks
-- Segment by symbol to group related data together for better compression
-- Order by time DESC to optimize for recent data queries
ALTER TABLE price_ticks SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy - compress chunks older than 7 days
-- This balances query performance (recent data uncompressed) with storage efficiency
SELECT add_compression_policy(
    'price_ticks', 
    INTERVAL '7 days',
    if_not_exists => true
);

-- =============================================================================
-- OHLC DATA COMPRESSION CONFIGURATION
-- =============================================================================

-- Remove existing compression policies for OHLC data
DO $$
BEGIN
    BEGIN
        PERFORM remove_compression_policy('ohlc_data', if_exists => true);
        RAISE NOTICE 'Removed existing compression policy for ohlc_data';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'No existing compression policy for ohlc_data or error occurred: %', SQLERRM;
    END;
END $$;

-- Configure compression settings for ohlc_data
-- Segment by symbol and interval_duration for optimal compression grouping
-- Order by time DESC for query performance
ALTER TABLE ohlc_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'symbol, interval_duration',
    timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy - compress chunks older than 3 days
-- OHLC data is accessed less frequently than ticks, so compress sooner
SELECT add_compression_policy(
    'ohlc_data', 
    INTERVAL '3 days',
    if_not_exists => true
);

-- =============================================================================
-- ADVANCED COMPRESSION STRATEGIES
-- =============================================================================

-- Function to compress specific symbol data immediately (for data migration)
CREATE OR REPLACE FUNCTION compress_symbol_data(
    target_symbol TEXT,
    older_than INTERVAL DEFAULT '1 hour'
) RETURNS TEXT AS $$
DECLARE
    chunk_record RECORD;
    chunks_compressed INTEGER := 0;
BEGIN
    -- Compress price_ticks chunks for specific symbol
    FOR chunk_record IN 
        SELECT chunk_schema, chunk_name, range_start, range_end
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'price_ticks'
        AND range_end < NOW() - older_than
        AND NOT is_compressed
        AND EXISTS (
            SELECT 1 FROM price_ticks pt 
            WHERE pt.symbol = target_symbol
            AND pt.time >= range_start 
            AND pt.time < range_end
        )
    LOOP
        PERFORM compress_chunk(format('%I.%I', chunk_record.chunk_schema, chunk_record.chunk_name));
        chunks_compressed := chunks_compressed + 1;
        RAISE NOTICE 'Compressed price_ticks chunk: %.% (symbol: %)', 
            chunk_record.chunk_schema, chunk_record.chunk_name, target_symbol;
    END LOOP;
    
    -- Compress ohlc_data chunks for specific symbol
    FOR chunk_record IN 
        SELECT chunk_schema, chunk_name, range_start, range_end
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'ohlc_data'
        AND range_end < NOW() - older_than
        AND NOT is_compressed
        AND EXISTS (
            SELECT 1 FROM ohlc_data od 
            WHERE od.symbol = target_symbol
            AND od.time >= range_start 
            AND od.time < range_end
        )
    LOOP
        PERFORM compress_chunk(format('%I.%I', chunk_record.chunk_schema, chunk_record.chunk_name));
        chunks_compressed := chunks_compressed + 1;
        RAISE NOTICE 'Compressed ohlc_data chunk: %.% (symbol: %)', 
            chunk_record.chunk_schema, chunk_record.chunk_name, target_symbol;
    END LOOP;
    
    RETURN format('Compressed %s chunks for symbol %s', chunks_compressed, target_symbol);
END;
$$ LANGUAGE plpgsql;

-- Function to decompress recent data for high-frequency access
CREATE OR REPLACE FUNCTION decompress_recent_data(
    recent_interval INTERVAL DEFAULT '24 hours'
) RETURNS TEXT AS $$
DECLARE
    chunk_record RECORD;
    chunks_decompressed INTEGER := 0;
BEGIN
    -- Decompress recent price_ticks chunks
    FOR chunk_record IN 
        SELECT chunk_schema, chunk_name
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'price_ticks'
        AND range_end > NOW() - recent_interval
        AND is_compressed = true
    LOOP
        PERFORM decompress_chunk(format('%I.%I', chunk_record.chunk_schema, chunk_record.chunk_name));
        chunks_decompressed := chunks_decompressed + 1;
        RAISE NOTICE 'Decompressed price_ticks chunk: %.%', 
            chunk_record.chunk_schema, chunk_record.chunk_name;
    END LOOP;
    
    -- Decompress recent ohlc_data chunks
    FOR chunk_record IN 
        SELECT chunk_schema, chunk_name
        FROM timescaledb_information.chunks
        WHERE hypertable_name = 'ohlc_data'
        AND range_end > NOW() - recent_interval
        AND is_compressed = true
    LOOP
        PERFORM decompress_chunk(format('%I.%I', chunk_record.chunk_schema, chunk_record.chunk_name));
        chunks_decompressed := chunks_decompressed + 1;
        RAISE NOTICE 'Decompressed ohlc_data chunk: %.%', 
            chunk_record.chunk_schema, chunk_record.chunk_name;
    END LOOP;
    
    RETURN format('Decompressed %s recent chunks', chunks_decompressed);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INTELLIGENT COMPRESSION BASED ON ACCESS PATTERNS
-- =============================================================================

-- Function to analyze chunk access patterns and compress accordingly
CREATE OR REPLACE FUNCTION intelligent_compression_analysis() RETURNS TABLE(
    hypertable_name TEXT,
    chunk_name TEXT,
    chunk_size TEXT,
    compression_ratio NUMERIC,
    last_accessed TIMESTAMPTZ,
    recommendation TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH chunk_stats AS (
        SELECT 
            c.hypertable_name,
            c.chunk_name,
            c.chunk_schema,
            c.is_compressed,
            c.range_start,
            c.range_end,
            pg_size_pretty(pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name))) as size,
            COALESCE(cs.uncompressed_heap_size, 0) as uncompressed_size,
            COALESCE(cs.compressed_heap_size, 0) as compressed_size
        FROM timescaledb_information.chunks c
        LEFT JOIN timescaledb_information.chunk_compression_stats cs 
            ON c.chunk_name = cs.chunk_name
        WHERE c.hypertable_name IN ('price_ticks', 'ohlc_data')
    )
    SELECT 
        cs.hypertable_name::TEXT,
        cs.chunk_name::TEXT,
        cs.size::TEXT,
        CASE 
            WHEN cs.compressed_size > 0 THEN 
                ROUND(cs.uncompressed_size::NUMERIC / cs.compressed_size::NUMERIC, 2)
            ELSE NULL 
        END as compression_ratio,
        cs.range_end as last_accessed,
        CASE 
            WHEN NOT cs.is_compressed AND cs.range_end < NOW() - INTERVAL '7 days' THEN 
                'COMPRESS - Old data should be compressed'
            WHEN cs.is_compressed AND cs.range_end > NOW() - INTERVAL '24 hours' THEN 
                'DECOMPRESS - Recent data should be uncompressed for performance'
            WHEN NOT cs.is_compressed AND cs.range_end >= NOW() - INTERVAL '7 days' THEN 
                'KEEP UNCOMPRESSED - Recent data for fast access'
            WHEN cs.is_compressed AND cs.range_end <= NOW() - INTERVAL '24 hours' THEN 
                'KEEP COMPRESSED - Old data optimized for storage'
            ELSE 'NO ACTION NEEDED'
        END as recommendation
    FROM chunk_stats cs
    ORDER BY cs.hypertable_name, cs.range_start DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMPRESSION MONITORING AND MAINTENANCE
-- =============================================================================

-- Create a view to monitor compression effectiveness
CREATE OR REPLACE VIEW compression_stats AS
SELECT 
    h.hypertable_name,
    COUNT(*) as total_chunks,
    COUNT(*) FILTER (WHERE c.is_compressed) as compressed_chunks,
    COUNT(*) FILTER (WHERE NOT c.is_compressed) as uncompressed_chunks,
    ROUND(
        (COUNT(*) FILTER (WHERE c.is_compressed)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2
    ) as compression_percentage,
    pg_size_pretty(
        SUM(COALESCE(cs.uncompressed_heap_size, pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name))))
    ) as total_uncompressed_size,
    pg_size_pretty(
        SUM(COALESCE(cs.compressed_heap_size, 0))
    ) as total_compressed_size,
    CASE 
        WHEN SUM(cs.compressed_heap_size) > 0 THEN
            ROUND(
                SUM(COALESCE(cs.uncompressed_heap_size, 0))::NUMERIC / 
                SUM(cs.compressed_heap_size)::NUMERIC, 2
            )
        ELSE NULL 
    END as avg_compression_ratio
FROM timescaledb_information.hypertables h
JOIN timescaledb_information.chunks c ON h.hypertable_name = c.hypertable_name
LEFT JOIN timescaledb_information.chunk_compression_stats cs ON c.chunk_name = cs.chunk_name
WHERE h.hypertable_name IN ('price_ticks', 'ohlc_data')
GROUP BY h.hypertable_name
ORDER BY h.hypertable_name;

-- Create a view to show compression job status
CREATE OR REPLACE VIEW compression_jobs_status AS
SELECT 
    j.job_id,
    j.application_name,
    j.hypertable_name,
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
FROM timescaledb_information.jobs j
LEFT JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
WHERE j.application_name LIKE '%compression%'
ORDER BY j.hypertable_name, j.job_id;

-- =============================================================================
-- EMERGENCY COMPRESSION MANAGEMENT
-- =============================================================================

-- Function to disable compression policies (for emergency data access)
CREATE OR REPLACE FUNCTION disable_compression_policies() RETURNS TEXT AS $$
DECLARE
    job_record RECORD;
    jobs_disabled INTEGER := 0;
BEGIN
    FOR job_record IN 
        SELECT job_id, application_name, hypertable_name
        FROM timescaledb_information.jobs
        WHERE application_name LIKE '%compression%'
    LOOP
        PERFORM alter_job(job_record.job_id, scheduled => false);
        jobs_disabled := jobs_disabled + 1;
        RAISE NOTICE 'Disabled compression job: % for table %', 
            job_record.application_name, job_record.hypertable_name;
    END LOOP;
    
    RETURN format('Disabled %s compression jobs', jobs_disabled);
END;
$$ LANGUAGE plpgsql;

-- Function to re-enable compression policies
CREATE OR REPLACE FUNCTION enable_compression_policies() RETURNS TEXT AS $$
DECLARE
    job_record RECORD;
    jobs_enabled INTEGER := 0;
BEGIN
    FOR job_record IN 
        SELECT job_id, application_name, hypertable_name
        FROM timescaledb_information.jobs
        WHERE application_name LIKE '%compression%'
    LOOP
        PERFORM alter_job(job_record.job_id, scheduled => true);
        jobs_enabled := jobs_enabled + 1;
        RAISE NOTICE 'Enabled compression job: % for table %', 
            job_record.application_name, job_record.hypertable_name;
    END LOOP;
    
    RETURN format('Enabled %s compression jobs', jobs_enabled);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MAINTENANCE SCRIPTS
-- =============================================================================

-- Function to run comprehensive compression maintenance
CREATE OR REPLACE FUNCTION run_compression_maintenance() RETURNS TEXT AS $$
DECLARE
    maintenance_results TEXT[] := ARRAY[]::TEXT[];
    result_text TEXT;
BEGIN
    -- Run intelligent analysis and apply recommendations
    SELECT string_agg(
        format('Table: %s, Chunk: %s, Recommendation: %s', 
               hypertable_name, chunk_name, recommendation), 
        E'\n'
    )
    INTO result_text
    FROM intelligent_compression_analysis()
    WHERE recommendation != 'NO ACTION NEEDED';
    
    IF result_text IS NOT NULL THEN
        maintenance_results := array_append(maintenance_results, 
            'Compression Analysis Results:' || E'\n' || result_text);
    ELSE
        maintenance_results := array_append(maintenance_results, 
            'Compression Analysis: All chunks properly configured');
    END IF;
    
    -- Log maintenance run
    INSERT INTO schema_versions (version, description) 
    VALUES (
        'compression_maintenance_' || to_char(NOW(), 'YYYY_MM_DD_HH24_MI_SS'),
        'Compression maintenance run: ' || array_to_string(maintenance_results, '; ')
    );
    
    RETURN array_to_string(maintenance_results, E'\n');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DOCUMENTATION AND COMMENTS
-- =============================================================================

COMMENT ON FUNCTION compress_symbol_data IS 
'Manually compress chunks for a specific symbol, useful for data migration scenarios';

COMMENT ON FUNCTION decompress_recent_data IS 
'Decompress recent chunks for high-frequency access patterns';

COMMENT ON FUNCTION intelligent_compression_analysis IS 
'Analyzes chunk access patterns and provides compression recommendations';

COMMENT ON FUNCTION run_compression_maintenance IS 
'Comprehensive compression maintenance function with intelligent analysis';

COMMENT ON VIEW compression_stats IS 
'Overview of compression effectiveness across all hypertables';

COMMENT ON VIEW compression_jobs_status IS 
'Monitor compression job health and execution status';

-- =============================================================================
-- PERFORMANCE OPTIMIZATION TIPS
-- =============================================================================

-- Create a function to provide compression optimization recommendations
CREATE OR REPLACE FUNCTION get_compression_recommendations() RETURNS TABLE(
    recommendation_type TEXT,
    description TEXT,
    sql_command TEXT
) AS $$
BEGIN
    RETURN QUERY
    VALUES 
        ('Segmentby Optimization', 
         'Group by high-cardinality columns that are frequently filtered',
         'ALTER TABLE price_ticks SET (timescaledb.compress_segmentby = ''symbol, exchange'');'),
        ('Orderby Optimization', 
         'Order by columns used in time-range queries',
         'ALTER TABLE price_ticks SET (timescaledb.compress_orderby = ''time DESC, price'');'),
        ('Compression Interval', 
         'Adjust compression interval based on query patterns',
         'SELECT alter_job(job_id, config => jsonb_set(config, ''{compress_after}'', ''"1 day"'')) FROM timescaledb_information.jobs WHERE application_name LIKE ''%compression%'';'),
        ('Storage Optimization', 
         'Use appropriate data types for better compression',
         'ALTER TABLE price_ticks ALTER COLUMN price TYPE REAL; -- If precision allows'),
        ('Index Strategy', 
         'Create covering indexes on compressed chunks',
         'CREATE INDEX ON price_ticks (symbol, time) INCLUDE (price, volume);');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMPLETION MESSAGE AND VERIFICATION
-- =============================================================================

DO $$
DECLARE
    price_ticks_compression BOOLEAN;
    ohlc_compression BOOLEAN;
    compression_jobs INTEGER;
BEGIN
    -- Verify compression is enabled
    SELECT compression_enabled INTO price_ticks_compression
    FROM timescaledb_information.hypertables 
    WHERE hypertable_name = 'price_ticks';
    
    SELECT compression_enabled INTO ohlc_compression
    FROM timescaledb_information.hypertables 
    WHERE hypertable_name = 'ohlc_data';
    
    SELECT COUNT(*) INTO compression_jobs
    FROM timescaledb_information.jobs 
    WHERE application_name LIKE '%compression%';
    
    RAISE NOTICE 'TimescaleDB compression policies configuration completed';
    RAISE NOTICE 'Price ticks compression: %', 
        CASE WHEN price_ticks_compression THEN 'ENABLED (7 days)' ELSE 'DISABLED' END;
    RAISE NOTICE 'OHLC data compression: %', 
        CASE WHEN ohlc_compression THEN 'ENABLED (3 days)' ELSE 'DISABLED' END;
    RAISE NOTICE 'Compression jobs configured: %', compression_jobs;
    RAISE NOTICE 'Monitor compression with: SELECT * FROM compression_stats;';
    RAISE NOTICE 'Check job status with: SELECT * FROM compression_jobs_status;';
    RAISE NOTICE 'Get optimization tips: SELECT * FROM get_compression_recommendations();';
END $$;