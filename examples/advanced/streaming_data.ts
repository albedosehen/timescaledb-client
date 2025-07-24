/**
 * Advanced Streaming Data Operations for TimescaleDB Client
 * 
 * This example demonstrates real-time data streaming patterns for financial applications,
 * including live market data feeds, continuous aggregation, real-time analytics,
 * and event-driven processing for high-frequency trading systems.
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'
import type { PriceTick, Ohlc, TimeRange } from '../../src/mod.ts'

// Configuration for streaming operations
interface StreamingConfig {
  connectionString: string
  batchSize: number
  flushIntervalMs: number
  maxBufferSize: number
  enableRealTimeAnalytics: boolean
  enableAlerts: boolean
}

const config: StreamingConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  batchSize: 1000,
  flushIntervalMs: 5000,
  maxBufferSize: 10000,
  enableRealTimeAnalytics: true,
  enableAlerts: true
}

/**
 * Real-time market data streaming processor
 */
class MarketDataStreamProcessor {
  private client: TimescaleClient
  private buffer: PriceTick[] = []
  private lastFlush: number = Date.now()
  private isRunning: boolean = false
  private flushTimer?: number
  private metrics: StreamingMetrics
  
  constructor(client: TimescaleClient) {
    this.client = client
    this.metrics = new StreamingMetrics()
  }
  
  /**
   * Start processing market data stream
   */
  async start(dataStream: AsyncIterable<PriceTick>): Promise<void> {
    this.isRunning = true
    this.startFlushTimer()
    
    console.log('🚀 Starting real-time market data streaming...')
    console.log(`Buffer size: ${config.batchSize}, Flush interval: ${config.flushIntervalMs}ms`)
    
    try {
      for await (const tick of dataStream) {
        if (!this.isRunning) break
        
        await this.processTick(tick)
        
        // Check if we need to flush
        if (this.shouldFlush()) {
          await this.flush()
        }
        
        // Check buffer overflow
        if (this.buffer.length >= config.maxBufferSize) {
          console.log('⚠️  Buffer overflow detected, forcing flush...')
          await this.flush()
        }
      }
    } catch (error) {
      console.error('❌ Streaming error:', error)
      this.metrics.recordError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      await this.stop()
    }
  }
  
  /**
   * Process individual tick with real-time analytics
   */
  private async processTick(tick: PriceTick): Promise<void> {
    // Add to buffer
    this.buffer.push(tick)
    this.metrics.recordTick(tick)
    
    // Real-time analytics
    if (config.enableRealTimeAnalytics) {
      await this.runRealTimeAnalytics(tick)
    }
    
    // Alert checking
    if (config.enableAlerts) {
      await this.checkAlerts(tick)
    }
  }
  
  /**
   * Check if buffer should be flushed
   */
  private shouldFlush(): boolean {
    const sizeThreshold = this.buffer.length >= config.batchSize
    const timeThreshold = Date.now() - this.lastFlush >= config.flushIntervalMs
    return sizeThreshold || timeThreshold
  }
  
  /**
   * Flush buffer to database
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    
    const flushStart = performance.now()
    const batchToFlush = [...this.buffer]
    this.buffer = []
    
    try {
      const result = await this.client.insertManyTicks(batchToFlush)
      const flushDuration = performance.now() - flushStart
      
      this.metrics.recordFlush(result.processed, flushDuration)
      this.lastFlush = Date.now()
      
      console.log(`💾 Flushed ${result.processed} records in ${flushDuration.toFixed(2)}ms`)
      
    } catch (error) {
      console.error('❌ Flush failed:', error)
      this.metrics.recordError(error instanceof Error ? error : new Error(String(error)))
      
      // Return failed records to buffer for retry
      this.buffer.unshift(...batchToFlush)
    }
  }
  
  /**
   * Run real-time analytics on incoming tick
   */
  private async runRealTimeAnalytics(tick: PriceTick): Promise<void> {
    try {
      // Calculate moving averages in real-time
      const ma5 = await this.calculateMovingAverage(tick.symbol, 5)
      const ma20 = await this.calculateMovingAverage(tick.symbol, 20)
      
      // Detect price movements
      const priceChange = await this.detectPriceMovement(tick)
      
      // Update real-time dashboard metrics
      this.metrics.updateAnalytics(tick.symbol, {
        currentPrice: tick.price,
        ma5,
        ma20,
        priceChange,
        volume: tick.volume || 0
      })
      
    } catch (error) {
      // Don't stop streaming for analytics errors
      console.debug('Analytics error:', error)
    }
  }
  
