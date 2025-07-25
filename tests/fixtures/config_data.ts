/**
 * Test configuration data for TimescaleDB client testing
 *
 * Provides various configuration scenarios for testing client initialization,
 * validation, and different operational modes.
 */

import type { ClientOptions, ConnectionConfig } from '../../src/types/config.ts'
import type { TimescaleClientConfig } from '../../src/client.ts'
import type { BatchError, ConnectionError, QueryError, ValidationError } from '../../src/types/errors.ts'

/**
 * Valid connection configurations for testing
 */
export const VALID_CONNECTIONS: Record<string, ConnectionConfig> = {
  localhost: {
    host: 'localhost',
    port: 5432,
    database: 'timescale_test',
    username: 'postgres',
    password: 'test123',
    ssl: false,
  },

  withSSL: {
    host: 'secure.timescale.com',
    port: 5432,
    database: 'production_db',
    username: 'app_user',
    password: 'secure_password',
    ssl: {
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\ntest_ca_cert\n-----END CERTIFICATE-----',
    },
  },

  connectionString: {
    connectionString: 'postgresql://user:password@localhost:5432/timescale_test?sslmode=disable',
  },

  cloudService: {
    connectionString: 'postgresql://user:password@cloud.timescale.com:5432/tsdb?sslmode=require',
  },

  withPool: {
    host: 'localhost',
    port: 5432,
    database: 'timescale_test',
    username: 'postgres',
    password: 'test123',
    maxConnections: 20,
    maxLifetime: 3600,
    idleTimeout: 300,
    connectTimeout: 10,
  },
} as const

/**
 * Invalid connection configurations for error testing
 */
export const INVALID_CONNECTIONS = {
  missingHost: {
    port: 5432,
    database: 'test',
    username: 'user',
    password: 'pass',
  },

  missingDatabase: {
    host: 'localhost',
    port: 5432,
    username: 'user',
    password: 'pass',
  },

  invalidPort: {
    host: 'localhost',
    port: -1,
    database: 'test',
    username: 'user',
    password: 'pass',
  },

  emptyConnectionString: {
    connectionString: '',
  },

  malformedConnectionString: {
    connectionString: 'not-a-valid-connection-string',
  },

  missingCredentials: {
    host: 'localhost',
    port: 5432,
    database: 'test',
    // Missing username and password
  },
} as const

/**
 * Valid client options for different scenarios
 */
export const VALID_CLIENT_OPTIONS: Record<string, ClientOptions> = {
  default: {
    defaultBatchSize: 1000,
    maxRetries: 3,
    retryBaseDelay: 1000,
    queryTimeout: 30000,
    autoCreateTables: false,
    autoCreateIndexes: true,
    defaultLimit: 1000,
    validateInputs: true,
    collectStats: false,
    timezone: 'UTC',
    useStreaming: true,
    streamingThreshold: 1000,
  },

  development: {
    defaultBatchSize: 100,
    maxRetries: 1,
    retryBaseDelay: 500,
    queryTimeout: 10000,
    autoCreateTables: true,
    autoCreateIndexes: true,
    defaultLimit: 100,
    validateInputs: true,
    collectStats: true,
    timezone: 'UTC',
    useStreaming: false,
    streamingThreshold: 10000,
  },

  production: {
    defaultBatchSize: 5000,
    maxRetries: 5,
    retryBaseDelay: 2000,
    queryTimeout: 60000,
    autoCreateTables: false,
    autoCreateIndexes: false,
    defaultLimit: 1000,
    validateInputs: false, // Skip validation for performance
    collectStats: true,
    timezone: 'UTC',
    useStreaming: true,
    streamingThreshold: 1000,
  },

  testing: {
    defaultBatchSize: 10,
    maxRetries: 0, // No retries for fast test failure
    retryBaseDelay: 100,
    queryTimeout: 5000,
    autoCreateTables: true,
    autoCreateIndexes: true,
    defaultLimit: 50,
    validateInputs: true,
    collectStats: false,
    timezone: 'UTC',
    useStreaming: false,
    streamingThreshold: 10000,
  },

  minimal: {
    validateInputs: false,
    collectStats: false,
  },

  maxPerformance: {
    defaultBatchSize: 10000,
    maxRetries: 0,
    queryTimeout: 120000,
    autoCreateTables: false,
    autoCreateIndexes: false,
    validateInputs: false,
    collectStats: false,
    useStreaming: true,
    streamingThreshold: 100,
  },
} as const

