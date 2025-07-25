/**
 * Aggregation operations for TimescaleDB client
 *
 * Provides time-windowed aggregations, OHLC calculations, and TimescaleDB-specific
 * aggregation functions for time-series data analysis.
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
  /** Number of data points in this time bucket */
  readonly count: number
  /** Average price in this time bucket */
  readonly avg?: number | undefined
  /** Minimum price in this time bucket */
  readonly min?: number | undefined
  /** Maximum price in this time bucket */
  readonly max?: number | undefined
  /** Sum of all prices in this time bucket */
  readonly sum?: number | undefined
  /** First price value in this time bucket (earliest by time) */
  readonly first?: number | undefined
  /** Last price value in this time bucket (latest by time) */
  readonly last?: number | undefined
  /** Standard deviation of prices in this time bucket */
  readonly stddev?: number | undefined
}

/**
 * Volume-weighted average price result
 */
export interface VwapResult {
  /** The time bucket timestamp */
  readonly bucket: Date
  /** The trading symbol */
  readonly symbol: string
  /** Volume-weighted average price for this bucket */
  readonly vwap: number
  /** Total trading volume for this bucket */
  readonly totalVolume: number
  /** Price range within this bucket */
  readonly priceRange: {
    /** Minimum price in this bucket */
    readonly min: number
    /** Maximum price in this bucket */
    readonly max: number
  }
}

/**
 * Price delta calculation result
 */
export interface PriceDeltaResult {
  /** The trading symbol */
  readonly symbol: string
  /** Starting price at the beginning of the time range */
  readonly startPrice: number
  /** Ending price at the end of the time range */
  readonly endPrice: number
  /** Absolute change in price (endPrice - startPrice) */
  readonly delta: number
  /** Percentage change in price over the time range */
  readonly percentChange: number
  /** Time range for the price delta calculation */
  readonly timeRange: TimeRange
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
}

/**
 * Calculate time-bucketed aggregations for price data
 */