  /**
   * Check for price alerts
   */
  private async checkAlerts(tick: PriceTick): Promise<void> {
    const alerts = await this.evaluateAlerts(tick)
    
    for (const alert of alerts) {
      console.log(`🚨 ALERT: ${alert.type} - ${alert.message}`)
      
      // In production, send to alert service
      await this.sendAlert(alert)
    }
  }
  
  /**
   * Calculate moving average for real-time analytics
   */
  private async calculateMovingAverage(symbol: string, period: number): Promise<number> {
    try {
      const range: TimeRange = {
        from: new Date(Date.now() - period * 60000), // Last N minutes
        to: new Date()
      }
      
      const smaResults = await this.client.calculateSMA(symbol, period, range)
      return smaResults.length > 0 ? smaResults[0].value : 0
    } catch (error) {
      return 0
    }
  }
  
  /**
   * Detect significant price movements
   */
  private async detectPriceMovement(tick: PriceTick): Promise<number> {
    const historicalAvg = this.metrics.getHistoricalAverage(tick.symbol)
    return historicalAvg > 0 ? ((tick.price - historicalAvg) / historicalAvg) * 100 : 0
  }
  
  /**
   * Evaluate price alerts
   */
  private async evaluateAlerts(tick: PriceTick): Promise<Alert[]> {
    const alerts: Alert[] = []
    
    // Price threshold alerts
    if (tick.price > 50000 && tick.symbol === 'BTCUSD') {
      alerts.push({
        type: 'PRICE_THRESHOLD',
        symbol: tick.symbol,
        message: `${tick.symbol} exceeded $50,000: $${tick.price}`,
        severity: 'HIGH',
        timestamp: new Date()
      })
    }
    
    // Volume spike alerts
    if (tick.volume && tick.volume > 100) {
      alerts.push({
        type: 'VOLUME_SPIKE',
        symbol: tick.symbol,
        message: `High volume detected: ${tick.volume}`,
        severity: 'MEDIUM',
        timestamp: new Date()
      })
    }
    
    // Price change alerts
    const priceChange = await this.detectPriceMovement(tick)
    if (Math.abs(priceChange) > 5) {
      alerts.push({
        type: 'PRICE_MOVEMENT',
        symbol: tick.symbol,
        message: `Significant price movement: ${priceChange.toFixed(2)}%`,
        severity: 'HIGH',
        timestamp: new Date()
      })
    }
    
    return alerts
  }
  
  /**
   * Send alert to external service
   */
  private async sendAlert(alert: Alert): Promise<void> {
    // Simulate sending to alert service
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // In production, integrate with actual alert service
    console.log(`📤 Alert sent: ${JSON.stringify(alert)}`)
  }
  
  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.buffer.length > 0) {
        await this.flush()
      }
    }, config.flushIntervalMs)
  }
  
  /**
   * Stop streaming processor
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping streaming processor...')
    this.isRunning = false
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    
    // Final flush
    await this.flush()
    
    // Display final metrics
    this.metrics.displaySummary()
    
    console.log('✅ Streaming processor stopped')
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): StreamingMetrics {
    return this.metrics
  }
}

/**
 * Streaming metrics collector
 */
