/**
 * Insert operations for TimescaleDB client
 *
 * Provides optimized SQL builders for inserting price ticks and OHLC data
 * with batch processing, upsert operations, and performance monitoring.
 */

import type { SqlInstance } from '../types/internal.ts'
import type { BatchResult, Ohlc, PriceTick } from '../types/interfaces.ts'
import { BatchError, QueryError, ValidationError } from '../types/errors.ts'

/**
 * Insert configuration options
 */
export interface InsertOptions {
  /** Whether to use upsert (ON CONFLICT DO UPDATE) */
  readonly upsert?: boolean
  /** Batch size for chunking large operations */
  readonly batchSize?: number
  /** Whether to use a transaction for the entire batch */
  readonly useTransaction?: boolean
  /** Timeout in milliseconds */
  readonly timeoutMs?: number
  /** Whether to validate data before insertion */
  readonly validate?: boolean
}

/**
 * Default insert options
 */
const DEFAULT_INSERT_OPTIONS: Required<InsertOptions> = {
  upsert: true,
  batchSize: 5000,
  useTransaction: true,
  timeoutMs: 30000,
  validate: true,
}

/**
 * Insert a single price tick
 */
export async function insertTick(
  sql: SqlInstance,
  tick: PriceTick,
  options: InsertOptions = {},
): Promise<void> {
  const opts = { ...DEFAULT_INSERT_OPTIONS, ...options }

  if (opts.validate) {
    validatePriceTick(tick)
  }

  try {
    if (opts.upsert) {
      await sql`
        INSERT INTO price_ticks (time, symbol, price, volume)
        VALUES (${tick.timestamp}, ${tick.symbol}, ${tick.price}, ${tick.volume || null})
        ON CONFLICT (symbol, time)
        DO UPDATE SET
          price = EXCLUDED.price,
          volume = EXCLUDED.volume,
          created_at = NOW()
      `
    } else {
      await sql`
        INSERT INTO price_ticks (time, symbol, price, volume)
        VALUES (${tick.timestamp}, ${tick.symbol}, ${tick.price}, ${tick.volume || null})
      `
    }
  } catch (error) {
    throw new QueryError(
      'Failed to insert price tick',
      error instanceof Error ? error : new Error(String(error)),
      'INSERT INTO price_ticks',
      [tick.symbol, tick.price],
    )
  }
}

/**
 * Insert a single OHLC candle
 */
export async function insertOhlc(
  sql: SqlInstance,
  candle: Ohlc,
  options: InsertOptions = {},
): Promise<void> {
  const opts = { ...DEFAULT_INSERT_OPTIONS, ...options }

  if (opts.validate) {
    validateOhlc(candle)
  }

  try {
    if (opts.upsert) {
      await sql`
        INSERT INTO ohlc_data (time, symbol, interval_duration, open, high, low, close, volume)
        VALUES (${candle.timestamp}, ${candle.symbol}, ${'1m'}, ${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}, ${
        candle.volume || null
      })
        ON CONFLICT (symbol, interval_duration, time)
        DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          created_at = NOW()
      `
    } else {
      await sql`
        INSERT INTO ohlc_data (time, symbol, interval_duration, open, high, low, close, volume)
        VALUES (${candle.timestamp}, ${candle.symbol}, ${'1m'}, ${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}, ${
        candle.volume || null
      })
      `
    }
  } catch (error) {
    throw new QueryError(
      'Failed to insert OHLC candle',
      error instanceof Error ? error : new Error(String(error)),
      'INSERT INTO ohlc_data',
      [candle.symbol, candle.open, candle.high, candle.low, candle.close],
    )
  }
}

/**
 * Insert multiple price ticks efficiently in batches
 */
