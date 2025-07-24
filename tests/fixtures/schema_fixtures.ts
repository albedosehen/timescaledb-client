/**
 * Schema fixtures for testing database schema validation and management
 * 
 * Provides mock schema validation results, hypertable information,
 * and schema management scenarios for testing.
 */

import type { 
  SchemaInfo, 
  HypertableInfo, 
  IndexInfo, 
  RetentionPolicy,
  HealthCheckResult 
} from '../../src/types/interfaces.ts'
import type { 
  SchemaValidationResult,
  HypertableMetadataRow,
  IndexMetadataRow,
  ChunkMetadataRow
} from '../../src/types/internal.ts'

/**
 * Valid schema validation results
 */
export const VALID_SCHEMA_RESULTS: Record<string, SchemaValidationResult> = {
  completeValid: {
    isValid: true,
    missingTables: [],
    missingIndexes: [],
    nonHypertables: [],
    warnings: []
  },

  validWithWarnings: {
    isValid: true,
    missingTables: [],
    missingIndexes: [],
    nonHypertables: [],
    warnings: [
      'Compression is not enabled for price_ticks hypertable',
      'Consider adding retention policy for older data'
    ]
  },

  validMinimal: {
    isValid: true,
    missingTables: [],
    missingIndexes: ['ix_price_ticks_symbol', 'ix_ohlc_data_interval'],
    nonHypertables: [],
    warnings: [
      'Some optional indexes are missing - query performance may be affected'
    ]
  }
} as const

/**
 * Invalid schema validation results
 */
export const INVALID_SCHEMA_RESULTS: Record<string, SchemaValidationResult> = {
  missingTables: {
    isValid: false,
    missingTables: ['price_ticks', 'ohlc_data'],
    missingIndexes: [],
    nonHypertables: [],
    warnings: []
  },

  missingIndexes: {
    isValid: false,
    missingTables: [],
    missingIndexes: [
      'ix_price_ticks_symbol_time',
      'ix_price_ticks_time',
      'ix_ohlc_data_symbol_interval_time'
    ],
    nonHypertables: [],
    warnings: []
  },

  notHypertables: {
    isValid: false,
    missingTables: [],
    missingIndexes: [],
    nonHypertables: ['price_ticks', 'ohlc_data'],
    warnings: []
  },

  multipleIssues: {
    isValid: false,
    missingTables: ['ohlc_data'],
    missingIndexes: ['ix_price_ticks_symbol_time'],
    nonHypertables: ['price_ticks'],
    warnings: [
      'TimescaleDB extension version is outdated',
      'Database has insufficient disk space'
    ]
  }
} as const

/**
 * Sample hypertable information
 */
export const SAMPLE_HYPERTABLES: readonly HypertableInfo[] = [
  {
    tableName: 'price_ticks',
    schemaName: 'public',
    timeColumn: 'time',
    chunkTimeInterval: '1 day',
    numDimensions: 1,
    numChunks: 30,
    compressionEnabled: false,
    tableSizeBytes: 1073741824, // 1GB
    createdAt: new Date('2024-01-01T00:00:00.000Z')
  },
  {
    tableName: 'ohlc_data',
    schemaName: 'public',
    timeColumn: 'time',
    chunkTimeInterval: '7 days',
    numDimensions: 2, // time + interval_duration
    numChunks: 8,
    compressionEnabled: true,
    tableSizeBytes: 268435456, // 256MB
    createdAt: new Date('2024-01-01T00:00:00.000Z')
  }
] as const

/**
 * Sample index information
 */
export const SAMPLE_INDEXES: readonly IndexInfo[] = [
  {
    indexName: 'price_ticks_pkey',
    tableName: 'price_ticks',
    columns: ['symbol', 'time'],
    isUnique: true,
    isPartial: false,
    sizeBytes: 67108864, // 64MB
    definition: 'CREATE UNIQUE INDEX price_ticks_pkey ON price_ticks USING btree (symbol, "time")'
  },
  {
    indexName: 'ix_price_ticks_symbol_time',
    tableName: 'price_ticks',
    columns: ['symbol', 'time'],
    isUnique: false,
    isPartial: false,
    sizeBytes: 33554432, // 32MB
    definition: 'CREATE INDEX ix_price_ticks_symbol_time ON price_ticks USING btree (symbol, "time" DESC)'
  },
  {
    indexName: 'ix_price_ticks_time',
    tableName: 'price_ticks',
    columns: ['time'],
    isUnique: false,
    isPartial: false,
    sizeBytes: 16777216, // 16MB
    definition: 'CREATE INDEX ix_price_ticks_time ON price_ticks USING btree ("time" DESC)'
  },
  {
    indexName: 'ohlc_data_pkey',
    tableName: 'ohlc_data',
    columns: ['symbol', 'interval_duration', 'time'],
    isUnique: true,
    isPartial: false,
    sizeBytes: 8388608, // 8MB
    definition: 'CREATE UNIQUE INDEX ohlc_data_pkey ON ohlc_data USING btree (symbol, interval_duration, "time")'
  }
] as const

