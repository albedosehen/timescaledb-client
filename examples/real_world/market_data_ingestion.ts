/**
 * Real-World Market Data Ingestion System
 *
 * This example demonstrates a high-performance market data ingestion system
 * that can handle real-time market feeds, perform data validation, compression,
 * and storage optimization using TimescaleDB. It includes features like:
 * - Multi-source data ingestion
 * - Real-time data processing
 * - Data validation and cleaning
 * - Compression and storage optimization
 * - Performance monitoring and alerting
 * - Error handling and retry logic
 * - Data quality checks
 * - Backpressure handling
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'

// Configuration interfaces
interface IngestionConfig {
  connectionString: string
  dataSources: DataSource[]
  batchSize: number
  bufferSize: number
  flushInterval: number
  compressionLevel: number
  retryAttempts: number
  retryDelay: number
  qualityChecks: QualityCheckConfig
  monitoring: MonitoringConfig
  performance: PerformanceConfig
}

interface DataSource {
  id: string
  name: string
  type: 'websocket' | 'rest' | 'file' | 'kafka'
  url: string
  enabled: boolean
  priority: number
  symbols: string[]
  updateInterval: number
  credentials?: {
    apiKey?: string
    secret?: string
  }
  filters: DataFilter[]
  transformations: DataTransformation[]
}

interface DataFilter {
  field: string
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin'
  value: any
}

interface DataTransformation {
  type: 'normalize' | 'validate' | 'enrich' | 'aggregate'
  config: Record<string, any>
}

interface QualityCheckConfig {
  enabled: boolean
  priceDeviationThreshold: number
  volumeAnomalyThreshold: number
  timestampToleranceMs: number
  duplicateDetection: boolean
  missingDataTolerance: number
}

interface MonitoringConfig {
  enabled: boolean
  metricsInterval: number
  alerting: {
    enabled: boolean
    thresholds: {
      ingestRate: number
      errorRate: number
      latency: number
      queueSize: number
    }
  }
}

interface PerformanceConfig {
  parallelWorkers: number
  maxConcurrentConnections: number
  connectionPoolSize: number
  compressionEnabled: boolean
  cacheEnabled: boolean
  cacheSize: number
}

// Data interfaces
interface RawMarketData {
  source: string
  symbol: string
  timestamp: Date
  price: number
  volume: number
  bid?: number
  ask?: number
  spread?: number
  high?: number
  low?: number
  open?: number
  close?: number
  metadata?: Record<string, any>
}

interface ProcessedMarketData {
  symbol: string
  timestamp: Date
  price: number
  volume: number
  bid: number
  ask: number
  spread: number
  high: number
  low: number
  open: number
  close: number
  source: string
  quality_score: number
  processed_at: Date
  metadata: Record<string, any>
}

interface IngestionMetrics {
  timestamp: Date
  source: string
  records_processed: number
  records_per_second: number
  errors: number
  error_rate: number
  latency_ms: number
  queue_size: number
  memory_usage: number
  cpu_usage: number
}

interface QualityCheck {
  timestamp: Date
  symbol: string
  check_type: string
  passed: boolean
  score: number
  details: Record<string, any>
}

// Configuration
const config: IngestionConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  dataSources: [
    {
      id: 'binance_ws',
      name: 'Binance WebSocket',
      type: 'websocket',
      url: 'wss://stream.binance.com:9443/ws',
      enabled: true,
      priority: 1,
      symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'],
      updateInterval: 100,
      filters: [
        { field: 'price', operator: 'gt', value: 0 },
        { field: 'volume', operator: 'gt', value: 0 }
      ],
      transformations: [
        { type: 'normalize', config: { format: 'decimal' } },
        { type: 'validate', config: { required: ['price', 'volume'] } }
      ]
    },
    {
      id: 'coinbase_rest',
      name: 'Coinbase REST API',
      type: 'rest',
      url: 'https://api.coinbase.com/v2',
      enabled: true,
      priority: 2,
      symbols: ['BTC-USD', 'ETH-USD', 'ADA-USD'],
      updateInterval: 1000,
      filters: [
        { field: 'price', operator: 'gt', value: 0 }
      ],
      transformations: [
        { type: 'normalize', config: { format: 'decimal' } }
      ]
    },
    {
      id: 'polygon_ws',
      name: 'Polygon WebSocket',
      type: 'websocket',
      url: 'wss://socket.polygon.io/stocks',
      enabled: true,
      priority: 3,
      symbols: ['NVDA', 'GOOGL', 'MSFT', 'TSLA'],
      updateInterval: 50,
      credentials: {
        apiKey: 'your-polygon-api-key'
      },
      filters: [
        { field: 'price', operator: 'gt', value: 0 }
      ],
      transformations: [
        { type: 'normalize', config: { format: 'decimal' } },
        { type: 'enrich', config: { addMarketHours: true } }
      ]
    }
  ],
  batchSize: 1000,
  bufferSize: 10000,
  flushInterval: 5000,
  compressionLevel: 6,
  retryAttempts: 3,
  retryDelay: 1000,
  qualityChecks: {
    enabled: true,
    priceDeviationThreshold: 0.1, // 10% deviation
    volumeAnomalyThreshold: 5.0, // 5x normal volume
    timestampToleranceMs: 5000, // 5 seconds
    duplicateDetection: true,
    missingDataTolerance: 0.05 // 5% missing data tolerance
  },
  monitoring: {
    enabled: true,
    metricsInterval: 30000, // 30 seconds
    alerting: {
      enabled: true,
      thresholds: {
        ingestRate: 1000, // records per second
        errorRate: 0.05, // 5% error rate
        latency: 1000, // 1 second latency
        queueSize: 50000 // 50k records in queue
      }
    }
  },
  performance: {
    parallelWorkers: 4,
    maxConcurrentConnections: 10,
    connectionPoolSize: 20,
    compressionEnabled: true,
    cacheEnabled: true,
    cacheSize: 100000
  }
}

/**
 * Market Data Ingestion System
 */
