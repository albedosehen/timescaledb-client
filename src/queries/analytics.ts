/**
 * Analytics operations for TimescaleDB client
 *
 * Provides advanced financial analysis, technical indicators, and market analytics
 * using TimescaleDB's powerful time-series functions.
 */

import type { SqlInstance } from '../types/internal.ts'
import type { QueryOptions, TimeRange, TopMover, VolumeProfile } from '../types/interfaces.ts'
import { QueryError, ValidationError } from '../types/errors.ts'

/**
 * Analytics configuration options
 */
export interface AnalyticsOptions extends QueryOptions {
  /** Minimum volume threshold for calculations */
  readonly minVolume?: number
  /** Smoothing factor for exponential calculations */
  readonly smoothingFactor?: number
  /** Whether to include statistical metadata */
  readonly includeStats?: boolean
}

/**
 * Technical indicator result
 */
export interface TechnicalIndicatorResult {
  /** Timestamp of the indicator value */
  readonly time: Date
  /** Calculated indicator value */
  readonly value: number
  /** Optional trading signal based on the indicator */
  readonly signal?: 'buy' | 'sell' | 'hold'
}

/**
 * RSI (Relative Strength Index) result
 */
export interface RSIResult extends TechnicalIndicatorResult {
  /** Relative Strength Index value (0-100) */
  readonly rsi: number
  /** Average gain over the calculation period */
  readonly avgGain: number
  /** Average loss over the calculation period */
  readonly avgLoss: number
}

/**
 * Bollinger Bands result
 */
export interface BollingerBandsResult {
  /** Timestamp of the calculation */
  readonly time: Date
  /** Price at this timestamp */
  readonly price: number
  /** Simple Moving Average (middle band) */
  readonly sma: number
  /** Upper Bollinger Band */
  readonly upperBand: number
  /** Lower Bollinger Band */
  readonly lowerBand: number
  /** Bandwidth (distance between upper and lower bands) */
  readonly bandwidth: number
  /** %B indicator (position within bands) */
  readonly percentB: number
}

/**
 * Support and resistance levels
 */
export interface SupportResistanceLevel {
  /** Price level of support/resistance */
  readonly level: number
  /** Strength of the level (0-1) */
  readonly strength: number
  /** Number of times price has touched this level */
  readonly touches: number
  /** Type of level */
  readonly type: 'support' | 'resistance'
  /** First time price touched this level */
  readonly firstTouch: Date
  /** Most recent time price touched this level */
  readonly lastTouch: Date
}

/**
 * Market correlation result
 */
export interface CorrelationResult {
  /** First symbol in the correlation pair */
  readonly symbol1: string
  /** Second symbol in the correlation pair */
  readonly symbol2: string
  /** Correlation coefficient (-1 to 1) */
  readonly correlation: number
  /** Statistical significance (p-value) */
  readonly pValue: number
  /** Number of data points used in calculation */
  readonly sampleSize: number
  /** Time range of the analysis */
  readonly timeRange: TimeRange
}

/**
 * Price momentum analysis
 */
export interface MomentumResult {
  readonly symbol: string
  readonly momentum: number
  readonly velocity: number
  readonly acceleration: number
  readonly trend: 'bullish' | 'bearish' | 'neutral'
  readonly strength: number
}

/**
 * Default analytics options
 */
const DEFAULT_ANALYTICS_OPTIONS: Required<AnalyticsOptions> = {
  limit: 1000,
  offset: 0,
  orderBy: { column: 'time', direction: 'desc' },
  where: {},
  includeStats: true,
  minVolume: 0,
  smoothingFactor: 0.1,
}

/**
 * Calculate Simple Moving Average (SMA)
 */
