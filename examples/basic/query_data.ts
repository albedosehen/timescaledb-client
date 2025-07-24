/**
 * Query Data Example - TimescaleDB Client for Financial Data
 *
 * This example demonstrates various patterns for querying market data
 * including time range queries, filtering, and data retrieval optimization.
 *
 * Run with: deno run --allow-net --allow-env examples/basic/query_data.ts
 */
/// <reference lib="deno.ns" />

import { ClientFactory } from '../../src/mod.ts'
import type { PriceTick, Ohlc, TimeRange } from '../../src/types/interfaces.ts'

// Helper function to create time ranges
function createTimeRange(hoursAgo: number, duration = 1): TimeRange {
  const to = new Date(Date.now() - hoursAgo * 3600000)
  const from = new Date(to.getTime() - duration * 3600000)
  return { from, to }
}

// Helper function to format price change
function formatPriceChange(current: number, previous: number): string {
  const change = current - previous
  const percent = (change / previous) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)} (${sign}${percent.toFixed(2)}%)`
}

async function queryDataDemo() {
  console.log('🔍 TimescaleDB Client - Query Data Demo')
  console.log('====================================\n')

  try {
    // Connect to TimescaleDB
    console.log('📡 Connecting to TimescaleDB...')
    const client = await ClientFactory.fromEnvironment({
      validateInputs: true,
      defaultLimit: 1000
    })

    await client.ensureSchema()
    console.log('✅ Connected and ready\n')

    // First, let's insert some sample data for querying
    console.log('📊 Inserting sample data for demonstration...')
    const symbols = ['BTCUSD', 'ETHUSD', 'NVDA', 'TSLA']
    const basePrices = { BTCUSD: 45000, ETHUSD: 2900, NVDA: 185, TSLA: 240 }
    const sampleTicks: PriceTick[] = []

    // Generate 500 ticks over the last 5 hours
    const now = new Date()
    for (let i = 0; i < 500; i++) {
      const symbol = symbols[i % symbols.length]
      const basePrice = basePrices[symbol as keyof typeof basePrices]
      const priceVariation = (Math.random() - 0.5) * 0.02 * basePrice // ±1% variation
      const price = Math.round((basePrice + priceVariation) * 100) / 100
      const volume = Math.round((Math.random() * 10 + 1) * 100) / 100
      const timestamp = new Date(now.getTime() - (500 - i) * 36000) // Spread over 5 hours

      sampleTicks.push({
        symbol,
        price,
        volume,
        timestamp: timestamp.toISOString()
      })
    }

    await client.insertManyTicks(sampleTicks)
    console.log(`✅ Inserted ${sampleTicks.length} sample ticks\n`)

    // Demo 1: Query recent tick data
    console.log('1️⃣ Querying recent tick data...')
    const recentTicks = await client.getTicks('BTCUSD', {
      from: new Date(Date.now() - 3600000), // Last hour
      to: new Date(),
      limit: 10
    })

    console.log(`Found ${recentTicks.length} recent BTCUSD ticks:`)
    recentTicks.slice(0, 5).forEach((tick, i) => {
      console.log(`  ${i + 1}. ${new Date(tick.timestamp).toLocaleTimeString()}: $${tick.price} (vol: ${tick.volume})`)
    })
    if (recentTicks.length > 5) {
      console.log(`  ... and ${recentTicks.length - 5} more`)
    }
    console.log()

    // Demo 2: Query with different time ranges
    console.log('2️⃣ Querying with different time ranges...')
    const timeRanges = [
      { name: 'Last hour', range: createTimeRange(0, 1) },
      { name: 'Last 4 hours', range: createTimeRange(0, 4) },
      { name: 'Yesterday', range: createTimeRange(24, 24) }
    ]

    for (const { name, range } of timeRanges) {
      const ticks = await client.getTicks('ETHUSD', range)
      console.log(`  ${name}: ${ticks.length} ticks`)
    }
    console.log()

    // Demo 3: Multi-symbol latest prices
    console.log('3️⃣ Retrieving multi-symbol latest prices...')
    const latestPrices = await client.getMultiSymbolLatest(symbols)

    console.log('Current Market Snapshot:')
    latestPrices.prices.forEach(price => {
      const timestamp = new Date(price.timestamp).toLocaleTimeString()
      console.log(`  ${price.symbol}: $${price.price.toLocaleString()} at ${timestamp}`)
    })
    console.log(`Retrieved ${latestPrices.found}/${latestPrices.requested} symbols\n`)

    // Demo 4: Query OHLC data with different intervals
    console.log('4️⃣ Querying OHLC data...')

    // First, generate some OHLC data from our ticks
    console.log('Generating OHLC candles from tick data...')
    const ohlcData = await client.getOhlcFromTicks('BTCUSD', 60, { // 60-minute candles
      from: new Date(Date.now() - 6 * 3600000), // Last 6 hours
      to: new Date()
    })

    console.log(`Generated ${ohlcData.length} hourly candles for BTCUSD:`)
    ohlcData.slice(0, 3).forEach((candle, i) => {
      const time = new Date(candle.timestamp).toLocaleTimeString()
      console.log(`  ${i + 1}. ${time}: O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`)
    })
    if (ohlcData.length > 3) {
      console.log(`  ... and ${ohlcData.length - 3} more candles`)
    }
    console.log()

    // Demo 5: Price movement analysis
    console.log('5️⃣ Analyzing price movements...')
    for (const symbol of symbols.slice(0, 2)) { // Analyze first 2 symbols
      try {
        const delta = await client.getPriceDelta(
          symbol,
          new Date(Date.now() - 3600000), // 1 hour ago
          new Date()
        )

        const direction = delta.delta >= 0 ? '📈' : '📉'
        const change = formatPriceChange(delta.endPrice, delta.startPrice)
        console.log(`  ${symbol}: ${direction} $${delta.startPrice} → $${delta.endPrice} (${change})`)
      } catch (error) {
        console.log(`  ${symbol}: No price movement data available`)
      }
    }
    console.log()

    // Demo 6: Query with pagination
    console.log('6️⃣ Demonstrating pagination...')
    const pageSize = 50
    let page = 0
    let totalTicks = 0

    console.log(`Paginating through NVDA ticks (${pageSize} per page):`)
    while (page < 3) { // Limit to 3 pages for demo
      const pagedTicks = await client.getTicks('NVDA', {
        from: new Date(Date.now() - 5 * 3600000), // Last 5 hours
        to: new Date(),
        limit: pageSize
      })

      if (pagedTicks.length === 0) break

      totalTicks += pagedTicks.length
      console.log(`  Page ${page + 1}: ${pagedTicks.length} ticks (${totalTicks} total)`)

      if (pagedTicks.length < pageSize) break // Last page
      page++
    }
    console.log()

    // Demo 7: Query optimization patterns
    console.log('7️⃣ Query optimization patterns...')

    // Pattern 1: Limit results for faster queries
    const startTime1 = performance.now()
    const limitedTicks = await client.getTicks('BTCUSD', {
      from: new Date(Date.now() - 24 * 3600000),
      to: new Date(),
      limit: 100 // Small limit for fast response
    })
    const duration1 = Math.round(performance.now() - startTime1)
    console.log(`  Limited query (100 records): ${limitedTicks.length} results in ${duration1}ms`)

    // Pattern 2: Recent data queries (leveraging time-based indexing)
    const startTime2 = performance.now()
    const recentData = await client.getTicks('BTCUSD', {
      from: new Date(Date.now() - 3600000), // Recent data is faster
      to: new Date(),
      limit: 1000
    })
    const duration2 = Math.round(performance.now() - startTime2)
    console.log(`  Recent data query: ${recentData.length} results in ${duration2}ms`)

    // Pattern 3: Single symbol queries (leveraging symbol indexing)
    const startTime3 = performance.now()
    const singleSymbol = await client.getLatestPrice('ETHUSD')
    const duration3 = Math.round(performance.now() - startTime3)
    console.log(`  Latest price query: $${singleSymbol} in ${duration3}ms`)
    console.log()

    // Demo 8: Error handling for missing data
    console.log('8️⃣ Handling missing data scenarios...')

    // Query for non-existent symbol
    const missingSymbol = await client.getLatestPrice('NONEXISTENT')
    console.log(`  Non-existent symbol price: ${missingSymbol === null ? 'null (correct)' : missingSymbol}`)

    // Query for future time range
    const futureTicks = await client.getTicks('BTCUSD', {
      from: new Date(Date.now() + 3600000), // 1 hour in future
      to: new Date(Date.now() + 7200000)    // 2 hours in future
    })
    console.log(`  Future time range query: ${futureTicks.length} results (should be 0)`)

    // Query for very old data
    const oldTicks = await client.getTicks('BTCUSD', {
      from: new Date('2020-01-01T00:00:00Z'),
      to: new Date('2020-01-01T01:00:00Z')
    })
    console.log(`  Historical data query: ${oldTicks.length} results`)
    console.log()

    // Demo 9: Market data quality checks
    console.log('9️⃣ Market data quality analysis...')
    const allTicks = await client.getTicks('BTCUSD', {
      from: new Date(Date.now() - 3600000),
      to: new Date(),
      limit: 1000
    })

    if (allTicks.length > 1) {
      const prices = allTicks.map(t => t.price)
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length
      const priceRange = maxPrice - minPrice
      const volatility = (priceRange / avgPrice) * 100

      console.log(`  Data quality for BTCUSD (${allTicks.length} ticks):`)
      console.log(`    Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`)
      console.log(`    Average price: $${avgPrice.toFixed(2)}`)
      console.log(`    Volatility: ${volatility.toFixed(2)}%`)

      // Check for data gaps
      const timestamps = allTicks.map(t => new Date(t.timestamp).getTime()).sort()
      const gaps = []
      for (let i = 1; i < timestamps.length; i++) {
        const gap = (timestamps[i] - timestamps[i-1]) / 1000 // Gap in seconds
        if (gap > 60) { // More than 1 minute
          gaps.push(gap)
        }
      }
      console.log(`    Data gaps > 1min: ${gaps.length} (avg: ${gaps.length > 0 ? Math.round(gaps.reduce((a,b) => a+b) / gaps.length) : 0}s)`)
    }
    console.log()

    console.log('🎉 Query data demo completed successfully!')
    console.log('\n📋 Key query patterns learned:')
    console.log('- Time range queries with proper indexing leverage')
    console.log('- Multi-symbol batch operations for efficiency')
    console.log('- Pagination for large result sets')
    console.log('- Error handling for missing or invalid data')
    console.log('- Data quality analysis and gap detection')
    console.log('- Query optimization through limits and time constraints')

    await client.close()

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Demo failed:', errorMessage)
    Deno.exit(1)
  }
}

// Run the demo
if (import.meta.main) {
  await queryDataDemo()
}