class MarketDataIngestionSystem {
  private client: TimescaleClient
  private config: IngestionConfig
  private dataCollectors: Map<string, DataCollector> = new Map()
  private dataProcessor: DataProcessor
  private qualityChecker: QualityChecker
  private storageManager: StorageManager
  private monitoringSystem: IngestionMonitoringSystem
  private performanceOptimizer: PerformanceOptimizer

  private isRunning: boolean = false
  private dataBuffer: RawMarketData[] = []
  private lastFlushTime: number = Date.now()
  private processedCount: number = 0
  private errorCount: number = 0

  constructor(client: TimescaleClient, config: IngestionConfig) {
    this.client = client
    this.config = config
    this.dataProcessor = new DataProcessor(config)
    this.qualityChecker = new QualityChecker(config.qualityChecks)
    this.storageManager = new StorageManager(client, config)
    this.monitoringSystem = new IngestionMonitoringSystem(client, config.monitoring)
    this.performanceOptimizer = new PerformanceOptimizer(config.performance)
  }

  /**
   * Initialize the ingestion system
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Market Data Ingestion System...')

    // Create database schema
    await this.createIngestionSchema()

    // Initialize components
    await this.storageManager.initialize()
    await this.monitoringSystem.initialize()
    await this.performanceOptimizer.initialize()

    // Initialize data collectors
    for (const sourceConfig of this.config.dataSources) {
      if (sourceConfig.enabled) {
        const collector = new DataCollector(sourceConfig, this.handleIncomingData.bind(this))
        this.dataCollectors.set(sourceConfig.id, collector)
        await collector.initialize()
      }
    }

    console.log('✅ Market Data Ingestion System initialized successfully')
  }

  /**
   * Start data ingestion
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Ingestion system is already running')
      return
    }

    console.log('🎯 Starting Market Data Ingestion...')
    this.isRunning = true

    // Start monitoring
    await this.monitoringSystem.start()

    // Start data collectors
    for (const collector of this.dataCollectors.values()) {
      await collector.start()
    }

    // Start periodic flush
    this.startPeriodicFlush()

    console.log('✅ Market Data Ingestion started successfully')
  }

  /**
   * Stop data ingestion
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Market Data Ingestion...')
    this.isRunning = false

    // Stop data collectors
    for (const collector of this.dataCollectors.values()) {
      await collector.stop()
    }

    // Flush remaining data
    await this.flushBuffer()

    // Stop monitoring
    await this.monitoringSystem.stop()

    // Generate final report
    const metrics = await this.monitoringSystem.getFinalReport()
    console.log('📊 Final Ingestion Report:')
    console.log(`  Total Records Processed: ${this.processedCount}`)
    console.log(`  Total Errors: ${this.errorCount}`)
    console.log(`  Error Rate: ${(this.errorCount / this.processedCount * 100).toFixed(2)}%`)
    console.log(`  Average Latency: ${metrics.average_latency_ms?.toFixed(2)}ms`)

    console.log('✅ Market Data Ingestion stopped successfully')
  }

  /**
   * Handle incoming data from collectors
   */
  private async handleIncomingData(data: RawMarketData): Promise<void> {
    try {
      // Add to buffer
      this.dataBuffer.push(data)

      // Check if buffer is full
      if (this.dataBuffer.length >= this.config.batchSize) {
        await this.flushBuffer()
      }

      // Update metrics
      this.processedCount++

    } catch (error) {
      this.errorCount++
      console.error('❌ Error handling incoming data:', error)
    }
  }

