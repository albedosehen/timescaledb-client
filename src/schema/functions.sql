-- TimescaleDB Client - Custom Functions Script
-- Dialect: postgresql
-- This script creates custom PostgreSQL and TimescaleDB functions for financial data analysis

-- =============================================================================
-- FINANCIAL CALCULATION FUNCTIONS
-- =============================================================================

-- Calculate Simple Moving Average (SMA)
CREATE OR REPLACE FUNCTION calculate_sma(
    p_symbol TEXT,
    p_period INTEGER,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    sma_value NUMERIC;
BEGIN
    SELECT AVG(price) INTO sma_value
    FROM (
        SELECT price 
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        ORDER BY time DESC 
        LIMIT p_period
    ) recent_prices;
    
    RETURN sma_value;
END;
$$ LANGUAGE plpgsql;

-- Calculate Exponential Moving Average (EMA)
CREATE OR REPLACE FUNCTION calculate_ema(
    p_symbol TEXT,
    p_period INTEGER,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    multiplier NUMERIC;
    current_price NUMERIC;
    previous_ema NUMERIC;
    result_ema NUMERIC;
    rec RECORD;
BEGIN
    -- Calculate the multiplier for EMA
    multiplier := 2.0 / (p_period + 1.0);
    
    -- Get the initial SMA as starting point
    SELECT calculate_sma(p_symbol, p_period, p_end_time) INTO previous_ema;
    
    IF previous_ema IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Calculate EMA iteratively
    FOR rec IN 
        SELECT price 
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        ORDER BY time DESC 
        LIMIT p_period
    LOOP
        result_ema := (rec.price * multiplier) + (previous_ema * (1 - multiplier));
        previous_ema := result_ema;
    END LOOP;
    
    RETURN result_ema;
END;
$$ LANGUAGE plpgsql;

-- Calculate Relative Strength Index (RSI)
CREATE OR REPLACE FUNCTION calculate_rsi(
    p_symbol TEXT,
    p_period INTEGER DEFAULT 14,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    avg_gain NUMERIC;
    avg_loss NUMERIC;
    rs NUMERIC;
    rsi_value NUMERIC;
BEGIN
    WITH price_changes AS (
        SELECT 
            price - LAG(price) OVER (ORDER BY time) AS price_change
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        ORDER BY time DESC 
        LIMIT p_period + 1
    ),
    gains_losses AS (
        SELECT 
            CASE WHEN price_change > 0 THEN price_change ELSE 0 END AS gain,
            CASE WHEN price_change < 0 THEN ABS(price_change) ELSE 0 END AS loss
        FROM price_changes
        WHERE price_change IS NOT NULL
    )
    SELECT 
        AVG(gain) INTO avg_gain,
        AVG(loss) INTO avg_loss
    FROM gains_losses;
    
    IF avg_loss = 0 THEN
        RETURN 100;
    END IF;
    
    rs := avg_gain / avg_loss;
    rsi_value := 100 - (100 / (1 + rs));
    
    RETURN rsi_value;
END;
$$ LANGUAGE plpgsql;

-- Calculate Bollinger Bands
CREATE OR REPLACE FUNCTION calculate_bollinger_bands(
    p_symbol TEXT,
    p_period INTEGER DEFAULT 20,
    p_std_dev NUMERIC DEFAULT 2.0,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(
    middle_band NUMERIC,
    upper_band NUMERIC,
    lower_band NUMERIC,
    price_position NUMERIC
) AS $$
DECLARE
    sma_value NUMERIC;
    std_dev_value NUMERIC;
    current_price NUMERIC;
BEGIN
    -- Calculate SMA (middle band)
    SELECT AVG(price) INTO sma_value
    FROM (
        SELECT price 
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        ORDER BY time DESC 
        LIMIT p_period
    ) recent_prices;
    
    -- Calculate standard deviation
    SELECT STDDEV(price) INTO std_dev_value
    FROM (
        SELECT price 
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        ORDER BY time DESC 
        LIMIT p_period
    ) recent_prices;
    
    -- Get current price
    SELECT price INTO current_price
    FROM price_ticks 
    WHERE symbol = p_symbol 
    AND time <= p_end_time
    ORDER BY time DESC 
    LIMIT 1;
    
    -- Return the bands and current price position
    middle_band := sma_value;
    upper_band := sma_value + (p_std_dev * std_dev_value);
    lower_band := sma_value - (p_std_dev * std_dev_value);
    
    -- Calculate price position within bands (0 = lower band, 1 = upper band)
    IF upper_band != lower_band THEN
        price_position := (current_price - lower_band) / (upper_band - lower_band);
    ELSE
        price_position := 0.5;
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VOLATILITY AND RISK FUNCTIONS
-- =============================================================================

-- Calculate historical volatility (annualized)
CREATE OR REPLACE FUNCTION calculate_volatility(
    p_symbol TEXT,
    p_days INTEGER DEFAULT 30,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    volatility NUMERIC;
    trading_days_per_year CONSTANT NUMERIC := 252;
BEGIN
    WITH daily_returns AS (
        SELECT 
            DATE(time) as trade_date,
            first(price ORDER BY time) as open_price,
            last(price ORDER BY time) as close_price
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        AND time >= p_end_time - (p_days || ' days')::INTERVAL
        GROUP BY DATE(time)
        ORDER BY trade_date
    ),
    returns AS (
        SELECT 
            LN(close_price / LAG(close_price) OVER (ORDER BY trade_date)) as daily_return
        FROM daily_returns
    )
    SELECT 
        STDDEV(daily_return) * SQRT(trading_days_per_year) INTO volatility
    FROM returns
    WHERE daily_return IS NOT NULL;
    
    RETURN volatility;
END;
$$ LANGUAGE plpgsql;

-- Calculate Value at Risk (VaR)
CREATE OR REPLACE FUNCTION calculate_var(
    p_symbol TEXT,
    p_confidence_level NUMERIC DEFAULT 0.95,
    p_days INTEGER DEFAULT 30,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    var_value NUMERIC;
    percentile_rank NUMERIC;
BEGIN
    percentile_rank := 1 - p_confidence_level;
    
    WITH daily_returns AS (
        SELECT 
            DATE(time) as trade_date,
            first(price ORDER BY time) as open_price,
            last(price ORDER BY time) as close_price
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        AND time >= p_end_time - (p_days || ' days')::INTERVAL
        GROUP BY DATE(time)
        ORDER BY trade_date
    ),
    returns AS (
        SELECT 
            (close_price - open_price) / open_price as daily_return
        FROM daily_returns
        WHERE open_price > 0
    )
    SELECT 
        percentile_cont(percentile_rank) WITHIN GROUP (ORDER BY daily_return) INTO var_value
    FROM returns;
    
    RETURN var_value;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- VOLUME ANALYSIS FUNCTIONS
-- =============================================================================

-- Calculate Volume Weighted Average Price (VWAP)
CREATE OR REPLACE FUNCTION calculate_vwap(
    p_symbol TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    vwap_value NUMERIC;
BEGIN
    SELECT 
        SUM(price * COALESCE(volume, 1)) / SUM(COALESCE(volume, 1)) INTO vwap_value
    FROM price_ticks 
    WHERE symbol = p_symbol 
    AND time >= p_start_time
    AND time <= p_end_time
    AND volume IS NOT NULL
    AND volume > 0;
    
    RETURN vwap_value;
END;
$$ LANGUAGE plpgsql;

-- Calculate On-Balance Volume (OBV)
CREATE OR REPLACE FUNCTION calculate_obv(
    p_symbol TEXT,
    p_end_time TIMESTAMPTZ DEFAULT NOW(),
    p_days INTEGER DEFAULT 30
) RETURNS NUMERIC AS $$
DECLARE
    obv_value NUMERIC := 0;
    rec RECORD;
    prev_price NUMERIC;
BEGIN
    FOR rec IN 
        SELECT price, volume, time
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        AND time >= p_end_time - (p_days || ' days')::INTERVAL
        ORDER BY time ASC
    LOOP
        IF prev_price IS NOT NULL THEN
            IF rec.price > prev_price THEN
                obv_value := obv_value + COALESCE(rec.volume, 0);
            ELSIF rec.price < prev_price THEN
                obv_value := obv_value - COALESCE(rec.volume, 0);
            END IF;
        END IF;
        prev_price := rec.price;
    END LOOP;
    
    RETURN obv_value;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SUPPORT AND RESISTANCE FUNCTIONS
-- =============================================================================

-- Find support and resistance levels
CREATE OR REPLACE FUNCTION find_support_resistance(
    p_symbol TEXT,
    p_days INTEGER DEFAULT 30,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE(
    price_level NUMERIC,
    level_type TEXT,
    touch_count INTEGER,
    strength NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH price_levels AS (
        SELECT 
            ROUND(price, 2) as rounded_price,
            COUNT(*) as touches
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        AND time >= p_end_time - (p_days || ' days')::INTERVAL
        GROUP BY ROUND(price, 2)
        HAVING COUNT(*) >= 3
    ),
    current_price AS (
        SELECT price as current_val
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time <= p_end_time
        ORDER BY time DESC 
        LIMIT 1
    )
    SELECT 
        pl.rounded_price,
        CASE 
            WHEN pl.rounded_price > cp.current_val THEN 'resistance'
            ELSE 'support'
        END,
        pl.touches,
        (pl.touches::NUMERIC / 10.0) as strength
    FROM price_levels pl
    CROSS JOIN current_price cp
    ORDER BY pl.touches DESC, ABS(pl.rounded_price - cp.current_val);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- CORRELATION AND COMPARISON FUNCTIONS
-- =============================================================================

-- Calculate correlation between two symbols
CREATE OR REPLACE FUNCTION calculate_correlation(
    p_symbol1 TEXT,
    p_symbol2 TEXT,
    p_days INTEGER DEFAULT 30,
    p_end_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC AS $$
DECLARE
    correlation_value NUMERIC;
BEGIN
    WITH symbol1_returns AS (
        SELECT 
            DATE(time) as trade_date,
            (last(price ORDER BY time) - first(price ORDER BY time)) / first(price ORDER BY time) as return1
        FROM price_ticks 
        WHERE symbol = p_symbol1 
        AND time <= p_end_time
        AND time >= p_end_time - (p_days || ' days')::INTERVAL
        GROUP BY DATE(time)
    ),
    symbol2_returns AS (
        SELECT 
            DATE(time) as trade_date,
            (last(price ORDER BY time) - first(price ORDER BY time)) / first(price ORDER BY time) as return2
        FROM price_ticks 
        WHERE symbol = p_symbol2 
        AND time <= p_end_time
        AND time >= p_end_time - (p_days || ' days')::INTERVAL
        GROUP BY DATE(time)
    )
    SELECT 
        CORR(s1.return1, s2.return2) INTO correlation_value
    FROM symbol1_returns s1
    JOIN symbol2_returns s2 ON s1.trade_date = s2.trade_date;
    
    RETURN correlation_value;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DATA QUALITY AND VALIDATION FUNCTIONS
-- =============================================================================

-- Validate price data quality
CREATE OR REPLACE FUNCTION validate_price_data(
    p_symbol TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
) RETURNS TABLE(
    issue_type TEXT,
    issue_count INTEGER,
    description TEXT
) AS $$
BEGIN
    -- Check for duplicate timestamps
    RETURN QUERY
    SELECT 
        'duplicate_timestamps'::TEXT,
        COUNT(*)::INTEGER,
        'Multiple price entries for the same timestamp'::TEXT
    FROM (
        SELECT time, COUNT(*) as cnt
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time >= p_start_time 
        AND time <= p_end_time
        GROUP BY time
        HAVING COUNT(*) > 1
    ) duplicates;
    
    -- Check for price gaps (>10% price change)
    RETURN QUERY
    SELECT 
        'large_price_gaps'::TEXT,
        COUNT(*)::INTEGER,
        'Price changes greater than 10% between consecutive ticks'::TEXT
    FROM (
        SELECT 
            price,
            LAG(price) OVER (ORDER BY time) as prev_price
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time >= p_start_time 
        AND time <= p_end_time
        ORDER BY time
    ) price_changes
    WHERE prev_price IS NOT NULL 
    AND ABS((price - prev_price) / prev_price) > 0.1;
    
    -- Check for missing volume data
    RETURN QUERY
    SELECT 
        'missing_volume'::TEXT,
        COUNT(*)::INTEGER,
        'Price ticks without volume information'::TEXT
    FROM price_ticks 
    WHERE symbol = p_symbol 
    AND time >= p_start_time 
    AND time <= p_end_time
    AND volume IS NULL;
    
    -- Check for zero or negative prices
    RETURN QUERY
    SELECT 
        'invalid_prices'::TEXT,
        COUNT(*)::INTEGER,
        'Zero or negative price values'::TEXT
    FROM price_ticks 
    WHERE symbol = p_symbol 
    AND time >= p_start_time 
    AND time <= p_end_time
    AND price <= 0;
END;
$$ LANGUAGE plpgsql;

-- Clean and normalize price data
CREATE OR REPLACE FUNCTION clean_price_data(
    p_symbol TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_dry_run BOOLEAN DEFAULT TRUE
) RETURNS TEXT AS $$
DECLARE
    rows_affected INTEGER := 0;
    result_message TEXT;
BEGIN
    IF p_dry_run THEN
        -- Count rows that would be affected
        SELECT COUNT(*) INTO rows_affected
        FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time >= p_start_time 
        AND time <= p_end_time
        AND (price <= 0 OR price IS NULL);
        
        result_message := format('DRY RUN: Would clean %s rows with invalid prices', rows_affected);
    ELSE
        -- Actually clean the data
        DELETE FROM price_ticks 
        WHERE symbol = p_symbol 
        AND time >= p_start_time 
        AND time <= p_end_time
        AND (price <= 0 OR price IS NULL);
        
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        result_message := format('Cleaned %s rows with invalid prices', rows_affected);
    END IF;
    
    RETURN result_message;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PERFORMANCE OPTIMIZATION FUNCTIONS
-- =============================================================================

-- Get table statistics and recommendations
CREATE OR REPLACE FUNCTION get_table_statistics(
    p_table_name TEXT DEFAULT 'price_ticks'
) RETURNS TABLE(
    metric_name TEXT,
    metric_value TEXT,
    recommendation TEXT
) AS $$
BEGIN
    -- Table size information
    RETURN QUERY
    SELECT 
        'table_size'::TEXT,
        pg_size_pretty(pg_total_relation_size(p_table_name))::TEXT,
        CASE 
            WHEN pg_total_relation_size(p_table_name) > 10737418240 THEN 'Consider partitioning or compression'
            ELSE 'Table size is manageable'
        END::TEXT;
    
    -- Row count
    RETURN QUERY
    EXECUTE format('
        SELECT 
            ''row_count''::TEXT,
            COUNT(*)::TEXT,
            CASE 
                WHEN COUNT(*) > 100000000 THEN ''Very large table - ensure proper indexing''
                WHEN COUNT(*) > 10000000 THEN ''Large table - monitor query performance''
                ELSE ''Normal table size''
            END::TEXT
        FROM %I', p_table_name);
    
    -- Index usage
    RETURN QUERY
    SELECT 
        'index_usage'::TEXT,
        ROUND(AVG(idx_scan)::NUMERIC, 2)::TEXT,
        CASE 
            WHEN AVG(idx_scan) < 100 THEN 'Low index usage - review query patterns'
            ELSE 'Good index utilization'
        END::TEXT
    FROM pg_stat_user_indexes 
    WHERE relname = p_table_name;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DOCUMENTATION AND COMMENTS
-- =============================================================================

COMMENT ON FUNCTION calculate_sma IS 
'Calculate Simple Moving Average for a given symbol and period';

COMMENT ON FUNCTION calculate_ema IS 
'Calculate Exponential Moving Average with configurable period';

COMMENT ON FUNCTION calculate_rsi IS 
'Calculate Relative Strength Index (RSI) for momentum analysis';

COMMENT ON FUNCTION calculate_bollinger_bands IS 
'Calculate Bollinger Bands with middle, upper, lower bands and price position';

COMMENT ON FUNCTION calculate_volatility IS 
'Calculate annualized historical volatility based on daily returns';

COMMENT ON FUNCTION calculate_var IS 
'Calculate Value at Risk (VaR) at specified confidence level';

COMMENT ON FUNCTION calculate_vwap IS 
'Calculate Volume Weighted Average Price for a time period';

COMMENT ON FUNCTION calculate_correlation IS 
'Calculate correlation coefficient between two symbols';

COMMENT ON FUNCTION validate_price_data IS 
'Comprehensive data quality validation for price data';

COMMENT ON FUNCTION clean_price_data IS 
'Clean invalid price data with optional dry-run mode';

COMMENT ON FUNCTION get_table_statistics IS 
'Get table statistics and performance recommendations';

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
DECLARE
    function_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'calculate_sma', 'calculate_ema', 'calculate_rsi', 'calculate_bollinger_bands',
        'calculate_volatility', 'calculate_var', 'calculate_vwap', 'calculate_obv',
        'find_support_resistance', 'calculate_correlation', 'validate_price_data',
        'clean_price_data', 'get_table_statistics'
    );
    
    RAISE NOTICE 'TimescaleDB custom functions creation completed';
    RAISE NOTICE 'Created % financial analysis functions', function_count;
    RAISE NOTICE 'Functions include: SMA, EMA, RSI, Bollinger Bands, Volatility, VaR, VWAP, OBV';
    RAISE NOTICE 'Use get_table_statistics() to analyze table performance';
    RAISE NOTICE 'Use validate_price_data() to check data quality';
END $$;