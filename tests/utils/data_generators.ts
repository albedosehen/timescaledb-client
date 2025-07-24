/**
 * Data generation utilities for creating realistic test data
 * 
 * Provides functions to generate realistic financial market data
 * for testing various scenarios and edge cases.
 */

import type { PriceTick, Ohlc, TimeRange } from '../../src/types/interfaces.ts'

/**
 * Configuration for data generation
 */
export interface DataGenerationConfig {
  /** Base price for price movements */
  readonly basePrice?: number
  
  /** Maximum price volatility as percentage (0.1 = 10%) */
  readonly volatility?: number
  
  /** Base volume range */
  readonly volumeRange?: { min: number; max: number }
  
  /** Time interval between data points in milliseconds */
  readonly timeInterval?: number
  
  /** Starting timestamp */
  readonly startTime?: Date
  
  /** Symbol to use for generated data */
  readonly symbol?: string
}

/**
 * Default configuration for data generation
 */
const DEFAULT_CONFIG: Required<DataGenerationConfig> = {
  basePrice: 45000,
  volatility: 0.02, // 2%
  volumeRange: { min: 0.1, max: 10 },
  timeInterval: 1000, // 1 second
  startTime: new Date('2024-01-15T10:00:00.000Z'),
  symbol: 'BTCUSD'
}

/**
 * Market data generator class
 */
export class DataGenerator {
  
  /**
   * Generate realistic price tick data with market-like movements
   */
  static generateRealisticTicks(
    count: number,
    config: Partial<DataGenerationConfig> = {}
  ): PriceTick[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const ticks: PriceTick[] = []
    
    let currentPrice = cfg.basePrice
    let currentTime = cfg.startTime.getTime()
    
    for (let i = 0; i < count; i++) {
      // Generate price movement using random walk with mean reversion
      const priceChange = this.generatePriceChange(currentPrice, cfg.volatility)
      currentPrice = Math.max(0.01, currentPrice + priceChange)
      
      // Generate volume with some correlation to price movement
      const volume = this.generateVolume(Math.abs(priceChange), cfg.volumeRange)
      
      ticks.push({
        symbol: cfg.symbol,
        price: Math.round(currentPrice * 100) / 100, // Round to 2 decimal places
        volume: Math.round(volume * 1000) / 1000, // Round to 3 decimal places
        timestamp: new Date(currentTime).toISOString()
      })
      
      currentTime += cfg.timeInterval
    }
    
    return ticks
  }

  /**
   * Generate OHLC data from tick data or create synthetic OHLC
   */
  static generateRealisticOhlc(
    count: number,
    config: Partial<DataGenerationConfig & { intervalMinutes?: number }> = {}
  ): Ohlc[] {
    const cfg = { ...DEFAULT_CONFIG, intervalMinutes: 60, ...config }
    const candles: Ohlc[] = []
    
    let currentPrice = cfg.basePrice
    let currentTime = cfg.startTime.getTime()
    const intervalMs = (config.intervalMinutes || 60) * 60 * 1000
    
    for (let i = 0; i < count; i++) {
      // Generate OHLC for this interval
      const open = currentPrice
      
      // Generate high/low with realistic spread
      const volatilityRange = open * cfg.volatility
      const high = open + Math.random() * volatilityRange
      const low = Math.max(0.01, open - Math.random() * volatilityRange)
      
      // Close price within high/low range, with slight trend bias
      const trendBias = (Math.random() - 0.5) * 0.1 // Small trend bias
      const close = Math.max(low, Math.min(high, open + (open * trendBias * cfg.volatility)))
      
      // Generate volume correlated with price movement
      const priceMovement = Math.abs(close - open) / open
      const baseVolume = cfg.volumeRange.min + Math.random() * (cfg.volumeRange.max - cfg.volumeRange.min)
      const volume = baseVolume * (1 + priceMovement * 5) // Higher volume with more movement
      
      candles.push({
        symbol: cfg.symbol,
        timestamp: new Date(currentTime).toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.round(volume * 1000) / 1000
      })
      
      currentPrice = close // Next candle starts where this one ended
      currentTime += intervalMs
    }
    
    return candles
  }