  /**
   * Start periodic buffer flush
   */
  private startPeriodicFlush(): void {
    const flushInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(flushInterval)
        return
      }

      const now = Date.now()
      if (now - this.lastFlushTime >= this.config.flushInterval) {
        await this.flushBuffer()
      }
    }, 1000)
  }

  /**
   * Flush data buffer to storage
   */
  private async flushBuffer(): Promise<void> {
    if (this.dataBuffer.length === 0) return

    const startTime = Date.now()
    const batchData = [...this.dataBuffer]
    this.dataBuffer = []
    this.lastFlushTime = Date.now()

    try {
      // Process data batch
      const processedData = await this.dataProcessor.processBatch(batchData)

      // Run quality checks
      const qualityResults = await this.qualityChecker.checkBatch(processedData)

      // Filter out failed quality checks
      const validData = processedData.filter((_, index) => qualityResults[index].passed)

      // Store data
      await this.storageManager.storeBatch(validData)

      // Store quality results
      await this.storageManager.storeQualityChecks(qualityResults)

      // Update metrics
      const processingTime = Date.now() - startTime
      await this.monitoringSystem.recordMetrics({
        timestamp: new Date(),
        source: 'batch_processor',
        records_processed: validData.length,
        records_per_second: validData.length / (processingTime / 1000),
        errors: batchData.length - validData.length,
        error_rate: (batchData.length - validData.length) / batchData.length,
        latency_ms: processingTime,
        queue_size: this.dataBuffer.length,
        memory_usage: this.getMemoryUsage(),
        cpu_usage: this.getCpuUsage()
      })

      console.log(`✅ Flushed ${validData.length} records in ${processingTime}ms`)

    } catch (error) {
      console.error('❌ Error flushing buffer:', error)
      // Re-add failed data to buffer for retry
      this.dataBuffer.unshift(...batchData)
    }
  }

  /**
   * Create database schema for ingestion
   */
  private async createIngestionSchema(): Promise<void> {
    console.log('📊 Creating ingestion database schema...')

    try {
      // In a real implementation, this would create the necessary tables
      // For this demo, we'll just log that schema creation is simulated
      console.log('✅ Ingestion database schema created successfully (simulated)')
    } catch (error) {
      console.log('⚠️  Ingestion database schema creation failed (simulated)')
    }
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    // Simplified memory usage calculation
    return Math.random() * 100
  }

  /**
   * Get current CPU usage
   */
  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    return Math.random() * 100
  }
}

/**
 * Data Collector for individual data sources
 */
class DataCollector {
  private config: DataSource
  private onDataCallback: (data: RawMarketData) => Promise<void>
  private isRunning: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000

  constructor(config: DataSource, onDataCallback: (data: RawMarketData) => Promise<void>) {
    this.config = config
    this.onDataCallback = onDataCallback
  }

  async initialize(): Promise<void> {
    console.log(`📡 Initializing data collector for ${this.config.name}...`)
  }

  async start(): Promise<void> {
    console.log(`🚀 Starting data collector for ${this.config.name}...`)
    this.isRunning = true

    // Start data collection based on source type
    switch (this.config.type) {
      case 'websocket':
        await this.startWebSocketCollection()
        break
      case 'rest':
        await this.startRestCollection()
        break
      case 'file':
        await this.startFileCollection()
        break
      case 'kafka':
        await this.startKafkaCollection()
        break
    }
  }

  async stop(): Promise<void> {
    console.log(`🛑 Stopping data collector for ${this.config.name}...`)
    this.isRunning = false
  }

