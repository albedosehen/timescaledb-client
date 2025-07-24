/**
 * Aggregations Example - TimescaleDB Client for Financial Data
 *
 * This example demonstrates technical analysis and aggregation operations
 * including moving averages, RSI, volatility calculations, and other indicators.
 *
 * Run with: deno run --allow-net --allow-env examples/basic/aggregations.ts
 */
/// <reference lib="deno.ns" />

import { ClientFactory } from '../../src/mod.ts'
import type { PriceTick, TimeRange } from '../../src/types/interfaces.ts'

// Helper function to generate realistic market data with trends
function generateTrendingData(symbol: string, basePrice: number, count: number, trend = 0): PriceTick[] {
  const ticks: PriceTick[] = []
  let currentPrice = basePrice
  const now = new Date()

  for (let i = 0; i < count; i++) {
    // Add trend (drift) and random walk
    const drift = trend * (basePrice * 0.001) // 0.1% trend per tick
    const randomWalk = (Math.random() - 0.5) * basePrice * 0.005 // 0.5% random variation
    currentPrice = Math.max(0.01, currentPrice + drift + randomWalk)

    const volume = Math.random() * 10 + 1
    const timestamp = new Date(now.getTime() - (count - i) * 60000) // 1 minute intervals

    ticks.push({
      symbol,
      price: Math.round(currentPrice * 100) / 100,
      volume: Math.round(volume * 100) / 100,
      timestamp: timestamp.toISOString()
    })
  }

  return ticks
}