export async function getTimeBucketAggregation(
  sql: SqlInstance,
  symbol: string,
  bucketInterval: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<TimeBucketResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket(${bucketInterval}, time) as bucket,
        count(*) as count,
        avg(price) as avg,
        min(price) as min,
        max(price) as max,
        sum(price) as sum,
        first(price, time) as first,
        last(price, time) as last,
        stddev(price) as stddev
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
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
      'SELECT time_bucket FROM price_ticks',
      [symbol, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate volume-weighted average price (VWAP) for time buckets
 */
export async function getVwap(
  sql: SqlInstance,
  symbol: string,
  bucketInterval: string,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<VwapResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket(${bucketInterval}, time) as bucket,
        symbol,
        sum(price * COALESCE(volume, 1)) / sum(COALESCE(volume, 1)) as vwap,
        sum(COALESCE(volume, 1)) as total_volume,
        min(price) as min_price,
        max(price) as max_price
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
        AND volume IS NOT NULL
      GROUP BY bucket, symbol
      HAVING sum(COALESCE(volume, 1)) > 0
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      symbol: string
      vwap: number
      total_volume: number
      min_price: number
      max_price: number
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
      symbol: row.symbol,
      vwap: row.vwap,
      totalVolume: row.total_volume,
      priceRange: {
        min: row.min_price,
        max: row.max_price,
      },
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate VWAP',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT time_bucket VWAP FROM price_ticks',
      [symbol, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate price delta between two time points
 */
export async function getPriceDelta(
  sql: SqlInstance,
  symbol: string,
  from: Date,
  to: Date,
): Promise<PriceDeltaResult> {
  validateSymbol(symbol)

  if (from >= to) {
    throw new ValidationError('From date must be before to date', 'from', from)
  }

  try {
    const results = await sql`
      WITH price_points AS (
        SELECT
          time,
          price,
          ROW_NUMBER() OVER (ORDER BY time ASC) as rn_asc,
          ROW_NUMBER() OVER (ORDER BY time DESC) as rn_desc
        FROM price_ticks
        WHERE symbol = ${symbol}
          AND time >= ${from.toISOString()}
          AND time <= ${to.toISOString()}
      ),
      first_price AS (
        SELECT price as start_price
        FROM price_points
        WHERE rn_asc = 1
      ),
      last_price AS (
        SELECT price as end_price
        FROM price_points
        WHERE rn_desc = 1
      )
      SELECT
        start_price,
        end_price,
        (end_price - start_price) as delta,
        CASE 
          WHEN start_price = 0 THEN NULL
          ELSE ((end_price - start_price) / start_price) * 100
        END as percent_change
      FROM first_price, last_price
    ` as Array<{
      start_price: number
      end_price: number
      delta: number
      percent_change: number | null
    }>

    if (results.length === 0) {
      throw new QueryError('No price data found for the specified time range')
    }

    const result = results[0]

    if (!result) {
      throw new QueryError('No price data found for the specified time range')
    }

    return {
      symbol,
      startPrice: result.start_price,
      endPrice: result.end_price,
      delta: result.delta,
      percentChange: result.percent_change ?? 0,
      timeRange: { from, to },
    }
  } catch (error) {
    throw new QueryError(
      'Failed to calculate price delta',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT price delta FROM price_ticks',
      [symbol, from, to],
    )
  }
}

/**
 * Calculate volatility (standard deviation) over a time period
 */
export async function getVolatility(
  sql: SqlInstance,
  symbol: string,
  hours: number,
): Promise<number> {
  validateSymbol(symbol)

  if (hours <= 0) {
    throw new ValidationError('Hours must be positive', 'hours', hours)
  }

  try {
    const results = await sql`
      SELECT
        stddev(price) as volatility,
        count(*) as sample_count
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= NOW() - INTERVAL '${hours} hours'
    ` as Array<{
      volatility: number | null
      sample_count: number
    }>

    const result = results[0]

    if (!result || result.sample_count === 0) {
      return 0
    }

    return result.volatility ?? 0
  } catch (error) {
    throw new QueryError(
      'Failed to calculate volatility',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT stddev FROM price_ticks',
      [symbol, hours],
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
  symbol: string,
  bucketInterval: string,
  range: TimeRange,
  fillValue: number | null = null,
  options: AggregationOptions = {},
): Promise<TimeBucketResult[]> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validateBucketInterval(bucketInterval)

  try {
    const results = await sql`
      SELECT
        time_bucket_gapfill(${bucketInterval}, time) as bucket,
        locf(avg(price), ${fillValue}) as avg,
        coalesce(count(price), 0) as count,
        locf(min(price), ${fillValue}) as min,
        locf(max(price), ${fillValue}) as max,
        locf(first(price, time), ${fillValue}) as first,
        locf(last(price, time), ${fillValue}) as last
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      avg: number | null
      count: number
      min: number | null
      max: number | null
      first: number | null
      last: number | null
    }>

    return results.map((row) => ({
      bucket: new Date(row.bucket),
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
      'SELECT time_bucket_gapfill FROM price_ticks',
      [symbol, bucketInterval, range.from, range.to],
    )
  }
}

/**
 * Calculate moving averages using window functions
 */
export async function getMovingAverages(
  sql: SqlInstance,
  symbol: string,
  windowSize: number,
  range: TimeRange,
  options: AggregationOptions = {},
): Promise<
  Array<{
    time: Date
    price: number
    sma: number
    ema: number
  }>
> {
  const opts = { ...DEFAULT_AGGREGATION_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)

  if (windowSize <= 0) {
    throw new ValidationError('Window size must be positive', 'windowSize', windowSize)
  }

  try {
    const results = await sql`
      SELECT
        time,
        price,
        avg(price) OVER (
          ORDER BY time 
          ROWS BETWEEN ${windowSize - 1} PRECEDING AND CURRENT ROW
        ) as sma,
        -- Exponential moving average approximation
        price * (2.0 / (${windowSize} + 1)) + 
        lag(price) OVER (ORDER BY time) * (1 - 2.0 / (${windowSize} + 1)) as ema
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      time: string
      price: number
      sma: number
      ema: number | null
    }>

    return results.map((row) => ({
      time: new Date(row.time),
      price: row.price,
      sma: row.sma,
      ema: row.ema ?? row.price, // Fallback to price for first value
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate moving averages',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT moving averages FROM price_ticks',
      [symbol, windowSize, range.from, range.to],
    )
  }
}

/**
 * Validate symbol format
 */
function validateSymbol(symbol: string): void {
  if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
    throw new ValidationError('Symbol is required and must be a non-empty string', 'symbol', symbol)
  }

  if (symbol.length > 20) {
    throw new ValidationError('Symbol must be 20 characters or less', 'symbol', symbol)
  }

  if (!/^[A-Z0-9_]+$/.test(symbol)) {
    throw new ValidationError('Symbol must contain only uppercase letters, numbers, and underscores', 'symbol', symbol)
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