  private async startWebSocketCollection(): Promise<void> {
    // Simulate WebSocket data collection
    const generateData = () => {
      if (!this.isRunning) return

      for (const symbol of this.config.symbols) {
        const data = this.generateSimulatedData(symbol)
        this.onDataCallback(data)
      }

      setTimeout(generateData, this.config.updateInterval)
    }

    generateData()
  }

  private async startRestCollection(): Promise<void> {
    // Simulate REST API data collection
    const collectData = async () => {
      if (!this.isRunning) return

      try {
        for (const symbol of this.config.symbols) {
          const data = this.generateSimulatedData(symbol)
          await this.onDataCallback(data)
        }
      } catch (error) {
        console.error(`❌ Error collecting from ${this.config.name}:`, error)
      }

      setTimeout(collectData, this.config.updateInterval)
    }

    collectData()
  }

  private async startFileCollection(): Promise<void> {
    // Simulate file-based data collection
    console.log(`📁 Starting file collection for ${this.config.name}`)
  }

  private async startKafkaCollection(): Promise<void> {
    // Simulate Kafka data collection
    console.log(`📨 Starting Kafka collection for ${this.config.name}`)
  }

  private generateSimulatedData(symbol: string): RawMarketData {
    const basePrice = this.getBasePrice(symbol)
    const price = basePrice + (Math.random() - 0.5) * basePrice * 0.01
    const volume = Math.random() * 1000
    const spread = price * 0.001

    return {
      source: this.config.id,
      symbol,
      timestamp: new Date(),
      price,
      volume,
      bid: price - spread / 2,
      ask: price + spread / 2,
      spread,
      high: price * 1.005,
      low: price * 0.995,
      open: price * 0.999,
      close: price,
      metadata: {
        source_priority: this.config.priority,
        update_interval: this.config.updateInterval
      }
    }
  }

  private getBasePrice(symbol: string): number {
    // Return base prices for different symbols
    const prices: Record<string, number> = {
      'BTCUSDT': 50000,
      'ETHUSDT': 3000,
      'ADAUSDT': 1.2,
      'BTC-USD': 50000,
      'ETH-USD': 3000,
      'ADA-USD': 1.2,
      'NVDA': 150,
      'GOOGL': 2500,
      'MSFT': 300,
      'TSLA': 800
    }

    return prices[symbol] || 100
  }
}

/**
 * Data Processor for cleaning and transforming data
 */
class DataProcessor {
  private config: IngestionConfig
  private cache: Map<string, any> = new Map()

  constructor(config: IngestionConfig) {
    this.config = config
  }

  async processBatch(data: RawMarketData[]): Promise<ProcessedMarketData[]> {
    const processed: ProcessedMarketData[] = []

    for (const item of data) {
      try {
        const processedItem = await this.processItem(item)
        if (processedItem) {
          processed.push(processedItem)
        }
      } catch (error) {
        console.error('❌ Error processing item:', error)
      }
    }

    return processed
  }

  private async processItem(item: RawMarketData): Promise<ProcessedMarketData | null> {
    // Apply filters
    if (!this.applyFilters(item)) {
      return null
    }

    // Apply transformations
    const transformed = await this.applyTransformations(item)

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(transformed)

    return {
      symbol: transformed.symbol,
      timestamp: transformed.timestamp,
      price: transformed.price,
      volume: transformed.volume,
      bid: transformed.bid || transformed.price * 0.9995,
      ask: transformed.ask || transformed.price * 1.0005,
      spread: transformed.spread || transformed.price * 0.001,
      high: transformed.high || transformed.price * 1.005,
      low: transformed.low || transformed.price * 0.995,
      open: transformed.open || transformed.price * 0.999,
      close: transformed.close || transformed.price,
      source: transformed.source,
      quality_score: qualityScore,
      processed_at: new Date(),
      metadata: transformed.metadata || {}
    }
  }