/**
 * Invalid client options for validation testing
 */
export const INVALID_CLIENT_OPTIONS = {
  negativeBatchSize: {
    defaultBatchSize: -100,
  },

  zeroBatchSize: {
    defaultBatchSize: 0,
  },

  oversizedBatchSize: {
    defaultBatchSize: 50000, // Over 10,000 limit
  },

  negativeRetries: {
    maxRetries: -1,
  },

  negativeTimeout: {
    queryTimeout: -1000,
  },

  zeroTimeout: {
    queryTimeout: 0,
  },

  negativeLimit: {
    defaultLimit: -500,
  },

  oversizedLimit: {
    defaultLimit: 50000, // Over 10,000 limit
  },

  invalidTimezone: {
    timezone: 'Invalid/Timezone',
  },
} as const

/**
 * Complete TimescaleClient configurations for integration testing
 */
export const COMPLETE_CONFIGS: Record<string, TimescaleClientConfig> = {
  development: {
    ...VALID_CLIENT_OPTIONS.development,
    autoEnsureSchema: true,
    defaultInterval: '1m',
    enableQueryStats: true,
    errorHandlers: {
      onValidationError: (error: ValidationError) => console.warn('Validation error:', error.message),
      onQueryError: (error: QueryError) => console.error('Query error:', error.message),
      onConnectionError: (error: ConnectionError) => console.error('Connection error:', error.message),
      onBatchError: (error: BatchError) => console.error('Batch error:', error.message),
    },
  },

  production: {
    ...VALID_CLIENT_OPTIONS.production,
    autoEnsureSchema: false,
    defaultInterval: '5m',
    enableQueryStats: true,
  },

  testing: {
    ...VALID_CLIENT_OPTIONS.testing,
    autoEnsureSchema: true,
    defaultInterval: '1m',
    enableQueryStats: false,
  },
} as const

/**
 * Environment variable configurations for testing
 */
export const ENV_CONFIGS = {
  complete: {
    TIMESCALE_CONNECTION_STRING: 'postgresql://user:pass@localhost:5432/test',
    TIMESCALE_DEFAULT_BATCH_SIZE: '1000',
    TIMESCALE_MAX_RETRIES: '3',
    TIMESCALE_QUERY_TIMEOUT: '30000',
    TIMESCALE_VALIDATE_INPUTS: 'true',
    TIMESCALE_AUTO_CREATE_TABLES: 'false',
    TIMESCALE_COLLECT_STATS: 'true',
  },

  minimal: {
    TIMESCALE_CONNECTION_STRING: 'postgresql://localhost/test',
  },

  individual: {
    PGHOST: 'localhost',
    PGPORT: '5432',
    PGDATABASE: 'timescale_test',
    PGUSER: 'postgres',
    PGPASSWORD: 'test123',
  },

  withSSL: {
    TIMESCALE_CONNECTION_STRING: 'postgresql://user:pass@secure.host:5432/db?sslmode=require',
    TIMESCALE_SSL_CA: '/path/to/ca.crt',
    TIMESCALE_SSL_CERT: '/path/to/client.crt',
    TIMESCALE_SSL_KEY: '/path/to/client.key',
  },
} as const

/**
 * Configuration builder scenarios for testing the fluent API
 */
export const BUILDER_SCENARIOS = {
  basic: {
    host: 'localhost',
    database: 'test',
    expectedConfig: {
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: undefined,
      password: undefined,
    },
  },

  withAuth: {
    host: 'localhost',
    database: 'test',
    username: 'user',
    password: 'pass',
    expectedConfig: {
      host: 'localhost',
      port: 5432,
      database: 'test',
      username: 'user',
      password: 'pass',
    },
  },

  withSSL: {
    host: 'secure.host',
    database: 'prod',
    ssl: true,
    expectedConfig: {
      host: 'secure.host',
      port: 5432,
      database: 'prod',
      ssl: true,
    },
  },

  withPool: {
    host: 'localhost',
    database: 'test',
    maxConnections: 20,
    idleTimeout: 300,
    expectedConfig: {
      host: 'localhost',
      port: 5432,
      database: 'test',
      max: 20,
      idleTimeout: 300,
    },
  },
} as const

