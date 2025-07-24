/**
 * Insert Data Example - TimescaleDB Client for Financial Data
 *
 * This example demonstrates various patterns for inserting market data
 * including individual ticks, OHLC candles, and batch operations.
 *
 * Run with: deno run --allow-net --allow-env examples/basic/insert_data.ts
 */
/// <reference lib="deno.ns" />

import { ClientFactory } from '../../src/mod.ts'
import type { PriceTick, Ohlc } from '../../src/types/interfaces.ts'

// Market data generators for demonstration
function generateRealisticTick(symbol: string, basePrice: number, timestamp: Date): PriceTick {
  // Add some realistic market noise (+/- 0.5%)
  const priceVariation = (Math.random() - 0.5) * 0.01 * basePrice
  const price = Math.round((basePrice + priceVariation) * 100) / 100

  // Generate realistic volume based on symbol type
  let volume: number
  if (symbol.includes('USD')) {
    // Crypto volumes (smaller, decimal places)
    volume = Math.round((Math.random() * 5 + 0.1) * 100) / 100
  } else {
    // Stock volumes (larger, whole numbers)
    volume = Math.floor(Math.random() * 1000 + 100)
  }

  return {
    symbol,
    price,
    volume,
    timestamp: timestamp.toISOString()
  }
}

function generateOhlcCandle(symbol: string, basePrice: number, timestamp: Date): Ohlc {
  // Generate realistic OHLC relationships
  const variation = 0.02 * basePrice // 2% max variation
  const open = basePrice + (Math.random() - 0.5) * variation
  const close = open + (Math.random() - 0.5) * variation

  // Ensure high >= max(open, close) and low <= min(open, close)
  const maxPrice = Math.max(open, close)
  const minPrice = Math.min(open, close)
  const high = maxPrice + Math.random() * variation * 0.5
  const low = minPrice - Math.random() * variation * 0.5

  // Calculate total volume for the period
  const volume = Math.floor(Math.random() * 10000 + 1000)

  return {
    symbol,
    timestamp: timestamp.toISOString(),
    open: Math.round(open * 100) / 100,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    close: Math.round(close * 100) / 100,
    volume
  }
}