  private applyFilters(item: RawMarketData): boolean {
    const sourceConfig = this.config.dataSources.find(s => s.id === item.source)
    if (!sourceConfig) return false

    for (const filter of sourceConfig.filters) {
      const fieldValue = (item as any)[filter.field]

      switch (filter.operator) {
        case 'gt':
          if (!(fieldValue > filter.value)) return false
          break
        case 'lt':
          if (!(fieldValue < filter.value)) return false
          break
        case 'eq':
          if (fieldValue !== filter.value) return false
          break
        case 'ne':
          if (fieldValue === filter.value) return false
          break
        case 'gte':
          if (!(fieldValue >= filter.value)) return false
          break
        case 'lte':
          if (!(fieldValue <= filter.value)) return false
          break
        case 'in':
          if (!Array.isArray(filter.value) || !filter.value.includes(fieldValue)) return false
          break
        case 'nin':
          if (Array.isArray(filter.value) && filter.value.includes(fieldValue)) return false
          break
      }
    }

    return true
  }

  private async applyTransformations(item: RawMarketData): Promise<RawMarketData> {
    const sourceConfig = this.config.dataSources.find(s => s.id === item.source)
    if (!sourceConfig) return item

    let transformed = { ...item }

    for (const transformation of sourceConfig.transformations) {
      switch (transformation.type) {
        case 'normalize':
          transformed = await this.normalizeData(transformed, transformation.config)
          break
        case 'validate':
          transformed = await this.validateData(transformed, transformation.config)
          break
        case 'enrich':
          transformed = await this.enrichData(transformed, transformation.config)
          break
        case 'aggregate':
          transformed = await this.aggregateData(transformed, transformation.config)
          break
      }
    }

    return transformed
  }

  private async normalizeData(item: RawMarketData, config: any): Promise<RawMarketData> {
    // Normalize numeric values
    if (config.format === 'decimal') {
      item.price = parseFloat(item.price.toFixed(8))
      item.volume = parseFloat(item.volume.toFixed(8))
      if (item.bid) item.bid = parseFloat(item.bid.toFixed(8))
      if (item.ask) item.ask = parseFloat(item.ask.toFixed(8))
    }

    return item
  }

  private async validateData(item: RawMarketData, config: any): Promise<RawMarketData> {
    // Validate required fields
    if (config.required) {
      for (const field of config.required) {
        if (!(field in item) || item[field as keyof RawMarketData] === undefined) {
          throw new Error(`Missing required field: ${field}`)
        }
      }
    }

    return item
  }

  private async enrichData(item: RawMarketData, config: any): Promise<RawMarketData> {
    // Add market hours information
    if (config.addMarketHours) {
      const now = new Date()
      const isMarketHours = this.isMarketHours(now)
      item.metadata = {
        ...item.metadata,
        market_hours: isMarketHours,
        market_session: this.getMarketSession(now)
      }
    }

    return item
  }

  private async aggregateData(item: RawMarketData, config: any): Promise<RawMarketData> {
    // Aggregate data based on time windows
    const cacheKey = `${item.symbol}_${config.window}`

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      // Update aggregated values
      cached.volume += item.volume
      cached.high = Math.max(cached.high, item.price)
      cached.low = Math.min(cached.low, item.price)
      cached.close = item.price

      this.cache.set(cacheKey, cached)
    } else {
      this.cache.set(cacheKey, {
        ...item,
        open: item.price,
        high: item.price,
        low: item.price,
        close: item.price
      })
    }

    return item
  }

  private calculateQualityScore(item: RawMarketData): number {
    let score = 100

    // Check for missing fields
    const requiredFields = ['symbol', 'timestamp', 'price', 'volume']
    for (const field of requiredFields) {
      if (!(field in item) || item[field as keyof RawMarketData] === undefined) {
        score -= 25
      }
    }

    // Check for reasonable values
    if (item.price <= 0) score -= 20
    if (item.volume < 0) score -= 20

    // Check timestamp freshness
    const now = Date.now()
    const dataAge = now - item.timestamp.getTime()
    if (dataAge > 60000) score -= 10 // Older than 1 minute

    return Math.max(0, score)
  }

  private isMarketHours(date: Date): boolean {
    const hour = date.getHours()
    const dayOfWeek = date.getDay()

    // Simple US market hours check (9:30 AM - 4:00 PM EST, Monday-Friday)
    return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 16
  }

  private getMarketSession(date: Date): string {
    const hour = date.getHours()

    if (hour >= 4 && hour < 9) return 'pre-market'
    if (hour >= 9 && hour < 16) return 'regular'
    if (hour >= 16 && hour < 20) return 'after-hours'

    return 'closed'
  }
}

/**
 * Quality Checker for data validation
 */
