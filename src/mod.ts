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
export {
  ClientFactory,
  ClientPresets,
  ClientUtils
} from './factory.ts'
export type { ClientFactoryOptions } from './factory.ts'

// ==================== CONFIGURATION ====================

// Configuration builders and presets
export {
  ConfigBuilder,
  ConfigPresets,
  DEFAULT_CONFIG,
  DEFAULT_CLIENT_OPTIONS,
  ENV_VARS
} from './types/config.ts'

// Configuration interfaces
export type {
  ConnectionConfig,
  ClientOptions,
  SSLConfig,
  Logger
} from './types/config.ts'

// ==================== CORE INTERFACES ====================

// Time-series data types
export type {
  PriceTick,
  Ohlc,
  TimeRange,
  TimeInterval,
  BatchResult,
  LatestPrice,
  MultiSymbolLatest
} from './types/interfaces.ts'

// Query and operation types
export type {
  QueryOptions,
  StreamingOptions,
  AggregationFunction,
  PriceDelta,
  VolatilityResult,
  TopMover,
  VolumeProfile
} from './types/interfaces.ts'

// Schema and metadata types
export type {
  SchemaInfo,
  HypertableInfo,
  IndexInfo,
  RetentionPolicy,
  HealthCheckResult
} from './types/interfaces.ts'

// Validation helper interface
export type { ValidationHelpers } from './types/interfaces.ts'

// ==================== ERROR HANDLING ====================

// Error classes
export {
  ValidationError,
  QueryError,
  ConnectionError,
  BatchError,
  TimeoutError,
  ConfigurationError,
  SchemaError
} from './types/errors.ts'

// Error utilities
export { ErrorUtils } from './types/errors.ts'
export type { ErrorContext } from './types/errors.ts'

// ==================== QUERY OPERATIONS ====================

// Note: Query operations are accessed through the TimescaleClient class
// These are not directly exported to maintain encapsulation
// Users should use: client.insertTick(), client.getTicks(), etc.

// However, we export the option types for advanced use cases
export type {
  InsertOptions,
  SelectOptions,
  AggregationOptions,
  AnalyticsOptions
} from './queries/mod.ts'

// Analytics result types
export type {
  TechnicalIndicatorResult,
  RSIResult,
  BollingerBandsResult,
  SupportResistanceLevel,
  CorrelationResult,
  TimeBucketResult,
  VwapResult,
  PriceDeltaResult
} from './queries/mod.ts'

// ==================== DATABASE LAYER ====================

// Database layer is primarily internal, but we export key types
// for advanced users who want to create custom integrations
export type {
  DatabaseLayer,
  SqlInstance,
  ConnectionState
} from './database/mod.ts'

// Utility functions for connection testing
export {
  testConnection,
  checkTimescaleDB
} from './database/mod.ts'

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
  }
}

// Import types for validators
import type { PriceTick, Ohlc, TimeRange } from './types/interfaces.ts'

/**
 * Validation utilities for time-series data
 */
export const Validators = {
  /**
   * Validate price tick data
   */
  isValidPriceTick: (tick: PriceTick): boolean => {
    try {
      return !!(
        tick.symbol &&
        typeof tick.symbol === 'string' &&
        tick.symbol.length <= 20 &&
        /^[A-Z0-9_]+$/.test(tick.symbol) &&
        typeof tick.price === 'number' &&
        tick.price > 0 &&
        isFinite(tick.price) &&
        (tick.volume === undefined || (typeof tick.volume === 'number' && tick.volume >= 0 && isFinite(tick.volume))) &&
        tick.timestamp &&
        typeof tick.timestamp === 'string' &&
        !isNaN(new Date(tick.timestamp).getTime())
      )
    } catch {
      return false
    }
  },

  /**
   * Validate OHLC data
   */
  isValidOhlc: (ohlc: Ohlc): boolean => {
    try {
      const prices = [ohlc.open, ohlc.high, ohlc.low, ohlc.close]
      const allPricesValid = prices.every(p => typeof p === 'number' && p > 0 && isFinite(p))
      const relationshipsValid = ohlc.high >= Math.max(ohlc.open, ohlc.close) &&
                                 ohlc.low <= Math.min(ohlc.open, ohlc.close)

      return !!(
        Validators.isValidPriceTick({
          symbol: ohlc.symbol,
          price: ohlc.close,
          volume: ohlc.volume,
          timestamp: ohlc.timestamp
        }) &&
        allPricesValid &&
        relationshipsValid
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
  }
}

/**
 * Constants for common time intervals and limits
 */
export const Constants = {
  /**
   * Supported time intervals for OHLC data
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
    MAX_SYMBOL_LENGTH: 20,
    MAX_TIME_RANGE_DAYS: 365
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
    WEEK: '1 week'
  } as const
}

// ==================== VERSION INFO ====================

/**
 * Client version information
 */
export const VERSION = '1.0.0'

/**
 * Client metadata
 */
export const CLIENT_INFO = {
  name: 'timescaledb-client',
  version: VERSION,
  description: 'Production-ready TimescaleDB client for TypeScript/Deno',
  repository: 'https://github.com/albedosehen/timescaledb-client',
  author: 'Your Organization'
} as const

// ==================== DEFAULT EXPORT ====================

/**
 * Default export provides the main factory for convenience
 */
import { ClientFactory as DefaultClientFactory } from './factory.ts'
export default DefaultClientFactory