  /**
   * Generate trending market data (upward or downward trend)
   */
  static generateTrendingData(
    count: number,
    trendDirection: 'up' | 'down',
    trendStrength = 0.001, // 0.1% per tick
    config: Partial<DataGenerationConfig> = {}
  ): PriceTick[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const ticks: PriceTick[] = []
    
    let currentPrice = cfg.basePrice
    let currentTime = cfg.startTime.getTime()
    const trendMultiplier = trendDirection === 'up' ? 1 : -1
    
    for (let i = 0; i < count; i++) {
      // Add trend component to random price movement
      const randomChange = this.generatePriceChange(currentPrice, cfg.volatility)
      const trendChange = currentPrice * trendStrength * trendMultiplier
      
      currentPrice = Math.max(0.01, currentPrice + randomChange + trendChange)
      
      const volume = this.generateVolume(Math.abs(randomChange + trendChange), cfg.volumeRange)
      
      ticks.push({
        symbol: cfg.symbol,
        price: Math.round(currentPrice * 100) / 100,
        volume: Math.round(volume * 1000) / 1000,
        timestamp: new Date(currentTime).toISOString()
      })
      
      currentTime += cfg.timeInterval
    }
    
    return ticks
  }

  /**
   * Generate volatile market data (high price swings)
   */
  static generateVolatileData(
    count: number,
    volatilityMultiplier = 3,
    config: Partial<DataGenerationConfig> = {}
  ): PriceTick[] {
    const volatileConfig = {
      ...config,
      volatility: (config.volatility || DEFAULT_CONFIG.volatility) * volatilityMultiplier
    }
    
    return this.generateRealisticTicks(count, volatileConfig)
  }

  /**
   * Generate sideways/ranging market data
   */
  static generateRangingData(
    count: number,
    rangePercentage = 0.05, // 5% range
    config: Partial<DataGenerationConfig> = {}
  ): PriceTick[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const ticks: PriceTick[] = []
    
    const rangeTop = cfg.basePrice * (1 + rangePercentage)
    const rangeBottom = cfg.basePrice * (1 - rangePercentage)
    let currentPrice = cfg.basePrice
    let currentTime = cfg.startTime.getTime()
    
    for (let i = 0; i < count; i++) {
      // Generate mean-reverting price movement within range
      const distanceFromCenter = (currentPrice - cfg.basePrice) / cfg.basePrice
      const meanReversionForce = -distanceFromCenter * 2 // Stronger reversion further from center
      
      const randomChange = this.generatePriceChange(currentPrice, cfg.volatility * 0.5)
      const reversionChange = currentPrice * meanReversionForce * cfg.volatility
      
      currentPrice = Math.max(rangeBottom, Math.min(rangeTop, currentPrice + randomChange + reversionChange))
      
      const volume = this.generateVolume(Math.abs(randomChange), cfg.volumeRange)
      
      ticks.push({
        symbol: cfg.symbol,
        price: Math.round(currentPrice * 100) / 100,
        volume: Math.round(volume * 1000) / 1000,
        timestamp: new Date(currentTime).toISOString()
      })
      
      currentTime += cfg.timeInterval
    }
    
    return ticks
  }

  /**
   * Generate multi-symbol data with correlation
   */
  static generateCorrelatedMultiSymbolData(
    symbols: string[],
    count: number,
    correlation = 0.7, // 0 = no correlation, 1 = perfect correlation
    config: Partial<DataGenerationConfig> = {}
  ): Record<string, PriceTick[]> {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const result: Record<string, PriceTick[]> = {}
    
    // Generate base price movements
    const basePriceChanges: number[] = []
    for (let i = 0; i < count; i++) {
      basePriceChanges.push((Math.random() - 0.5) * 2) // -1 to 1
    }
    
    // Generate data for each symbol with correlation to base movements
    symbols.forEach((symbol, symbolIndex) => {
      const ticks: PriceTick[] = []
      let currentPrice = cfg.basePrice * (0.8 + symbolIndex * 0.1) // Slightly different base prices
      let currentTime = cfg.startTime.getTime()
      
      for (let i = 0; i < count; i++) {
        // Combine correlated and independent price movements
        const baseChange = basePriceChanges[i]
        const correlatedChange = baseChange ? baseChange * correlation : 0
        const independentChange = (Math.random() - 0.5) * 2 * (1 - correlation)
        const totalChange = (correlatedChange + independentChange) * currentPrice * cfg.volatility
        
        currentPrice = Math.max(0.01, currentPrice + totalChange)
        
        const volume = this.generateVolume(Math.abs(totalChange), cfg.volumeRange)
        
        ticks.push({
          symbol,
          price: Math.round(currentPrice * 100) / 100,
          volume: Math.round(volume * 1000) / 1000,
          timestamp: new Date(currentTime).toISOString()
        })
        
        currentTime += cfg.timeInterval
      }
      
      result[symbol] = ticks
    })
    
    return result
  }

