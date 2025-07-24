/**
 * Factory functions for creating TimescaleClient instances
 * 
 * Provides convenient factory methods for different initialization patterns
 * including connection strings, configuration objects, environment variables,
 * and configuration builders.
 */

import type {
  ConnectionConfig,
  ClientOptions,
  Logger,
  ConfigBuilder
} from './types/config.ts'
import type { SqlInstance } from './types/internal.ts'
import { 
  createDatabaseLayer, 
  createDatabaseLayerFromEnv,
  createSimplePool,
  testConnection,
  checkTimescaleDB
} from './database/mod.ts'
import { TimescaleClient, type TimescaleClientConfig } from './client.ts'
import { 
  ValidationError, 
  ConnectionError, 
  ConfigurationError 
} from './types/errors.ts'

/**
 * Factory options for client creation
 */
export interface ClientFactoryOptions {
  /** Whether to test connection before returning client */
  readonly testConnection?: boolean
  
  /** Whether to verify TimescaleDB availability */
  readonly verifyTimescaleDB?: boolean
  
  /** Whether to automatically initialize the client */
  readonly autoInitialize?: boolean
  
  /** Custom logger for factory operations */
  readonly logger?: Logger
}

/**
 * Default factory options
 */
const DEFAULT_FACTORY_OPTIONS: Required<ClientFactoryOptions> = {
  testConnection: true,
  verifyTimescaleDB: true,
  autoInitialize: true,
  logger: undefined!
}

/**
 * Main factory class for creating TimescaleClient instances
 */
export class ClientFactory {
  