/**
 * Preset configuration scenarios
 */
export const PRESET_SCENARIOS = {
  development: {
    database: 'dev_db',
    expectedOptions: {
      autoCreateTables: true,
      validateInputs: true,
      collectStats: true,
      maxRetries: 3,
    },
  },

  production: {
    connectionString: 'postgresql://prod_user:secret@prod.host:5432/prod_db',
    expectedOptions: {
      autoCreateTables: false,
      validateInputs: false,
      collectStats: true,
      maxRetries: 5,
      ssl: true,
    },
  },

  testing: {
    database: 'test_db',
    expectedOptions: {
      autoCreateTables: true,
      validateInputs: true,
      collectStats: false,
      maxRetries: 1,
    },
  },

  cloud: {
    connectionString: 'postgresql://cloud_user:token@cloud.timescale.com:5432/tsdb',
    expectedOptions: {
      ssl: true,
      maxRetries: 5,
      queryTimeout: 60000,
    },
  },
} as const

/**
 * Helper function to create test connection configurations
 */
export function createTestConnectionConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    host: 'localhost',
    port: 5432,
    database: 'timescale_test',
    username: 'postgres',
    password: 'test123',
    ssl: false,
    ...overrides,
  }
}

/**
 * Helper function to create test client options
 */
export function createTestClientOptions(overrides: Partial<ClientOptions> = {}): ClientOptions {
  return {
    defaultBatchSize: 100,
    maxRetries: 1,
    retryBaseDelay: 100,
    queryTimeout: 5000,
    autoCreateTables: true,
    autoCreateIndexes: true,
    defaultLimit: 100,
    validateInputs: true,
    collectStats: false,
    timezone: 'UTC',
    useStreaming: false,
    streamingThreshold: 1000,
    ...overrides,
  }
}

/**
 * Helper function to create complete test configurations
 */
export function createTestConfig(
  connectionOverrides: Partial<ConnectionConfig> = {},
  clientOverrides: Partial<TimescaleClientConfig> = {},
): { connectionConfig: ConnectionConfig; clientOptions: TimescaleClientConfig } {
  return {
    connectionConfig: createTestConnectionConfig(connectionOverrides),
    clientOptions: {
      ...createTestClientOptions(),
      autoEnsureSchema: true,
      defaultInterval: '1m',
      enableQueryStats: false,
      ...clientOverrides,
    },
  }
}

/**
 * Mock logger for testing
 */
export const MOCK_LOGGER = {
  debug: (message: string, ...args: unknown[]) => console.debug(`[DEBUG] ${message}`, ...args),
  info: (message: string, ...args: unknown[]) => console.info(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${message}`, ...args),
} as const

/**
 * Configuration validation test cases
 */
export const VALIDATION_TEST_CASES = [
  {
    name: 'valid minimal config',
    config: { validateInputs: true },
    shouldPass: true,
  },
  {
    name: 'valid complete config',
    config: VALID_CLIENT_OPTIONS.default,
    shouldPass: true,
  },
  {
    name: 'invalid batch size - negative',
    config: { defaultBatchSize: -100 },
    shouldPass: false,
    expectedError: 'defaultBatchSize',
  },
  {
    name: 'invalid batch size - too large',
    config: { defaultBatchSize: 50000 },
    shouldPass: false,
    expectedError: 'defaultBatchSize',
  },
  {
    name: 'invalid retries - negative',
    config: { maxRetries: -1 },
    shouldPass: false,
    expectedError: 'maxRetries',
  },
  {
    name: 'invalid timeout - negative',
    config: { queryTimeout: -1000 },
    shouldPass: false,
    expectedError: 'queryTimeout',
  },
  {
    name: 'invalid limit - too large',
    config: { defaultLimit: 50000 },
    shouldPass: false,
    expectedError: 'defaultLimit',
  },
] as const