export async function calculateSMA(
  sql: SqlInstance,
  symbol: string,
  period: number,
  range: TimeRange,
  options: AnalyticsOptions = {},
): Promise<TechnicalIndicatorResult[]> {
  const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validatePeriod(period)

  try {
    const results = await sql`
      SELECT
        time,
        avg(price) OVER (
          ORDER BY time 
          ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
        ) as sma_value
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      time: string
      sma_value: number
    }>

    return results.map((row) => ({
      time: new Date(row.time),
      value: row.sma_value,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate SMA',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT SMA FROM price_ticks',
      [symbol, period, range.from, range.to],
    )
  }
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export async function calculateEMA(
  sql: SqlInstance,
  symbol: string,
  period: number,
  range: TimeRange,
  options: AnalyticsOptions = {},
): Promise<TechnicalIndicatorResult[]> {
  const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validatePeriod(period)

  const alpha = 2.0 / (period + 1)

  try {
    const results = await sql`
      WITH recursive ema_calc AS (
        -- Base case: first row uses SMA as initial EMA
        SELECT 
          time,
          price,
          price as ema_value,
          ROW_NUMBER() OVER (ORDER BY time) as rn
        FROM price_ticks
        WHERE symbol = ${symbol}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        ORDER BY time
        LIMIT 1
        
        UNION ALL
        
        -- Recursive case: calculate EMA
        SELECT 
          pt.time,
          pt.price,
          ${alpha} * pt.price + ${1 - alpha} * ec.ema_value as ema_value,
          ec.rn + 1
        FROM price_ticks pt
        JOIN ema_calc ec ON pt.time > ec.time
        WHERE pt.symbol = ${symbol}
          AND pt.time >= ${range.from.toISOString()}
          AND pt.time < ${range.to.toISOString()}
        ORDER BY pt.time
        LIMIT 1
      )
      SELECT time, ema_value
      FROM ema_calc
      ORDER BY time
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      time: string
      ema_value: number
    }>

    return results.map((row) => ({
      time: new Date(row.time),
      value: row.ema_value,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate EMA',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT EMA FROM price_ticks',
      [symbol, period, range.from, range.to],
    )
  }
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export async function calculateRSI(
  sql: SqlInstance,
  symbol: string,
  range: TimeRange,
  period: number = 14,
  options: AnalyticsOptions = {},
): Promise<RSIResult[]> {
  const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validatePeriod(period)

  try {
    const results = await sql`
      WITH price_changes AS (
        SELECT
          time,
          price,
          price - LAG(price) OVER (ORDER BY time) as change
        FROM price_ticks
        WHERE symbol = ${symbol}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        ORDER BY time
      ),
      gains_losses AS (
        SELECT
          time,
          price,
          CASE WHEN change > 0 THEN change ELSE 0 END as gain,
          CASE WHEN change < 0 THEN ABS(change) ELSE 0 END as loss
        FROM price_changes
        WHERE change IS NOT NULL
      ),
      avg_gains_losses AS (
        SELECT
          time,
          price,
          AVG(gain) OVER (
            ORDER BY time 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as avg_gain,
          AVG(loss) OVER (
            ORDER BY time 
            ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
          ) as avg_loss
        FROM gains_losses
      )
      SELECT
        time,
        price,
        avg_gain,
        avg_loss,
        CASE 
          WHEN avg_loss = 0 THEN 100
          ELSE 100 - (100 / (1 + (avg_gain / avg_loss)))
        END as rsi
      FROM avg_gains_losses
      ORDER BY time
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      time: string
      price: number
      avg_gain: number
      avg_loss: number
      rsi: number
    }>

    return results.map((row) => ({
      time: new Date(row.time),
      value: row.rsi,
      rsi: row.rsi,
      avgGain: row.avg_gain,
      avgLoss: row.avg_loss,
      signal: row.rsi > 70 ? 'sell' : row.rsi < 30 ? 'buy' : 'hold',
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate RSI',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT RSI FROM price_ticks',
      [symbol, period, range.from, range.to],
    )
  }
}

/**
 * Calculate Bollinger Bands
 */
export async function calculateBollingerBands(
  sql: SqlInstance,
  symbol: string,
  range: TimeRange,
  period: number = 20,
  stdDevMultiplier: number = 2,
  options: AnalyticsOptions = {},
): Promise<BollingerBandsResult[]> {
  const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validatePeriod(period)

  try {
    const results = await sql`
      SELECT
        time,
        price,
        AVG(price) OVER (
          ORDER BY time 
          ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
        ) as sma,
        STDDEV(price) OVER (
          ORDER BY time 
          ROWS BETWEEN ${period - 1} PRECEDING AND CURRENT ROW
        ) as std_dev
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
      std_dev: number
    }>

    return results.map((row) => {
      const upperBand = row.sma + (stdDevMultiplier * row.std_dev)
      const lowerBand = row.sma - (stdDevMultiplier * row.std_dev)
      const bandwidth = (upperBand - lowerBand) / row.sma
      const percentB = (row.price - lowerBand) / (upperBand - lowerBand)

      return {
        time: new Date(row.time),
        price: row.price,
        sma: row.sma,
        upperBand,
        lowerBand,
        bandwidth,
        percentB,
      }
    })
  } catch (error) {
    throw new QueryError(
      'Failed to calculate Bollinger Bands',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT Bollinger Bands FROM price_ticks',
      [symbol, period, stdDevMultiplier, range.from, range.to],
    )
  }
}

/**
 * Get top price movers over a time period
 */
export async function getTopMovers(
  sql: SqlInstance,
  _options: AnalyticsOptions = {},
  limit: number = 10,
  hours: number = 24,
): Promise<TopMover[]> {
  // const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  if (limit <= 0 || limit > 100) {
    throw new ValidationError('Limit must be between 1 and 100', 'limit', limit)
  }

  if (hours <= 0) {
    throw new ValidationError('Hours must be positive', 'hours', hours)
  }

  try {
    const results = await sql`
      WITH price_changes AS (
        SELECT
          symbol,
          first(price, time) as start_price,
          last(price, time) as current_price,
          sum(COALESCE(volume, 0)) as total_volume
        FROM price_ticks
        WHERE time >= NOW() - INTERVAL '${hours} hours'
        GROUP BY symbol
        HAVING count(*) >= 2
      )
      SELECT
        symbol,
        start_price,
        current_price,
        (current_price - start_price) as price_change,
        CASE 
          WHEN start_price = 0 THEN 0
          ELSE ((current_price - start_price) / start_price) * 100
        END as percent_change,
        total_volume
      FROM price_changes
      WHERE start_price > 0
      ORDER BY ABS(percent_change) DESC
      LIMIT ${limit}
    ` as Array<{
      symbol: string
      start_price: number
      current_price: number
      price_change: number
      percent_change: number
      total_volume: number
    }>

    return results.map((row) => ({
      symbol: row.symbol,
      startPrice: row.start_price,
      currentPrice: row.current_price,
      priceChange: row.price_change,
      percentChange: row.percent_change,
      volume: row.total_volume,
      periodHours: hours,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to get top movers',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT top movers FROM price_ticks',
      [limit, hours],
    )
  }
}

/**
 * Calculate volume profile for price distribution analysis
 */
export async function getVolumeProfile(
  sql: SqlInstance,
  symbol: string,
  range: TimeRange,
  buckets: number = 20,
  options: AnalyticsOptions = {},
): Promise<VolumeProfile[]> {
  const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)

  if (buckets <= 0 || buckets > 100) {
    throw new ValidationError('Buckets must be between 1 and 100', 'buckets', buckets)
  }

  try {
    const results = await sql`
      WITH price_range AS (
        SELECT
          min(price) as min_price,
          max(price) as max_price
        FROM price_ticks
        WHERE symbol = ${symbol}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
      ),
      price_buckets AS (
        SELECT
          width_bucket(
            price, 
            min_price, 
            max_price, 
            ${buckets}
          ) as bucket,
          min_price + (max_price - min_price) * (width_bucket(price, min_price, max_price, ${buckets}) - 1) / ${buckets} as price_level,
          sum(COALESCE(volume, 1)) as volume,
          count(*) as trade_count
        FROM price_ticks, price_range
        WHERE symbol = ${symbol}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        GROUP BY bucket, min_price, max_price
      ),
      total_volume AS (
        SELECT sum(volume) as total_vol
        FROM price_buckets
      )
      SELECT
        price_level,
        volume,
        trade_count,
        (volume / total_vol) * 100 as volume_percent
      FROM price_buckets, total_volume
      ORDER BY volume DESC
      LIMIT ${opts.limit}
    ` as Array<{
      price_level: number
      volume: number
      trade_count: number
      volume_percent: number
    }>

    return results.map((row) => ({
      priceLevel: row.price_level,
      volume: row.volume,
      tradeCount: row.trade_count,
      volumePercent: row.volume_percent,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to calculate volume profile',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT volume profile FROM price_ticks',
      [symbol, buckets, range.from, range.to],
    )
  }
}

/**
 * Find support and resistance levels
 */
export async function findSupportResistanceLevels(
  sql: SqlInstance,
  symbol: string,
  range: TimeRange,
  tolerance: number = 0.005, // 0.5% tolerance
  minTouches: number = 3,
  options: AnalyticsOptions = {},
): Promise<SupportResistanceLevel[]> {
  const opts = { ...DEFAULT_ANALYTICS_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)

  try {
    const results = await sql`
      WITH price_levels AS (
        SELECT
          price,
          time,
          ROUND(price / (price * ${tolerance})) * (price * ${tolerance}) as level_group
        FROM price_ticks
        WHERE symbol = ${symbol}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
      ),
      level_stats AS (
        SELECT
          level_group as level,
          count(*) as touches,
          min(time) as first_touch,
          max(time) as last_touch,
          CASE 
            WHEN avg(price) <= percentile_cont(0.5) WITHIN GROUP (ORDER BY price) THEN 'support'
            ELSE 'resistance'
          END as type
        FROM price_levels
        GROUP BY level_group
        HAVING count(*) >= ${minTouches}
      )
      SELECT
        level,
        touches,
        type,
        first_touch,
        last_touch,
        touches * LOG(touches) as strength
      FROM level_stats
      ORDER BY strength DESC
      LIMIT ${opts.limit}
    ` as Array<{
      level: number
      touches: number
      type: 'support' | 'resistance'
      first_touch: string
      last_touch: string
      strength: number
    }>

    return results.map((row) => ({
      level: row.level,
      strength: row.strength,
      touches: row.touches,
      type: row.type,
      firstTouch: new Date(row.first_touch),
      lastTouch: new Date(row.last_touch),
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to find support/resistance levels',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT support/resistance FROM price_ticks',
      [symbol, tolerance, minTouches, range.from, range.to],
    )
  }
}

/**
 * Calculate correlation between two symbols
 */
export async function calculateCorrelation(
  sql: SqlInstance,
  symbol1: string,
  symbol2: string,
  range: TimeRange,
  _options: AnalyticsOptions = {},
): Promise<CorrelationResult> {
  validateSymbol(symbol1)
  validateSymbol(symbol2)
  validateTimeRange(range)

  try {
    const results = await sql`
      WITH aligned_prices AS (
        SELECT
          p1.time,
          p1.price as price1,
          p2.price as price2
        FROM price_ticks p1
        JOIN price_ticks p2 ON p1.time = p2.time
        WHERE p1.symbol = ${symbol1}
          AND p2.symbol = ${symbol2}
          AND p1.time >= ${range.from.toISOString()}
          AND p1.time < ${range.to.toISOString()}
      )
      SELECT
        corr(price1, price2) as correlation,
        count(*) as sample_size
      FROM aligned_prices
    ` as Array<{
      correlation: number | null
      sample_size: number
    }>

    const result = results[0]

    if (!result || result.sample_size < 2) {
      throw new QueryError('Insufficient data for correlation calculation')
    }

    return {
      symbol1,
      symbol2,
      correlation: result.correlation ?? 0,
      pValue: 0, // Would need additional statistical calculation
      sampleSize: result.sample_size,
      timeRange: range,
    }
  } catch (error) {
    throw new QueryError(
      'Failed to calculate correlation',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT correlation FROM price_ticks',
      [symbol1, symbol2, range.from, range.to],
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
 * Validate period for technical indicators
 */
function validatePeriod(period: number): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new ValidationError('Period must be a positive integer', 'period', period)
  }

  if (period > 1000) {
    throw new ValidationError('Period cannot exceed 1000', 'period', period)
  }
}