/**
 * Sample retention policies
 */
export const SAMPLE_RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    hypertableName: 'price_ticks',
    retentionPeriod: '90 days',
    isActive: true,
    nextExecution: new Date('2024-02-01T00:00:00.000Z'),
    lastExecution: new Date('2024-01-15T00:00:00.000Z')
  },
  {
    hypertableName: 'ohlc_data',
    retentionPeriod: '1 year',
    isActive: true,
    nextExecution: new Date('2024-02-01T00:00:00.000Z'),
    lastExecution: new Date('2024-01-15T00:00:00.000Z')
  }
] as const

/**
 * Complete schema information samples
 */
export const SCHEMA_INFO_SAMPLES: Record<string, SchemaInfo> = {
  complete: {
    version: '2.12.1',
    hypertables: SAMPLE_HYPERTABLES,
    indexes: SAMPLE_INDEXES,
    compressionEnabled: true,
    retentionPolicies: SAMPLE_RETENTION_POLICIES,
    validatedAt: new Date('2024-01-15T10:00:00.000Z')
  },

  minimal: {
    version: '2.11.0',
    hypertables: SAMPLE_HYPERTABLES[0] ? [SAMPLE_HYPERTABLES[0]] : [], // Only price_ticks if available
    indexes: SAMPLE_INDEXES.filter(idx => idx.tableName === 'price_ticks'),
    compressionEnabled: false,
    retentionPolicies: [],
    validatedAt: new Date('2024-01-15T10:00:00.000Z')
  },

  empty: {
    version: '2.12.1',
    hypertables: [],
    indexes: [],
    compressionEnabled: false,
    retentionPolicies: [],
    validatedAt: new Date('2024-01-15T10:00:00.000Z')
  }
} as const

/**
 * Database metadata row samples (raw database results)
 */
export const DATABASE_METADATA_ROWS = {
  hypertableRows: [
    {
      hypertable_name: 'price_ticks',
      hypertable_schema: 'public',
      num_dimensions: 1,
      num_chunks: 30,
      compression_enabled: false,
      table_size: '1073741824',
      created: new Date('2024-01-01T00:00:00.000Z')
    },
    {
      hypertable_name: 'ohlc_data',
      hypertable_schema: 'public',
      num_dimensions: 2,
      num_chunks: 8,
      compression_enabled: true,
      table_size: '268435456',
      created: new Date('2024-01-01T00:00:00.000Z')
    }
  ] as HypertableMetadataRow[],

  indexRows: [
    {
      indexname: 'price_ticks_pkey',
      tablename: 'price_ticks',
      schemaname: 'public',
      indexdef: 'CREATE UNIQUE INDEX price_ticks_pkey ON price_ticks USING btree (symbol, "time")',
      size: '67108864'
    },
    {
      indexname: 'ix_price_ticks_symbol_time',
      tablename: 'price_ticks',
      schemaname: 'public',
      indexdef: 'CREATE INDEX ix_price_ticks_symbol_time ON price_ticks USING btree (symbol, "time" DESC)',
      size: '33554432'
    }
  ] as IndexMetadataRow[],

  chunkRows: [
    {
      chunk_name: '_timescaledb_internal._hyper_1_1_chunk',
      hypertable_name: 'price_ticks',
      range_start: new Date('2024-01-01T00:00:00.000Z'),
      range_end: new Date('2024-01-02T00:00:00.000Z'),
      size_bytes: 35651584, // ~34MB
      compressed_chunk_id: null,
      num_rows: 86400 // 1 per second for 24 hours
    },
    {
      chunk_name: '_timescaledb_internal._hyper_1_2_chunk',
      hypertable_name: 'price_ticks',
      range_start: new Date('2024-01-02T00:00:00.000Z'),
      range_end: new Date('2024-01-03T00:00:00.000Z'),
      size_bytes: 33554432, // 32MB
      compressed_chunk_id: 1001,
      num_rows: 86400
    }
  ] as ChunkMetadataRow[]
} as const