class StreamingMetrics {
  private startTime: number = Date.now()
  private tickCount: number = 0
  private flushCount: number = 0
  private errorCount: number = 0
  private totalFlushTime: number = 0
  private symbolPrices: Map<string, number[]> = new Map()
  private analytics: Map<string, any> = new Map()
  
  recordTick(tick: PriceTick): void {
    this.tickCount++
    
    // Track price history for analytics
    if (!this.symbolPrices.has(tick.symbol)) {
      this.symbolPrices.set(tick.symbol, [])
    }
    const prices = this.symbolPrices.get(tick.symbol)!
    prices.push(tick.price)
    
    // Keep only last 100 prices for performance
    if (prices.length > 100) {
      prices.shift()
    }
  }
  
  recordFlush(recordCount: number, duration: number): void {
    this.flushCount++
    this.totalFlushTime += duration
  }
  
  recordError(error: Error): void {
    this.errorCount++
  }
  
  updateAnalytics(symbol: string, data: any): void {
    this.analytics.set(symbol, data)
  }
  
  getHistoricalAverage(symbol: string): number {
    const prices = this.symbolPrices.get(symbol)
    if (!prices || prices.length === 0) return 0
    
    const sum = prices.reduce((acc, price) => acc + price, 0)
    return sum / prices.length
  }
  
  getThroughput(): number {
    const elapsed = (Date.now() - this.startTime) / 1000
    return this.tickCount / elapsed
  }
  
  displaySummary(): void {
    console.log('\n📊 Streaming Metrics Summary:')
    console.log(`  📥 Total ticks processed: ${this.tickCount.toLocaleString()}`)
    console.log(`  💾 Total flushes: ${this.flushCount}`)
    console.log(`  ❌ Errors: ${this.errorCount}`)
    console.log(`  🚀 Throughput: ${this.getThroughput().toFixed(2)} ticks/second`)
    console.log(`  ⏱️  Average flush time: ${(this.totalFlushTime / this.flushCount).toFixed(2)}ms`)
    
    // Display analytics for each symbol
    console.log('\n📈 Real-time Analytics:')
    for (const [symbol, data] of this.analytics) {
      console.log(`  ${symbol}: $${data.currentPrice} | MA5: $${data.ma5.toFixed(2)} | MA20: $${data.ma20.toFixed(2)} | Change: ${data.priceChange.toFixed(2)}%`)
    }
  }
}

/**
 * Alert interface
 */
interface Alert {
  type: string
  symbol: string
  message: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  timestamp: Date
}

/**
 * Continuous aggregation processor
 */
class ContinuousAggregationProcessor {
  private client: TimescaleClient
  private aggregationIntervals: Map<string, number> = new Map()
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  /**
   * Start continuous aggregation for OHLC data
   */
  async startOhlcAggregation(symbols: string[]): Promise<void> {
    console.log('📊 Starting continuous OHLC aggregation...')
    
    const intervals = [
      { name: '1m', minutes: 1 },
      { name: '5m', minutes: 5 },
      { name: '15m', minutes: 15 },
      { name: '1h', minutes: 60 }
    ]
    
    for (const interval of intervals) {
      const timerId = setInterval(async () => {
        await this.generateOhlcCandles(symbols, interval.minutes, interval.name)
      }, interval.minutes * 60000)
      
      this.aggregationIntervals.set(interval.name, timerId)
    }
    
    console.log(`✅ Continuous aggregation started for ${intervals.length} intervals`)
  }
  
  /**
   * Generate OHLC candles for given interval
   */
  private async generateOhlcCandles(symbols: string[], intervalMinutes: number, intervalName: string): Promise<void> {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - intervalMinutes * 60000)
    
    console.log(`🕐 Generating ${intervalName} OHLC candles...`)
    
    const allCandles: Ohlc[] = []
    
