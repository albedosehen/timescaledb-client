/**
 * Type definitions module exports for TimescaleDB client
 * 
 * This module consolidates all type definitions and provides a clean
 * public API for type imports throughout the project.
 */

// Core data interfaces
export type {
  PriceTick,
  Ohlc,
  TimeRange,
  TimeInterval,
  AggregationFunction,
  PriceDelta,
  VolatilityResult,
  LatestPrice,
  BatchResult,
  QueryStats,
  QueryOptions,
  VolumeProfile,
  SchemaInfo,
  HypertableInfo,
  IndexInfo,
  RetentionPolicy,
  StreamingOptions,
  MultiSymbolLatest,
  TopMover,
  HealthCheckResult,
  ValidationHelpers
} from './interfaces.ts'

// Configuration interfaces
export type {
  SSLConfig,
  ConnectionConfig,
  ClientOptions,
  Logger
} from './config.ts'

export {
  ENV_VARS,
  DEFAULT_CONFIG,
  DEFAULT_CLIENT_OPTIONS,
  ConfigBuilder,
  ConfigPresets
} from './config.ts'

// Error classes and utilities
export {
  TimescaleClientError,
  ConnectionError,
  ValidationError,
  QueryError,
  SchemaError,
  ConfigurationError,
  TimeoutError,
  BatchError,
  RateLimitError,
  ERROR_CODES,
  ErrorUtils
} from './errors.ts'

export type {
  ErrorCode,
  PostgresError,
  ErrorContext
} from './errors.ts'

// Internal types (for implementation use only)
export type {
  SqlInstance,
  QueryBuilder,
  BatchInsertOptions
} from './internal.ts'