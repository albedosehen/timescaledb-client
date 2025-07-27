/**
 * Database-specific test fixtures for TimescaleDB client testing
 *
 * Provides connection configurations, health metrics, schema validation data,
 * and other database-related test fixtures to supplement the existing sample_data.ts.
 */

import type { ClientOptions, ConnectionConfig } from '../../src/types/config.ts'
import type { ChunkInfo, ConnectionHealthMetrics, SchemaValidationResult } from '../../src/types/internal.ts'
import type { HypertableInfo as PublicHypertableInfo, IndexInfo, RetentionPolicy } from '../../src/types/interfaces.ts'

/**
 * Test connection configurations for various scenarios
 */
export const TEST_CONNECTION_CONFIGS: Record<string, ConnectionConfig> = {
  /**
   * Local development configuration
   */
  local: {
    host: 'localhost',
    port: 5432,
    database: 'timescale_dev',
    username: 'postgres',
    password: 'password',
    maxConnections: 10,
    connectTimeout: 30,
    debug: true,
    ssl: false,
  },

  /**
   * Test environment configuration
   */
  test: {
    host: 'localhost',
    port: 5433,
    database: 'timescale_test',
    username: 'test_user',
    password: 'test_password',
    maxConnections: 5,
    connectTimeout: 10,
    debug: false,
    ssl: false,
  },

  /**
   * Production-like configuration with SSL
   */
  production: {
    connectionString: 'postgresql://user:password@db.example.com:5432/timescaledb?sslmode=require',
    maxConnections: 20,
    connectTimeout: 30,
    ssl: {
      rejectUnauthorized: true,
      mode: 'require',
    },
    debug: false,
  },

  /**
   * Cloud configuration
   */
  cloud: {
    connectionString: 'postgresql://user:password@cloud.timescale.com:5432/tsdb?sslmode=require',
    maxConnections: 15,
    connectTimeout: 45,
    ssl: true,
    debug: false,
  },

  /**
   * Minimal configuration for basic tests
   */
  minimal: {
    host: 'localhost',
    database: 'test',
  },

  /**
   * Configuration with async password function
   */
  asyncPassword: {
    host: 'localhost',
    port: 5432,
    database: 'timescale_test',
    username: 'test_user',
    password: () => Promise.resolve('dynamic_password'),
    maxConnections: 5,
  },
}

/**
 * Test client options for various scenarios
 */
export const TEST_CLIENT_OPTIONS: Record<string, ClientOptions> = {
  /**
   * Development options with debugging enabled
   */
  development: {
    defaultBatchSize: 100,
    maxRetries: 3,
    retryBaseDelay: 1000,
    queryTimeout: 30000,
    autoCreateTables: true,
    autoCreateIndexes: true,
    validateInputs: true,
    collectStats: true,
    useStreaming: false,
  },

  /**
   * Production options optimized for performance
   */
  production: {
    defaultBatchSize: 1000,
    maxRetries: 5,
    retryBaseDelay: 2000,
    queryTimeout: 60000,
    autoCreateTables: false,
    autoCreateIndexes: true,
    validateInputs: true,
    collectStats: false,
    useStreaming: true,
    streamingThreshold: 5000,
  },

  /**
   * Test options for fast execution
   */
  test: {
    defaultBatchSize: 50,
    maxRetries: 1,
    retryBaseDelay: 100,
    queryTimeout: 5000,
    autoCreateTables: true,
    autoCreateIndexes: true,
    validateInputs: true,
    collectStats: false,
    useStreaming: false,
  },

  /**
   * Minimal options for basic functionality
   */
  minimal: {
    queryTimeout: 10000,
    validateInputs: false,
    collectStats: false,
  },
}

/**
 * Sample connection health metrics
 */
export const SAMPLE_HEALTH_METRICS: Record<string, ConnectionHealthMetrics> = {
  /**
   * Healthy connection metrics
   */
  healthy: {
    connectionTimeMs: 15,
    lastQueryTime: new Date('2024-01-15T10:30:00Z'),
    failedQueries: 0,
    successfulQueries: 1500,
    avgQueryTimeMs: 25,
    uptimeSeconds: 7200,
  },

  /**
   * Degraded performance metrics
   */
  degraded: {
    connectionTimeMs: 150,
    lastQueryTime: new Date('2024-01-15T10:29:30Z'),
    failedQueries: 5,
    successfulQueries: 995,
    avgQueryTimeMs: 500,
    uptimeSeconds: 3600,
  },

  /**
   * Unhealthy connection metrics
   */
  unhealthy: {
    connectionTimeMs: 5000,
    lastQueryTime: new Date('2024-01-15T10:25:00Z'),
    failedQueries: 50,
    successfulQueries: 150,
    avgQueryTimeMs: 2000,
    uptimeSeconds: 300,
  },

  /**
   * Fresh connection metrics
   */
  fresh: {
    connectionTimeMs: 10,
    lastQueryTime: new Date(),
    failedQueries: 0,
    successfulQueries: 1,
    avgQueryTimeMs: 10,
    uptimeSeconds: 30,
  },
}