class QualityChecker {
  private config: QualityCheckConfig
  private priceHistory: Map<string, number[]> = new Map()
  private volumeHistory: Map<string, number[]> = new Map()
  private seenRecords: Set<string> = new Set()

  constructor(config: QualityCheckConfig) {
    this.config = config
  }

  async checkBatch(data: ProcessedMarketData[]): Promise<QualityCheck[]> {
    const results: QualityCheck[] = []

    for (const item of data) {
      const checks = await this.checkItem(item)
      results.push(...checks)
    }

    return results
  }

  private async checkItem(item: ProcessedMarketData): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = []

    // Price deviation check
    const priceCheck = this.checkPriceDeviation(item)
    checks.push(priceCheck)

    // Volume anomaly check
    const volumeCheck = this.checkVolumeAnomaly(item)
    checks.push(volumeCheck)

    // Timestamp check
    const timestampCheck = this.checkTimestamp(item)
    checks.push(timestampCheck)

    // Duplicate check
    if (this.config.duplicateDetection) {
      const duplicateCheck = this.checkDuplicate(item)
      checks.push(duplicateCheck)
    }

    return checks
  }

  private checkPriceDeviation(item: ProcessedMarketData): QualityCheck {
    const symbol = item.symbol
    const price = item.price

    // Get price history
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, [])
    }

    const history = this.priceHistory.get(symbol)!

    if (history.length > 0) {
      const lastPrice = history[history.length - 1]
      const deviation = Math.abs(price - lastPrice) / lastPrice

      const passed = deviation <= this.config.priceDeviationThreshold

      // Update history
      history.push(price)
      if (history.length > 100) history.shift()

      return {
        timestamp: new Date(),
        symbol,
        check_type: 'price_deviation',
        passed,
        score: passed ? 100 : 0,
        details: {
          current_price: price,
          last_price: lastPrice,
          deviation: deviation,
          threshold: this.config.priceDeviationThreshold
        }
      }
    } else {
      // First price record
      history.push(price)

      return {
        timestamp: new Date(),
        symbol,
        check_type: 'price_deviation',
        passed: true,
        score: 100,
        details: {
          current_price: price,
          note: 'First price record'
        }
      }
    }
  }

  private checkVolumeAnomaly(item: ProcessedMarketData): QualityCheck {
    const symbol = item.symbol
    const volume = item.volume

    // Get volume history
    if (!this.volumeHistory.has(symbol)) {
      this.volumeHistory.set(symbol, [])
    }

    const history = this.volumeHistory.get(symbol)!

    if (history.length >= 10) {
      const avgVolume = history.reduce((a, b) => a + b, 0) / history.length
      const volumeRatio = volume / avgVolume

      const passed = volumeRatio <= this.config.volumeAnomalyThreshold

      // Update history
      history.push(volume)
      if (history.length > 100) history.shift()

      return {
        timestamp: new Date(),
        symbol,
        check_type: 'volume_anomaly',
        passed,
        score: passed ? 100 : Math.max(0, 100 - (volumeRatio - this.config.volumeAnomalyThreshold) * 20),
        details: {
          current_volume: volume,
          average_volume: avgVolume,
          volume_ratio: volumeRatio,
          threshold: this.config.volumeAnomalyThreshold
        }
      }
    } else {
      // Not enough history
      history.push(volume)

      return {
        timestamp: new Date(),
        symbol,
        check_type: 'volume_anomaly',
        passed: true,
        score: 100,
        details: {
          current_volume: volume,
          note: 'Insufficient history for volume anomaly detection'
        }
      }
    }
  }

  private checkTimestamp(item: ProcessedMarketData): QualityCheck {
    const now = Date.now()
    const dataTime = item.timestamp.getTime()
    const age = now - dataTime

    const passed = age <= this.config.timestampToleranceMs

    return {
      timestamp: new Date(),
      symbol: item.symbol,
      check_type: 'timestamp',
      passed,
      score: passed ? 100 : Math.max(0, 100 - (age / this.config.timestampToleranceMs) * 100),
      details: {
        data_timestamp: item.timestamp,
        current_time: new Date(),
        age_ms: age,
        tolerance_ms: this.config.timestampToleranceMs
      }
    }
  }

  private checkDuplicate(item: ProcessedMarketData): QualityCheck {
    const recordKey = `${item.symbol}_${item.timestamp.getTime()}_${item.price}_${item.volume}`
    const isDuplicate = this.seenRecords.has(recordKey)

    if (!isDuplicate) {
      this.seenRecords.add(recordKey)
    }

    return {
      timestamp: new Date(),
      symbol: item.symbol,
      check_type: 'duplicate',
      passed: !isDuplicate,
      score: isDuplicate ? 0 : 100,
      details: {
        record_key: recordKey,
        is_duplicate: isDuplicate
      }
    }
  }
}

