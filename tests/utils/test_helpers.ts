/**
 * Test helper utilities
 */

import type { Ohlc, PriceTick, TimeRange } from '../../src/types/interfaces.ts'

/**
 * Test environment interface for integration tests
 */
export interface TestEnvironment {
  cleanup: () => Promise<void>
  config: {
    host: string
    port: number
    database: string
  }
}

/**
 * Simple logger for testing that captures log messages
 */
export interface LogEntry {
  level: string
  message: string
  meta?: Record<string, unknown>
}

export class TestLogger {
  private logs: LogEntry[] = []

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', message, ...(meta ? { meta } : {}) })
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', message, ...(meta ? { meta } : {}) })
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, ...(meta ? { meta } : {}) })
  }

  error(message: string, error?: Error): void {
    this.logs.push({
      level: 'error',
      message,
      ...(error ? { meta: { error: error.message, stack: error.stack } } : {}),
    })
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  getLogsByLevel(level: string): LogEntry[] {
    return this.logs.filter((log) => log.level === level)
  }

  clear(): void {
    this.logs = []
  }

  hasErrorLogs(): boolean {
    return this.logs.some((log) => log.level === 'error')
  }

  getErrorMessages(): string[] {
    return this.logs
      .filter((log) => log.level === 'error')
      .map((log) => log.message)
  }
}

/**
 * Test assertion helpers
 */
export function assertValidPriceTick(tick: PriceTick): void {
  if (!tick.symbol || tick.symbol.length === 0) {
    throw new Error('PriceTick must have a valid symbol')
  }

  if (typeof tick.price !== 'number' || tick.price <= 0) {
    throw new Error('PriceTick must have a positive price')
  }

  if (tick.volume !== undefined && (typeof tick.volume !== 'number' || tick.volume < 0)) {
    throw new Error('PriceTick volume must be a non-negative number')
  }

  if (!tick.timestamp) {
    throw new Error('PriceTick must have a timestamp')
  }

  // Validate timestamp format
  const date = new Date(tick.timestamp)
  if (isNaN(date.getTime())) {
    throw new Error('PriceTick timestamp must be a valid date')
  }
}

export function assertValidOhlc(ohlc: Ohlc): void {
  if (!ohlc.symbol || ohlc.symbol.length === 0) {
    throw new Error('OHLC must have a valid symbol')
  }

  if (typeof ohlc.open !== 'number' || ohlc.open <= 0) {
    throw new Error('OHLC open price must be positive')
  }

  if (typeof ohlc.high !== 'number' || ohlc.high <= 0) {
    throw new Error('OHLC high price must be positive')
  }

  if (typeof ohlc.low !== 'number' || ohlc.low <= 0) {
    throw new Error('OHLC low price must be positive')
  }

  if (typeof ohlc.close !== 'number' || ohlc.close <= 0) {
    throw new Error('OHLC close price must be positive')
  }

  // Validate OHLC relationships
  if (ohlc.high < ohlc.low) {
    throw new Error('OHLC high must be >= low')
  }

  if (ohlc.high < ohlc.open || ohlc.high < ohlc.close) {
    throw new Error('OHLC high must be >= open and close')
  }

  if (ohlc.low > ohlc.open || ohlc.low > ohlc.close) {
    throw new Error('OHLC low must be <= open and close')
  }

  if (ohlc.volume !== undefined && (typeof ohlc.volume !== 'number' || ohlc.volume < 0)) {
    throw new Error('OHLC volume must be a non-negative number')
  }
}

export function assertValidTimeRange(range: TimeRange): void {
  if (!range.from || !range.to) {
    throw new Error('TimeRange must have both from and to dates')
  }

  if (!(range.from instanceof Date) || !(range.to instanceof Date)) {
    throw new Error('TimeRange from and to must be Date objects')
  }

  if (range.from >= range.to) {
    throw new Error('TimeRange from must be before to')
  }
}

/**
 * Data validation helpers
 */
export function isValidPrice(price: number): boolean {
  return typeof price === 'number' && price > 0 && isFinite(price)
}

export function isValidVolume(volume: number | undefined): boolean {
  return volume === undefined || (typeof volume === 'number' && volume >= 0 && isFinite(volume))
}

export function isValidSymbol(symbol: string): boolean {
  return typeof symbol === 'string' &&
    symbol.length > 0 &&
    symbol.length <= 20 &&
    /^[A-Z0-9_]+$/.test(symbol)
}

export function isValidTimestamp(timestamp: string): boolean {
  if (typeof timestamp !== 'string') return false
  const date = new Date(timestamp)
  return !isNaN(date.getTime())
}

/**
 * Generate test data with realistic patterns
 */
export function generateRandomPrice(basePrice: number, volatility: number = 0.02): number {
  const change = (Math.random() - 0.5) * 2 * volatility
  return Math.max(basePrice * (1 + change), 0.01)
}

export function generateRandomVolume(baseVolume: number = 1.0): number {
  return baseVolume * (0.1 + Math.random() * 1.9) // 0.1x to 2.0x base volume
}

