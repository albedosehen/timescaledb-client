/**
 * Configuration interfaces for TimescaleDB client initialization
 * 
 * These interfaces define how clients can be configured for different deployment
 * scenarios while maintaining security and performance best practices.
 */

/**
 * SSL configuration options
 */
export interface SSLConfig {
  /** Whether to reject unauthorized SSL certificates (default: true in production) */
  readonly rejectUnauthorized?: boolean
  
  /** Certificate Authority certificate */
  readonly ca?: string
  
  /** Client certificate */
  readonly cert?: string
  
  /** Client private key */
  readonly key?: string
  
  /** SSL mode preference */
  readonly mode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'
}

/**
 * Connection configuration options
 * 
 * Supports both connection string and individual parameter approaches
 */
export interface ConnectionConfig {
  /** Complete PostgreSQL connection string (takes precedence over individual params) */
  readonly connectionString?: string
  
  /** Database host(s) - can be string or array for multiple hosts */
  readonly host?: string | string[]
  
  /** Database port(s) - can be number or array for multiple ports */
  readonly port?: number | number[]
  
  /** Unix socket path (alternative to host/port) */
  readonly path?: string
  
  /** Database name */
  readonly database?: string
  
  /** Username for authentication */
  readonly username?: string
  
  /** Password for authentication (can be async function for dynamic passwords) */
  readonly password?: string | (() => Promise<string>)
  
  /** SSL configuration */
  readonly ssl?: boolean | SSLConfig
  
  /** Maximum number of connections in pool (default: 10) */
  readonly maxConnections?: number
  
  /** Maximum connection lifetime in seconds (default: null - no limit) */
  readonly maxLifetime?: number | null
  
  /** Idle connection timeout in seconds (default: 0 - keep alive) */
  readonly idleTimeout?: number
  
  /** Connection timeout in seconds (default: 30) */
  readonly connectTimeout?: number
  
  /** Application name for connection identification */
  readonly applicationName?: string
  
  /** Enable debug logging */
  readonly debug?: boolean
  
  /** Custom notice handler (default: console.log if debug=true) */
  readonly onNotice?: (notice: string) => void
  
  /** Custom parameter change handler */
  readonly onParameter?: (key: string, value: string) => void
  
  /** Transform functions for data handling */
  readonly transform?: {
    /** How to handle undefined values (default: null) */
    readonly undefined?: null | undefined
    /** Column name transformation */
    readonly column?: (column: string) => string
    /** Value transformation */
    readonly value?: (value: unknown) => unknown
    /** Row transformation */
    readonly row?: (row: Record<string, unknown>) => Record<string, unknown>
  }
  
  /** Target session attributes for read/write routing */
  readonly targetSessionAttrs?: 'any' | 'read-write' | 'read-only' | 'primary' | 'standby' | 'prefer-standby'
  
  /** Whether to fetch types on connect (default: true) */
  readonly fetchTypes?: boolean
  
  /** Whether to use prepared statements (default: true) */
  readonly prepare?: boolean
}

/**
 * Client behavior configuration options
 */
export interface ClientOptions {
  /** Default batch size for bulk operations (default: 1000, max: 10000) */
  readonly defaultBatchSize?: number
  
  /** Maximum number of retry attempts for failed operations (default: 3) */
  readonly maxRetries?: number
  
  /** Base delay for retry backoff in milliseconds (default: 1000) */
  readonly retryBaseDelay?: number
  
  /** Default query timeout in milliseconds (default: 30000) */
  readonly queryTimeout?: number
  
  /** Whether to automatically create required hypertables (default: false) */
  readonly autoCreateTables?: boolean
  
  /** Whether to automatically create indexes (default: true) */
  readonly autoCreateIndexes?: boolean
  
  /** Default time range limit for queries (default: 1000, max: 10000) */
  readonly defaultLimit?: number
  
  /** Whether to validate input data (default: true) */
  readonly validateInputs?: boolean
  
  /** Whether to collect query statistics (default: false) */
  readonly collectStats?: boolean
  
  /** Custom logger implementation */
  readonly logger?: Logger
  
  /** Timezone for timestamp handling (default: 'UTC') */
  readonly timezone?: string
  
  /** Whether to use streaming for large result sets (default: true for >1000 rows) */
  readonly useStreaming?: boolean
  
  /** Threshold for switching to streaming mode (default: 1000 rows) */
  readonly streamingThreshold?: number
}

/**
 * Logger interface for custom logging implementations
 */
export interface Logger {
  /** Log debug-level messages with optional metadata */
  debug(message: string, meta?: Record<string, unknown>): void
  /** Log info-level messages with optional metadata */
  info(message: string, meta?: Record<string, unknown>): void
  /** Log warning-level messages with optional metadata */
  warn(message: string, meta?: Record<string, unknown>): void
  /** Log error-level messages with optional error object and metadata */
  error(message: string, error?: Error, meta?: Record<string, unknown>): void
}

/**
 * Environment variable names for configuration
 */