/**
 * Schema validation results for different scenarios
 */
export const SAMPLE_SCHEMA_VALIDATION: Record<string, SchemaValidationResult> = {
  /**
   * Valid schema with all required components
   */
  valid: {
    isValid: true,
    missingTables: [],
    missingIndexes: [],
    nonHypertables: [],
    warnings: [],
  },

  /**
   * Schema missing core tables
   */
  missingTables: {
    isValid: false,
    missingTables: ['time_series_data', 'entities'],
    missingIndexes: [],
    nonHypertables: [],
    warnings: [],
  },

  /**
   * Schema with tables but missing hypertable conversion
   */
  nonHypertables: {
    isValid: false,
    missingTables: [],
    missingIndexes: [],
    nonHypertables: ['time_series_data'],
    warnings: ['Table time_series_data exists but is not a hypertable'],
  },

  /**
   * Schema missing performance indexes
   */
  missingIndexes: {
    isValid: true,
    missingTables: [],
    missingIndexes: ['ix_entity_time', 'ix_source'],
    nonHypertables: [],
    warnings: ['Missing performance indexes may impact query performance'],
  },

  /**
   * Schema with warnings but functionally valid
   */
  withWarnings: {
    isValid: true,
    missingTables: [],
    missingIndexes: ['ix_source'],
    nonHypertables: [],
    warnings: [
      'Index ix_source is missing but not critical',
      'TimescaleDB extension not found in shared_preload_libraries',
    ],
  },
}

/**
 * Sample hypertable information
 */
export const SAMPLE_HYPERTABLES: PublicHypertableInfo[] = [
  {
    tableName: 'time_series_data',
    schemaName: 'public',
    timeColumn: 'time',
    chunkTimeInterval: '1 day',
    numDimensions: 1,
    numChunks: 30,
    compressionEnabled: true,
    tableSizeBytes: 1024 * 1024 * 100, // 100MB
    createdAt: new Date('2024-01-01T00:00:00Z'),
  },
  {
    tableName: 'metrics_data',
    schemaName: 'public',
    timeColumn: 'timestamp',
    chunkTimeInterval: '1 hour',
    numDimensions: 2,
    numChunks: 720, // 30 days * 24 hours
    compressionEnabled: false,
    tableSizeBytes: 1024 * 1024 * 50, // 50MB
    createdAt: new Date('2024-01-01T12:00:00Z'),
  },
]

/**
 * Sample index information
 */
export const SAMPLE_INDEXES: IndexInfo[] = [
  {
    indexName: 'ix_time_series_data_entity_id_time',
    tableName: 'time_series_data',
    columns: ['entity_id', 'time'],
    isUnique: false,
    isPartial: false,
    sizeBytes: 1024 * 1024 * 5, // 5MB
    definition:
      'CREATE INDEX ix_time_series_data_entity_id_time ON public.time_series_data USING btree (entity_id, time DESC)',
  },
  {
    indexName: 'ix_time_series_data_time',
    tableName: 'time_series_data',
    columns: ['time'],
    isUnique: false,
    isPartial: false,
    sizeBytes: 1024 * 1024 * 3, // 3MB
    definition: 'CREATE INDEX ix_time_series_data_time ON public.time_series_data USING btree (time DESC)',
  },
  {
    indexName: 'ix_entities_entity_type',
    tableName: 'entities',
    columns: ['entity_type'],
    isUnique: false,
    isPartial: false,
    sizeBytes: 1024 * 512, // 512KB
    definition: 'CREATE INDEX ix_entities_entity_type ON public.entities USING btree (entity_type)',
  },
  {
    indexName: 'uq_entities_entity_id',
    tableName: 'entities',
    columns: ['entity_id'],
    isUnique: true,
    isPartial: false,
    sizeBytes: 1024 * 256, // 256KB
    definition: 'CREATE UNIQUE INDEX uq_entities_entity_id ON public.entities USING btree (entity_id)',
  },
]

/**
 * Sample retention policies
 */
export const SAMPLE_RETENTION_POLICIES: RetentionPolicy[] = [
  {
    hypertableName: 'time_series_data',
    retentionPeriod: '30 days',
    isActive: true,
    nextExecution: new Date('2024-01-16T02:00:00Z'),
    lastExecution: new Date('2024-01-15T02:00:00Z'),
  },
  {
    hypertableName: 'metrics_data',
    retentionPeriod: '7 days',
    isActive: true,
    nextExecution: new Date('2024-01-16T03:00:00Z'),
    lastExecution: new Date('2024-01-15T03:00:00Z'),
  },
  {
    hypertableName: 'logs_data',
    retentionPeriod: '1 day',
    isActive: false,
    lastExecution: new Date('2024-01-14T01:00:00Z'),
  },
]

