/**
 * TimescaleDB Client - Main module exports
 *
 * Production-ready TimescaleDB client for TypeScript/Deno with comprehensive
 * time-series data operations, analytics, and performance optimizations.
 * @module tsdb-client
 */

// ==================== MAIN CLIENT CLASSES ====================

// Core client class
export { TimescaleClient } from './client.ts'
export type { TimescaleClientConfig } from './client.ts'

// Import TimescaleClient as type for return type annotations
import type { TimescaleClient as TimescaleClientType } from './client.ts'

// Factory functions for client creation
export { ClientFactory, ClientPresets, ClientUtils } from './factory.ts'
export type { ClientFactoryOptions } from './factory.ts'

// ==================== CONFIGURATION ====================

// Configuration builders and presets
export { ConfigBuilder, ConfigPresets, DEFAULT_CLIENT_OPTIONS, DEFAULT_CONFIG, ENV_VARS } from './types/config.ts'

// Configuration interfaces
export type { ClientOptions, ConnectionConfig, Logger, SSLConfig } from './types/config.ts'

// ==================== CORE INTERFACES ====================

// Universal time-series data types
export type {
  AggregationFunction,
  AggregationResult,
  BatchResult,
  EntityMetadata,
  LatestRecord,
  MultiEntityLatest,
  StatisticalResult,
  TimeInterval,
  TimeRange,
  TimeSeriesRecord,
} from './types/interfaces.ts'

// Query and operation types
export type { BulkOperationConfig, FilterCriteria, QueryOptions, StreamingOptions } from './types/interfaces.ts'

// Schema and metadata types
export type { HealthCheckResult, HypertableInfo, IndexInfo, RetentionPolicy, SchemaInfo } from './types/interfaces.ts'

// Validation helper interface
export type { ValidationHelpers } from './types/interfaces.ts'

// ==================== ERROR HANDLING ====================

// Error classes
export {
  BatchError,
  ConfigurationError,
  ConnectionError,
  QueryError,
  SchemaError,
  TimeoutError,
  ValidationError,
} from './types/errors.ts'

// Error utilities
export { ErrorUtils } from './types/errors.ts'
export type { ErrorContext } from './types/errors.ts'

// ==================== QUERY OPERATIONS ====================

// Note: Query operations are accessed through the TimescaleClient class
// These are not directly exported to maintain encapsulation
// Users should use: client.insertRecord(), client.getRecords(), etc.

// However, we export the option types for advanced use cases
export type { AggregationOptions, InsertOptions, SelectOptions } from './queries/mod.ts'

// Generic aggregation result types
export type {
  DeltaResult,
  MultiValueAggregationResult,
  TimeBucketResult,
  WeightedAverageResult,
} from './queries/aggregate.ts'

// ==================== DATABASE LAYER ====================

// Database layer is primarily internal, but we export key types
// for advanced users who want to create custom integrations
export type { ConnectionState, DatabaseLayer, SqlInstance } from './database/mod.ts'

// Utility functions for connection testing
export { checkTimescaleDB, testConnection } from './database/mod.ts'

// ==================== CONVENIENCE EXPORTS ====================

/**
 * Quick-start factory functions using common configuration patterns
 */
export const QuickStart = {
  /**
   * Create a development client with default settings
   *
   * @example
   * ```typescript
   * const client = await QuickStart.development('my_dev_db')
   * ```
   */
  development: async (database = 'timescale_dev', factoryOptions = {}): Promise<TimescaleClientType> => {
    const { ClientPresets } = await import('./factory.ts')
    return ClientPresets.development(database, factoryOptions)
  },

  /**
   * Create a production client from connection string
   *
   * @example
   * ```typescript
   * const client = await QuickStart.production(process.env.DATABASE_URL!)
   * ```
   */
  production: async (connectionString: string, factoryOptions = {}): Promise<TimescaleClientType> => {
    const { ClientPresets } = await import('./factory.ts')
    return ClientPresets.production(connectionString, factoryOptions)
  },

  /**
   * Create a testing client with minimal setup
   *
   * @example
   * ```typescript
   * const client = await QuickStart.testing('test_db')
   * ```
   */
  testing: async (database = 'timescale_test', factoryOptions = {}): Promise<TimescaleClientType> => {
    const { ClientPresets } = await import('./factory.ts')
    return ClientPresets.testing(database, factoryOptions)
  },

  /**
   * Create a cloud client for hosted TimescaleDB
   *
   * @example
   * ```typescript
   * const client = await QuickStart.cloud(connectionString)
   * ```
   */
  cloud: async (connectionString: string, factoryOptions = {}): Promise<TimescaleClientType> => {
    const { ClientPresets } = await import('./factory.ts')
    return ClientPresets.cloud(connectionString, factoryOptions)
  },
}