export const ENV_VARS = {
  CONNECTION_STRING: 'TIMESCALE_CONNECTION_STRING',
  HOST: 'PGHOST',
  PORT: 'PGPORT', 
  DATABASE: 'PGDATABASE',
  USERNAME: 'PGUSER',
  PASSWORD: 'PGPASSWORD',
  SSL_MODE: 'PGSSLMODE',
  SSL_CERT: 'PGSSLCERT',
  SSL_KEY: 'PGSSLKEY',
  SSL_ROOT_CERT: 'PGSSLROOTCERT',
  APPLICATION_NAME: 'PGAPPNAME',
  CONNECT_TIMEOUT: 'PGCONNECT_TIMEOUT',
  DEBUG: 'TIMESCALE_DEBUG'
} as const

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<ConnectionConfig, 'connectionString' | 'password' | 'onNotice' | 'onParameter'>> = {
  host: 'localhost',
  port: 5432,
  path: '',
  database: 'postgres',
  username: 'postgres',
  ssl: false,
  maxConnections: 10,
  maxLifetime: null,
  idleTimeout: 0,
  connectTimeout: 30,
  applicationName: 'timescaledb-client',
  debug: false,
  transform: {
    undefined: null
  },
  targetSessionAttrs: 'any',
  fetchTypes: true,
  prepare: true
} as const

/**
 * Default client options
 */
export const DEFAULT_CLIENT_OPTIONS: Required<Omit<ClientOptions, 'logger'>> = {
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
  streamingThreshold: 1000
} as const

/**
 * Mutable version of ConnectionConfig for internal builder use
 */
type MutableConnectionConfig = {
  -readonly [K in keyof ConnectionConfig]: ConnectionConfig[K]
}

/**
 * Mutable version of ClientOptions for internal builder use
 */
type MutableClientOptions = {
  -readonly [K in keyof ClientOptions]: ClientOptions[K]
}

/**
 * Configuration builder for fluent API
 */
export class ConfigBuilder {
  private config: Partial<MutableConnectionConfig> = {}
  private options: Partial<MutableClientOptions> = {}

  /** Create a new ConfigBuilder instance */
  static create(): ConfigBuilder {
    return new ConfigBuilder()
  }

  /**
   * Set connection string
   */
  connectionString(connectionString: string): this {
    this.config.connectionString = connectionString
    return this
  }

  /**
   * Set host and port
   */
  host(host: string, port = 5432): this {
    this.config.host = host
    this.config.port = port
    return this
  }

  /**
   * Set database name
   */
  database(database: string): this {
    this.config.database = database
    return this
  }

  /**
   * Set authentication credentials
   */
  auth(username: string, password: string | (() => Promise<string>)): this {
    this.config.username = username
    this.config.password = password
    return this
  }

  /**
   * Enable SSL with optional configuration
   */
  ssl(sslConfig: boolean | SSLConfig = true): this {
    this.config.ssl = sslConfig
    return this
  }

  /**
   * Set connection pool configuration
   */
  pool(maxConnections: number, maxLifetime?: number, idleTimeout?: number): this {
    this.config.maxConnections = maxConnections
    if (maxLifetime !== undefined) this.config.maxLifetime = maxLifetime
    if (idleTimeout !== undefined) this.config.idleTimeout = idleTimeout
    return this
  }

  /**
   * Enable debug mode
   */
  debug(enable = true): this {
    this.config.debug = enable
    return this
  }

  /**
   * Set client options
   */
  clientOptions(options: Partial<ClientOptions>): this {
    this.options = { ...this.options, ...options }
    return this
  }

  /**
   * Build the final configuration
   */
  build(): { connectionConfig: ConnectionConfig; clientOptions: ClientOptions } {
    return {
      connectionConfig: { ...DEFAULT_CONFIG, ...this.config } as ConnectionConfig,
      clientOptions: { ...DEFAULT_CLIENT_OPTIONS, ...this.options } as ClientOptions
    }
  }
}

/**
 * Factory function for common configuration patterns
 */
export class ConfigPresets {
  /**
   * Development configuration with debug enabled
   */
  static development(database = 'timescale_dev'): ConfigBuilder {
    return ConfigBuilder.create()
      .host('localhost')
      .database(database)
      .auth('postgres', 'password')
      .debug(true)
      .clientOptions({
        autoCreateTables: true,
        validateInputs: true,
        collectStats: true
      })
  }

  /**
   * Production configuration with SSL and optimizations
   */
  static production(connectionString: string): ConfigBuilder {
    return ConfigBuilder.create()
      .connectionString(connectionString)
      .ssl({
        rejectUnauthorized: true,
        mode: 'require'
      })
      .pool(20, 3600, 300) // 20 connections, 1h lifetime, 5m idle timeout
      .clientOptions({
        maxRetries: 5,
        queryTimeout: 60000,
        validateInputs: true,
        collectStats: false
      })
  }

  /**
   * Testing configuration with minimal setup
   */
  static testing(database = 'timescale_test'): ConfigBuilder {
    return ConfigBuilder.create()
      .host('localhost')
      .database(database)
      .auth('postgres', 'test')
      .pool(5) // Smaller pool for tests
      .clientOptions({
        autoCreateTables: true,
        validateInputs: true,
        maxRetries: 1,
        queryTimeout: 10000
      })
  }

  /**
   * Cloud configuration for hosted TimescaleDB
   */
  static cloud(connectionString: string): ConfigBuilder {
    return ConfigBuilder.create()
      .connectionString(connectionString)
      .ssl(true)
      .pool(15, 1800) // 15 connections, 30m lifetime
      .clientOptions({
        maxRetries: 3,
        retryBaseDelay: 2000,
        queryTimeout: 45000
      })
  }
}