export async function insertManyTicks(
  sql: SqlInstance,
  ticks: PriceTick[],
  options: InsertOptions = {},
): Promise<BatchResult> {
  const opts = { ...DEFAULT_INSERT_OPTIONS, ...options }
  const startTime = performance.now()

  if (ticks.length === 0) {
    return {
      processed: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    }
  }

  if (opts.validate) {
    for (const tick of ticks) {
      validatePriceTick(tick)
    }
  }

  let processed = 0
  let failed = 0
  const errors: Error[] = []

  try {
    // Process in chunks
    const chunks = chunkArray(ticks, opts.batchSize)

    for (const chunk of chunks) {
      try {
        if (opts.useTransaction) {
          await sql.begin(async (sql: SqlInstance) => {
            await insertTickBatch(sql, chunk, opts.upsert)
          })
        } else {
          await insertTickBatch(sql, chunk, opts.upsert)
        }
        processed += chunk.length
      } catch (error) {
        failed += chunk.length
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const durationMs = Math.round(performance.now() - startTime)

    if (failed > 0) {
      throw new BatchError(
        `Batch operation partially failed: ${processed} succeeded, ${failed} failed`,
        processed,
        failed,
        errors,
      )
    }

    return {
      processed,
      failed,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    if (error instanceof BatchError) {
      throw error
    }

    throw new BatchError(
      'Batch tick insertion failed',
      processed,
      failed || ticks.length,
      [error instanceof Error ? error : new Error(String(error))],
    )
  }
}

/**
 * Insert multiple OHLC candles efficiently in batches
 */
export async function insertManyOhlc(
  sql: SqlInstance,
  candles: Ohlc[],
  options: InsertOptions = {},
): Promise<BatchResult> {
  const opts = { ...DEFAULT_INSERT_OPTIONS, ...options }
  const startTime = performance.now()

  if (candles.length === 0) {
    return {
      processed: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    }
  }

  if (opts.validate) {
    for (const candle of candles) {
      validateOhlc(candle)
    }
  }

  let processed = 0
  let failed = 0
  const errors: Error[] = []

  try {
    // Process in chunks
    const chunks = chunkArray(candles, opts.batchSize)

    for (const chunk of chunks) {
      try {
        if (opts.useTransaction) {
          await sql.begin(async (sql: SqlInstance) => {
            await insertOhlcBatch(sql, chunk, opts.upsert)
          })
        } else {
          await insertOhlcBatch(sql, chunk, opts.upsert)
        }
        processed += chunk.length
      } catch (error) {
        failed += chunk.length
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const durationMs = Math.round(performance.now() - startTime)

    if (failed > 0) {
      throw new BatchError(
        `Batch operation partially failed: ${processed} succeeded, ${failed} failed`,
        processed,
        failed,
        errors,
      )
    }

    return {
      processed,
      failed,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    if (error instanceof BatchError) {
      throw error
    }

    throw new BatchError(
      'Batch OHLC insertion failed',
      processed,
      failed || candles.length,
      [error instanceof Error ? error : new Error(String(error))],
    )
  }
}

/**
 * Insert a batch of price ticks using optimized bulk insert
 */
async function insertTickBatch(
  sql: SqlInstance,
  ticks: PriceTick[],
  upsert: boolean,
): Promise<void> {
  const tickData = ticks.map((tick) => ({
    time: tick.timestamp,
    symbol: tick.symbol,
    price: tick.price,
    volume: tick.volume || null,
  }))

  if (upsert) {
    await sql`
      INSERT INTO price_ticks ${sql(tickData, 'time', 'symbol', 'price', 'volume')}
      ON CONFLICT (symbol, time)
      DO UPDATE SET
        price = EXCLUDED.price,
        volume = EXCLUDED.volume,
        created_at = NOW()
    `
  } else {
    await sql`
      INSERT INTO price_ticks ${sql(tickData, 'time', 'symbol', 'price', 'volume')}
    `
  }
}

/**
 * Insert a batch of OHLC candles using optimized bulk insert
 */
async function insertOhlcBatch(
  sql: SqlInstance,
  candles: Ohlc[],
  upsert: boolean,
): Promise<void> {
  const candleData = candles.map((candle) => ({
    time: candle.timestamp,
    symbol: candle.symbol,
    interval_duration: '1m', // Default interval
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume || null,
  }))

  if (upsert) {
    await sql`
      INSERT INTO ohlc_data ${
      sql(candleData, 'time', 'symbol', 'interval_duration', 'open', 'high', 'low', 'close', 'volume')
    }
      ON CONFLICT (symbol, interval_duration, time)
      DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        created_at = NOW()
    `
  } else {
    await sql`
      INSERT INTO ohlc_data ${
      sql(candleData, 'time', 'symbol', 'interval_duration', 'open', 'high', 'low', 'close', 'volume')
    }
    `
  }
}

/**
 * Validate price tick data
 */
function validatePriceTick(tick: PriceTick): void {
  if (!tick.symbol || typeof tick.symbol !== 'string' || tick.symbol.trim().length === 0) {
    throw new ValidationError('Symbol is required and must be a non-empty string', 'symbol', tick.symbol)
  }

  if (tick.symbol.length > 20) {
    throw new ValidationError('Symbol must be 20 characters or less', 'symbol', tick.symbol)
  }

  if (!/^[A-Z0-9_]+$/.test(tick.symbol)) {
    throw new ValidationError(
      'Symbol must contain only uppercase letters, numbers, and underscores',
      'symbol',
      tick.symbol,
    )
  }

  if (typeof tick.price !== 'number' || !isFinite(tick.price) || tick.price <= 0) {
    throw new ValidationError('Price must be a positive finite number', 'price', tick.price)
  }

  if (tick.volume !== undefined && (typeof tick.volume !== 'number' || !isFinite(tick.volume) || tick.volume < 0)) {
    throw new ValidationError('Volume must be a non-negative finite number', 'volume', tick.volume)
  }

  if (!tick.timestamp || typeof tick.timestamp !== 'string') {
    throw new ValidationError('Timestamp is required and must be a string', 'timestamp', tick.timestamp)
  }

  // Validate ISO 8601 format
  try {
    const date = new Date(tick.timestamp)
    if (isNaN(date.getTime())) {
      throw new ValidationError('Timestamp must be a valid ISO 8601 date string', 'timestamp', tick.timestamp)
    }
  } catch {
    throw new ValidationError('Timestamp must be a valid ISO 8601 date string', 'timestamp', tick.timestamp)
  }
}

/**
 * Validate OHLC data
 */
function validateOhlc(candle: Ohlc): void {
  if (!candle.symbol || typeof candle.symbol !== 'string' || candle.symbol.trim().length === 0) {
    throw new ValidationError('Symbol is required and must be a non-empty string', 'symbol', candle.symbol)
  }

  if (candle.symbol.length > 20) {
    throw new ValidationError('Symbol must be 20 characters or less', 'symbol', candle.symbol)
  }

  if (!/^[A-Z0-9_]+$/.test(candle.symbol)) {
    throw new ValidationError(
      'Symbol must contain only uppercase letters, numbers, and underscores',
      'symbol',
      candle.symbol,
    )
  }

  // Validate all OHLC prices
  const prices = { open: candle.open, high: candle.high, low: candle.low, close: candle.close }

  for (const [field, price] of Object.entries(prices)) {
    if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
      throw new ValidationError(`${field} must be a positive finite number`, field, price)
    }
  }

  // Validate OHLC relationships
  if (candle.high < Math.max(candle.open, candle.close)) {
    throw new ValidationError('High must be greater than or equal to max(open, close)', 'high', candle.high)
  }

  if (candle.low > Math.min(candle.open, candle.close)) {
    throw new ValidationError('Low must be less than or equal to min(open, close)', 'low', candle.low)
  }

  if (
    candle.volume !== undefined && (typeof candle.volume !== 'number' || !isFinite(candle.volume) || candle.volume < 0)
  ) {
    throw new ValidationError('Volume must be a non-negative finite number', 'volume', candle.volume)
  }

  if (!candle.timestamp || typeof candle.timestamp !== 'string') {
    throw new ValidationError('Timestamp is required and must be a string', 'timestamp', candle.timestamp)
  }

  // Validate ISO 8601 format
  try {
    const date = new Date(candle.timestamp)
    if (isNaN(date.getTime())) {
      throw new ValidationError('Timestamp must be a valid ISO 8601 date string', 'timestamp', candle.timestamp)
    }
  } catch {
    throw new ValidationError('Timestamp must be a valid ISO 8601 date string', 'timestamp', candle.timestamp)
  }
}

/**
 * Chunk an array into smaller arrays
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