/**
 * Storage Manager for efficient data storage
 */
class StorageManager {
  private client: TimescaleClient
  private config: IngestionConfig
  private compressionEnabled: boolean

  constructor(client: TimescaleClient, config: IngestionConfig) {
    this.client = client
    this.config = config
    this.compressionEnabled = config.performance.compressionEnabled
  }

  async initialize(): Promise<void> {
    console.log('💾 Initializing Storage Manager...')
  }

  async storeBatch(data: ProcessedMarketData[]): Promise<void> {
    if (data.length === 0) return

    try {
      // In a real implementation, this would batch insert to TimescaleDB
      // For this demo, we'll simulate the storage
      console.log(`💾 Storing ${data.length} market data records`)

      // Simulate compression if enabled
      if (this.compressionEnabled) {
        console.log('🗜️  Applying compression to data batch')
      }

      // Simulate storage delay
      await new Promise(resolve => setTimeout(resolve, 10))

    } catch (error) {
      console.error('❌ Error storing data batch:', error)
      throw error
    }
  }

  async storeQualityChecks(checks: QualityCheck[]): Promise<void> {
    if (checks.length === 0) return

    try {
      // In a real implementation, this would store quality check results
      // For this demo, we'll simulate the storage
      console.log(`📊 Storing ${checks.length} quality check results`)

      // Simulate storage delay
      await new Promise(resolve => setTimeout(resolve, 5))

    } catch (error) {
      console.error('❌ Error storing quality checks:', error)
      throw error
    }
  }

  async storeMetrics(metrics: IngestionMetrics): Promise<void> {
    try {
      // In a real implementation, this would store metrics to TimescaleDB
      // For this demo, we'll simulate the storage
      console.log(`📈 Storing ingestion metrics for ${metrics.source}`)

    } catch (error) {
      console.error('❌ Error storing metrics:', error)
      throw error
    }
  }
}

/**
 * Monitoring System for ingestion performance
 */
class IngestionMonitoringSystem {
  private client: TimescaleClient
  private config: MonitoringConfig
  private metrics: IngestionMetrics[] = []
  private isRunning: boolean = false
  private alertThresholds: any

  constructor(client: TimescaleClient, config: MonitoringConfig) {
    this.client = client
    this.config = config
    this.alertThresholds = config.alerting.thresholds
  }

  async initialize(): Promise<void> {
    console.log('🔍 Initializing Ingestion Monitoring System...')
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return

    console.log('🚀 Starting Ingestion Monitoring...')
    this.isRunning = true

    // Start periodic metrics collection
    this.startMetricsCollection()
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Ingestion Monitoring...')
    this.isRunning = false
  }

  async recordMetrics(metrics: IngestionMetrics): Promise<void> {
    this.metrics.push(metrics)

    // Keep only recent metrics
    if (this.metrics.length > 1000) {
      this.metrics.shift()
    }

    // Check for alerts
    await this.checkAlerts(metrics)
  }

  async getFinalReport(): Promise<any> {
    if (this.metrics.length === 0) {
      return {
        total_records: 0,
        average_latency_ms: 0,
        average_throughput: 0,
        error_rate: 0
      }
    }

    const totalRecords = this.metrics.reduce((sum, m) => sum + m.records_processed, 0)
    const averageLatency = this.metrics.reduce((sum, m) => sum + m.latency_ms, 0) / this.metrics.length
    const averageThroughput = this.metrics.reduce((sum, m) => sum + m.records_per_second, 0) / this.metrics.length
    const totalErrors = this.metrics.reduce((sum, m) => sum + m.errors, 0)
    const errorRate = totalErrors / totalRecords

    return {
      total_records: totalRecords,
      average_latency_ms: averageLatency,
      average_throughput: averageThroughput,
      error_rate: errorRate,
      metrics_count: this.metrics.length
    }
  }

