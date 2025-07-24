/**
 * Advanced Batch Operations for TimescaleDB Client
 * 
 * This example demonstrates high-throughput batch processing patterns for financial data,
 * including parallel processing, chunking strategies, performance optimization,
 * and error recovery mechanisms for production trading systems.
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'
import type { PriceTick, Ohlc, TimeRange, BatchResult } from '../../src/mod.ts'
import { BatchError, ValidationError } from '../../src/mod.ts'

// Configuration for batch operations
interface BatchConfig {
  connectionString: string
  batchSize: number
  maxConcurrency: number
  retryAttempts: number
  progressReporting: boolean
  validateData: boolean
  useTransactions: boolean
}

const config: BatchConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  batchSize: 5000,
  maxConcurrency: 4,
  retryAttempts: 3,
  progressReporting: true,
  validateData: true,
  useTransactions: true
}

/**
 * High-performance batch processor for financial data
 */
class FinancialDataBatchProcessor {
  private client: TimescaleClient
  private processedCount: number = 0
  private failedCount: number = 0
  private startTime: number = 0
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  /**
   * Process large datasets with parallel batching
   */
  async processLargeDataset<T extends PriceTick | Ohlc>(
    data: T[],
    processFn: (batch: T[]) => Promise<BatchResult>,
    options: {
      chunkSize?: number
      maxConcurrency?: number
      onProgress?: (processed: number, total: number) => void
      onError?: (error: Error, batch: T[]) => void
    } = {}
  ): Promise<{
    totalProcessed: number
    totalFailed: number
    durationMs: number
    throughputPerSecond: number
    errors: Error[]
  }> {
    const {
      chunkSize = config.batchSize,
      maxConcurrency = config.maxConcurrency,
      onProgress,
      onError
    } = options
    
    this.startTime = performance.now()
    this.processedCount = 0
    this.failedCount = 0
    const errors: Error[] = []
    
    console.log(`🚀 Starting batch processing: ${data.length} records`)
    console.log(`Chunk size: ${chunkSize}, Max concurrency: ${maxConcurrency}`)
    
    // Create chunks
    const chunks: T[][] = []
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize))
    }
    
    // Process chunks with controlled concurrency
    const semaphore = new Semaphore(maxConcurrency)
    const chunkPromises = chunks.map((chunk, index) => 
      semaphore.acquire().then(async (release) => {
        try {
          const result = await this.processChunkWithRetry(chunk, processFn)
          this.processedCount += result.processed
          this.failedCount += result.failed
          
          if (result.errors) {
            errors.push(...result.errors)
          }
          
          // Report progress
          if (onProgress) {
            onProgress(this.processedCount + this.failedCount, data.length)
          }
          
          if (config.progressReporting) {
            const completed = index + 1
            const progress = (completed / chunks.length * 100).toFixed(1)
            console.log(`📊 Progress: ${progress}% (${completed}/${chunks.length} chunks)`)
          }
          
          return result
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          errors.push(err)
          this.failedCount += chunk.length
          
          if (onError) {
            onError(err, chunk)
          }
          
          console.log(`❌ Chunk ${index + 1} failed: ${err.message}`)
          return { processed: 0, failed: chunk.length, durationMs: 0, errors: [err] }
        } finally {
          release()
        }
      })
    )
    
    await Promise.all(chunkPromises)
    
    const durationMs = performance.now() - this.startTime
    const throughputPerSecond = (this.processedCount / durationMs) * 1000
    
    console.log(`✅ Batch processing completed in ${durationMs.toFixed(2)}ms`)
    console.log(`📈 Throughput: ${throughputPerSecond.toFixed(0)} records/second`)
    
    return {
      totalProcessed: this.processedCount,
      totalFailed: this.failedCount,
      durationMs,
      throughputPerSecond,
      errors
    }
  }
  
  /**
   * Process a single chunk with retry logic
   */
  private async processChunkWithRetry<T extends PriceTick | Ohlc>(
    chunk: T[],
    processFn: (batch: T[]) => Promise<BatchResult>
  ): Promise<BatchResult> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        return await processFn(chunk)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt < config.retryAttempts) {
          const delayMs = Math.pow(2, attempt) * 1000 // Exponential backoff
          console.log(`⏳ Retrying chunk in ${delayMs}ms (attempt ${attempt}/${config.retryAttempts})`)
          await sleep(delayMs)
        }
      }
    }
    
    throw lastError || new Error('Chunk processing failed after all retries')
  }
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number
  private queue: (() => void)[] = []
  
  constructor(permits: number) {
    this.permits = permits
  }
  
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--
        resolve(() => this.release())
      } else {
        this.queue.push(() => {
          this.permits--
          resolve(() => this.release())
        })
      }
    })
  }
  
  private release(): void {
    this.permits++
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

/**
 * Demonstrates high-volume market data ingestion
 */
async function demonstrateHighVolumeIngestion(): Promise<void> {
  console.log('\n=== High-Volume Market Data Ingestion ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString, {
    defaultBatchSize: config.batchSize,
    validateInputs: config.validateData
  })
  
  try {
    // Generate large dataset of market ticks
    const marketData = generateLargeMarketDataset(50000) // 50k records
    const processor = new FinancialDataBatchProcessor(client)
    
    console.log(`Generated ${marketData.length} market tick records`)
    
    // Process with progress monitoring
    const result = await processor.processLargeDataset(
      marketData,
      async (batch) => await client.insertManyTicks(batch),
      {
        chunkSize: config.batchSize,
        maxConcurrency: config.maxConcurrency,
        onProgress: (processed, total) => {
          if (processed % 10000 === 0) {
            const progress = (processed / total * 100).toFixed(1)
            console.log(`📈 Ingested: ${processed}/${total} (${progress}%)`)
          }
        },
        onError: (error, batch) => {
          console.log(`🔴 Batch failed: ${error.message} (${batch.length} records)`)
        }
      }
    )
    
    // Display comprehensive results
    console.log('\n📊 Ingestion Results:')
    console.log(`  ✅ Successfully processed: ${result.totalProcessed.toLocaleString()} records`)
    console.log(`  ❌ Failed records: ${result.totalFailed.toLocaleString()}`)
    console.log(`  ⏱️  Total duration: ${(result.durationMs / 1000).toFixed(2)} seconds`)
    console.log(`  🚀 Throughput: ${result.throughputPerSecond.toLocaleString()} records/second`)
    console.log(`  📉 Error rate: ${((result.totalFailed / marketData.length) * 100).toFixed(2)}%`)
    
    if (result.errors.length > 0) {
      console.log('\n🔍 Error Summary:')
      const errorCounts = result.errors.reduce((acc, error) => {
        const type = error.constructor.name
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      Object.entries(errorCounts).forEach(([type, count]) => {
        console.log(`  ${type}: ${count} occurrences`)
      })
    }
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrates streaming batch processing with backpressure
 */
async function demonstrateStreamingBatchProcessing(): Promise<void> {
  console.log('\n=== Streaming Batch Processing ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Simulate real-time data stream
    const dataStream = createMarketDataStream(1000) // 1000 records/second
    const batchBuffer: PriceTick[] = []
    const flushIntervalMs = 5000 // Flush every 5 seconds
    let lastFlush = Date.now()
    let totalProcessed = 0
    
    console.log('📡 Starting streaming batch processor...')
    console.log(`Batch size: ${config.batchSize}, Flush interval: ${flushIntervalMs}ms`)
    
    // Process streaming data
    for await (const tick of dataStream) {
      batchBuffer.push(tick)
      
      // Flush based on size or time
      const shouldFlushSize = batchBuffer.length >= config.batchSize
      const shouldFlushTime = Date.now() - lastFlush >= flushIntervalMs
      
      if (shouldFlushSize || shouldFlushTime) {
        if (batchBuffer.length > 0) {
          try {
            const result = await client.insertManyTicks([...batchBuffer])
            totalProcessed += result.processed
            
            console.log(`💾 Flushed batch: ${result.processed} records (total: ${totalProcessed})`)
            
            // Clear buffer
            batchBuffer.length = 0
            lastFlush = Date.now()
            
            // Implement backpressure if needed
            if (result.durationMs > 1000) {
              console.log('⚠️  High latency detected, applying backpressure...')
              await sleep(500)
            }
            
          } catch (error) {
            console.log(`❌ Batch flush failed: ${error}`)
            // In production, implement dead letter queue or retry logic
          }
        }
      }
    }
    
    // Final flush
    if (batchBuffer.length > 0) {
      const result = await client.insertManyTicks(batchBuffer)
      totalProcessed += result.processed
      console.log(`🏁 Final flush: ${result.processed} records`)
    }
    
    console.log(`✅ Stream processing completed: ${totalProcessed} total records processed`)
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrates batch data validation and cleaning
 */
async function demonstrateBatchValidationAndCleaning(): Promise<void> {
  console.log('\n=== Batch Data Validation & Cleaning ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Generate dataset with intentional errors
    const dirtyData = generateDirtyMarketData(10000)
    
    console.log(`📋 Processing ${dirtyData.length} records with validation...`)
    
    // Validate and clean data in batches
    const cleanedBatches: PriceTick[] = []
    const rejectedRecords: { record: any, errors: string[] }[] = []
    
    const batchSize = 1000
    for (let i = 0; i < dirtyData.length; i += batchSize) {
      const batch = dirtyData.slice(i, i + batchSize)
      const { valid, invalid } = await validateAndCleanBatch(batch)
      
      cleanedBatches.push(...valid)
      rejectedRecords.push(...invalid)
      
      console.log(`🧹 Processed batch ${Math.floor(i / batchSize) + 1}: ${valid.length} valid, ${invalid.length} rejected`)
    }
    
    // Insert cleaned data
    if (cleanedBatches.length > 0) {
      const processor = new FinancialDataBatchProcessor(client)
      const result = await processor.processLargeDataset(
        cleanedBatches,
        async (batch) => await client.insertManyTicks(batch)
      )
      
      console.log(`✅ Inserted ${result.totalProcessed} cleaned records`)
    }
    
    // Report validation results
    console.log('\n📊 Validation Summary:')
    console.log(`  📥 Input records: ${dirtyData.length.toLocaleString()}`)
    console.log(`  ✅ Valid records: ${cleanedBatches.length.toLocaleString()}`)
    console.log(`  ❌ Rejected records: ${rejectedRecords.length.toLocaleString()}`)
    console.log(`  📈 Validation rate: ${((cleanedBatches.length / dirtyData.length) * 100).toFixed(2)}%`)
    
    // Show error categories
    if (rejectedRecords.length > 0) {
      const errorCategories = rejectedRecords.reduce((acc, { errors }) => {
        errors.forEach(error => {
          acc[error] = (acc[error] || 0) + 1
        })
        return acc
      }, {} as Record<string, number>)
      
      console.log('\n🔍 Rejection Reasons:')
      Object.entries(errorCategories).forEach(([reason, count]) => {
        console.log(`  ${reason}: ${count} records`)
      })
    }
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrates advanced OHLC batch generation from tick data
 */
async function demonstrateOhlcBatchGeneration(): Promise<void> {
  console.log('\n=== Advanced OHLC Batch Generation ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Generate tick data for multiple symbols
    const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD', 'SOLUSD', 'DOTUSD']
    const tickData: PriceTick[] = []
    
    // Generate 1 hour of tick data for each symbol
    const startTime = new Date('2024-01-01T00:00:00Z')
    for (const symbol of symbols) {
      const symbolTicks = generateTickDataForSymbol(symbol, startTime, 3600, 100) // 100 ticks/second
      tickData.push(...symbolTicks)
    }
    
    console.log(`📊 Generated ${tickData.length.toLocaleString()} ticks for ${symbols.length} symbols`)
    
    // Insert tick data first
    const processor = new FinancialDataBatchProcessor(client)
    await processor.processLargeDataset(
      tickData,
      async (batch) => await client.insertManyTicks(batch)
    )
    
    // Generate OHLC candles from tick data for different timeframes
    const timeframes = [
      { name: '1-minute', minutes: 1 },
      { name: '5-minute', minutes: 5 },
      { name: '15-minute', minutes: 15 },
      { name: '1-hour', minutes: 60 }
    ]
    
    for (const timeframe of timeframes) {
      console.log(`\n🕐 Generating ${timeframe.name} OHLC candles...`)
      
      const allCandles: Ohlc[] = []
      for (const symbol of symbols) {
        const range: TimeRange = {
          from: startTime,
          to: new Date(startTime.getTime() + 3600000) // 1 hour later
        }
        
        const candles = await client.getOhlcFromTicks(symbol, timeframe.minutes, range)
        allCandles.push(...candles)
      }
      
      console.log(`📈 Generated ${allCandles.length} ${timeframe.name} candles`)
      
      // Insert OHLC data
      if (allCandles.length > 0) {
        const result = await processor.processLargeDataset(
          allCandles,
          async (batch) => await client.insertManyOhlc(batch)
        )
        
        console.log(`✅ Inserted ${result.totalProcessed} ${timeframe.name} candles`)
      }
    }
    
  } finally {
    await client.close()
  }
}

/**
 * Generate large market dataset for testing
 */
function generateLargeMarketDataset(count: number): PriceTick[] {
  const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD', 'SOLUSD', 'DOTUSD', 'AVAXUSD', 'MATICUSD', 'LINKUSD']
  const data: PriceTick[] = []
  const startTime = Date.now() - (count * 1000) // Spread over time
  
  for (let i = 0; i < count; i++) {
    const symbol = symbols[i % symbols.length]
    const basePrice = getBasePrice(symbol)
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.02) // ±1% variation
    
    data.push({
      symbol,
      price: Number(price.toFixed(2)),
      volume: Math.random() * 10 + 0.1,
      timestamp: new Date(startTime + i * 1000).toISOString()
    })
  }
  
  return data
}

/**
 * Generate dirty data with various validation issues
 */
function generateDirtyMarketData(count: number): any[] {
  const data: any[] = []
  const symbols = ['BTCUSD', 'ETHUSD', 'INVALID!', 'ADAUSD']
  
  for (let i = 0; i < count; i++) {
    const errorType = Math.random()
    let record: any
    
    if (errorType < 0.05) {
      // 5% invalid symbol
      record = {
        symbol: 'INVALID!@#',
        price: 45000,
        volume: 1.0,
        timestamp: new Date().toISOString()
      }
    } else if (errorType < 0.1) {
      // 5% negative price
      record = {
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        price: -100,
        volume: 1.0,
        timestamp: new Date().toISOString()
      }
    } else if (errorType < 0.15) {
      // 5% invalid timestamp
      record = {
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        price: 45000,
        volume: 1.0,
        timestamp: 'invalid-date'
      }
    } else if (errorType < 0.2) {
      // 5% missing required fields
      record = {
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        price: 45000
        // Missing volume and timestamp
      }
    } else {
      // 80% valid data
      record = {
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        price: getBasePrice(symbols[0]) * (1 + (Math.random() - 0.5) * 0.02),
        volume: Math.random() * 10 + 0.1,
        timestamp: new Date().toISOString()
      }
    }
    
    data.push(record)
  }
  
  return data
}

/**
 * Validate and clean a batch of data
 */
async function validateAndCleanBatch(batch: any[]): Promise<{
  valid: PriceTick[]
  invalid: { record: any, errors: string[] }[]
}> {
  const valid: PriceTick[] = []
  const invalid: { record: any, errors: string[] }[] = []
  
  for (const record of batch) {
    const errors: string[] = []
    
    // Validate symbol
    if (!record.symbol || typeof record.symbol !== 'string') {
      errors.push('Missing or invalid symbol')
    } else if (!/^[A-Z0-9_]+$/.test(record.symbol)) {
      errors.push('Invalid symbol format')
    }
    
    // Validate price
    if (typeof record.price !== 'number' || record.price <= 0 || !isFinite(record.price)) {
      errors.push('Invalid price')
    }
    
    // Validate volume (optional)
    if (record.volume !== undefined && (typeof record.volume !== 'number' || record.volume < 0 || !isFinite(record.volume))) {
      errors.push('Invalid volume')
    }
    
    // Validate timestamp
    if (!record.timestamp || isNaN(new Date(record.timestamp).getTime())) {
      errors.push('Invalid timestamp')
    }
    
    if (errors.length === 0) {
      valid.push(record as PriceTick)
    } else {
      invalid.push({ record, errors })
    }
  }
  
  return { valid, invalid }
}

/**
 * Create simulated market data stream
 */
async function* createMarketDataStream(recordsPerSecond: number): AsyncGenerator<PriceTick, void, unknown> {
  const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD']
  const intervalMs = 1000 / recordsPerSecond
  let count = 0
  const maxRecords = 10000 // Limit for demo
  
  while (count < maxRecords) {
    const symbol = symbols[count % symbols.length]
    const basePrice = getBasePrice(symbol)
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.01)
    
    yield {
      symbol,
      price: Number(price.toFixed(2)),
      volume: Math.random() * 5 + 0.1,
      timestamp: new Date().toISOString()
    }
    
    count++
    await sleep(intervalMs)
  }
}

/**
 * Generate tick data for a specific symbol
 */
function generateTickDataForSymbol(symbol: string, startTime: Date, durationSeconds: number, ticksPerSecond: number): PriceTick[] {
  const ticks: PriceTick[] = []
  const basePrice = getBasePrice(symbol)
  let currentPrice = basePrice
  
  const totalTicks = durationSeconds * ticksPerSecond
  const intervalMs = 1000 / ticksPerSecond
  
  for (let i = 0; i < totalTicks; i++) {
    // Random walk price movement
    const change = (Math.random() - 0.5) * 0.001 // ±0.1% per tick
    currentPrice *= (1 + change)
    
    ticks.push({
      symbol,
      price: Number(currentPrice.toFixed(2)),
      volume: Math.random() * 10 + 0.1,
      timestamp: new Date(startTime.getTime() + i * intervalMs).toISOString()
    })
  }
  
  return ticks
}

/**
 * Get base price for a symbol
 */
function getBasePrice(symbol: string): number {
  const prices: Record<string, number> = {
    'BTCUSD': 45000,
    'ETHUSD': 2800,
    'ADAUSD': 0.85,
    'SOLUSD': 120,
    'DOTUSD': 18,
    'AVAXUSD': 35,
    'MATICUSD': 1.2,
    'LINKUSD': 22
  }
  return prices[symbol] || 100
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Main demonstration function
 */
async function main(): Promise<void> {
  console.log('⚡ TimescaleDB Client - Advanced Batch Operations')
  console.log('=' .repeat(55))
  
  try {
    await demonstrateHighVolumeIngestion()
    await demonstrateStreamingBatchProcessing()
    await demonstrateBatchValidationAndCleaning()
    await demonstrateOhlcBatchGeneration()
    
    console.log('\n🎉 All advanced batch operation examples completed!')
    console.log('\n📚 Key Patterns Demonstrated:')
    console.log('  1. High-throughput parallel batch processing')
    console.log('  2. Controlled concurrency with semaphores')
    console.log('  3. Streaming data processing with backpressure')
    console.log('  4. Data validation and cleaning pipelines')
    console.log('  5. OHLC generation from tick data')
    console.log('  6. Error handling and retry strategies')
    console.log('  7. Performance monitoring and throughput optimization')
    
  } catch (error) {
    console.error('❌ Failed to run batch operation examples:', error)
    Deno.exit(1)
  }
}

// Run the examples
if (import.meta.main) {
  await main()
}