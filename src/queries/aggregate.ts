/**
 * Aggregation operations for TimescaleDB client
 *
 * Provides time-windowed aggregations and TimescaleDB-specific aggregation functions
 * for generic time-series data analysis supporting any domain.
 */

import type { SqlInstance } from '../types/internal.ts'
import type { QueryOptions, TimeRange } from '../types/interfaces.ts'
import { QueryError, ValidationError } from '../types/errors.ts'

/**
 * Aggregation configuration options
 */
export interface AggregationOptions extends QueryOptions {
  /** Whether to fill gaps in time series data */
  readonly fillGaps?: boolean
  /** Fill value for gaps (default: null) */
  readonly fillValue?: number | null
  /** Whether to include metadata in results */
  readonly includeMetadata?: boolean
}

/**
 * Time bucket aggregation result
 */
export interface TimeBucketResult {
  /** The time bucket timestamp */
  readonly bucket: Date
  /** Entity identifier */
  readonly entity_id: string
  /** Number of data points in this time bucket */
  readonly count: number
  /** Average value in this time bucket */
  readonly avg?: number | undefined
  /** Minimum value in this time bucket */
  readonly min?: number | undefined
  /** Maximum value in this time bucket */
  readonly max?: number | undefined
  /** Sum of all values in this time bucket */
  readonly sum?: number | undefined
  /** First value in this time bucket (earliest by time) */
  readonly first?: number | undefined
  /** Last value in this time bucket (latest by time) */
  readonly last?: number | undefined
  /** Standard deviation of values in this time bucket */
  readonly stddev?: number | undefined
}

/**
 * Multi-value aggregation result
 */
export interface MultiValueAggregationResult {
  /** The time bucket timestamp */
  readonly bucket: Date
  /** Entity identifier */
  readonly entity_id: string
  /** Number of data points in this time bucket */
  readonly count: number
  /** Statistics for primary value */
  readonly value_stats: {
    readonly avg?: number | undefined
    readonly min?: number | undefined
    readonly max?: number | undefined
    readonly sum?: number | undefined
    readonly first?: number | undefined
    readonly last?: number | undefined
  }
  /** Statistics for secondary value */
  readonly value2_stats?: {
    readonly avg?: number | undefined
    readonly min?: number | undefined
    readonly max?: number | undefined
    readonly sum?: number | undefined
    readonly first?: number | undefined
    readonly last?: number | undefined
  }
  /** Statistics for tertiary value */
  readonly value3_stats?: {
    readonly avg?: number | undefined
    readonly min?: number | undefined
    readonly max?: number | undefined
    readonly sum?: number | undefined
    readonly first?: number | undefined
    readonly last?: number | undefined
  }
  /** Statistics for quaternary value */
  readonly value4_stats?: {
    readonly avg?: number | undefined
    readonly min?: number | undefined
    readonly max?: number | undefined
    readonly sum?: number | undefined
    readonly first?: number | undefined
    readonly last?: number | undefined
  }
}

/**
 * Weighted average result
 */
export interface WeightedAverageResult {
  /** The time bucket timestamp */
  readonly bucket: Date
  /** Entity identifier */
  readonly entity_id: string
  /** Weighted average value for this bucket */
  readonly weighted_avg: number
  /** Total weight for this bucket */
  readonly total_weight: number
  /** Value range within this bucket */
  readonly value_range: {
    /** Minimum value in this bucket */
    readonly min: number
    /** Maximum value in this bucket */
    readonly max: number
  }
}

/**
 * Delta calculation result
 */
export interface DeltaResult {
  /** Entity identifier */
  readonly entity_id: string
  /** Starting value at the beginning of the time range */
  readonly start_value: number
  /** Ending value at the end of the time range */
  readonly end_value: number
  /** Absolute change in value (end_value - start_value) */
  readonly delta: number
  /** Percentage change in value over the time range */
  readonly percent_change: number
  /** Time range for the delta calculation */
  readonly time_range: TimeRange
}

/**
 * Default aggregation options
 */
const DEFAULT_AGGREGATION_OPTIONS: Required<AggregationOptions> = {
  limit: 1000,
  offset: 0,
  orderBy: { column: 'bucket', direction: 'desc' },
  where: {},
  includeStats: false,
  fillGaps: false,
  fillValue: null,
  includeMetadata: false,
  entityTypes: [],
  entityIds: [],
}

/**
 * Calculate time-bucketed aggregations for an entity
 */
