/**
 * Query operations module exports
 * 
 * Provides all query operation types and functions for time-series data
 * manipulation with optimized batch processing and validation.
 */

// Export all option types
export type { AggregationOptions } from './aggregate.ts'
export type { InsertOptions } from './insert.ts' 
export type { SelectOptions } from './select.ts'

// Export result types
export type {
  TimeBucketResult,
  MultiValueAggregationResult,
  WeightedAverageResult,
  DeltaResult
} from './aggregate.ts'

// Export functions (for advanced use cases)
export {
  getTimeBucketAggregation,
  getMultiValueAggregation,
  getWeightedAverage,
  getValueDelta,
  getVariability,
  getContinuousAggregate,
  getGapFilledAggregation,
  getMovingAverages,
  getMultiEntityAggregation
} from './aggregate.ts'

export {
  insertRecord,
  insertManyRecords
} from './insert.ts'

export {
  getRecords,
  getMultiEntityRecords,
  getLatestRecord,
  getMultiEntityLatest,
  getRecordsByEntityType,
  getRecordsStream,
  getAvailableEntities,
  getEntitiesByType,
  searchRecords
} from './select.ts'