async function insertDataDemo() {
  console.log('📊 TimescaleDB Client - Insert Data Demo')
  console.log('======================================\n')

  try {
    // Connect to TimescaleDB
    console.log('📡 Connecting to TimescaleDB...')
    const client = await ClientFactory.fromEnvironment({
      validateInputs: true,
      defaultBatchSize: 1000
    })

    // Ensure schema exists
    await client.ensureSchema()
    console.log('✅ Connected and schema verified\n')

    // Demo 1: Insert single price tick
    console.log('1️⃣ Inserting single price tick...')
    const singleTick: PriceTick = {
      symbol: 'BTCUSD',
      price: 45250.00,
      volume: 1.25,
      timestamp: new Date().toISOString()
    }

    const start1 = performance.now()
    await client.insertTick(singleTick)
    const duration1 = Math.round(performance.now() - start1)

    console.log(`✅ Inserted BTCUSD tick: $${singleTick.price} (vol: ${singleTick.volume}) in ${duration1}ms\n`)

    // Demo 2: Insert single OHLC candle
    console.log('2️⃣ Inserting single OHLC candle...')
    const singleCandle: Ohlc = {
      symbol: 'ETHUSD',
      timestamp: new Date().toISOString(),
      open: 2890.50,
      high: 2895.75,
      low: 2885.25,
      close: 2892.00,
      volume: 150.75
    }

    const start2 = performance.now()
    await client.insertOhlc(singleCandle)
    const duration2 = Math.round(performance.now() - start2)

    console.log(`✅ Inserted ETHUSD candle: O:${singleCandle.open} H:${singleCandle.high} L:${singleCandle.low} C:${singleCandle.close} in ${duration2}ms\n`)

    // Demo 3: Batch insert price ticks
    console.log('3️⃣ Batch inserting price ticks...')
    const tickSymbols = ['BTCUSD', 'ETHUSD', 'NVDA', 'TSLA']
    const basePrices = { BTCUSD: 45250, ETHUSD: 2890, NVDA: 185, TSLA: 240 }
    const batchTicks: PriceTick[] = []

    // Generate 1000 realistic ticks over the last hour
    const now = new Date()
    for (let i = 0; i < 1000; i++) {
      const symbol = tickSymbols[i % tickSymbols.length]
      const timestamp = new Date(now.getTime() - (1000 - i) * 3600) // Spread over 1 hour in seconds
      const tick = generateRealisticTick(symbol, basePrices[symbol as keyof typeof basePrices], timestamp)
      batchTicks.push(tick)
    }

    const start3 = performance.now()
    const result3 = await client.insertManyTicks(batchTicks)
    const duration3 = Math.round(performance.now() - start3)

    console.log(`✅ Batch inserted ${result3.processed} ticks in ${duration3}ms`)
    console.log(`   Throughput: ${Math.round(result3.processed / (duration3 / 1000))} ticks/second`)
    if (result3.failed > 0) {
      console.log(`⚠️  ${result3.failed} ticks failed to insert`)
    }
    console.log()

    // Demo 4: Batch insert OHLC candles
    console.log('4️⃣ Batch inserting OHLC candles...')
    const candleSymbols = ['BTCUSD', 'ETHUSD', 'NVDA']
    const batchCandles: Ohlc[] = []

    // Generate hourly candles for the last 24 hours
    for (let hour = 23; hour >= 0; hour--) {
      for (const symbol of candleSymbols) {
        const timestamp = new Date(now.getTime() - hour * 3600000) // Hour ago
        const candle = generateOhlcCandle(symbol, basePrices[symbol as keyof typeof basePrices], timestamp)
        batchCandles.push(candle)
      }
    }

    const start4 = performance.now()
    const result4 = await client.insertManyOhlc(batchCandles)
    const duration4 = Math.round(performance.now() - start4)

    console.log(`✅ Batch inserted ${result4.processed} candles in ${duration4}ms`)
    console.log(`   Throughput: ${Math.round(result4.processed / (duration4 / 1000))} candles/second`)
    if (result4.failed > 0) {
      console.log(`⚠️  ${result4.failed} candles failed to insert`)
    }
    console.log()

    // Demo 5: Handling validation errors
    console.log('5️⃣ Demonstrating validation error handling...')
    const invalidTicks: PriceTick[] = [
      // Valid tick
      { symbol: 'NVDA', price: 185.25, volume: 100, timestamp: new Date().toISOString() },
      // Invalid ticks (will be caught by validation)
      { symbol: '', price: 100, volume: 50, timestamp: new Date().toISOString() }, // Empty symbol
      { symbol: 'INVALID!@#', price: -100, volume: -50, timestamp: 'bad-date' } as any, // Multiple issues
    ]

    try {
      await client.insertManyTicks(invalidTicks)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.log(`✅ Validation error caught: ${errorMessage}`)
    }
    console.log()

    // Demo 6: Upsert behavior (ON CONFLICT handling)
    console.log('6️⃣ Demonstrating upsert behavior...')
    const conflictTick: PriceTick = {
      symbol: 'BTCUSD',
      price: 45300.00, // Different price
      volume: 2.50,     // Different volume
      timestamp: singleTick.timestamp // Same timestamp as earlier insert
    }

    console.log(`Original: $${singleTick.price} (vol: ${singleTick.volume})`)
    console.log(`Update:   $${conflictTick.price} (vol: ${conflictTick.volume})`)

    await client.insertTick(conflictTick)

    // Verify the update
    const latestPrice = await client.getLatestPrice('BTCUSD')
    console.log(`✅ Upserted successfully. Latest price: $${latestPrice}`)
    console.log()

    // Demo 7: Performance comparison
    console.log('7️⃣ Performance comparison: Single vs Batch...')
    const testTicks = Array.from({ length: 100 }, (_, i) =>
      generateRealisticTick('PERF_TEST', 100, new Date(Date.now() + i * 1000))
    )

    // Single inserts
    const startSingle = performance.now()
    for (const tick of testTicks.slice(0, 10)) { // Test with 10 ticks
      await client.insertTick(tick)
    }
    const durationSingle = performance.now() - startSingle

    // Batch insert
    const startBatch = performance.now()
    await client.insertManyTicks(testTicks.slice(10, 20)) // Test with 10 ticks
    const durationBatch = performance.now() - startBatch

    console.log(`Single inserts (10 ticks): ${Math.round(durationSingle)}ms`)
    console.log(`Batch insert (10 ticks):   ${Math.round(durationBatch)}ms`)
    console.log(`Batch is ${Math.round(durationSingle / durationBatch)}x faster`)
    console.log()

    console.log('🎉 Insert data demo completed successfully!')
    console.log('\n📈 Key insights:')
    console.log('- Batch operations are significantly faster than individual inserts')
    console.log('- The client handles validation and upsert behavior automatically')
    console.log('- Large datasets can be processed efficiently with proper batching')
    console.log('- Realistic market data requires proper OHLC relationships')

    await client.close()

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Demo failed:', errorMessage)
    Deno.exit(1)
  }
}

// Run the demo
if (import.meta.main) {
  await insertDataDemo()
}