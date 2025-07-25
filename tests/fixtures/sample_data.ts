/**
 * Sample data for testing TimescaleDB client
 */

import type { Ohlc, PriceTick, TimeRange } from '../../src/types/interfaces.ts'

/**
 * Sample price tick data for testing
 */
export const SAMPLE_TICKS: PriceTick[] = [
  {
    symbol: 'BTCUSD',
    price: 45000,
    volume: 1.5,
    timestamp: '2024-01-01T00:00:00Z',
  },
  {
    symbol: 'BTCUSD',
    price: 45100,
    volume: 2.0,
    timestamp: '2024-01-01T01:00:00Z',
  },
  {
    symbol: 'BTCUSD',
    price: 44900,
    volume: 1.8,
    timestamp: '2024-01-01T02:00:00Z',
  },
  {
    symbol: 'BTCUSD',
    price: 45200,
    volume: 2.2,
    timestamp: '2024-01-01T03:00:00Z',
  },
  {
    symbol: 'ETHUSD',
    price: 3000,
    volume: 10.5,
    timestamp: '2024-01-01T00:00:00Z',
  },
  {
    symbol: 'ETHUSD',
    price: 3050,
    volume: 8.0,
    timestamp: '2024-01-01T01:00:00Z',
  },
]

/**
 * Sample OHLC data for testing
 */
export const SAMPLE_OHLC: Ohlc[] = [
  {
    symbol: 'BTCUSD',
    timestamp: '2024-01-01T00:00:00Z',
    open: 45000,
    high: 45200,
    low: 44800,
    close: 45100,
    volume: 10.5,
  },
  {
    symbol: 'BTCUSD',
    timestamp: '2024-01-01T01:00:00Z',
    open: 45100,
    high: 45300,
    low: 44900,
    close: 45200,
    volume: 12.8,
  },
  {
    symbol: 'ETHUSD',
    timestamp: '2024-01-01T00:00:00Z',
    open: 3000,
    high: 3080,
    low: 2950,
    close: 3050,
    volume: 50.0,
  },
]

/**
 * Time ranges for testing
 */
export const TIME_RANGES = {
  hour: {
    from: new Date('2024-01-01T00:00:00Z'),
    to: new Date('2024-01-01T01:00:00Z'),
  },
  day: {
    from: new Date('2024-01-01T00:00:00Z'),
    to: new Date('2024-01-02T00:00:00Z'),
  },
  week: {
    from: new Date('2024-01-01T00:00:00Z'),
    to: new Date('2024-01-08T00:00:00Z'),
  },
} as const

/**
 * Invalid data for testing error cases
 */
export const INVALID_TICKS = {
  negativePrice: {
    symbol: 'BTC',
    price: -100, // Negative price
    volume: 1.0,
    timestamp: '2024-01-01T00:00:00Z',
  } as Partial<PriceTick>,

  emptySymbol: {
    symbol: '',
    price: 100,
    volume: 1.0,
    timestamp: '2024-01-01T00:00:00Z',
  } as Partial<PriceTick>,

  missingRequired: {
    // Missing required fields
    price: 100,
  } as Partial<PriceTick>,

  negativeVolume: {
    symbol: 'BTC',
    price: 100,
    volume: -10, // Negative volume
    timestamp: '2024-01-01T00:00:00Z',
  } as Partial<PriceTick>,
} as const

/**
 * Invalid data as array for backward compatibility
 */
export const INVALID_TICKS_ARRAY: Partial<PriceTick>[] = [
  INVALID_TICKS.missingRequired,
  INVALID_TICKS.negativePrice,
  INVALID_TICKS.negativeVolume,
]

/**
 * Invalid OHLC data for testing
 */
export const INVALID_OHLC: Partial<Ohlc>[] = [
  {
    // Missing required fields
    symbol: 'BTC',
    open: 100,
  },
  {
    symbol: 'BTC',
    timestamp: '2024-01-01T00:00:00Z',
    open: 100,
    high: 50, // High < Open
    low: 80,
    close: 90,
  },
]

/**
 * Edge case data for testing
 */
export const EDGE_CASES = {
  veryLargeNumbers: {
    symbol: 'TEST',
    price: Number.MAX_SAFE_INTEGER,
    volume: Number.MAX_SAFE_INTEGER,
    timestamp: '2024-01-01T00:00:00Z',
  },
  verySmallNumbers: {
    symbol: 'TEST',
    price: Number.MIN_VALUE,
    volume: Number.MIN_VALUE,
    timestamp: '2024-01-01T00:00:00Z',
  },
  emptyVolume: {
    symbol: 'TEST',
    price: 100,
    timestamp: '2024-01-01T00:00:00Z',
  },
} as const

/**
 * Generate realistic test data with proper correlations and temporal ordering
 */