  /**
   * Create a TimescaleClient from a connection string
   * 
   * @param connectionString - PostgreSQL connection string
   * @param clientOptions - Client behavior options
   * @param factoryOptions - Factory-specific options
   * @returns Promise resolving to configured TimescaleClient
   * 
   * @example
   * ```typescript
   * const client = await ClientFactory.fromConnectionString(
   *   'postgresql://user:pass@localhost:5432/timescale_db',
   *   { 
   *     defaultBatchSize: 5000,
   *     validateInputs: true 
   *   }
   * )
   * ```
   */
  static async fromConnectionString(
    connectionString: string,
    clientOptions: TimescaleClientConfig = {},
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const options = { ...DEFAULT_FACTORY_OPTIONS, ...factoryOptions }
    
    if (!connectionString || typeof connectionString !== 'string') {
      throw new ValidationError('Connection string is required', 'connectionString', connectionString)
    }

    try {
      const connectionConfig: ConnectionConfig = {
        connectionString,
        debug: clientOptions.logger !== undefined
      }

      // Test connection if requested
      if (options.testConnection) {
        await testConnection(connectionConfig, options.logger)
      }

      // Verify TimescaleDB if requested
      if (options.verifyTimescaleDB) {
        const tsdbInfo = await checkTimescaleDB(connectionConfig, options.logger)
        if (!tsdbInfo.isAvailable) {
          throw new ConfigurationError('TimescaleDB extension is not available in the target database')
        }
        options.logger?.info(`TimescaleDB version ${tsdbInfo.version} detected`)
      }

      // Create database layer
      const dbLayer = createDatabaseLayer({
        connection: connectionConfig,
        client: clientOptions,
        enableHealthChecking: true,
        logger: options.logger
      })

      // Create client
      const client = new TimescaleClient(dbLayer, {
        ...clientOptions,
        logger: options.logger
      })

      // Initialize if requested
      if (options.autoInitialize) {
        await client.initialize()
      }

      return client
    } catch (error) {
      throw new ConnectionError(
        'Failed to create client from connection string',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Create a TimescaleClient from a configuration object
   * 
   * @param connectionConfig - Database connection configuration
   * @param clientOptions - Client behavior options
   * @param factoryOptions - Factory-specific options
   * @returns Promise resolving to configured TimescaleClient
   * 
   * @example
   * ```typescript
   * const client = await ClientFactory.fromConfig({
   *   host: 'localhost',
   *   port: 5432,
   *   database: 'timescale_db',
   *   username: 'user',
   *   password: 'password',
   *   ssl: true
   * }, {
   *   validateInputs: true,
   *   autoCreateTables: false
   * })
   * ```
   */
  static async fromConfig(
    connectionConfig: ConnectionConfig,
    clientOptions: TimescaleClientConfig = {},
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const options = { ...DEFAULT_FACTORY_OPTIONS, ...factoryOptions }

    if (!connectionConfig) {
      throw new ValidationError('Connection configuration is required', 'connectionConfig')
    }

    try {
      // Test connection if requested
      if (options.testConnection) {
        await testConnection(connectionConfig, options.logger)
      }

      // Verify TimescaleDB if requested
      if (options.verifyTimescaleDB) {
        const tsdbInfo = await checkTimescaleDB(connectionConfig, options.logger)
        if (!tsdbInfo.isAvailable) {
          throw new ConfigurationError('TimescaleDB extension is not available in the target database')
        }
        options.logger?.info(`TimescaleDB version ${tsdbInfo.version} detected`)
      }

      // Create database layer
      const dbLayer = createDatabaseLayer({
        connection: connectionConfig,
        client: clientOptions,
        enableHealthChecking: true,
        logger: options.logger
      })

      // Create client
      const client = new TimescaleClient(dbLayer, {
        ...clientOptions,
        logger: options.logger
      })

      // Initialize if requested
      if (options.autoInitialize) {
        await client.initialize()
      }

      return client
    } catch (error) {
      throw new ConnectionError(
        'Failed to create client from configuration',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Create a TimescaleClient from environment variables
   * 
   * Uses standard PostgreSQL environment variables:
   * - TIMESCALE_CONNECTION_STRING or PGHOST, PGPORT, PGDATABASE, etc.
   * 
   * @param clientOptions - Client behavior options
   * @param factoryOptions - Factory-specific options
   * @returns Promise resolving to configured TimescaleClient
   * 
   * @example
   * ```typescript
   * // Set environment variables:
   * // PGHOST=localhost
   * // PGPORT=5432
   * // PGDATABASE=timescale_db
   * // PGUSER=user
   * // PGPASSWORD=password
   * 
   * const client = await ClientFactory.fromEnvironment({
   *   maxRetries: 5,
   *   queryTimeout: 60000
   * })
   * ```
   */
  static async fromEnvironment(
    clientOptions: TimescaleClientConfig = {},
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const options = { ...DEFAULT_FACTORY_OPTIONS, ...factoryOptions }

    try {
      // Create database layer from environment
      const dbLayer = createDatabaseLayerFromEnv(
        options.logger,
        {
          client: clientOptions,
          enableHealthChecking: true
        }
      )

      // Test connection if requested
      if (options.testConnection) {
        const isHealthy = await dbLayer.pool.healthCheck()
        if (!isHealthy) {
          throw new ConnectionError('Environment-based connection health check failed')
        }
      }

      // Verify TimescaleDB if requested (requires getting connection config from env)
      if (options.verifyTimescaleDB) {
        const connectionString = Deno.env.get('TIMESCALE_CONNECTION_STRING')
        if (connectionString) {
          const tsdbInfo = await checkTimescaleDB({ connectionString }, options.logger)
          if (!tsdbInfo.isAvailable) {
            throw new ConfigurationError('TimescaleDB extension is not available in the target database')
          }
          options.logger?.info(`TimescaleDB version ${tsdbInfo.version} detected`)
        }
      }

      // Create client
      const client = new TimescaleClient(dbLayer, {
        ...clientOptions,
        logger: options.logger
      })

      // Initialize if requested
      if (options.autoInitialize) {
        await client.initialize()
      }

      return client
    } catch (error) {
      throw new ConnectionError(
        'Failed to create client from environment variables',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Create a TimescaleClient using a configuration builder
   * 
   * @param builderFn - Function that configures and builds the client
   * @param factoryOptions - Factory-specific options
   * @returns Promise resolving to configured TimescaleClient
   * 
   * @example
   * ```typescript
   * const client = await ClientFactory.fromBuilder(
   *   (builder) => builder
   *     .host('localhost')
   *     .database('timescale_db')
   *     .auth('user', 'password')
   *     .ssl(true)
   *     .clientOptions({ validateInputs: true })
   *     .build()
   * )
   * ```
   */
  static async fromBuilder(
    builderFn: (builder: ConfigBuilder) => { connectionConfig: ConnectionConfig; clientOptions: ClientOptions },
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    if (typeof builderFn !== 'function') {
      throw new ValidationError('Builder function is required', 'builderFn')
    }

    try {
      // Import ConfigBuilder dynamically to avoid circular dependencies
      const { ConfigBuilder } = await import('./types/config.ts')
      const builder = ConfigBuilder.create()
      const { connectionConfig, clientOptions } = builderFn(builder)

      return await this.fromConfig(connectionConfig, clientOptions, factoryOptions)
    } catch (error) {
      throw new ConnectionError(
        'Failed to create client from builder',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  /**
   * Create a simple TimescaleClient without health monitoring (for testing/development)
   * 
   * @param connectionString - PostgreSQL connection string
   * @param clientOptions - Client behavior options
   * @returns TimescaleClient instance (not initialized)
   */
  static createSimple(
    connectionString: string,
    clientOptions: TimescaleClientConfig = {}
  ): TimescaleClient {
    if (!connectionString || typeof connectionString !== 'string') {
      throw new ValidationError('Connection string is required', 'connectionString', connectionString)
    }

    try {
      const pool = createSimplePool(
        { connectionString },
        undefined,
        clientOptions
      )

      return new TimescaleClient(pool as unknown as SqlInstance, clientOptions)
    } catch (error) {
      throw new ConnectionError(
        'Failed to create simple client',
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
}

/**
 * Convenience factory functions using configuration presets
 */
export class ClientPresets {
  
  /**
   * Create a development client with debug enabled
   */
  static async development(
    database = 'timescale_dev',
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const { ConfigPresets } = await import('./types/config.ts')
    
    return await ClientFactory.fromBuilder(
      () => ConfigPresets.development(database).build(),
      { testConnection: false, ...factoryOptions }
    )
  }

  /**
   * Create a production client with SSL and optimizations
   */
  static async production(
    connectionString: string,
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const { ConfigPresets } = await import('./types/config.ts')
    
    return await ClientFactory.fromBuilder(
      () => ConfigPresets.production(connectionString).build(),
      factoryOptions
    )
  }

  /**
   * Create a testing client with minimal setup
   */
  static async testing(
    database = 'timescale_test',
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const { ConfigPresets } = await import('./types/config.ts')
    
    return await ClientFactory.fromBuilder(
      () => ConfigPresets.testing(database).build(),
      { testConnection: false, verifyTimescaleDB: false, ...factoryOptions }
    )
  }

  /**
   * Create a cloud client for hosted TimescaleDB
   */
  static async cloud(
    connectionString: string,
    factoryOptions: ClientFactoryOptions = {}
  ): Promise<TimescaleClient> {
    const { ConfigPresets } = await import('./types/config.ts')
    
    return await ClientFactory.fromBuilder(
      () => ConfigPresets.cloud(connectionString).build(),
      factoryOptions
    )
  }
}

/**
 * Utility functions for connection testing and validation
 */
export class ClientUtils {
  
  /**
   * Test a connection without creating a full client
   */
  static async testConnection(
    connectionConfig: ConnectionConfig,
    logger?: Logger
  ): Promise<boolean> {
    try {
      await testConnection(connectionConfig, logger)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if TimescaleDB is available at the given connection
   */
  static async checkTimescaleDB(
    connectionConfig: ConnectionConfig,
    logger?: Logger
  ): Promise<{
    isAvailable: boolean
    version?: string
    extensions: string[]
  }> {
    return await checkTimescaleDB(connectionConfig, logger)
  }

  /**
   * Validate client configuration
   */
  static validateConfig(config: TimescaleClientConfig): void {
    if (config.defaultBatchSize && (config.defaultBatchSize <= 0 || config.defaultBatchSize > 10000)) {
      throw new ValidationError('Default batch size must be between 1 and 10,000', 'defaultBatchSize', config.defaultBatchSize)
    }

    if (config.maxRetries && config.maxRetries < 0) {
      throw new ValidationError('Max retries must be non-negative', 'maxRetries', config.maxRetries)
    }

    if (config.queryTimeout && config.queryTimeout <= 0) {
      throw new ValidationError('Query timeout must be positive', 'queryTimeout', config.queryTimeout)
    }

    if (config.defaultLimit && (config.defaultLimit <= 0 || config.defaultLimit > 10000)) {
      throw new ValidationError('Default limit must be between 1 and 10,000', 'defaultLimit', config.defaultLimit)
    }
  }
}

// Default exports for convenience
export { TimescaleClient }
export * from './client.ts'