/**
 * Health check result samples
 */
export const HEALTH_CHECK_SAMPLES: Record<string, HealthCheckResult> = {
  healthy: {
    isHealthy: true,
    responseTimeMs: 45,
    version: '2.12.1',
    database: 'timescale_prod',
    connection: {
      host: 'localhost',
      port: 5432,
      ssl: false
    },
    timestamp: new Date('2024-01-15T10:00:00.000Z')
  },

  slow: {
    isHealthy: true,
    responseTimeMs: 2500,
    version: '2.12.1',
    database: 'timescale_prod',
    connection: {
      host: 'remote.timescale.com',
      port: 5432,
      ssl: true
    },
    timestamp: new Date('2024-01-15T10:00:00.000Z')
  },

  unhealthy: {
    isHealthy: false,
    responseTimeMs: 0,
    connection: {
      host: 'localhost',
      port: 5432,
      ssl: false
    },
    errors: [
      'Connection refused',
      'TimescaleDB extension not available'
    ],
    timestamp: new Date('2024-01-15T10:00:00.000Z')
  },

  partialFailure: {
    isHealthy: false,
    responseTimeMs: 150,
    version: '2.12.1',
    database: 'timescale_test',
    connection: {
      host: 'localhost',
      port: 5432,
      ssl: false
    },
    errors: [
      'Some hypertables are missing required indexes'
    ],
    timestamp: new Date('2024-01-15T10:00:00.000Z')
  }
} as const

/**
 * Schema creation SQL samples for testing
 */
export const SCHEMA_SQL_SAMPLES = {
  createPriceTicksTable: `
    CREATE TABLE IF NOT EXISTS price_ticks (
      time TIMESTAMPTZ NOT NULL,
      symbol TEXT NOT NULL,
      price NUMERIC NOT NULL CHECK (price > 0),
      volume NUMERIC CHECK (volume >= 0),
      exchange TEXT,
      data_source TEXT,
      bid_price NUMERIC,
      ask_price NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (symbol, time)
    );
  `,

  createOhlcTable: `
    CREATE TABLE IF NOT EXISTS ohlc_data (
      time TIMESTAMPTZ NOT NULL,
      symbol TEXT NOT NULL,
      interval_duration TEXT NOT NULL,
      open NUMERIC NOT NULL CHECK (open > 0),
      high NUMERIC NOT NULL CHECK (high > 0),
      low NUMERIC NOT NULL CHECK (low > 0),
      close NUMERIC NOT NULL CHECK (close > 0),
      volume NUMERIC CHECK (volume >= 0),
      price_change NUMERIC,
      price_change_percent NUMERIC,
      data_source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (symbol, interval_duration, time)
    );
  `,

  createHypertables: `
    SELECT create_hypertable('price_ticks', 'time', if_not_exists => true);
    SELECT create_hypertable('ohlc_data', 'time', if_not_exists => true);
  `,

  createIndexes: `
    CREATE INDEX IF NOT EXISTS ix_price_ticks_symbol_time 
    ON price_ticks (symbol, time DESC);
    
    CREATE INDEX IF NOT EXISTS ix_price_ticks_time 
    ON price_ticks (time DESC);
    
    CREATE INDEX IF NOT EXISTS ix_ohlc_data_symbol_interval_time 
    ON ohlc_data (symbol, interval_duration, time DESC);
  `,

  enableCompression: `
    ALTER TABLE price_ticks SET (timescaledb.compress);
    ALTER TABLE ohlc_data SET (timescaledb.compress);
    
    SELECT add_compression_policy('price_ticks', INTERVAL '7 days');
    SELECT add_compression_policy('ohlc_data', INTERVAL '30 days');
  `,

  addRetentionPolicies: `
    SELECT add_retention_policy('price_ticks', INTERVAL '90 days');
    SELECT add_retention_policy('ohlc_data', INTERVAL '1 year');
  `
} as const

/**
 * Schema migration scenarios
 */
