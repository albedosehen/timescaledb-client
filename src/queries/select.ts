/**
 * Select operations for TimescaleDB client
 *
 * Provides optimized SQL queries for retrieving price ticks and OHLC data
 * with time-range filtering, pagination, and streaming support.
 */

import type { SqlInstance } from '../types/internal.ts'
import type {
  LatestPrice,
  MultiSymbolLatest,
  Ohlc,
  PriceTick,
  QueryOptions,
  StreamingOptions,
  TimeInterval,
  TimeRange,
} from '../types/interfaces.ts'
import { QueryError, ValidationError } from '../types/errors.ts'

/**
 * Select configuration options
 */
export interface SelectOptions extends QueryOptions {
  /** Whether to include metadata fields */
  readonly includeMetadata?: boolean
  /** Custom ORDER BY clause */
  readonly customOrderBy?: string
  /** Whether to use streaming for large result sets */
  readonly useStreaming?: boolean
}

/**
 * Default select options
 */
const DEFAULT_SELECT_OPTIONS: Required<SelectOptions> = {
  limit: 1000,
  offset: 0,
  orderBy: { column: 'time', direction: 'desc' },
  where: {},
  includeStats: false,
  includeMetadata: false,
  customOrderBy: '',
  useStreaming: false,
}

/**
 * Get price ticks for a specific symbol and time range
 */
export async function getTicks(
  sql: SqlInstance,
  symbol: string,
  range: TimeRange,
  options: SelectOptions = {},
): Promise<PriceTick[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)

  if (opts.limit > 10000) {
    throw new ValidationError('Limit cannot exceed 10,000 records', 'limit', opts.limit)
  }

  try {
    let results: Array<{
      time: string
      symbol: string
      price: number
      volume: number | null
      exchange?: string | null
      data_source?: string | null
      bid_price?: number | null
      ask_price?: number | null
      created_at?: string | null
    }>

    if (opts.includeMetadata) {
      results = await sql`
        SELECT time, symbol, price, volume, exchange, data_source, bid_price, ask_price, created_at
        FROM price_ticks
        WHERE symbol = ${symbol} AND time >= ${range.from.toISOString()} AND time < ${range.to.toISOString()}
        ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    } else {
      results = await sql`
        SELECT time, symbol, price, volume
        FROM price_ticks
        WHERE symbol = ${symbol} AND time >= ${range.from.toISOString()} AND time < ${range.to.toISOString()}
        ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    }

    return results.map((row) => ({
      symbol: row.symbol,
      price: row.price,
      volume: row.volume ?? undefined,
      timestamp: row.time,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve price ticks',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM price_ticks',
      [symbol, range.from, range.to],
    )
  }
}

/**
 * Get OHLC data for a specific symbol, interval, and time range
 */
export async function getOhlc(
  sql: SqlInstance,
  symbol: string,
  interval: TimeInterval,
  range: TimeRange,
  options: SelectOptions = {},
): Promise<Ohlc[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)
  validateTimeInterval(interval)

  if (opts.limit > 10000) {
    throw new ValidationError('Limit cannot exceed 10,000 records', 'limit', opts.limit)
  }

  try {
    const results = await sql`
      SELECT 
        time,
        symbol,
        open,
        high,
        low,
        close,
        volume,
        price_change,
        price_change_percent
        ${opts.includeMetadata ? sql`, data_source, created_at` : sql``}
      FROM ohlc_data
      WHERE symbol = ${symbol}
        AND interval_duration = ${interval}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      time: string
      symbol: string
      open: number
      high: number
      low: number
      close: number
      volume: number | null
      price_change: number | null
      price_change_percent: number | null
      data_source?: string | null
      created_at?: string | null
    }>

    return results.map((row) => ({
      symbol: row.symbol,
      timestamp: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume ?? undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve OHLC data',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM ohlc_data',
      [symbol, interval, range.from, range.to],
    )
  }
}

/**
 * Generate OHLC data dynamically from tick data using TimescaleDB aggregation functions
 */
export async function getOhlcFromTicks(
  sql: SqlInstance,
  symbol: string,
  intervalMinutes: number,
  range: TimeRange,
  options: SelectOptions = {},
): Promise<Ohlc[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  validateSymbol(symbol)
  validateTimeRange(range)

  if (intervalMinutes <= 0) {
    throw new ValidationError('Interval minutes must be positive', 'intervalMinutes', intervalMinutes)
  }

  if (opts.limit > 10000) {
    throw new ValidationError('Limit cannot exceed 10,000 records', 'limit', opts.limit)
  }

  try {
    const intervalSpec = `${intervalMinutes} minutes`

    const results = await sql`
      SELECT
        time_bucket(${intervalSpec}, time) as bucket,
        symbol,
        first(price, time) as open,
        max(price) as high,
        min(price) as low,
        last(price, time) as close,
        sum(volume) as volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      GROUP BY bucket, symbol
      ORDER BY bucket ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      bucket: string
      symbol: string
      open: number
      high: number
      low: number
      close: number
      volume: number | null
    }>

    return results.map((row) => ({
      symbol: row.symbol,
      timestamp: row.bucket,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume ?? undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to generate OHLC from ticks',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT time_bucket FROM price_ticks',
      [symbol, intervalMinutes, range.from, range.to],
    )
  }
}

/**
 * Get the most recent price for a symbol
 */
export async function getLatestPrice(
  sql: SqlInstance,
  symbol: string,
): Promise<number | null> {
  validateSymbol(symbol)

  try {
    const results = await sql`
      SELECT price
      FROM price_ticks
      WHERE symbol = ${symbol}
      ORDER BY time DESC
      LIMIT 1
    ` as Array<{ price: number }>

    return results.length > 0 ? results[0]!.price : null
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve latest price',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT price FROM price_ticks',
      [symbol],
    )
  }
}