export async function getTimeBucketAggregation(
  sql: SqlInstance,
  entityId: string,
  bucketInterval: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<TimeBucketResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateEntityId(entityId)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket(${bucketInterval}, time) as bucket,
        entity_id,
        count(*) as count,
        avg(value) as avg,
        min(value) as min,
        max(value) as max,
        sum(value) as sum,
        first(value, time) as first,
        last(value, time) as last,
        stddev(value) as stddev
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket, entity_id
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      entity_id: string
      count: number
      avg: number | null
      min: number | null
      max: number | null
      sum: number | null
      first: number | null
      last: number | null
      stddev: number | null
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
      entity_id: row.entity_id,
      count: row.count,
      avg: row.avg ?? undefined,
      min: row.min ?? undefined,
      max: row.max ?? undefined,
      sum: row.sum ?? undefined,
      first: row.first ?? undefined,
      last: row.last ?? undefined,
      stddev: row.stddev ?? undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate time bucket aggregation',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT time_bucket FROM time_series_data',
      [entityId, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate multi-value aggregations for an entity
 */
export async function getMultiValueAggregation(
  sql: SqlInstance,
  entityId: string,
  bucketInterval: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<MultiValueAggregationResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateEntityId(entityId)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket(${bucketInterval}, time) as bucket,
        entity_id,
        count(*) as count,
        avg(value) as value_avg, min(value) as value_min, max(value) as value_max, sum(value) as value_sum,
        first(value, time) as value_first, last(value, time) as value_last,
        avg(value2) as value2_avg, min(value2) as value2_min, max(value2) as value2_max, sum(value2) as value2_sum,
        first(value2, time) as value2_first, last(value2, time) as value2_last,
        avg(value3) as value3_avg, min(value3) as value3_min, max(value3) as value3_max, sum(value3) as value3_sum,
        first(value3, time) as value3_first, last(value3, time) as value3_last,
        avg(value4) as value4_avg, min(value4) as value4_min, max(value4) as value4_max, sum(value4) as value4_sum,
        first(value4, time) as value4_first, last(value4, time) as value4_last
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket, entity_id
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      entity_id: string
      count: number
      value_avg: number | null
      value_min: number | null
      value_max: number | null
      value_sum: number | null
      value_first: number | null
      value_last: number | null
      value2_avg: number | null
      value2_min: number | null
      value2_max: number | null
      value2_sum: number | null
      value2_first: number | null
      value2_last: number | null
      value3_avg: number | null
      value3_min: number | null
      value3_max: number | null
      value3_sum: number | null
      value3_first: number | null
      value3_last: number | null
      value4_avg: number | null
      value4_min: number | null
      value4_max: number | null
      value4_sum: number | null
      value4_first: number | null
      value4_last: number | null
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
      entity_id: row.entity_id,
      count: row.count,
      value_stats: {
        avg: row.value_avg ?? undefined,
        min: row.value_min ?? undefined,
        max: row.value_max ?? undefined,
        sum: row.value_sum ?? undefined,
        first: row.value_first ?? undefined,
        last: row.value_last ?? undefined,
      },
      value2_stats: {
        avg: row.value2_avg ?? undefined,
        min: row.value2_min ?? undefined,
        max: row.value2_max ?? undefined,
        sum: row.value2_sum ?? undefined,
        first: row.value2_first ?? undefined,
        last: row.value2_last ?? undefined,
      },
      value3_stats: {
        avg: row.value3_avg ?? undefined,
        min: row.value3_min ?? undefined,
        max: row.value3_max ?? undefined,
        sum: row.value3_sum ?? undefined,
        first: row.value3_first ?? undefined,
        last: row.value3_last ?? undefined,
      },
      value4_stats: {
        avg: row.value4_avg ?? undefined,
        min: row.value4_min ?? undefined,
        max: row.value4_max ?? undefined,
        sum: row.value4_sum ?? undefined,
        first: row.value4_first ?? undefined,
        last: row.value4_last ?? undefined,
      },
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate multi-value aggregation',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT multi-value aggregation FROM time_series_data',
      [entityId, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate weighted average using value2 as weight
 */
export async function getWeightedAverage(
  sql: SqlInstance,
  entityId: string,
  bucketInterval: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<WeightedAverageResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateEntityId(entityId)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket(${bucketInterval}, time) as bucket,
        entity_id,
        sum(value * COALESCE(value2, 1)) / sum(COALESCE(value2, 1)) as weighted_avg,
        sum(COALESCE(value2, 1)) as total_weight,
        min(value) as min_value,
        max(value) as max_value
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
        AND value2 IS NOT NULL
      GROUP BY bucket, entity_id
      HAVING sum(COALESCE(value2, 1)) > 0
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      entity_id: string
      weighted_avg: number
      total_weight: number
      min_value: number
      max_value: number
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
      entity_id: row.entity_id,
      weighted_avg: row.weighted_avg,
      total_weight: row.total_weight,
      value_range: {
        min: row.min_value,
        max: row.max_value,
      },
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate weighted average',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT weighted average FROM time_series_data',
      [entityId, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate value delta between two time points
 */
export async function getValueDelta(
  sql: SqlInstance,
  entityId: string,
  from: Date,
  to: Date,
): Promise<DeltaResult> {
  validateEntityId(entityId)

  if (from >= to) {
    throw new ValidationError('From date must be before to date', 'from', from)
  }

  try {
    const results = await sql`
      WITH value_points AS (
        SELECT
          time,
          value,
          ROW_NUMBER() OVER (ORDER BY time ASC) as rn_asc,
          ROW_NUMBER() OVER (ORDER BY time DESC) as rn_desc
        FROM time_series_data
        WHERE entity_id = ${entityId}
          AND time >= ${from.toISOString()}
          AND time <= ${to.toISOString()}
      ),
      first_value AS (
        SELECT value as start_value
        FROM value_points
        WHERE rn_asc = 1
      ),
      last_value AS (
        SELECT value as end_value
        FROM value_points
        WHERE rn_desc = 1
      )
      SELECT
        start_value,
        end_value,
        (end_value - start_value) as delta,
        CASE 
          WHEN start_value = 0 THEN NULL
          ELSE ((end_value - start_value) / start_value) * 100
        END as percent_change
      FROM first_value, last_value
    ` as Array<{
      start_value: number
      end_value: number
      delta: number
      percent_change: number | null
    }>

    if (results.length === 0) {
      throw new QueryError('No data found for the specified time range')
    }

    const result = results[0]

    if (!result) {
      throw new QueryError('No data found for the specified time range')
    }

    return {
      entity_id: entityId,
      start_value: result.start_value,
      end_value: result.end_value,
      delta: result.delta,
      percent_change: result.percent_change ?? 0,
      time_range: { from, to },
    }
  } catch (error) {
    throw new QueryError(
      'Failed to calculate value delta',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT value delta FROM time_series_data',
      [entityId, from, to],
    )
  }
}

/**
 * Calculate variability (standard deviation) over a time period
 */
export async function getVariability(
  sql: SqlInstance,
  entityId: string,
  hours: number,
): Promise<number> {
  validateEntityId(entityId)

  if (hours <= 0) {
    throw new ValidationError('Hours must be positive', 'hours', hours)
  }

  try {
    const results = await sql`
      SELECT
        stddev(value) as variability,
        count(*) as sample_count
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= NOW() - INTERVAL '${hours} hours'
    ` as Array<{
      variability: number | null
      sample_count: number
    }>

    const result = results[0]

    if (!result || result.sample_count === 0) {
      return 0
    }

    return result.variability ?? 0
  } catch (error) {
    throw new QueryError(
      'Failed to calculate variability',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT stddev FROM time_series_data',
      [entityId, hours],
    )
  }
}

/**
 * Generate continuous aggregates using TimescaleDB features
 */
export async function getContinuousAggregate(
  sql: SqlInstance,
  aggregateName: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateTimeRange(range)
  validateAggregateName(aggregateName)

  try {
    // Dynamic query to select from continuous aggregate view
    // Using unsafe() for dynamic table name, but building complete SQL string
    const results = await sql.unsafe(
      `SELECT *
       FROM ${aggregateName}
       WHERE time >= '${range.from.toISOString()}' AND time < '${range.to.toISOString()}'
       ORDER BY time ${opts.orderBy.direction.toUpperCase()}
       LIMIT ${opts.limit} OFFSET ${opts.offset}`,
    ) as Array<Record<string, unknown>>

    return results
  } catch (error) {
    throw new QueryError(
      'Failed to query continuous aggregate',
      error instanceof Error ? error : new Error(String(error)),
      `SELECT FROM ${aggregateName}`,
      [aggregateName, range.from, range.to],
    )
  }
}

/**
 * Create real-time aggregation using time_bucket_gapfill
 */
export async function getGapFilledAggregation(
  sql: SqlInstance,
  entityId: string,
  bucketInterval: string,
  range: TimeRange,
  fillValue: number | null = null,
  options: AggregationOptions = {},
): Promise<TimeBucketResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateEntityId(entityId)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket_gapfill(${bucketInterval}, time) as bucket,
        entity_id,
        locf(avg(value), ${fillValue}) as avg,
        coalesce(count(value), 0) as count,
        locf(min(value), ${fillValue}) as min,
        locf(max(value), ${fillValue}) as max,
        locf(first(value, time), ${fillValue}) as first,
        locf(last(value, time), ${fillValue}) as last
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket, entity_id
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      entity_id: string
      avg: number | null
      count: number
      min: number | null
      max: number | null
      first: number | null
      last: number | null
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
      entity_id: row.entity_id,
      count: row.count,
      avg: row.avg ?? undefined,
      min: row.min ?? undefined,
      max: row.max ?? undefined,
      first: row.first ?? undefined,
      last: row.last ?? undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate gap-filled aggregation',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT time_bucket_gapfill FROM time_series_data',
      [entityId, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate moving averages using window functions
 */
export async function getMovingAverages(
  sql: SqlInstance,
  entityId: string,
  windowSize: number,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<
  Array<{
    time: Date
    value: number
    sma: number
    ema: number
  }>
> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateEntityId(entityId)
  validateTimeRange(range)

  if (windowSize <= 0) {
    throw new ValidationError('Window size must be positive', 'windowSize', windowSize)
  }

  try {
    const results = await sql`
      SELECT
        time,
        value,
        avg(value) OVER (
          ORDER BY time 
          ROWS BETWEEN ${windowSize - 1} PRECEDING AND CURRENT ROW
        ) as sma,
        -- Exponential moving average approximation
        value * (2.0 / (${windowSize} + 1)) +
        lag(value) OVER (ORDER BY time) * (1 - 2.0 / (${windowSize} + 1)) as ema
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      time: string
      value: number
      sma: number
      ema: number | null
    }>

    return results.map((row) => ({
      time: new Date(row.time),
      value: row.value,
      sma: row.sma,
      ema: row.ema ?? row.value, // Fallback to value for first value
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate moving averages',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT moving averages FROM time_series_data',
      [entityId, windowSize, range.from, range.to],
    )
  }
}

/**
 * Get aggregated statistics for multiple entities
 */
export async function getMultiEntityAggregation(
  sql: SqlInstance,
  entityIds: string[],
  bucketInterval: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<TimeBucketResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  if (entityIds.length === 0) {
    return []
  }

  for (const entityId of entityIds) {
    validateEntityId(entityId)
  }
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket(${bucketInterval}, time) as bucket,
        entity_id,
        count(*) as count,
        avg(value) as avg,
        min(value) as min,
        max(value) as max,
        sum(value) as sum,
        first(value, time) as first,
        last(value, time) as last,
        stddev(value) as stddev
      FROM time_series_data
      WHERE entity_id = ANY(${entityIds})
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket, entity_id
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}, entity_id
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      entity_id: string
      count: number
      avg: number | null
      min: number | null
      max: number | null
      sum: number | null
      first: number | null
      last: number | null
      stddev: number | null
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
      entity_id: row.entity_id,
      count: row.count,
      avg: row.avg ?? undefined,
      min: row.min ?? undefined,
      max: row.max ?? undefined,
      sum: row.sum ?? undefined,
      first: row.first ?? undefined,
      last: row.last ?? undefined,
      stddev: row.stddev ?? undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate multi-entity aggregation',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT time_bucket FROM time_series_data',
      [entityIds, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Validate entity ID format
 */
function validateEntityId(entityId: string): void {
  if (!entityId || typeof entityId !== 'string' || entityId.trim().length === 0) {
    throw new ValidationError('Entity ID is required and must be a non-empty string', 'entityId', entityId)
  }

  if (entityId.length > 100) {
    throw new ValidationError('Entity ID must be 100 characters or less', 'entityId', entityId)
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(entityId)) {
    throw new ValidationError(
      'Entity ID must contain only letters, numbers, underscores, dots, and dashes',
      'entityId',
      entityId,
    )
  }
}

/**
 * Validate time range
 */
function validateTimeRange(range: TimeRange): void {
  if (!range.from || !range.to) {
    throw new ValidationError('Time range must include both from and to dates', 'range')
  }

  if (!(range.from instanceof Date) || !(range.to instanceof Date)) {
    throw new ValidationError('Time range from and to must be Date objects', 'range')
  }

  if (range.from >= range.to) {
    throw new ValidationError('Time range from must be before to', 'range')
  }
}

/**
 * Validate bucket interval format
 */
function validateBucketInterval(interval: string): void {
  // Valid TimescaleDB interval formats: '1 minute', '5 minutes', '1 hour', '1 day', etc.
  const intervalPattern = /^\d+\s+(second|minute|hour|day|week|month|year)s?$/i

  if (!intervalPattern.test(interval)) {
    throw new ValidationError(
      'Invalid bucket interval format. Use format like "1 minute", "5 minutes", "1 hour", etc.',
      'bucketInterval',
      interval,
    )
  }
}

/**
 * Validate continuous aggregate name
 */
function validateAggregateName(name: string): void {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Aggregate name is required', 'aggregateName', name)
  }

  // SQL identifier validation
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new ValidationError(
      'Aggregate name must be a valid SQL identifier',
      'aggregateName',
      name,
    )
  }
}
