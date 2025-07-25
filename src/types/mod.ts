/**
 * Type definitions module exports for TimescaleDB client
 *
 * This module consolidates all type definitions and provides a clean
 * public API for type imports throughout the project.
 */

// Core data interfaces
export type {
  AggregationFunction,
  BatchResult,
  HealthCheckResult,
  HypertableInfo,
  IndexInfo,
  LatestPrice,
  MultiSymbolLatest,
  Ohlc,
  PriceDelta,
  PriceTick,
  QueryOptions,
  QueryStats,
  RetentionPolicy,
  SchemaInfo,
  StreamingOptions,
  TimeInterval,
  TimeRange,
  TopMover,
  ValidationHelpers,
  VolatilityResult,
  VolumeProfile,
} from './interfaces.ts'

// Configuration interfaces
export type { ClientOptions, ConnectionConfig, Logger, SSLConfig } from './config.ts'

export { ConfigBuilder, ConfigPresets, DEFAULT_CLIENT_OPTIONS, DEFAULT_CONFIG, ENV_VARS } from './config.ts'

// Error classes and utilities
export {
  BatchError,
  ConfigurationError,
  ConnectionError,
  ERROR_CODES,
  ErrorUtils,
  QueryError,
  RateLimitError,
  SchemaError,
  TimeoutError,
  TimescaleClientError,
  ValidationError,
} from './errors.ts'

export type { ErrorCode, ErrorContext, PostgresError } from './errors.ts'

// Internal types (for implementation use only)
export type { BatchInsertOptions, QueryBuilder, SqlInstance } from './internal.ts'