    for (const symbol of symbols) {
      try {
        const range: TimeRange = { from: startTime, to: endTime }
        const candles = await this.client.getOhlcFromTicks(symbol, intervalMinutes, range)
        allCandles.push(...candles)
      } catch (error) {
        console.error(`❌ Failed to generate ${intervalName} candles for ${symbol}:`, error)
      }
    }
    
    // Insert generated candles
    if (allCandles.length > 0) {
      try {
        const result = await this.client.insertManyOhlc(allCandles)
        console.log(`✅ Inserted ${result.processed} ${intervalName} candles`)
      } catch (error) {
        console.error(`❌ Failed to insert ${intervalName} candles:`, error)
      }
    }
  }
  
  /**
   * Stop continuous aggregation
   */
  stop(): void {
    console.log('🛑 Stopping continuous aggregation...')
    
    for (const [interval, timerId] of this.aggregationIntervals) {
      clearInterval(timerId)
      console.log(`✅ Stopped ${interval} aggregation`)
    }
    
    this.aggregationIntervals.clear()
  }
}

/**
 * Event-driven streaming processor
 */
class EventDrivenProcessor {
  private client: TimescaleClient
  private eventHandlers: Map<string, ((data: any) => Promise<void>)[]> = new Map()
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  /**
   * Register event handler
   */
  on(eventType: string, handler: (data: any) => Promise<void>): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }
  
  /**
   * Emit event to all registered handlers
   */
  async emit(eventType: string, data: any): Promise<void> {
    const handlers = this.eventHandlers.get(eventType) || []
    
    const promises = handlers.map(handler => 
      handler(data).catch(error => {
        console.error(`❌ Event handler error for ${eventType}:`, error)
      })
    )
    
    await Promise.all(promises)
  }
  
  /**
   * Process stream with event-driven approach
   */
  async processStream(dataStream: AsyncIterable<PriceTick>): Promise<void> {
    console.log('🎯 Starting event-driven stream processing...')
    
    for await (const tick of dataStream) {
      // Emit different events based on conditions
      await this.emit('tick', tick)
      
      // Price threshold events
      if (tick.price > 50000 && tick.symbol === 'BTCUSD') {
        await this.emit('priceThreshold', { tick, threshold: 50000 })
      }
      
      // Volume events
      if (tick.volume && tick.volume > 100) {
        await this.emit('highVolume', { tick, volumeThreshold: 100 })
      }
      
      // Symbol-specific events
      await this.emit(`tick:${tick.symbol}`, tick)
    }
  }
}

/**
 * Generate simulated real-time market data stream
 */
async function* generateRealtimeMarketStream(durationSeconds: number): AsyncGenerator<PriceTick, void, unknown> {
  const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD', 'SOLUSD']
  const basePrice: Record<string, number> = {
    'BTCUSD': 45000,
    'ETHUSD': 2800,
    'ADAUSD': 0.85,
    'SOLUSD': 120
  }
  
  const currentPrices = { ...basePrice }
  const startTime = Date.now()
  const endTime = startTime + (durationSeconds * 1000)
  
  console.log(`📡 Generating real-time market stream for ${durationSeconds} seconds...`)
  
  while (Date.now() < endTime) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)]
    
    // Random walk price movement
    const change = (Math.random() - 0.5) * 0.002 // ±0.2% per tick
    currentPrices[symbol] *= (1 + change)
    
    const tick: PriceTick = {
      symbol,
      price: Number(currentPrices[symbol].toFixed(2)),
      volume: Math.random() * 10 + 0.1,
      timestamp: new Date().toISOString()
    }
    
    yield tick
    
    // Simulate realistic tick rate (variable delay)
    const delay = Math.random() * 100 + 50 // 50-150ms between ticks
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  
  console.log('📡 Market stream ended')
}

/**
 * Demonstrate real-time streaming with analytics
 */
