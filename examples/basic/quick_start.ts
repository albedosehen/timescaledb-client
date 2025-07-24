/**
 * Quick Start Example - TimescaleDB Client for Financial Data
 *
 * This example demonstrates the minimal setup required to start using the
 * TimescaleDB client for financial market data operations.
 *
 * Run with: deno run --allow-net --allow-env examples/basic/quick_start.ts
 */
/// <reference lib="deno.ns" />

import { ClientFactory } from '../../src/mod.ts'

// Sample market data for demonstration
const sampleTicks = [
  {
    symbol: 'BTCUSD',
    price: 45250.00,
    volume: 1.25,
    timestamp: '2024-01-15T10:00:00.000Z'
  },
  {
    symbol: 'ETHUSD',
    price: 2890.50,
    volume: 5.50,
    timestamp: '2024-01-15T10:00:01.000Z'
  },
  {
    symbol: 'NVDA',
    price: 185.25,
    volume: 100,
    timestamp: '2024-01-15T10:00:02.000Z'
  }
]

async function quickStartDemo() {
  console.log('🚀 TimescaleDB Client - Quick Start Demo')
  console.log('=====================================\n')

  try {
    // Step 1: Create client from environment variables
    console.log('📡 Connecting to TimescaleDB...')
    const client = await ClientFactory.fromEnvironment({
      validateInputs: true,
      defaultBatchSize: 1000
    })

    // Step 2: Check database health
    console.log('🏥 Checking database health...')
    const health = await client.healthCheck()
    if (!health.isHealthy) {
      throw new Error(`Database health check failed: ${health.errors?.join(', ')}`)
    }
    console.log(`✅ Connected to TimescaleDB ${health.version} in ${health.responseTimeMs}ms\n`)

    // Step 3: Ensure schema exists (creates tables if needed)
    console.log('🗄️  Ensuring database schema...')
    await client.ensureSchema()
    console.log('✅ Schema verified\n')

    // Step 4: Insert sample market data
    console.log('📊 Inserting sample market ticks...')
    const insertResult = await client.insertManyTicks(sampleTicks)
    console.log(`✅ Inserted ${insertResult.processed} ticks in ${insertResult.durationMs}ms\n`)

    // Step 5: Query latest prices
    console.log('💰 Retrieving latest prices...')
    const symbols = ['BTCUSD', 'ETHUSD', 'NVDA']
    const latestPrices = await client.getMultiSymbolLatest(symbols)

    console.log('Latest Market Prices:')
    latestPrices.prices.forEach(price => {
      console.log(`  ${price.symbol}: $${price.price.toLocaleString()} (${price.timestamp.toISOString()})`)
    })
    console.log()

    // Step 6: Calculate price movements
    console.log('📈 Analyzing price movements...')
    const timeRange = {
      from: new Date('2024-01-15T09:00:00.000Z'),
      to: new Date('2024-01-15T11:00:00.000Z')
    }

    for (const symbol of symbols) {
      try {
        const delta = await client.getPriceDelta(
          symbol,
          timeRange.from,
          timeRange.to
        )

        const direction = delta.delta >= 0 ? '📈' : '📉'
        console.log(`  ${symbol}: ${direction} ${delta.delta >= 0 ? '+' : ''}${delta.delta.toFixed(2)} (${delta.percentChange.toFixed(2)}%)`)
      } catch (error) {
        console.log(`  ${symbol}: No data available`)
      }
    }
    console.log()

    // Step 7: Query recent tick data
    console.log('⏰ Retrieving recent tick history...')
    const recentTicks = await client.getTicks('BTCUSD', {
      from: new Date(Date.now() - 3600000), // Last hour
      to: new Date(),
      limit: 10
    })

    console.log(`Found ${recentTicks.length} recent BTCUSD ticks:`)
    recentTicks.slice(0, 3).forEach(tick => {
      console.log(`  ${tick.timestamp}: $${tick.price} (vol: ${tick.volume || 'N/A'})`)
    })
    if (recentTicks.length > 3) {
      console.log(`  ... and ${recentTicks.length - 3} more`)
    }
    console.log()

    // Step 8: Basic technical analysis
    console.log('📊 Calculating technical indicators...')
    try {
      // Calculate 20-period SMA for BTCUSD
      const sma = await client.calculateSMA('BTCUSD', 20, {
        from: new Date('2024-01-01T00:00:00.000Z'),
        to: new Date('2024-01-31T23:59:59.000Z')
      })

      if (sma.length > 0) {
        const latestSMA = sma[0] // Most recent value (ordered DESC)
        console.log(`  BTCUSD SMA(20): $${latestSMA.value.toFixed(2)}`)
      } else {
        console.log('  BTCUSD SMA(20): Insufficient data')
      }
    } catch (error) {
      console.log('  BTCUSD SMA(20): Calculation failed (need more data)')
    }

    // Step 9: Demonstrate error handling
    console.log('\n🛡️  Demonstrating error handling...')
    try {
      // This should fail validation
      await client.insertTick({
        symbol: '', // Invalid empty symbol
        price: -100, // Invalid negative price
        timestamp: 'invalid-date' // Invalid timestamp
      } as any)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.log(`✅ Error properly caught: ${errorMessage}`)
    }

    console.log('\n🎉 Quick start demo completed successfully!')
    console.log('\nNext steps:')
    console.log('- Explore more examples in examples/basic/')
    console.log('- Check out advanced features in examples/advanced/')
    console.log('- Review real-world scenarios in examples/real_world/')

    // Clean up
    await client.close()

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Demo failed:', errorMessage)
    if (errorMessage.includes('Connection')) {
      console.error('\n💡 Make sure TimescaleDB is running and environment variables are set:')
      console.error('   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD')
    }
    Deno.exit(1)
  }
}

// Run the demo
if (import.meta.main) {
  await quickStartDemo()
}