/**
 * Get latest prices for multiple symbols efficiently
 */
export async function getMultiSymbolLatest(
  sql: SqlInstance,
  symbols: string[],
): Promise<MultiSymbolLatest> {
  if (symbols.length === 0) {
    return {
      prices: [],
      retrievedAt: new Date(),
      requested: 0,
      found: 0,
    }
  }

  for (const symbol of symbols) {
    validateSymbol(symbol)
  }

  try {
    const results = await sql`
      SELECT DISTINCT ON (symbol)
        symbol,
        price,
        volume,
        time
      FROM price_ticks
      WHERE symbol = ANY(${symbols})
      ORDER BY symbol, time DESC
    ` as Array<{
      symbol: string
      price: number
      volume: number | null
      time: string
    }>

    const prices: LatestPrice[] = results.map((row) => ({
      symbol: row.symbol,
      price: row.price,
      volume: row.volume ?? undefined,
      timestamp: new Date(row.time),
    }))

    return {
      prices,
      retrievedAt: new Date(),
      requested: symbols.length,
      found: prices.length,
    }
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve multi-symbol latest prices',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT DISTINCT ON (symbol) FROM price_ticks',
      symbols,
    )
  }
}

/**
 * Stream large tick datasets to avoid memory issues
 */
export async function* getTicksStream(
  sql: SqlInstance,
  symbol: string,
  range: TimeRange,
  options: StreamingOptions = {},
): AsyncIterable<PriceTick[]> {
  validateSymbol(symbol)
  validateTimeRange(range)

  const batchSize = options.batchSize || 1000

  try {
    const cursor = sql`
      SELECT 
        time,
        symbol,
        price,
        volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time DESC
    `.cursor(batchSize)

    for await (const rows of cursor) {
      const ticks: PriceTick[] = (rows as { symbol: string; price: number; volume: number | null; time: string }[]).map(
        (row) => ({
          symbol: row.symbol,
          price: row.price,
          volume: row.volume ?? undefined,
          timestamp: row.time,
        }),
      )

      yield ticks
    }
  } catch (error) {
    throw new QueryError(
      'Failed to stream price ticks',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM price_ticks (streaming)',
      [symbol, range.from, range.to],
    )
  }
}

/**
 * Stream OHLC data for large datasets
 */
export async function* getOhlcStream(
  sql: SqlInstance,
  symbol: string,
  interval: TimeInterval,
  range: TimeRange,
  options: StreamingOptions = {},
): AsyncIterable<Ohlc[]> {
  validateSymbol(symbol)
  validateTimeRange(range)
  validateTimeInterval(interval)

  const batchSize = options.batchSize || 1000

  try {
    const cursor = sql`
      SELECT 
        time,
        symbol,
        open,
        high,
        low,
        close,
        volume
      FROM ohlc_data
      WHERE symbol = ${symbol}
        AND interval_duration = ${interval}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time DESC
    `.cursor(batchSize)

    for await (const rows of cursor) {
      const candles: Ohlc[] = (rows as {
        symbol: string
        time: string
        open: number
        high: number
        low: number
        close: number
        volume: number | null
      }[]).map((row) => ({
        symbol: row.symbol,
        timestamp: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume ?? undefined,
      }))

      yield candles
    }
  } catch (error) {
    throw new QueryError(
      'Failed to stream OHLC data',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM ohlc_data (streaming)',
      [symbol, interval, range.from, range.to],
    )
  }
}

/**
 * Get available symbols with their metadata
 */
export async function getAvailableSymbols(
  sql: SqlInstance,
  options: SelectOptions = {},
): Promise<Array<{ symbol: string; assetType: string; exchange?: string; isActive: boolean }>> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  try {
    const results = await sql`
      SELECT 
        symbol,
        asset_type,
        exchange,
        is_active
      FROM symbols
      WHERE is_active = true
      ORDER BY symbol
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      symbol: string
      asset_type: string
      exchange: string | null
      is_active: boolean
    }>

    return results.map((row) => ({
      symbol: row.symbol,
      assetType: row.asset_type,
      exchange: row.exchange ?? undefined,
      isActive: row.is_active,
    })) as Array<{ symbol: string; assetType: string; exchange?: string; isActive: boolean }>
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve available symbols',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM symbols',
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

  // Limit range to prevent excessive queries
  const maxRangeDays = 365 // 1 year
  const rangeDays = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)

  if (rangeDays > maxRangeDays) {
    throw new ValidationError(
      `Time range cannot exceed ${maxRangeDays} days`,
      'range',
      `${rangeDays} days`,
    )
  }
}

/**
 * Validate time interval
 */
function validateTimeInterval(interval: TimeInterval): void {
  const validIntervals: TimeInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']

  if (!validIntervals.includes(interval)) {
    throw new ValidationError(
      `Invalid time interval. Must be one of: ${validIntervals.join(', ')}`,
      'interval',
      interval,
    )
  }
}