async function demonstrateRealtimeStreaming(): Promise<void> {
  console.log('\n=== Real-time Streaming with Analytics ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    const processor = new MarketDataStreamProcessor(client)
    const dataStream = generateRealtimeMarketStream(30) // 30 seconds
    
    // Start streaming
    await processor.start(dataStream)
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrate continuous aggregation
 */
async function demonstrateContinuousAggregation(): Promise<void> {
  console.log('\n=== Continuous Aggregation ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    const aggregator = new ContinuousAggregationProcessor(client)
    const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD']
    
    // Start continuous aggregation
    await aggregator.startOhlcAggregation(symbols)
    
    // Let it run for a while
    console.log('⏳ Running continuous aggregation for 1 minute...')
    await new Promise(resolve => setTimeout(resolve, 60000))
    
    // Stop aggregation
    aggregator.stop()
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrate event-driven processing
 */
async function demonstrateEventDrivenProcessing(): Promise<void> {
  console.log('\n=== Event-driven Processing ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    const processor = new EventDrivenProcessor(client)
    
    // Register event handlers
    processor.on('tick', async (tick: PriceTick) => {
      // Process every tick
      console.log(`📊 Processing tick: ${tick.symbol} @ $${tick.price}`)
    })
    
    processor.on('priceThreshold', async (data: { tick: PriceTick, threshold: number }) => {
      console.log(`🚨 Price threshold exceeded: ${data.tick.symbol} > $${data.threshold}`)
    })
    
    processor.on('highVolume', async (data: { tick: PriceTick, volumeThreshold: number }) => {
      console.log(`📈 High volume detected: ${data.tick.symbol} volume = ${data.tick.volume}`)
    })
    
    processor.on('tick:BTCUSD', async (tick: PriceTick) => {
      console.log(`₿ Bitcoin tick: $${tick.price}`)
    })
    
    // Process stream
    const dataStream = generateRealtimeMarketStream(15) // 15 seconds
    await processor.processStream(dataStream)
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrate streaming query operations
 */
async function demonstrateStreamingQueries(): Promise<void> {
  console.log('\n=== Streaming Query Operations ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    const range: TimeRange = {
      from: new Date(Date.now() - 86400000), // Last 24 hours
      to: new Date()
    }
    
    console.log('🔍 Streaming large dataset query...')
    
    // Stream large tick dataset
    const tickStream = await client.getTicksStream('BTCUSD', range, { batchSize: 1000 })
    
    let totalTicks = 0
    let minPrice = Infinity
    let maxPrice = -Infinity
    
    for await (const batch of tickStream) {
      totalTicks += batch.length
      
      for (const tick of batch) {
        minPrice = Math.min(minPrice, tick.price)
        maxPrice = Math.max(maxPrice, tick.price)
      }
      
      console.log(`📦 Processed batch: ${batch.length} ticks (total: ${totalTicks})`)
    }
    
    console.log(`✅ Streaming query completed: ${totalTicks} ticks processed`)
    console.log(`📊 Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`)
    
  } finally {
    await client.close()
  }
}

/**
 * Main demonstration function
 */
async function main(): Promise<void> {
  console.log('🌊 TimescaleDB Client - Advanced Streaming Data Operations')
  console.log('=' .repeat(60))
  
  try {
    await demonstrateRealtimeStreaming()
    await demonstrateContinuousAggregation()
    await demonstrateEventDrivenProcessing()
    await demonstrateStreamingQueries()
    
    console.log('\n🎉 All streaming data examples completed!')
    console.log('\n📚 Key Patterns Demonstrated:')
    console.log('  1. Real-time market data streaming with buffering')
    console.log('  2. Continuous aggregation and OHLC generation')
    console.log('  3. Event-driven processing with custom handlers')
    console.log('  4. Streaming query operations for large datasets')
    console.log('  5. Real-time analytics and alerting')
    console.log('  6. Backpressure handling and buffer management')
    console.log('  7. Performance metrics and monitoring')
    
  } catch (error) {
    console.error('❌ Failed to run streaming examples:', error)
    Deno.exit(1)
  }
}

// Run the examples
if (import.meta.main) {
  await main()
}