  /**
   * Generate data with gaps (missing time periods)
   */
  static generateDataWithGaps(
    count: number,
    gapProbability = 0.1, // 10% chance of gap
    maxGapSizeMultiplier = 10,
    config: Partial<DataGenerationConfig> = {}
  ): PriceTick[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const ticks: PriceTick[] = []
    
    let currentPrice = cfg.basePrice
    let currentTime = cfg.startTime.getTime()
    
    for (let i = 0; i < count; i++) {
      // Maybe create a gap
      if (Math.random() < gapProbability) {
        const gapSize = Math.floor(Math.random() * maxGapSizeMultiplier) + 1
        currentTime += cfg.timeInterval * gapSize
      }
      
      const priceChange = this.generatePriceChange(currentPrice, cfg.volatility)
      currentPrice = Math.max(0.01, currentPrice + priceChange)
      
      const volume = this.generateVolume(Math.abs(priceChange), cfg.volumeRange)
      
      ticks.push({
        symbol: cfg.symbol,
        price: Math.round(currentPrice * 100) / 100,
        volume: Math.round(volume * 1000) / 1000,
        timestamp: new Date(currentTime).toISOString()
      })
      
      currentTime += cfg.timeInterval
    }
    
    return ticks
  }

  /**
   * Generate extreme market events (crashes, spikes)
   */
  static generateExtremeEvent(
    normalCount: number,
    eventType: 'crash' | 'spike',
    eventMagnitude = 0.2, // 20% movement
    config: Partial<DataGenerationConfig> = {}
  ): PriceTick[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    
    // Generate normal data leading up to event
    const normalData = this.generateRealisticTicks(normalCount, cfg)
    
    // Create extreme event
    const lastTick = normalData.at(-1)
    if (!lastTick) {
      throw new Error('Cannot create extreme event: no normal data available')
    }

    const eventPrice = eventType === 'crash'
      ? lastTick.price * (1 - eventMagnitude)
      : lastTick.price * (1 + eventMagnitude)
    
    const eventTick: PriceTick = {
      symbol: cfg.symbol,
      price: Math.round(eventPrice * 100) / 100,
      volume: cfg.volumeRange.max * 5, // Very high volume during event
      timestamp: new Date(new Date(lastTick.timestamp).getTime() + cfg.timeInterval).toISOString()
    }
    
    // Generate recovery data
    const recoveryData = this.generateRealisticTicks(normalCount / 2, {
      ...cfg,
      basePrice: eventPrice,
      startTime: new Date(eventTick.timestamp)
    })
    
    return [...normalData, eventTick, ...recoveryData]
  }

  /**
   * Generate price movement using various models
   */
  private static generatePriceChange(currentPrice: number, volatility: number): number {
    // Use geometric Brownian motion for realistic price movements
    const dt = 1 / (24 * 60 * 60) // Assume 1 second time step in daily terms
    const drift = 0.0001 // Small positive drift (annual growth)
    const randomComponent = this.generateNormalRandom() * Math.sqrt(dt)
    
    return currentPrice * (drift * dt + volatility * randomComponent)
  }

  /**
   * Generate volume correlated with price movement
   */
  private static generateVolume(priceMovement: number, volumeRange: { min: number; max: number }): number {
    const baseVolume = volumeRange.min + Math.random() * (volumeRange.max - volumeRange.min)
    
    // Higher volume with larger price movements
    const movementFactor = 1 + (priceMovement / 1000) * 2 // Scale factor
    
    return baseVolume * movementFactor
  }

  /**
   * Generate normally distributed random numbers using Box-Muller transform
   */
  private static generateNormalRandom(): number {
    // Box-Muller transformation for normal distribution
    const u1 = Math.random()
    const u2 = Math.random()
    
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }

  /**
   * Create time ranges for testing
   */
  static createTimeRanges(config: {
    start?: Date
    intervals?: Array<{ name: string; duration: number; limit?: number }>
  } = {}): Record<string, TimeRange> {
    const start = config.start || new Date('2024-01-15T10:00:00.000Z')
    
    const defaultIntervals = [
      { name: 'minute', duration: 60 * 1000, limit: 100 },
      { name: 'hour', duration: 60 * 60 * 1000, limit: 1000 },
      { name: 'day', duration: 24 * 60 * 60 * 1000, limit: 1000 },
      { name: 'week', duration: 7 * 24 * 60 * 60 * 1000, limit: 10000 }
    ]
    
    const intervals = config.intervals || defaultIntervals
    const ranges: Record<string, TimeRange> = {}
    
    intervals.forEach(interval => {
      ranges[interval.name] = {
        from: new Date(start),
        to: new Date(start.getTime() + interval.duration),
        ...(interval.limit !== undefined ? { limit: interval.limit } : {})
      }
    })
    
    return ranges
  }

  /**
   * Generate batch test data with specific sizes
   */
  static generateBatchTestData(batchSizes: number[]): Array<{ size: number; data: PriceTick[] }> {
    return batchSizes.map(size => ({
      size,
      data: this.generateRealisticTicks(size, { 
        symbol: `TEST${size}`,
        timeInterval: 100 // Faster for testing
      })
    }))
  }
}