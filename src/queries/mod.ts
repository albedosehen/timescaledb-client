/**
 * Query layer module exports
 *
 * Provides clean exports for all TimescaleDB query operations including
 * insert, select, aggregate, and analytics functions.
 */

// Insert operations
export {
  insertTick,
  insertOhlc,
  insertManyTicks,
  insertManyOhlc,
  type InsertOptions
} from './insert.ts'

// Select operations
export {
  getTicks,
  getOhlc,
  getOhlcFromTicks,
  getLatestPrice,
  getMultiSymbolLatest,
  getTicksStream,
  getOhlcStream,
  type SelectOptions
} from './select.ts'

// Aggregation operations
export {
  getTimeBucketAggregation,
  getVwap,
  getPriceDelta,
  getVolatility,
  getMovingAverages,
  getContinuousAggregate,
  getGapFilledAggregation,
  type AggregationOptions,
  type TimeBucketResult,
  type VwapResult,
  type PriceDeltaResult
} from './aggregate.ts'

// Analytics operations
export {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  getTopMovers,
  getVolumeProfile,
  findSupportResistanceLevels,
  calculateCorrelation,
  type AnalyticsOptions,
  type TechnicalIndicatorResult,
  type RSIResult,
  type BollingerBandsResult,
  type SupportResistanceLevel,
  type CorrelationResult,
  type MomentumResult
} from './analytics.ts'

// Re-export common types from interfaces
export type {
  TimeRange,
  QueryOptions,
  TopMover,
  VolumeProfile,
  Ohlc,
  PriceTick,
  BatchResult,
  StreamingOptions,
  MultiSymbolLatest,
  LatestPrice
} from '../types/interfaces.ts'

// Re-export error types
export {
  ValidationError,
  QueryError,
  BatchError,
  ConnectionError
} from '../types/errors.ts'