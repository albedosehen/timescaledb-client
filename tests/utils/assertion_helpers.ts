/**
 * Assertion helper utilities for test validation
 */

import type { PriceTick, Ohlc, BatchResult } from '../../src/types/interfaces.ts'
import type { MockSql } from './mock_factory.ts'

/**
 * Assert that price ticks are properly ordered by time
 */
export function assertTicksOrdered(ticks: PriceTick[], prefix: string = ''): void {
  if (ticks.length <= 1) return

  for (let i = 1; i < ticks.length; i++) {
    const prevTime = new Date(ticks[i - 1]!.timestamp).getTime()
    const currTime = new Date(ticks[i]!.timestamp).getTime()
    
    if (currTime <= prevTime) {
      throw new Error(`${prefix}Ticks are not properly ordered by time at index ${i}`)
    }
  }
}

/**
 * Assert that OHLC data is properly ordered by time
 */
export function assertOhlcOrdered(ohlc: Ohlc[], prefix: string = ''): void {
  if (ohlc.length <= 1) return

  for (let i = 1; i < ohlc.length; i++) {
    const prevTime = new Date(ohlc[i - 1]!.timestamp).getTime()
    const currTime = new Date(ohlc[i]!.timestamp).getTime()
    
    if (currTime <= prevTime) {
      throw new Error(`${prefix}OHLC data is not properly ordered by time at index ${i}`)
    }
  }
}

/**
 * Assert that price ticks have realistic data
 */
export function assertTicksRealistic(ticks: PriceTick[], prefix: string = ''): void {
  if (ticks.length <= 1) return

  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!
    const curr = ticks[i]!
    
    // Check symbol consistency
    if (prev.symbol !== curr.symbol) {
      throw new Error(`${prefix}All ticks must have the same symbol`)
    }

    // Check for unrealistic price movements (>50% change)
    const changePercent = Math.abs(curr.price - prev.price) / prev.price
    if (changePercent > 0.5) {
      throw new Error(`${prefix}Unrealistic price movement: ${changePercent * 100}% change`)
    }
  }
}

/**
 * Assert that OHLC data has valid price relationships
 */
export function assertOhlcValid(ohlc: Ohlc[], prefix: string = ''): void {
  for (let i = 0; i < ohlc.length; i++) {
    const candle = ohlc[i]!
    
    // Check OHLC price relationships
    if (candle.high < candle.low) {
      throw new Error(`${prefix}OHLC ${i}: high (${candle.high}) must be >= low (${candle.low})`)
    }
    
    if (candle.high < candle.open) {
      throw new Error(`${prefix}OHLC ${i}: high (${candle.high}) must be >= open (${candle.open})`)
    }
    
    if (candle.high < candle.close) {
      throw new Error(`${prefix}OHLC ${i}: high (${candle.high}) must be >= close (${candle.close})`)
    }
    
    if (candle.low > candle.open) {
      throw new Error(`${prefix}OHLC ${i}: low (${candle.low}) must be <= open (${candle.open})`)
    }
    
    if (candle.low > candle.close) {
      throw new Error(`${prefix}OHLC ${i}: low (${candle.low}) must be <= close (${candle.close})`)
    }
  }
}

/**
 * Assert that time range is valid for the given data
 */
export function assertTimeRangeCoversData(
  data: (PriceTick | Ohlc)[],
  from: Date,
  to: Date,
  prefix: string = ''
): void {
  if (data.length === 0) return

  for (let i = 0; i < data.length; i++) {
    const item = data[i]!
    const itemTime = new Date(item.timestamp).getTime()
    
    if (itemTime < from.getTime() || itemTime >= to.getTime()) {
      throw new Error(
        `${prefix}Data item ${i} timestamp ${item.timestamp} is outside range [${from.toISOString()}, ${to.toISOString()})`
      )
    }
  }
}

/**
 * Assert that batch results are valid
 */