  private startMetricsCollection(): void {
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval)
        return
      }

      // Collect and report system metrics
      const systemMetrics: IngestionMetrics = {
        timestamp: new Date(),
        source: 'system',
        records_processed: 0,
        records_per_second: 0,
        errors: 0,
        error_rate: 0,
        latency_ms: 0,
        queue_size: 0,
        memory_usage: this.getMemoryUsage(),
        cpu_usage: this.getCpuUsage()
      }

      await this.recordMetrics(systemMetrics)

    }, this.config.metricsInterval)
  }

  private async checkAlerts(metrics: IngestionMetrics): Promise<void> {
    if (!this.config.alerting.enabled) return

    // Check throughput alert
    if (metrics.records_per_second > this.alertThresholds.ingestRate) {
      console.log(`🚨 HIGH THROUGHPUT ALERT: ${metrics.records_per_second} records/sec exceeds threshold`)
    }

    // Check error rate alert
    if (metrics.error_rate > this.alertThresholds.errorRate) {
      console.log(`🚨 HIGH ERROR RATE ALERT: ${(metrics.error_rate * 100).toFixed(2)}% exceeds threshold`)
    }

    // Check latency alert
    if (metrics.latency_ms > this.alertThresholds.latency) {
      console.log(`🚨 HIGH LATENCY ALERT: ${metrics.latency_ms}ms exceeds threshold`)
    }

    // Check queue size alert
    if (metrics.queue_size > this.alertThresholds.queueSize) {
      console.log(`🚨 QUEUE SIZE ALERT: ${metrics.queue_size} records in queue exceeds threshold`)
    }
  }

  private getMemoryUsage(): number {
    // Simplified memory usage calculation
    return Math.random() * 100
  }

  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    return Math.random() * 100
  }
}

/**
 * Performance Optimizer for system optimization
 */
class PerformanceOptimizer {
  private config: PerformanceConfig
  private workerPool: Worker[] = []
  private connectionPool: Connection[] = []
  private cache: Map<string, any> = new Map()

  constructor(config: PerformanceConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('⚡ Initializing Performance Optimizer...')

    // Initialize worker pool
    await this.initializeWorkerPool()

    // Initialize connection pool
    await this.initializeConnectionPool()

    // Initialize cache
    if (this.config.cacheEnabled) {
      await this.initializeCache()
    }
  }

  private async initializeWorkerPool(): Promise<void> {
    console.log(`👥 Initializing ${this.config.parallelWorkers} parallel workers`)
    // In a real implementation, this would create worker threads
  }

  private async initializeConnectionPool(): Promise<void> {
    console.log(`🔌 Initializing connection pool with ${this.config.connectionPoolSize} connections`)
    // In a real implementation, this would create database connections
  }

  private async initializeCache(): Promise<void> {
    console.log(`🗄️  Initializing cache with ${this.config.cacheSize} entries`)
    // In a real implementation, this would set up Redis or in-memory cache
  }
}

// Helper interfaces for performance optimization
interface Worker {
  id: string
  isAvailable: boolean
  currentTask?: any
}

interface Connection {
  id: string
  isAvailable: boolean
  client: any
}

/**
 * Main demonstration function
 */
async function demonstrateMarketDataIngestion() {
  console.log('🎯 Starting Market Data Ingestion Demonstration...')

  try {
    // Initialize client
    const client = await ClientFactory.fromConnectionString(config.connectionString)

    // Create and initialize ingestion system
    const ingestionSystem = new MarketDataIngestionSystem(client, config)
    await ingestionSystem.initialize()

    // Start ingestion
    await ingestionSystem.start()

    // Let it run for demonstration
    console.log('🏃 Market data ingestion running for 30 seconds...')
    await new Promise(resolve => setTimeout(resolve, 30000))

    // Stop ingestion
    await ingestionSystem.stop()

    console.log('✅ Market Data Ingestion demonstration completed!')

  } catch (error) {
    console.error('❌ Error in market data ingestion demonstration:', error)
  }
}

// Run the demonstration
if (import.meta.main) {
  await demonstrateMarketDataIngestion()
}

export {
  MarketDataIngestionSystem,
  DataCollector,
  DataProcessor,
  QualityChecker,
  StorageManager,
  IngestionMonitoringSystem,
  PerformanceOptimizer,
  type IngestionConfig,
  type DataSource,
  type RawMarketData,
  type ProcessedMarketData,
  type IngestionMetrics,
  type QualityCheck
}