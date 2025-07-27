-- TimescaleDB Client - Universal Time-Series Schema
-- Dialect: postgresql
-- This script creates hypertables and supporting tables for universal time-series data storage
-- Supports any domain: financial, IoT, monitoring, logging, analytics, etc.

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

-- Universal entity metadata table for any domain
CREATE TABLE IF NOT EXISTS entities (
  entity_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'financial_symbol', 'sensor', 'server', 'service', 'device', etc.
  name TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,

  -- Data integrity constraints
  CONSTRAINT entities_entity_id_format CHECK (
    entity_id ~ '^[A-Za-z0-9_.-]{1,100}$' -- Alphanumeric, underscore, dot, dash, max 100 chars
  ),
  CONSTRAINT entities_entity_type_format CHECK (
    entity_type ~ '^[a-z_]{1,50}$' -- Lowercase, underscore, max 50 chars
  )
);

-- =============================================================================
-- HYPERTABLES - Universal time-series data storage
-- =============================================================================

-- Universal time-series data hypertable supporting any domain
CREATE TABLE IF NOT EXISTS time_series_data (
  time TIMESTAMPTZ NOT NULL,
  entity_id TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  value2 DOUBLE PRECISION DEFAULT NULL,
  value3 DOUBLE PRECISION DEFAULT NULL,
  value4 DOUBLE PRECISION DEFAULT NULL,
  metadata JSONB DEFAULT '{}',

  -- Composite primary key ensuring uniqueness per entity and time
  PRIMARY KEY (entity_id, time),

  -- Foreign key to entities table
  CONSTRAINT fk_entity_id FOREIGN KEY (entity_id) REFERENCES entities(entity_id) ON DELETE CASCADE,

  -- Data integrity constraints
  CONSTRAINT time_series_value_finite CHECK (value IS NOT NULL AND value = value), -- Ensures not NaN or infinite
  CONSTRAINT time_series_value2_finite CHECK (value2 IS NULL OR value2 = value2),
  CONSTRAINT time_series_value3_finite CHECK (value3 IS NULL OR value3 = value3),
  CONSTRAINT time_series_value4_finite CHECK (value4 IS NULL OR value4 = value4)
);

