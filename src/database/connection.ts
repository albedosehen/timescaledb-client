/**
 * Core database connection management for TimescaleDB client
 *
 * Provides connection configuration, validation, and initialization
 * with comprehensive SSL support and error handling.
 */

// TODO(module): Replace with proper postgres.js import when module resolution is fixed
// import postgres from 'postgres'
const postgres = (() => {
  throw new Error('postgres.js not available - this is a placeholder implementation')
}) as (config: Record<string, unknown>) => SqlInstance
import type { ConnectionConfig, SSLConfig, Logger } from '../types/config.ts'
import type { SqlInstance } from '../types/internal.ts'
import {
  ConnectionError,
  ConfigurationError,
  ValidationError
} from '../types/errors.ts'

/**
 * Connection string parser result
 */
interface ParsedConnectionString {
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl?: boolean
  sslmode?: string | undefined
  "application_name"?: string | undefined
}

/**
 * Database connection manager
 *
 * Handles connection configuration, validation, and initialization
 * with support for both connection strings and individual parameters.
 */
export class DatabaseConnection {
  private sql: SqlInstance | null = null
  private readonly config: ConnectionConfig
  private readonly logger?: Logger | undefined

  constructor(config: ConnectionConfig, logger?: Logger | undefined) {
    this.config = { ...config }
    this.logger = logger
    this.validateConfiguration()
  }

  /**
   * Initialize the database connection
   */
  async connect(): Promise<SqlInstance> {
    try {
      if (this.sql) {
        this.logger?.debug('Reusing existing connection')
        return this.sql as SqlInstance
      }

      this.logger?.debug('Initializing new database connection')
      const postgresConfig = await this.buildPostgresConfig()
      
      this.sql = postgres(postgresConfig)
      
      // Test the connection
      await this.testConnection()
      
      this.logger?.info('Database connection established successfully')
      return this.sql as SqlInstance
    } catch (error) {
      const connectionError = new ConnectionError(
        'Failed to establish database connection',
        error instanceof Error ? error : new Error(String(error)),
        { config: this.sanitizeConfig() }
      )
      this.logger?.error('Connection failed', connectionError)
      throw connectionError
    }
  }

  /**
   * Close the database connection
   */
  async disconnect(): Promise<void> {
    if (this.sql) {
      try {
        this.logger?.debug('Closing database connection')
        await this.sql.end()
        this.sql = null
        this.logger?.info('Database connection closed')
      } catch (error) {
        this.logger?.error('Error closing connection', error instanceof Error ? error : new Error(String(error)))
        throw new ConnectionError(
          'Failed to close database connection',
          error instanceof Error ? error : new Error(String(error))
        )
      }
    }
  }

  /**
   * Get the current SQL instance (throws if not connected)
   */
  getSql(): SqlInstance {
    if (!this.sql) {
      throw new ConnectionError('Database connection not established. Call connect() first.')
    }
    return this.sql as SqlInstance
  }

  /**
   * Check if connection is active
   */
  isConnected(): boolean {
    return this.sql !== null
  }

