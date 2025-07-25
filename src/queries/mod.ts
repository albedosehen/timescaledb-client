/**
 * Query layer module exports
 *
 * Provides clean exports for all TimescaleDB query operations including
 * insert, select, aggregate, and analytics functions.
 */

// Insert operations
export { insertManyOhlc, insertManyTicks, insertOhlc, type InsertOptions, insertTick } from './insert.ts'

// Select operations
export {
  getLatestPrice,
  getMultiSymbolLatest,
  getOhlc,
  getOhlcFromTicks,
  getOhlcStream,
  getTicks,
  getTicksStream,
  type SelectOptions,
} from './select.ts'

// Aggregation operations
export {
  type AggregationOptions,
  getContinuousAggregate,
  getGapFilledAggregation,
  getMovingAverages,
  getPriceDelta,
  getTimeBucketAggregation,
  getVolatility,
  getVwap,
  type PriceDeltaResult,
  type TimeBucketResult,
  type VwapResult,
} from './aggregate.ts'

// Analytics operations
export {
  type AnalyticsOptions,
  type BollingerBandsResult,
  calculateBollingerBands,
  calculateCorrelation,
  calculateEMA,
  calculateRSI,
  calculateSMA,
  type CorrelationResult,
  findSupportResistanceLevels,
  getTopMovers,
  getVolumeProfile,
  type MomentumResult,
  type RSIResult,
  type SupportResistanceLevel,
  type TechnicalIndicatorResult,
} from './analytics.ts'

// Re-export common types from interfaces
export type {
  BatchResult,
  LatestPrice,
  MultiSymbolLatest,
  Ohlc,
  PriceTick,
  QueryOptions,
  StreamingOptions,
  TimeRange,
  TopMover,
  VolumeProfile,
} from '../types/interfaces.ts'

// Re-export error types
export { BatchError, ConnectionError, QueryError, ValidationError } from '../types/errors.ts'