// Import types for validators
import type { EntityMetadata, TimeRange, TimeSeriesRecord } from './types/interfaces.ts'

/**
 * Validation utilities for time-series data
 */
export const Validators = {
  /**
   * Validate time-series record data
   */
  isValidTimeSeriesRecord: (record: TimeSeriesRecord): boolean => {
    try {
      return !!(
        record.entity_id &&
        typeof record.entity_id === 'string' &&
        record.entity_id.length <= 100 &&
        /^[A-Za-z0-9_.-]+$/.test(record.entity_id) &&
        typeof record.value === 'number' &&
        isFinite(record.value) &&
        record.time &&
        typeof record.time === 'string' &&
        !isNaN(new Date(record.time).getTime()) &&
        (record.value2 === undefined || (typeof record.value2 === 'number' && isFinite(record.value2))) &&
        (record.value3 === undefined || (typeof record.value3 === 'number' && isFinite(record.value3))) &&
        (record.value4 === undefined || (typeof record.value4 === 'number' && isFinite(record.value4)))
      )
    } catch {
      return false
    }
  },

  /**
   * Validate entity metadata structure
   */
  isValidEntityMetadata: (metadata: EntityMetadata): boolean => {
    try {
      return !!(
        metadata.entity_id &&
        typeof metadata.entity_id === 'string' &&
        metadata.entity_id.length <= 100 &&
        /^[A-Za-z0-9_.-]+$/.test(metadata.entity_id) &&
        metadata.entity_type &&
        typeof metadata.entity_type === 'string' &&
        metadata.entity_type.length <= 50 &&
        /^[a-z_]+$/.test(metadata.entity_type)
      )
    } catch {
      return false
    }
  },

  /**
   * Validate time range
   */
  isValidTimeRange: (range: TimeRange): boolean => {
    try {
      return !!(
        range.from instanceof Date &&
        range.to instanceof Date &&
        range.from < range.to &&
        (range.limit === undefined || (typeof range.limit === 'number' && range.limit > 0 && range.limit <= 10000))
      )
    } catch {
      return false
    }
  },

  /**
   * Validate entity ID format
   */
  isValidEntityId: (entityId: string): boolean => {
    try {
      return !!(
        entityId &&
        typeof entityId === 'string' &&
        entityId.length <= 100 &&
        /^[A-Za-z0-9_.-]+$/.test(entityId)
      )
    } catch {
      return false
    }
  },

  /**
   * Validate entity type format
   */
  isValidEntityType: (entityType: string): boolean => {
    try {
      return !!(
        entityType &&
        typeof entityType === 'string' &&
        entityType.length <= 50 &&
        /^[a-z_]+$/.test(entityType)
      )
    } catch {
      return false
    }
  },
}

/**
 * Constants for common time intervals and limits
 */
export const Constants = {
  /**
   * Supported time intervals for aggregations
   */
  TIME_INTERVALS: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const,

  /**
   * Default limits and constraints
   */
  LIMITS: {
    MAX_BATCH_SIZE: 10000,
    DEFAULT_BATCH_SIZE: 1000,
    MAX_QUERY_LIMIT: 10000,
    DEFAULT_QUERY_LIMIT: 1000,
    MAX_ENTITY_ID_LENGTH: 100,
    MAX_ENTITY_TYPE_LENGTH: 50,
    MAX_TIME_RANGE_DAYS: 365,
  } as const,

  /**
   * Default intervals for aggregations
   */
  AGGREGATION_INTERVALS: {
    MINUTE: '1 minute',
    FIVE_MINUTES: '5 minutes',
    FIFTEEN_MINUTES: '15 minutes',
    HOUR: '1 hour',
    DAY: '1 day',
    WEEK: '1 week',
  } as const,

  /**
   * Common entity types for different domains
   */
  ENTITY_TYPES: {
    // IoT and sensor domains
    SENSOR: 'sensor',
    DEVICE: 'device',
    GATEWAY: 'gateway',

    // Monitoring and infrastructure
    SERVER: 'server',
    SERVICE: 'service',
    APPLICATION: 'application',
    CONTAINER: 'container',

    // General purpose
    METRIC: 'metric',
    EVENT: 'event',
    LOG: 'log',
  } as const,
}

// ==================== VERSION INFO ====================

/**
 * Client version information
 */
export const VERSION = '2.0.0'

/**
 * Client metadata
 */
export const CLIENT_INFO = {
  name: 'timescaledb-client',
  version: VERSION,
  description: 'Universal TimescaleDB client for TypeScript/Deno - supports any time-series domain',
  repository: 'https://github.com/albedosehen/timescaledb-client',
  author: 'Your Organization',
} as const

// ==================== DEFAULT EXPORT ====================

/**
 * Default export provides the main factory for convenience
 */
import { ClientFactory as DefaultClientFactory } from './factory.ts'
export default DefaultClientFactory