export const MIGRATION_SCENARIOS = {
  initialSetup: {
    description: 'First-time database setup',
    requiredSteps: [
      'create_tables',
      'create_hypertables', 
      'create_indexes'
    ],
    expectedTables: ['price_ticks', 'ohlc_data'],
    expectedIndexes: 4
  },

  addCompression: {
    description: 'Enable compression on existing hypertables',
    requiredSteps: [
      'enable_compression',
      'add_compression_policies'
    ],
    prerequisite: 'hypertables_exist',
    expectedChange: 'compression_enabled'
  },

  addRetention: {
    description: 'Add data retention policies',
    requiredSteps: [
      'add_retention_policies'
    ],
    prerequisite: 'hypertables_exist',
    expectedPolicies: 2
  },

  upgradeSchema: {
    description: 'Upgrade existing schema to new version',
    requiredSteps: [
      'add_missing_columns',
      'create_missing_indexes',
      'update_constraints'
    ],
    fromVersion: '1.0.0',
    toVersion: '1.1.0'
  }
} as const

/**
 * Helper functions for schema testing
 */
export class SchemaTestHelpers {
  
  /**
   * Create a mock schema validation result
   */
  static createSchemaValidation(
    isValid: boolean,
    overrides: Partial<SchemaValidationResult> = {}
  ): SchemaValidationResult {
    return {
      isValid,
      missingTables: isValid ? [] : ['price_ticks'],
      missingIndexes: isValid ? [] : ['ix_price_ticks_symbol_time'],
      nonHypertables: isValid ? [] : ['price_ticks'],
      warnings: [],
      ...overrides
    }
  }

  /**
   * Create mock hypertable information
   */
  static createHypertableInfo(
    tableName: string,
    overrides: Partial<HypertableInfo> = {}
  ): HypertableInfo {
    return {
      tableName,
      schemaName: 'public',
      timeColumn: 'time',
      chunkTimeInterval: '1 day',
      numDimensions: 1,
      numChunks: 10,
      compressionEnabled: false,
      tableSizeBytes: 1073741824,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides
    }
  }

  /**
   * Create mock index information
   */
  static createIndexInfo(
    indexName: string,
    tableName: string,
    overrides: Partial<IndexInfo> = {}
  ): IndexInfo {
    return {
      indexName,
      tableName,
      columns: ['time'],
      isUnique: false,
      isPartial: false,
      sizeBytes: 16777216,
      definition: `CREATE INDEX ${indexName} ON ${tableName} USING btree ("time" DESC)`,
      ...overrides
    }
  }

  /**
   * Create a complete schema info object
   */
  static createSchemaInfo(
    overrides: Partial<SchemaInfo> = {}
  ): SchemaInfo {
    return {
      version: '2.12.1',
      hypertables: [this.createHypertableInfo('price_ticks')],
      indexes: [this.createIndexInfo('ix_price_ticks_time', 'price_ticks')],
      compressionEnabled: false,
      retentionPolicies: [],
      validatedAt: new Date(),
      ...overrides
    }
  }

  /**
   * Create a health check result
   */
  static createHealthCheck(
    isHealthy: boolean,
    overrides: Partial<HealthCheckResult> = {}
  ): HealthCheckResult {
    return {
      isHealthy,
      responseTimeMs: isHealthy ? 50 : 0,
      version: isHealthy ? '2.12.1' : undefined,
      database: isHealthy ? 'test_db' : undefined,
      connection: {
        host: 'localhost',
        port: 5432,
        ssl: false
      },
      errors: isHealthy ? undefined : ['Connection failed'],
      timestamp: new Date(),
      ...overrides
    }
  }
}

/**
 * Schema validation test cases
 */
export const SCHEMA_VALIDATION_TESTS = [
  {
    name: 'should pass with complete valid schema',
    result: VALID_SCHEMA_RESULTS.completeValid,
    expectedValid: true
  },
  {
    name: 'should pass with warnings',
    result: VALID_SCHEMA_RESULTS.validWithWarnings,
    expectedValid: true,
    expectedWarnings: 2
  },
  {
    name: 'should fail with missing tables',
    result: INVALID_SCHEMA_RESULTS.missingTables,
    expectedValid: false,
    expectedMissingTables: 2
  },
  {
    name: 'should fail with missing indexes',
    result: INVALID_SCHEMA_RESULTS.missingIndexes,
    expectedValid: false,
    expectedMissingIndexes: 3
  },
  {
    name: 'should fail with non-hypertables',
    result: INVALID_SCHEMA_RESULTS.notHypertables,
    expectedValid: false,
    expectedNonHypertables: 2
  }
] as const