export function assertBatchResultValid(result: BatchResult, expectedTotal: number, prefix: string = ''): void {
  if (result.processed + result.failed !== expectedTotal) {
    throw new Error(
      `${prefix}Batch result totals don't match: processed(${result.processed}) + failed(${result.failed}) != expected(${expectedTotal})`
    )
  }
  
  if (result.processed < 0 || result.failed < 0) {
    throw new Error(`${prefix}Batch result counts cannot be negative`)
  }

  if (result.durationMs < 0) {
    throw new Error(`${prefix}Batch duration cannot be negative`)
  }

  if (result.errors && result.errors.length !== result.failed) {
    throw new Error(
      `${prefix}Error count (${result.errors.length}) doesn't match failed count (${result.failed})`
    )
  }
}

/**
 * Assert that volume data is consistent and realistic
 */
export function assertVolumeConsistent(data: PriceTick[], prefix: string = ''): void {
  if (data.length === 0) return

  const volumes: number[] = []
  const highMovementVolumes: number[] = []

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]!
    const curr = data[i]!

    if (prev.volume !== undefined && curr.volume !== undefined) {
      const priceChange = Math.abs(curr.price - prev.price) / prev.price
      volumes.push((prev.volume + curr.volume) / 2)

      // Track volume during high price movement periods
      if (priceChange > 0.02) { // >2% price change
        highMovementVolumes.push((prev.volume + curr.volume) / 2)
      }
    }
  }

  if (volumes.length === 0) return

  // Check that volume tends to be higher during high volatility periods
  if (highMovementVolumes.length > 0) {
    const avgVolume = volumes.reduce((sum, vol) => sum + vol!, 0) / volumes.length
    const avgHighMovementVolume = highMovementVolumes.reduce((sum, vol) => sum + vol!, 0) / highMovementVolumes.length

    // This is a heuristic - volume should generally be higher during volatile periods
    if (avgHighMovementVolume < avgVolume * 0.8) {
      console.warn(`${prefix}Warning: Volume during high volatility periods seems low`)
    }
  }
}

/**
 * Assert that SQL queries match expected patterns
 */
export function assertQueriesMatch(
  queries: MockSql[],
  expectedPatterns: (string | RegExp)[],
  prefix: string = ''
): void {
  if (queries.length !== expectedPatterns.length) {
    throw new Error(
      `${prefix}Query count mismatch: expected ${expectedPatterns.length}, got ${queries.length}`
    )
  }

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]!
    const pattern = expectedPatterns[i]!

    const matches = typeof pattern === 'string'
      ? query.query.toLowerCase().includes(pattern.toLowerCase())
      : pattern.test(query.query)

    if (!matches) {
      throw new Error(
        `${prefix}Query ${i} does not match expected pattern '${pattern}'. Actual: ${query.query}`
      )
    }
  }
}

/**
 * Assert that query parameters are correct
 */