/**
 * Sample chunk information
 */
export const SAMPLE_CHUNKS: ChunkInfo[] = [
  {
    chunkName: '_timescaledb_internal._hyper_1_1_chunk',
    hypertableName: 'time_series_data',
    rangeStart: new Date('2024-01-14T00:00:00Z'),
    rangeEnd: new Date('2024-01-15T00:00:00Z'),
    sizeBytes: 1024 * 1024 * 10, // 10MB
    isCompressed: true,
    rowCount: 100000,
  },
  {
    chunkName: '_timescaledb_internal._hyper_1_2_chunk',
    hypertableName: 'time_series_data',
    rangeStart: new Date('2024-01-15T00:00:00Z'),
    rangeEnd: new Date('2024-01-16T00:00:00Z'),
    sizeBytes: 1024 * 1024 * 15, // 15MB
    isCompressed: false,
    rowCount: 150000,
  },
]

/**
 * Database error scenarios for testing error handling
 */
export const DATABASE_ERROR_SCENARIOS = {
  /**
   * Connection timeout error
   */
  connectionTimeout: {
    error: new Error('Connection timeout'),
    sqlState: '08006',
    context: 'connection_establishment',
  },

  /**
   * Authentication failure
   */
  authenticationFailed: {
    error: new Error('password authentication failed for user "test_user"'),
    sqlState: '28P01',
    context: 'authentication',
  },

  /**
   * Database does not exist
   */
  databaseNotFound: {
    error: new Error('database "nonexistent_db" does not exist'),
    sqlState: '3D000',
    context: 'connection_establishment',
  },

  /**
   * Table does not exist
   */
  tableNotFound: {
    error: new Error('relation "nonexistent_table" does not exist'),
    sqlState: '42P01',
    context: 'query_execution',
  },

  /**
   * TimescaleDB extension not installed
   */
  timescaleNotInstalled: {
    error: new Error('extension "timescaledb" is not available'),
    sqlState: '0A000',
    context: 'extension_check',
  },

  /**
   * Query timeout
   */
  queryTimeout: {
    error: new Error('Query timeout after 30000ms'),
    sqlState: '57014',
    context: 'query_execution',
  },

  /**
   * Connection pool exhausted
   */
  poolExhausted: {
    error: new Error('Connection pool exhausted'),
    sqlState: '53300',
    context: 'connection_pool',
  },

  /**
   * Duplicate key violation
   */
  duplicateKey: {
    error: new Error('duplicate key value violates unique constraint'),
    sqlState: '23505',
    context: 'data_insertion',
  },
}

/**
 * Mock SQL responses for common queries
 */
export const MOCK_SQL_RESPONSES = {
  /**
   * Health check responses
   */
  healthCheck: [{ test: 1, version: 'PostgreSQL 14.0 on TimescaleDB 2.8.0' }],

  /**
   * Version queries
   */
  postgresVersion: [{ version: 'PostgreSQL 14.0 on x86_64-pc-linux-gnu' }],
  timescaleVersion: [{ timescaledb_version: '2.8.0' }],

  /**
   * Extension queries
   */
  extensions: [
    { extname: 'timescaledb', extversion: '2.8.0' },
    { extname: 'pg_stat_statements', extversion: '1.9' },
  ],

  /**
   * Table existence queries
   */
  tables: [
    { tablename: 'time_series_data' },
    { tablename: 'entities' },
  ],

  /**
   * Hypertable queries
   */
  hypertables: [
    { hypertable_name: 'time_series_data', num_dimensions: 1, compression_enabled: true },
  ],

  /**
   * Index queries
   */
  indexes: [
    { indexname: 'ix_time_series_data_entity_id_time' },
    { indexname: 'ix_time_series_data_time' },
    { indexname: 'ix_entities_entity_type' },
  ],

  /**
   * Settings queries
   */
  settings: [
    { name: 'shared_preload_libraries', setting: 'timescaledb' },
    { name: 'max_connections', setting: '100' },
    { name: 'work_mem', setting: '4MB' },
  ],

  /**
   * Empty result for missing components
   */
  empty: [],

  /**
   * Successful operation responses
   */
  insertSuccess: { command: 'INSERT', count: 1 },
  updateSuccess: { command: 'UPDATE', count: 1 },
  deleteSuccess: { command: 'DELETE', count: 1 },
}

/**
 * Test environment variables
 */
export const TEST_ENV_VARS = {
  TIMESCALE_CONNECTION_STRING: 'postgresql://test:test@localhost:5432/timescale_test',
  PGHOST: 'localhost',
  PGPORT: '5432',
  PGDATABASE: 'timescale_test',
  PGUSER: 'test_user',
  PGPASSWORD: 'test_password',
  PGSSLMODE: 'disable',
  TIMESCALE_DEBUG: 'false',
}