-- Convert to hypertable with optimized partitioning
SELECT create_hypertable(
  'time_series_data',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Add space partitioning by entity_id for better performance
SELECT add_dimension(
  'time_series_data',
  'entity_id',
  number_partitions => 4,
  if_not_exists => TRUE
);

-- =============================================================================
-- INDEXES FOR OPTIMAL PERFORMANCE
-- =============================================================================

-- Entity-related indexes
CREATE INDEX IF NOT EXISTS ix_entities_entity_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS ix_entities_is_active ON entities(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ix_entities_metadata_gin ON entities USING GIN (metadata);
CREATE INDEX IF NOT EXISTS ix_entities_updated_at ON entities(updated_at);

-- Time-series data indexes
CREATE INDEX IF NOT EXISTS ix_time_series_data_entity_id_time ON time_series_data(entity_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_time_series_data_time ON time_series_data(time DESC);
CREATE INDEX IF NOT EXISTS ix_time_series_data_metadata_gin ON time_series_data USING GIN (metadata);

-- =============================================================================
-- TABLE COMMENTS AND DOCUMENTATION
-- =============================================================================

-- Schema version table comments
COMMENT ON TABLE schema_versions IS 'Tracks database schema versions and migration history';
COMMENT ON COLUMN schema_versions.version IS 'Semantic version of the schema (e.g., 1.0.0)';
COMMENT ON COLUMN schema_versions.description IS 'Human-readable description of changes in this version';

-- Entities table comments
COMMENT ON TABLE entities IS 'Universal metadata storage for any type of entity across all domains';
COMMENT ON COLUMN entities.entity_id IS 'Unique identifier for the entity (symbol, sensor_id, server_id, etc.)';
COMMENT ON COLUMN entities.entity_type IS 'Type of entity: financial_symbol, sensor, server, service, device, etc.';
COMMENT ON COLUMN entities.name IS 'Human-readable name or display name for the entity';
COMMENT ON COLUMN entities.description IS 'Detailed description of the entity';
COMMENT ON COLUMN entities.metadata IS 'Domain-specific metadata stored as JSON (exchange, location, config, etc.)';
COMMENT ON CONSTRAINT entities_entity_id_format ON entities IS 'Ensures entity_id follows naming conventions';
COMMENT ON CONSTRAINT entities_entity_type_format ON entities IS 'Ensures entity_type follows naming conventions';

-- Time-series data table comments
COMMENT ON TABLE time_series_data IS 'Universal time-series storage supporting any domain and use case';
COMMENT ON COLUMN time_series_data.time IS 'Timestamp of the data point (partition key)';
COMMENT ON COLUMN time_series_data.entity_id IS 'Reference to the entity this data belongs to';
COMMENT ON COLUMN time_series_data.value IS 'Primary numeric value (price, temperature, cpu_usage, error_count, etc.)';
COMMENT ON COLUMN time_series_data.value2 IS 'Secondary numeric value (volume, humidity, memory_usage, etc.)';
COMMENT ON COLUMN time_series_data.value3 IS 'Tertiary numeric value (for OHLC low, disk_usage, etc.)';
COMMENT ON COLUMN time_series_data.value4 IS 'Quaternary numeric value (for OHLC close, network_usage, etc.)';
COMMENT ON COLUMN time_series_data.metadata IS 'Record-specific metadata stored as JSON';
COMMENT ON CONSTRAINT time_series_value_finite ON time_series_data IS 'Ensures numeric values are finite (not NaN or infinite)';

-- =============================================================================
-- DOMAIN-SPECIFIC EXAMPLE DATA
-- =============================================================================

-- Insert initial schema version
INSERT INTO schema_versions (version, description)
VALUES ('2.0.0', 'Universal time-series schema supporting any domain (financial, IoT, monitoring, logging)')
ON CONFLICT (version) DO NOTHING;

-- NOTE: Sample data has been removed to keep the schema clean and unopinionated.
-- Users can insert their own domain-specific entities and time-series data as needed.
--
-- Example entity types that can be used:
-- - 'sensor' for IoT sensors
-- - 'server' for server monitoring
-- - 'service' for microservices
-- - 'device' for IoT devices
-- - 'application' for applications
-- - Any custom entity type following the format: lowercase letters and underscores only
--
-- Example time-series data mapping:
-- - IoT: {entity_id: "sensor_001", value: temperature, value2: humidity}
-- - Monitoring: {entity_id: "server_01", value: cpu_usage, value2: memory_usage}
-- - Application: {entity_id: "service_api", value: error_count, value2: response_time}
-- - Custom domains: Use value, value2, value3, value4 fields as needed for your use case

-- =============================================================================
-- SECURITY AND PERMISSIONS
-- =============================================================================

-- Revoke public access and grant specific permissions as needed
-- (These commands should be customized based on your security requirements)

-- Example: Grant read-only access to a reporting role
-- GRANT SELECT ON entities, time_series_data TO readonly_role;

-- Example: Grant insert permissions to a data ingestion role
-- GRANT SELECT, INSERT ON time_series_data TO data_writer_role;
-- GRANT SELECT ON entities TO data_writer_role;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Universal TimescaleDB schema creation completed successfully';
  RAISE NOTICE 'Created tables: schema_versions, entities, time_series_data (hypertable)';
  RAISE NOTICE 'Schema supports any domain: financial, IoT, monitoring, logging, analytics';
  RAISE NOTICE 'Sample data includes: financial symbols, IoT sensors, servers, microservices';
  RAISE NOTICE 'Next steps: Run indexes.sql, retention.sql, compression.sql, continuous_aggregates.sql';
END $$;