export function generateMarketData(
  symbol: string,
  count: number,
  startPrice: number = 45000,
  startTime: Date = new Date('2024-01-01T00:00:00Z'),
): PriceTick[] {
  const ticks: PriceTick[] = []
  let currentPrice = startPrice
  let currentTime = new Date(startTime)

  for (let i = 0; i < count; i++) {
    // Simulate realistic price movements
    const volatility = 0.02 // 2% volatility
    const randomChange = (Math.random() - 0.5) * 2 * volatility
    currentPrice = Math.max(currentPrice * (1 + randomChange), 0.01)

    // Simulate volume based on price volatility
    const baseVolume = 1.0
    const volumeMultiplier = 1 + Math.abs(randomChange) * 10
    const volume = baseVolume * volumeMultiplier * (0.5 + Math.random())

    // Add time interval (1 minute)
    currentTime = new Date(currentTime.getTime() + 60000)

    ticks.push({
      symbol,
      price: Math.round(currentPrice * 100) / 100, // Round to 2 decimals
      volume: Math.round(volume * 100) / 100,
      timestamp: currentTime.toISOString(),
    })
  }

  return ticks
}

/**
 * Generate OHLC data from price ticks
 */
export function generateOhlcFromTicks(
  ticks: PriceTick[],
  intervalMinutes: number = 60,
): Ohlc[] {
  if (ticks.length === 0) return []

  const sortedTicks = [...ticks].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const firstTick = sortedTicks[0]
  const lastTick = sortedTicks.at(-1)

  if (!firstTick || !lastTick) {
    return []
  }

  const startTime = new Date(firstTick.timestamp).getTime()
  const endTime = new Date(lastTick.timestamp).getTime()

  const ohlcData: Ohlc[] = []
  const intervalMs = intervalMinutes * 60 * 1000

  for (let time = startTime; time <= endTime; time += intervalMs) {
    const periodStart = new Date(time)

    const periodTicks = sortedTicks.filter((tick) => {
      const tickTime = new Date(tick.timestamp).getTime()
      return tickTime >= time && tickTime < time + intervalMs
    })

    if (periodTicks.length > 0) {
      const prices = periodTicks.map((t) => t.price)
      const totalVolume = periodTicks.reduce((sum, t) => sum + (t.volume || 0), 0)

      const firstTick = periodTicks[0]
      const lastTick = periodTicks.at(-1)

      if (firstTick && lastTick) {
        ohlcData.push({
          symbol: firstTick.symbol,
          timestamp: periodStart.toISOString(),
          open: firstTick.price,
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: lastTick.price,
          volume: totalVolume > 0 ? totalVolume : undefined,
        })
      }
    }
  }

  return ohlcData
}

/**
 * Generate mixed valid and invalid data for batch testing
 */
export function generateMixedData(validCount: number, invalidCount: number): (PriceTick | null)[] {
  const validTicks = generateMarketData('MIXED', validCount)
  const invalidTicks = Array.from({ length: invalidCount }, () => null)

  // Mix valid and invalid data randomly
  const mixed: (PriceTick | null)[] = [...validTicks, ...invalidTicks]
  for (let i = mixed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const itemI = mixed[i]
    const itemJ = mixed[j]
    if (itemI !== undefined && itemJ !== undefined) {
      mixed[i] = itemJ
      mixed[j] = itemI
    }
  }

  return mixed
}

/**
 * Create time range from relative parameters
 */
export function createTimeRange(
  startHoursAgo: number,
  durationHours: number = 1,
): TimeRange {
  const now = new Date()
  const from = new Date(now.getTime() - startHoursAgo * 60 * 60 * 1000)
  const to = new Date(from.getTime() + durationHours * 60 * 60 * 1000)

  return { from, to }
}

/**
 * Generate large dataset for testing performance and batch operations
 */
export function generateLargeTickDataset(
  count: number,
  symbol: string = 'LARGE_TEST',
  basePrice: number = 50000,
): PriceTick[] {
  const ticks: PriceTick[] = []
  let currentPrice = basePrice
  let currentTime = new Date('2024-01-01T00:00:00Z').getTime()

  for (let i = 0; i < count; i++) {
    // Simple price movement
    const volatility = 0.01 // 1% volatility
    const priceChange = (Math.random() - 0.5) * 2 * volatility * currentPrice
    currentPrice = Math.max(0.01, currentPrice + priceChange)

    // Simple volume generation
    const volume = 0.1 + Math.random() * 2 // 0.1 to 2.1

    ticks.push({
      symbol,
      price: Math.round(currentPrice * 100) / 100,
      volume: Math.round(volume * 1000) / 1000,
      timestamp: new Date(currentTime).toISOString(),
    })

    currentTime += 1000 // 1 second intervals
  }

  return ticks
}