async function aggregationsDemo() {
  console.log('📊 TimescaleDB Client - Aggregations & Technical Analysis Demo')
  console.log('============================================================\n')

  try {
    // Connect to TimescaleDB
    console.log('📡 Connecting to TimescaleDB...')
    const client = await ClientFactory.fromEnvironment({
      validateInputs: true,
      defaultBatchSize: 2000
    })

    await client.ensureSchema()
    console.log('✅ Connected and ready\n')

    // Generate sample data with different market conditions
    console.log('📈 Generating sample market data...')
    const symbols = {
      'BTCUSD': { basePrice: 45000, trend: 1 },    // Bullish trend
      'ETHUSD': { basePrice: 2900, trend: -0.5 },  // Bearish trend
      'NVDA': { basePrice: 185, trend: 0 },        // Sideways
      'TSLA': { basePrice: 240, trend: 2 }         // Strong bullish
    }

    const allTicks: PriceTick[] = []
    for (const [symbol, config] of Object.entries(symbols)) {
      const ticks = generateTrendingData(symbol, config.basePrice, 200, config.trend)
      allTicks.push(...ticks)
    }

    const result = await client.insertManyTicks(allTicks)
    console.log(`✅ Generated and inserted ${result.processed} ticks across ${Object.keys(symbols).length} symbols\n`)

    // Define time range for analysis
    const timeRange: TimeRange = {
      from: new Date(Date.now() - 4 * 3600000), // Last 4 hours
      to: new Date()
    }

    // Demo 1: Moving Averages
    console.log('1️⃣ Calculating Moving Averages...')
    const symbol = 'BTCUSD'

    try {
      // Simple Moving Average (SMA)
      const sma20 = await client.calculateSMA(symbol, 20, timeRange)
      const sma50 = await client.calculateSMA(symbol, 50, timeRange)

      console.log(`SMA Analysis for ${symbol}:`)
      if (sma20.length > 0) {
        console.log(`  SMA(20): $${sma20[0].value.toFixed(2)} (latest)`)
      }
      if (sma50.length > 0) {
        console.log(`  SMA(50): $${sma50[0].value.toFixed(2)} (latest)`)
      }

      // Exponential Moving Average (EMA)
      const ema12 = await client.calculateEMA(symbol, 12, timeRange)
      const ema26 = await client.calculateEMA(symbol, 26, timeRange)

      if (ema12.length > 0 && ema26.length > 0) {
        console.log(`  EMA(12): $${ema12[0].value.toFixed(2)}`)
        console.log(`  EMA(26): $${ema26[0].value.toFixed(2)}`)

        // MACD Signal
        const macd = ema12[0].value - ema26[0].value
        console.log(`  MACD: ${macd.toFixed(2)} ${macd > 0 ? '📈 Bullish' : '📉 Bearish'}`)
      }

      // Moving Average Cross Signal
      if (sma20.length > 0 && sma50.length > 0) {
        const crossSignal = sma20[0].value > sma50[0].value ? 'Golden Cross 📈' : 'Death Cross 📉'
        console.log(`  MA Cross: ${crossSignal}`)
      }
    } catch (error) {
      console.log(`  Moving averages: Need more data points for calculation`)
    }
    console.log()

    // Demo 2: RSI (Relative Strength Index)
    console.log('2️⃣ Calculating RSI (Relative Strength Index)...')
    for (const sym of Object.keys(symbols).slice(0, 2)) {
      try {
        const rsi = await client.calculateRSI(sym, 14, timeRange)
        if (rsi.length > 0) {
          const rsiValue = rsi[0].rsi
          let signal = ''
          if (rsiValue > 70) signal = '🔴 Overbought'
          else if (rsiValue < 30) signal = '🟢 Oversold'
          else signal = '🟡 Neutral'

          console.log(`  ${sym}: RSI(14) = ${rsiValue.toFixed(2)} ${signal}`)
        }
      } catch (error) {
        console.log(`  ${sym}: RSI calculation needs more data`)
      }
    }
    console.log()

    // Demo 3: Bollinger Bands
    console.log('3️⃣ Calculating Bollinger Bands...')
    try {
      const bands = await client.calculateBollingerBands(symbol, 20, 2.0, timeRange)
      if (bands.length > 0) {
        const latest = bands[0]
        const currentPrice = await client.getLatestPrice(symbol)

        console.log(`Bollinger Bands for ${symbol}:`)
        console.log(`  Upper Band: $${latest.upperBand.toFixed(2)}`)
        console.log(`  Middle (SMA): $${latest.sma.toFixed(2)}`)
        console.log(`  Lower Band: $${latest.lowerBand.toFixed(2)}`)

        if (currentPrice) {
          let position = ''
          if (currentPrice > latest.upperBand) position = '🔴 Above upper band (overbought)'
          else if (currentPrice < latest.lowerBand) position = '🟢 Below lower band (oversold)'
          else position = '🟡 Within bands (normal)'

          console.log(`  Current Price: $${currentPrice.toFixed(2)} ${position}`)
        }
      }
    } catch (error) {
      console.log(`  Bollinger Bands: Need more data for calculation`)
    }
    console.log()

    // Demo 4: Volatility Analysis
    console.log('4️⃣ Volatility Analysis...')
    for (const sym of Object.keys(symbols)) {
      try {
        const volatility = await client.getVolatility(sym, 4) // 4 hours
        let volatilityLevel = ''
        if (volatility > 50) volatilityLevel = '🔥 High'
        else if (volatility > 20) volatilityLevel = '🟡 Medium'
        else volatilityLevel = '🟢 Low'

        console.log(`  ${sym}: ${volatility.toFixed(2)}% ${volatilityLevel} volatility`)
      } catch (error) {
        console.log(`  ${sym}: Volatility calculation failed`)
      }
    }
    console.log()

    // Demo 5: Price Momentum Analysis
    console.log('5️⃣ Price Momentum Analysis...')
    const timeFrames = [
      { name: '1 hour', hours: 1 },
      { name: '4 hours', hours: 4 },
      { name: '24 hours', hours: 24 }
    ]

    for (const sym of Object.keys(symbols).slice(0, 2)) {
      console.log(`${sym} momentum:`)
      for (const timeFrame of timeFrames) {
        try {
          const delta = await client.getPriceDelta(
            sym,
            new Date(Date.now() - timeFrame.hours * 3600000),
            new Date()
          )

          const direction = delta.delta >= 0 ? '📈' : '📉'
          const percentChange = ((delta.endPrice - delta.startPrice) / delta.startPrice * 100)
          console.log(`  ${timeFrame.name}: ${direction} ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`)
        } catch (error) {
          console.log(`  ${timeFrame.name}: No data available`)
        }
      }
    }
    console.log()

    // Demo 6: VWAP (Volume Weighted Average Price)
    console.log('6️⃣ VWAP Analysis...')
    try {
      const vwap = await client.getVwap(symbol, '1 hour', timeRange)
      if (vwap.length > 0) {
        console.log(`VWAP Analysis for ${symbol}:`)
        vwap.slice(0, 3).forEach((bucket, i) => {
          const time = new Date(bucket.bucket).toLocaleTimeString()
          console.log(`  ${time}: VWAP = $${bucket.vwap.toFixed(2)} (vol: ${bucket.totalVolume})`)
        })

        // Compare current price to VWAP
        const latestVwap = vwap[0].vwap
        const currentPrice = await client.getLatestPrice(symbol)
        if (currentPrice) {
          const vwapSignal = currentPrice > latestVwap ? '📈 Above VWAP (bullish)' : '📉 Below VWAP (bearish)'
          console.log(`  Signal: ${vwapSignal}`)
        }
      }
    } catch (error) {
      console.log(`  VWAP: Calculation failed - need volume data`)
    }
    console.log()

    // Demo 7: Support and Resistance Levels
    console.log('7️⃣ Support and Resistance Analysis...')
    try {
      const levels = await client.findSupportResistanceLevels(symbol, timeRange, 0.005, 2)
      if (levels.length > 0) {
        console.log(`Found ${levels.length} key levels for ${symbol}:`)
        levels.slice(0, 5).forEach((level, i) => {
          const type = level.type === 'support' ? '🟢 Support' : '🔴 Resistance'
          console.log(`  ${i + 1}. ${type}: $${level.level.toFixed(2)} (${level.touches} touches, strength: ${level.strength.toFixed(2)})`)
        })
      } else {
        console.log(`  No significant levels found for ${symbol}`)
      }
    } catch (error) {
      console.log(`  Support/Resistance: Analysis failed`)
    }
    console.log()

    // Demo 8: Market Correlation Analysis
    console.log('8️⃣ Asset Correlation Analysis...')
    const pairs = [
      ['BTCUSD', 'ETHUSD'],
      ['NVDA', 'TSLA']
    ]

    for (const [symbol1, symbol2] of pairs) {
      try {
        const correlation = await client.calculateCorrelation(symbol1, symbol2, timeRange)
        let correlationLevel = ''
        const corr = correlation.correlation

        if (Math.abs(corr) > 0.8) correlationLevel = '🔴 Strong'
        else if (Math.abs(corr) > 0.5) correlationLevel = '🟡 Moderate'
        else correlationLevel = '🟢 Weak'

        const direction = corr > 0 ? 'Positive' : 'Negative'
        console.log(`  ${symbol1} vs ${symbol2}: ${corr.toFixed(3)} (${direction} ${correlationLevel})`)
      } catch (error) {
        console.log(`  ${symbol1} vs ${symbol2}: Correlation calculation failed`)
      }
    }
    console.log()

    // Demo 9: Top Market Movers
    console.log('9️⃣ Top Market Movers...')
    try {
      const topMovers = await client.getTopMovers(5, 4) // Top 5 in last 4 hours
      if (topMovers.length > 0) {
        console.log('Biggest price movements (last 4 hours):')
        topMovers.forEach((mover, i) => {
          const direction = mover.percentChange >= 0 ? '📈' : '📉'
          console.log(`  ${i + 1}. ${mover.symbol}: ${direction} ${mover.percentChange >= 0 ? '+' : ''}${mover.percentChange.toFixed(2)}% ($${mover.startPrice} → $${mover.currentPrice})`)
        })
      }
    } catch (error) {
      console.log(`  Top movers: Analysis failed`)
    }
    console.log()

    // Demo 10: Volume Profile Analysis
    console.log('🔟 Volume Profile Analysis...')
    try {
      const volumeProfile = await client.getVolumeProfile(symbol, timeRange, 10)
      if (volumeProfile.length > 0) {
        console.log(`Volume Profile for ${symbol} (10 price levels):`)

        // Find the volume-weighted average price level
        const totalVolume = volumeProfile.reduce((sum, level) => sum + level.volume, 0)
        const volumeWeightedPrice = volumeProfile.reduce((sum, level) =>
          sum + (level.priceLevel * level.volume), 0) / totalVolume

        console.log(`  Volume-weighted price: $${volumeWeightedPrice.toFixed(2)}`)
        console.log(`  Top volume levels:`)

        volumeProfile
          .sort((a, b) => b.volume - a.volume)
          .slice(0, 3)
          .forEach((level, i) => {
            console.log(`    ${i + 1}. $${level.priceLevel.toFixed(2)}: ${level.volume.toFixed(2)} (${level.volumePercent.toFixed(1)}%)`)
          })
      }
    } catch (error) {
      console.log(`  Volume Profile: Analysis failed`)
    }
    console.log()

    console.log('🎉 Aggregations and technical analysis demo completed!')
    console.log('\n📊 Technical indicators calculated:')
    console.log('- Moving Averages (SMA, EMA) for trend analysis')
    console.log('- RSI for momentum and overbought/oversold conditions')
    console.log('- Bollinger Bands for volatility and price channels')
    console.log('- VWAP for institutional trading benchmarks')
    console.log('- Support/Resistance levels for key price zones')
    console.log('- Asset correlations for portfolio diversification')
    console.log('- Volume profile for price-volume relationships')
    console.log('\n💡 These indicators form the foundation of quantitative trading strategies!')

    await client.close()

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Demo failed:', errorMessage)
    Deno.exit(1)
  }
}

// Run the demo
if (import.meta.main) {
  await aggregationsDemo()
}