/**
 * Time utilities
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

export function truncateToMinute(date: Date): Date {
  const truncated = new Date(date)
  truncated.setSeconds(0, 0)
  return truncated
}

export function truncateToHour(date: Date): Date {
  const truncated = new Date(date)
  truncated.setMinutes(0, 0, 0)
  return truncated
}

/**
 * Mock data quality checks
 */
export function validateMarketData(ticks: PriceTick[]): void {
  if (ticks.length === 0) return

  // Check temporal ordering
  let previousTime = new Date(ticks[0]!.timestamp).getTime()
  for (let i = 1; i < ticks.length; i++) {
    const currentTime = new Date(ticks[i]!.timestamp).getTime()
    if (currentTime <= previousTime) {
      throw new Error(`Tick ${i} timestamp is not after previous tick`)
    }
    previousTime = currentTime
  }

  // Check symbol consistency
  const symbol = ticks[0]!.symbol
  for (const tick of ticks) {
    if (tick.symbol !== symbol) {
      throw new Error('All ticks must have the same symbol')
    }
  }

  // Check price movements are reasonable (no more than 50% change between ticks)
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!
    const curr = ticks[i]!
    const changePercent = Math.abs(curr.price - prev.price) / prev.price

    if (changePercent > 0.5) {
      throw new Error(`Unrealistic price movement between tick ${i - 1} and ${i}: ${changePercent * 100}%`)
    }
  }
}

export function validateOhlcConsistency(candles: Ohlc[]): void {
  for (const ohlc of candles) {
    assertValidOhlc(ohlc)
  }

  // Check temporal ordering
  if (candles.length > 1) {
    let previousTime = new Date(candles[0]!.timestamp).getTime()
    for (let i = 1; i < candles.length; i++) {
      const currentTime = new Date(candles[i]!.timestamp).getTime()
      if (currentTime <= previousTime) {
        throw new Error(`Candle ${i} timestamp is not after previous candle`)
      }
      previousTime = currentTime
    }
  }
}

/**
 * Performance testing helpers
 */
export interface PerformanceMetrics {
  durationMs: number
  operationsPerSecond: number
  avgLatencyMs: number
  minLatencyMs: number
  maxLatencyMs: number
}

export async function measurePerformance<T>(
  operation: () => Promise<T>,
  iterations: number = 100,
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const latencies: number[] = []
  let result: T | undefined

  const startTime = performance.now()

  for (let i = 0; i < iterations; i++) {
    const iterStartTime = performance.now()
    result = await operation()
    const iterEndTime = performance.now()
    latencies.push(iterEndTime - iterStartTime)
  }

  const endTime = performance.now()
  const totalDuration = endTime - startTime

  const metrics: PerformanceMetrics = {
    durationMs: totalDuration,
    operationsPerSecond: iterations / (totalDuration / 1000),
    avgLatencyMs: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
    minLatencyMs: Math.min(...latencies),
    maxLatencyMs: Math.max(...latencies),
  }

  return { result: result!, metrics }
}

/**
 * Async testing utilities
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
}

/**
 * Test helper class - exported as TestHelpers
 */
export class TestHelpers {
  static createLogger(): TestLogger {
    return new TestLogger()
  }

  static validatePriceTick = assertValidPriceTick
  static validateOhlc = assertValidOhlc
  static validateTimeRange = assertValidTimeRange

  static generateRandomPrice = generateRandomPrice
  static generateRandomVolume = generateRandomVolume

  static addMinutes = addMinutes
  static addHours = addHours
  static addDays = addDays

  static truncateToMinute = truncateToMinute
  static truncateToHour = truncateToHour

  static validateMarketData = validateMarketData
  static validateOhlcConsistency = validateOhlcConsistency

  static measurePerformance = measurePerformance
  static sleep = sleep
  static timeout = timeout

  /**
   * Create test environment for integration tests
   */
  static createTestEnvironment(): TestEnvironment {
    return {
      cleanup: () => Promise.resolve(),
      config: {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
      },
    }
  }

  /**
   * Cleanup test environment
   */
  static cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
    return env?.cleanup ? env.cleanup() : Promise.resolve()
  }
}

/**
 * Timing helper class - exported as TimingHelpers
 */
export class TimingHelpers {
  static sleep = sleep
  static timeout = timeout
  static addMinutes = addMinutes
  static addHours = addHours
  static addDays = addDays
  static truncateToMinute = truncateToMinute
  static truncateToHour = truncateToHour
  static measurePerformance = measurePerformance

  /**
   * Assert execution time is within bounds
   */
  static async assertExecutionTime<T>(
    operation: () => Promise<T>,
    maxTimeMs: number,
    errorMessage?: string,
  ): Promise<T> {
    const startTime = performance.now()
    const result = await operation()
    const endTime = performance.now()
    const duration = endTime - startTime

    if (duration > maxTimeMs) {
      throw new Error(
        errorMessage || `Operation took ${duration}ms, expected ≤ ${maxTimeMs}ms`,
      )
    }

    return result
  }
}