export function assertQueryParams(
  query: MockSql,
  expectedParams: unknown[],
  prefix: string = ''
): void {
  if (query.params.length !== expectedParams.length) {
    throw new Error(
      `${prefix}Parameter count mismatch: expected ${expectedParams.length}, got ${query.params.length}`
    )
  }

  for (let i = 0; i < expectedParams.length; i++) {
    const actual = query.params[i]
    const expected = expectedParams[i]

    if (actual !== expected) {
      throw new Error(
        `${prefix}Parameter ${i} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      )
    }
  }
}

/**
 * Assert that numbers are approximately equal (for floating point comparisons)
 */
export function assertApproximatelyEqual(
  actual: number,
  expected: number,
  tolerance: number = 0.0001,
  message?: string
): void {
  const diff = Math.abs(actual - expected)
  if (diff > tolerance) {
    throw new Error(
      message || `Numbers not approximately equal: expected ${expected}, got ${actual} (diff: ${diff}, tolerance: ${tolerance})`
    )
  }
}

/**
 * Assert that arrays have the same length and all elements match a predicate
 */
export function assertArraysMatch<T>(
  actual: T[],
  expected: T[],
  compareFn: (a: T, b: T) => boolean = (a, b) => a === b,
  message?: string
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      message || `Array length mismatch: expected ${expected.length}, got ${actual.length}`
    )
  }

  for (let i = 0; i < actual.length; i++) {
    if (!compareFn(actual[i]!, expected[i]!)) {
      throw new Error(
        message || `Array element ${i} mismatch: expected ${JSON.stringify(expected[i])}, got ${JSON.stringify(actual[i])}`
      )
    }
  }
}

/**
 * Assert that a value is within expected bounds
 */
export function assertWithinBounds(
  value: number,
  min: number,
  max: number,
  message?: string
): void {
  if (value < min || value > max) {
    throw new Error(
      message || `Value ${value} is not within bounds [${min}, ${max}]`
    )
  }
}

/**
 * Assert that execution time is within acceptable limits
 */
export function assertPerformance(
  actualMs: number,
  maxExpectedMs: number,
  operation: string = 'operation'
): void {
  if (actualMs > maxExpectedMs) {
    throw new Error(
      `Performance assertion failed: ${operation} took ${actualMs}ms, expected ≤ ${maxExpectedMs}ms`
    )
  }
}

/**
 * Assert that an object contains all expected properties
 */
export function assertObjectContains<T extends Record<string, unknown>>(
  actual: T,
  expectedProperties: Partial<T>,
  message?: string
): void {
  for (const [key, expectedValue] of Object.entries(expectedProperties)) {
    const actualValue = actual[key]
    
    if (actualValue !== expectedValue) {
      throw new Error(
        message || `Object property '${key}' mismatch: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
      )
    }
  }
}

/**
 * Financial assertions class - exported as FinancialAssertions
 */
export class FinancialAssertions {
  static assertTicksOrdered = assertTicksOrdered
  static assertOhlcOrdered = assertOhlcOrdered
  static assertTicksRealistic = assertTicksRealistic
  static assertOhlcValid = assertOhlcValid
  static assertTimeRangeCoversData = assertTimeRangeCoversData
  static assertBatchResultValid = assertBatchResultValid
  static assertVolumeConsistent = assertVolumeConsistent
  static assertQueriesMatch = assertQueriesMatch
  static assertQueryParams = assertQueryParams
  static assertApproximatelyEqual = assertApproximatelyEqual
  static assertArraysMatch = assertArraysMatch
  static assertWithinBounds = assertWithinBounds
  static assertPerformance = assertPerformance
  static assertObjectContains = assertObjectContains

  /**
   * Assert that a price tick is valid
   */
  static assertValidPriceTick(tick: unknown): asserts tick is PriceTick {
    if (!tick || typeof tick !== 'object') {
      throw new Error('Price tick must be an object')
    }

    const t = tick as any

    if (!t.symbol || typeof t.symbol !== 'string') {
      throw new Error('Price tick must have a valid symbol')
    }

    if (typeof t.price !== 'number' || t.price <= 0) {
      throw new Error('Price tick must have a positive price')
    }

    if (t.volume !== undefined && (typeof t.volume !== 'number' || t.volume < 0)) {
      throw new Error('Price tick volume must be a non-negative number')
    }

    if (!t.timestamp) {
      throw new Error('Price tick must have a timestamp')
    }
  }

  /**
   * Assert that OHLC data is valid
   */
  static assertValidOhlc(ohlc: unknown): asserts ohlc is Ohlc {
    if (!ohlc || typeof ohlc !== 'object') {
      throw new Error('OHLC must be an object')
    }

    const o = ohlc as any

    if (!o.symbol || typeof o.symbol !== 'string') {
      throw new Error('OHLC must have a valid symbol')
    }

    if (typeof o.open !== 'number' || o.open <= 0) {
      throw new Error('OHLC open price must be positive')
    }

    if (typeof o.high !== 'number' || o.high <= 0) {
      throw new Error('OHLC high price must be positive')
    }

    if (typeof o.low !== 'number' || o.low <= 0) {
      throw new Error('OHLC low price must be positive')
    }

    if (typeof o.close !== 'number' || o.close <= 0) {
      throw new Error('OHLC close price must be positive')
    }
  }
}