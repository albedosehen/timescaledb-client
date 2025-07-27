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
export type { DeltaResult, MultiValueAggregationResult, TimeBucketResult, WeightedAverageResult } from './aggregate.ts'

// Export functions (for advanced use cases)
export {
  getContinuousAggregate,
  getGapFilledAggregation,
  getMovingAverages,
  getMultiEntityAggregation,
  getMultiValueAggregation,
  getTimeBucketAggregation,
  getValueDelta,
  getVariability,
  getWeightedAverage,
} from './aggregate.ts'

export { insertManyRecords, insertRecord } from './insert.ts'

export {
  getAvailableEntities,
  getEntitiesByType,
  getLatestRecord,
  getMultiEntityLatest,
  getMultiEntityRecords,
  getRecords,
  getRecordsByEntityType,
  getRecordsStream,
  searchRecords,
} from './select.ts'