  /**
   * Test the connection by executing a simple query
   */
  async testConnection(): Promise<void> {
    if (!this.sql) {
      throw new ConnectionError('No connection to test')
    }

    try {
      this.logger?.debug('Testing database connection')
      const result = await this.sql`SELECT 1 as test, version() as version`
      
      if (!result || result.length === 0) {
        throw new ConnectionError('Invalid connection test response')
      }

      this.logger?.debug('Connection test successful', { version: result[0]?.version })
    } catch (error) {
      throw new ConnectionError(
        'Connection test failed',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Validate TimescaleDB extension availability
   */
  async validateTimescaleDB(): Promise<void> {
    if (!this.sql) {
      throw new ConnectionError('No connection available for TimescaleDB validation')
    }

    try {
      this.logger?.debug('Validating TimescaleDB extension')
      
      // Check if TimescaleDB extension is installed
      const extensionResult = await this.sql`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
        ) as installed
      `

      if (!extensionResult[0]?.installed) {
        throw new ConfigurationError(
          'TimescaleDB extension is not installed',
          'timescaledb_extension',
          false
        )
      }

      // Get TimescaleDB version
      const versionResult = await this.sql`SELECT timescaledb_version()`
      const version = versionResult[0]?.timescaledb_version

      this.logger?.info('TimescaleDB validation successful', { version })
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error
      }
      throw new ConfigurationError(
        'Failed to validate TimescaleDB extension',
        'timescaledb_validation',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  /**
   * Build postgres.js configuration from connection config
   */
  private async buildPostgresConfig(): Promise<Record<string, unknown>> {
    // If connection string is provided, parse it first
    if (this.config.connectionString) {
      const parsed = this.parseConnectionString(this.config.connectionString)
      return this.buildConfigFromParsed(parsed)
    }

    // Build from individual parameters
    return await this.buildConfigFromParameters()
  }

  /**
   * Build config from parsed connection string
   */
  private buildConfigFromParsed(parsed: ParsedConnectionString): Record<string, unknown> {
    const config: Record<string, unknown> = {}

    // Connection parameters
    if (parsed.host) config.host = parsed.host
    if (parsed.port) config.port = parsed.port
    if (parsed.database) config.database = parsed.database
    if (parsed.username) config.username = parsed.username
    if (parsed.password) config.password = parsed.password

    // SSL configuration
    if (parsed.ssl !== undefined || parsed.sslmode) {
      config.ssl = this.buildSSLConfig(parsed.ssl, parsed.sslmode)
    }

    // Additional configuration
    if (parsed.application_name) config.application_name = parsed.application_name

    // Apply pool and other settings from config
    this.applyAdditionalConfig(config)

    return config
  }

  /**
   * Build config from individual parameters
   */
  private async buildConfigFromParameters(): Promise<Record<string, unknown>> {
    const config: Record<string, unknown> = {}

    // Basic connection parameters
    if (this.config.host) config.host = this.config.host
    if (this.config.port) config.port = this.config.port
    if (this.config.path) config.path = this.config.path
    if (this.config.database) config.database = this.config.database
    if (this.config.username) config.username = this.config.username

    // Handle password (can be async function)
    if (this.config.password) {
      if (typeof this.config.password === 'function') {
        try {
          config.password = await this.config.password()
        } catch (error) {
          throw new ConfigurationError(
            'Failed to retrieve password from function',
            'password',
            error instanceof Error ? error.message : String(error)
          )
        }
      } else {
        config.password = this.config.password
      }
    }

    // SSL configuration
    if (this.config.ssl !== undefined) {
      config.ssl = this.buildSSLConfigFromObject(this.config.ssl)
    }

    // Apply additional configuration
    this.applyAdditionalConfig(config)

    return config
  }

  /**
   * Apply additional configuration options
   */
  private applyAdditionalConfig(config: Record<string, unknown>): void {
    // Pool configuration
    if (this.config.maxConnections) config.max = this.config.maxConnections
    if (this.config.maxLifetime !== undefined) config.max_lifetime = this.config.maxLifetime
    if (this.config.idleTimeout !== undefined) config.idle_timeout = this.config.idleTimeout
    if (this.config.connectTimeout) config.connect_timeout = this.config.connectTimeout

    // Application settings
    if (this.config.applicationName) config.application_name = this.config.applicationName
    if (this.config.debug) config.debug = this.config.debug

    // Transform settings
    if (this.config.transform) config.transform = this.config.transform

    // Session attributes
    if (this.config.targetSessionAttrs) config.target_session_attrs = this.config.targetSessionAttrs

    // Prepared statements
    if (this.config.prepare !== undefined) config.prepare = this.config.prepare
    if (this.config.fetchTypes !== undefined) config.fetch_types = this.config.fetchTypes

    // Event handlers
    if (this.config.onNotice) config.onnotice = this.config.onNotice
    if (this.config.onParameter) config.onparameter = this.config.onParameter
  }

  /**
   * Build SSL configuration from boolean and mode
   */
  private buildSSLConfig(ssl?: boolean, sslmode?: string): boolean | Record<string, unknown> {
    if (ssl === false) return false
    if (ssl === true && !sslmode) return true

    const sslConfig: Record<string, unknown> = {}
    
    if (sslmode) {
      switch (sslmode) {
        case 'disable':
          return false
        case 'allow':
        case 'prefer':
          sslConfig.rejectUnauthorized = false
          break
        case 'require':
          sslConfig.rejectUnauthorized = false
          break
        case 'verify-ca':
        case 'verify-full':
          sslConfig.rejectUnauthorized = true
          break
      }
    }

    return Object.keys(sslConfig).length > 0 ? sslConfig : true
  }

  /**
   * Build SSL configuration from SSLConfig object
   */
  private buildSSLConfigFromObject(ssl: boolean | SSLConfig): boolean | Record<string, unknown> {
    if (typeof ssl === 'boolean') {
      return ssl
    }

    const sslConfig: Record<string, unknown> = {}

    if (ssl.rejectUnauthorized !== undefined) {
      sslConfig.rejectUnauthorized = ssl.rejectUnauthorized
    }
    if (ssl.ca) sslConfig.ca = ssl.ca
    if (ssl.cert) sslConfig.cert = ssl.cert
    if (ssl.key) sslConfig.key = ssl.key

    // Handle SSL mode
    if (ssl.mode) {
      switch (ssl.mode) {
        case 'disable':
          return false
        case 'allow':
        case 'prefer':
          sslConfig.rejectUnauthorized = false
          break
        case 'require':
          if (sslConfig.rejectUnauthorized === undefined) {
            sslConfig.rejectUnauthorized = false
          }
          break
        case 'verify-ca':
        case 'verify-full':
          sslConfig.rejectUnauthorized = true
          break
      }
    }

    return Object.keys(sslConfig).length > 0 ? sslConfig : true
  }

  /**
   * Parse connection string into components
   */
  private parseConnectionString(connectionString: string): ParsedConnectionString {
    try {
      const url = new URL(connectionString)
      const parsed: Partial<ParsedConnectionString> = {}

      if (url.hostname) parsed.host = url.hostname
      if (url.port) parsed.port = parseInt(url.port, 10)
      if (url.pathname && url.pathname !== '/') {
        parsed.database = url.pathname.slice(1) // Remove leading slash
      }
      if (url.username) parsed.username = decodeURIComponent(url.username)
      if (url.password) parsed.password = decodeURIComponent(url.password)

      // Parse query parameters
      const searchParams = url.searchParams
      if (searchParams.has('sslmode')) {
        parsed.sslmode = searchParams.get('sslmode') || undefined
      }
      if (searchParams.has('ssl')) {
        parsed.ssl = searchParams.get('ssl') === 'true'
      }
      if (searchParams.has('application_name')) {
        parsed.application_name = searchParams.get('application_name') || undefined
      }

      return parsed as ParsedConnectionString
    } catch {
      throw new ConfigurationError(
        'Invalid connection string format',
        'connectionString',
        connectionString
      )
    }
  }

  /**
   * Validate configuration parameters
   */
  private validateConfiguration(): void {
    // Must have either connection string or host/database
    if (!this.config.connectionString && !this.config.host && !this.config.path) {
      throw new ValidationError(
        'Must provide either connectionString, host, or path',
        'connectionString'
      )
    }

    // Validate numeric parameters
    if (this.config.port !== undefined) {
      const ports = Array.isArray(this.config.port) ? this.config.port : [this.config.port]
      for (const port of ports) {
        if (port < 1 || port > 65535) {
          throw new ValidationError('Port must be between 1 and 65535', 'port', port)
        }
      }
    }

    if (this.config.maxConnections !== undefined && this.config.maxConnections < 1) {
      throw new ValidationError('maxConnections must be at least 1', 'maxConnections', this.config.maxConnections)
    }

    if (this.config.connectTimeout !== undefined && this.config.connectTimeout < 1) {
      throw new ValidationError('connectTimeout must be at least 1 second', 'connectTimeout', this.config.connectTimeout)
    }

    // Validate SSL configuration
    if (typeof this.config.ssl === 'object' && this.config.ssl !== null) {
      this.validateSSLConfig(this.config.ssl)
    }
  }

  /**
   * Validate SSL configuration
   */
  private validateSSLConfig(ssl: SSLConfig): void {
    if (ssl.mode && !['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(ssl.mode)) {
      throw new ValidationError(
        'Invalid SSL mode. Must be one of: disable, allow, prefer, require, verify-ca, verify-full',
        'ssl.mode',
        ssl.mode
      )
    }

    // If certificates are provided, validate they're strings
    if (ssl.ca && typeof ssl.ca !== 'string') {
      throw new ValidationError('SSL CA certificate must be a string', 'ssl.ca', typeof ssl.ca)
    }
    if (ssl.cert && typeof ssl.cert !== 'string') {
      throw new ValidationError('SSL client certificate must be a string', 'ssl.cert', typeof ssl.cert)
    }
    if (ssl.key && typeof ssl.key !== 'string') {
      throw new ValidationError('SSL private key must be a string', 'ssl.key', typeof ssl.key)
    }
  }

  /**
   * Create sanitized configuration for logging (removes sensitive data)
   */
  private sanitizeConfig(): Record<string, unknown> {
    const sanitized = { ...this.config }
    
    // Remove sensitive information
    if (sanitized.password) {
      sanitized.password = '[REDACTED]'
    }
    if (sanitized.connectionString) {
      // Remove password from connection string
      try {
        const url = new URL(sanitized.connectionString)
        if (url.password) {
          url.password = '[REDACTED]'
          sanitized.connectionString = url.toString()
        }
      } catch {
        sanitized.connectionString = '[REDACTED]'
      }
    }
    if (typeof sanitized.ssl === 'object' && sanitized.ssl !== null) {
      const ssl = sanitized.ssl as Record<string, unknown>
      if (ssl.key) ssl.key = '[REDACTED]'
    }

    return sanitized
  }
}

/**
 * Factory function for creating database connections
 */
export function createDatabaseConnection(
  config: ConnectionConfig,
  logger?: Logger
): DatabaseConnection {
  return new DatabaseConnection(config, logger)
}