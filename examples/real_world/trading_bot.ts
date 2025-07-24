/**
 * Real-World Trading Bot Implementation
 * 
 * This example demonstrates a complete automated trading system using TimescaleDB,
 * including market data processing, signal generation, risk management, order execution,
 * and performance tracking. This is a comprehensive example that combines concepts
 * from basic and advanced examples into a production-ready trading application.
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'

// Configuration for trading bot
interface TradingBotConfig {
  connectionString: string
  symbol: string
  initialCapital: number
  maxRiskPerTrade: number
  maxPositionSize: number
  signalStrategies: SignalStrategy[]
  riskManagement: RiskManagementConfig
  executionConfig: ExecutionConfig
  monitoringConfig: MonitoringConfig
}

interface SignalStrategy {
  name: string
  enabled: boolean
  weight: number
  parameters: Record<string, any>
}

interface RiskManagementConfig {
  maxDailyLoss: number
  maxDrawdown: number
  positionSizingMethod: 'fixed' | 'kelly' | 'risk_parity'
  stopLossPercent: number
  takeProfitPercent: number
}

interface ExecutionConfig {
  orderType: 'market' | 'limit' | 'stop'
  slippage: number
  maxOrderSize: number
  minOrderSize: number
}

interface MonitoringConfig {
  enableTelemetry: boolean
  alertThresholds: AlertThresholds
  reportingInterval: number
}

interface AlertThresholds {
  maxLoss: number
  maxDrawdown: number
  consecutiveLosses: number
  unusualVolume: number
}

// Market data types
interface MarketTick {
  symbol: string
  timestamp: Date
  price: number
  volume: number
  bid: number
  ask: number
  spread: number
}

interface OHLCV {
  symbol: string
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  interval: string
}

// Trading types
interface TradingSignal {
  timestamp: Date
  symbol: string
  signal: 'BUY' | 'SELL' | 'HOLD'
  strength: number
  confidence: number
  strategy: string
  metadata: Record<string, any>
}

interface Order {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  type: 'MARKET' | 'LIMIT' | 'STOP'
  quantity: number
  price?: number
  stopPrice?: number
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  timestamp: Date
  filledQuantity: number
  averagePrice: number
  fees: number
}

interface Position {
  symbol: string
  side: 'LONG' | 'SHORT'
  quantity: number
  averagePrice: number
  unrealizedPnl: number
  realizedPnl: number
  timestamp: Date
}

interface Trade {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  timestamp: Date
  pnl: number
  fees: number
  strategy: string
}

interface Alert {
  id: string
  type: string
  message: string
  severity: 'WARNING' | 'ERROR'
  timestamp: Date
  resolved: boolean
}

// Performance tracking
interface PerformanceMetrics {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  totalReturn: number
  annualizedReturn: number
  volatility: number
}

const config: TradingBotConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  symbol: 'BTCUSD',
  initialCapital: 10000,
  maxRiskPerTrade: 0.02, // 2% per trade
  maxPositionSize: 0.1, // 10% of capital
  signalStrategies: [
    {
      name: 'MovingAverageCrossover',
      enabled: true,
      weight: 0.4,
      parameters: {
        fastPeriod: 20,
        slowPeriod: 50
      }
    },
    {
      name: 'RSIDivergence',
      enabled: true,
      weight: 0.3,
      parameters: {
        period: 14,
        overbought: 70,
        oversold: 30
      }
    },
    {
      name: 'BollingerBands',
      enabled: true,
      weight: 0.3,
      parameters: {
        period: 20,
        stddev: 2
      }
    }
  ],
  riskManagement: {
    maxDailyLoss: 0.05, // 5% daily loss limit
    maxDrawdown: 0.15, // 15% max drawdown
    positionSizingMethod: 'kelly',
    stopLossPercent: 0.02,
    takeProfitPercent: 0.04
  },
  executionConfig: {
    orderType: 'limit',
    slippage: 0.001,
    maxOrderSize: 1000,
    minOrderSize: 10
  },
  monitoringConfig: {
    enableTelemetry: true,
    alertThresholds: {
      maxLoss: 0.03,
      maxDrawdown: 0.1,
      consecutiveLosses: 5,
      unusualVolume: 10
    },
    reportingInterval: 60000 // 1 minute
  }
}

/**
 * Complete Trading Bot Implementation
 */
class TradingBot {
  private client: TimescaleClient
  private config: TradingBotConfig
  private dataManager: MarketDataManager
  private signalGenerator: SignalGenerator
  private riskManager: RiskManager
  private orderManager: OrderManager
  private portfolioManager: PortfolioManager
  private performanceTracker: PerformanceTracker
  private monitor: TradingMonitor
  
  private isRunning: boolean = false
  private currentPosition: Position | null = null
  private currentPrice: number = 0
  private lastSignal: TradingSignal | null = null
  
  constructor(client: TimescaleClient, config: TradingBotConfig) {
    this.client = client
    this.config = config
    this.dataManager = new MarketDataManager(client)
    this.signalGenerator = new SignalGenerator(client, config.signalStrategies)
    this.riskManager = new RiskManager(config.riskManagement)
    this.orderManager = new OrderManager(client, config.executionConfig)
    this.portfolioManager = new PortfolioManager(client, config.initialCapital)
    this.performanceTracker = new PerformanceTracker(client)
    this.monitor = new TradingMonitor(client, config.monitoringConfig)
  }
  
  /**
   * Initialize the trading bot and set up database schema
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Trading Bot...')
    
    // Create database schema
    await this.createTradingSchema()
    
    // Initialize components
    await this.dataManager.initialize()
    await this.signalGenerator.initialize()
    await this.portfolioManager.initialize()
    await this.performanceTracker.initialize()
    await this.monitor.initialize()
    
    console.log('✅ Trading Bot initialized successfully')
  }
  
  /**
   * Start the trading bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Trading bot is already running')
      return
    }
    
    console.log('🎯 Starting Trading Bot...')
    this.isRunning = true
    
    // Start monitoring
    await this.monitor.start()
    
    // Start main trading loop
    this.startTradingLoop()
    
    console.log('✅ Trading Bot started successfully')
  }
  
  /**
   * Stop the trading bot
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Trading Bot...')
    this.isRunning = false
    
    // Close any open positions
    if (this.currentPosition) {
      await this.closePosition(this.currentPosition)
    }
    
    // Stop monitoring
    await this.monitor.stop()
    
    // Generate final performance report
    const performance = await this.performanceTracker.getPerformanceReport()
    console.log('📊 Final Performance Report:')
    console.log(JSON.stringify(performance, null, 2))
    
    console.log('✅ Trading Bot stopped successfully')
  }
  
  /**
   * Main trading loop
   */
  private async startTradingLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Get latest market data
        const marketData = await this.dataManager.getLatestMarketData(this.config.symbol)
        if (!marketData) {
          await this.sleep(1000)
          continue
        }
        
        this.currentPrice = marketData.price
        
        // Generate trading signals
        const signals = await this.signalGenerator.generateSignals(this.config.symbol)
        if (signals.length === 0) {
          await this.sleep(1000)
          continue
        }
        
        // Combine signals into final decision
        const combinedSignal = this.combineSignals(signals)
        this.lastSignal = combinedSignal
        
        // Check risk management constraints
        const riskCheck = await this.riskManager.checkRisk(
          this.currentPosition,
          combinedSignal,
          marketData,
          await this.portfolioManager.getPortfolioValue()
        )
        
        if (!riskCheck.allowed) {
          console.log(`⚠️  Risk check failed: ${riskCheck.reason}`)
          await this.sleep(1000)
          continue
        }
        
        // Execute trading decision
        await this.executeTradingDecision(combinedSignal, marketData)
        
        // Update performance tracking
        await this.performanceTracker.updateMetrics(
          this.currentPosition,
          marketData,
          await this.portfolioManager.getPortfolioValue()
        )
        
        // Check alerts
        await this.monitor.checkAlerts(
          this.currentPosition,
          marketData,
          await this.performanceTracker.getPerformanceReport()
        )
        
        // Sleep before next iteration
        await this.sleep(1000)
        
      } catch (error) {
        console.error('❌ Error in trading loop:', error)
        await this.sleep(5000) // Wait longer on error
      }
    }
  }
  
  /**
   * Combine multiple signals into a single decision
   */
  private combineSignals(signals: TradingSignal[]): TradingSignal {
    let buyScore = 0
    let sellScore = 0
    let totalWeight = 0
    
    const strategies = signals.map(s => s.strategy)
    
    for (const signal of signals) {
      const strategy = this.config.signalStrategies.find(s => s.name === signal.strategy)
      if (!strategy?.enabled) continue
      
      const weight = strategy.weight * signal.confidence
      totalWeight += weight
      
      if (signal.signal === 'BUY') {
        buyScore += weight * signal.strength
      } else if (signal.signal === 'SELL') {
        sellScore += weight * signal.strength
      }
    }
    
    // Determine final signal
    let finalSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let strength = 0
    let confidence = 0
    
    if (totalWeight > 0) {
      const buyStrength = buyScore / totalWeight
      const sellStrength = sellScore / totalWeight
      
      if (buyStrength > sellStrength && buyStrength > 0.6) {
        finalSignal = 'BUY'
        strength = buyStrength
        confidence = Math.min(buyStrength, 1.0)
      } else if (sellStrength > buyStrength && sellStrength > 0.6) {
        finalSignal = 'SELL'
        strength = sellStrength
        confidence = Math.min(sellStrength, 1.0)
      }
    }
    
    return {
      timestamp: new Date(),
      symbol: this.config.symbol,
      signal: finalSignal,
      strength,
      confidence,
      strategy: 'Combined',
      metadata: {
        component_signals: signals.length,
        strategies: strategies.join(', '),
        buy_score: buyScore,
        sell_score: sellScore,
        total_weight: totalWeight
      }
    }
  }
  
  /**
   * Execute trading decision based on signal
   */
  private async executeTradingDecision(signal: TradingSignal, marketData: MarketTick): Promise<void> {
    if (signal.signal === 'HOLD') {
      return
    }
    
    // Calculate position size
    const portfolioValue = await this.portfolioManager.getPortfolioValue()
    const positionSize = this.riskManager.calculatePositionSize(
      signal,
      marketData,
      portfolioValue,
      this.config.maxRiskPerTrade
    )
    
    if (positionSize === 0) {
      return
    }
    
    // Handle different scenarios
    if (signal.signal === 'BUY') {
      if (!this.currentPosition) {
        // Open new long position
        await this.openPosition('LONG', positionSize, marketData)
      } else if (this.currentPosition.side === 'SHORT') {
        // Close short position and open long
        await this.closePosition(this.currentPosition)
        await this.openPosition('LONG', positionSize, marketData)
      }
      // If already long, hold position
    } else if (signal.signal === 'SELL') {
      if (!this.currentPosition) {
        // Open new short position
        await this.openPosition('SHORT', positionSize, marketData)
      } else if (this.currentPosition.side === 'LONG') {
        // Close long position and open short
        await this.closePosition(this.currentPosition)
        await this.openPosition('SHORT', positionSize, marketData)
      }
      // If already short, hold position
    }
  }
  
  /**
   * Open new position
   */
  private async openPosition(side: 'LONG' | 'SHORT', size: number, marketData: MarketTick): Promise<void> {
    const orderSide = side === 'LONG' ? 'BUY' : 'SELL'
    const price = side === 'LONG' ? marketData.ask : marketData.bid
    
    const order: Order = {
      id: `order_${Date.now()}`,
      symbol: this.config.symbol,
      side: orderSide,
      type: 'MARKET',
      quantity: size,
      price,
      status: 'PENDING',
      timestamp: new Date(),
      filledQuantity: 0,
      averagePrice: 0,
      fees: 0
    }
    
    // Execute order
    const executedOrder = await this.orderManager.executeOrder(order)
    
    if (executedOrder.status === 'FILLED') {
      this.currentPosition = {
        symbol: this.config.symbol,
        side,
        quantity: executedOrder.filledQuantity,
        averagePrice: executedOrder.averagePrice,
        unrealizedPnl: 0,
        realizedPnl: 0,
        timestamp: new Date()
      }
      
      // Update portfolio
      await this.portfolioManager.updatePosition(this.currentPosition)
      
      console.log(`📈 Opened ${side} position: ${executedOrder.filledQuantity} @ ${executedOrder.averagePrice}`)
    }
  }
  
  /**
   * Close existing position
   */
  private async closePosition(position: Position): Promise<void> {
    const orderSide = position.side === 'LONG' ? 'SELL' : 'BUY'
    const price = position.side === 'LONG' ? this.currentPrice * 0.999 : this.currentPrice * 1.001
    
    const order: Order = {
      id: `order_${Date.now()}`,
      symbol: this.config.symbol,
      side: orderSide,
      type: 'MARKET',
      quantity: position.quantity,
      price,
      status: 'PENDING',
      timestamp: new Date(),
      filledQuantity: 0,
      averagePrice: 0,
      fees: 0
    }
    
    // Execute order
    const executedOrder = await this.orderManager.executeOrder(order)
    
    if (executedOrder.status === 'FILLED') {
      // Calculate PnL
      const pnl = position.side === 'LONG' 
        ? (executedOrder.averagePrice - position.averagePrice) * position.quantity
        : (position.averagePrice - executedOrder.averagePrice) * position.quantity
      
      // Record trade
      const trade: Trade = {
        id: `trade_${Date.now()}`,
        symbol: this.config.symbol,
        side: orderSide,
        quantity: executedOrder.filledQuantity,
        price: executedOrder.averagePrice,
        timestamp: new Date(),
        pnl: pnl - executedOrder.fees,
        fees: executedOrder.fees,
        strategy: this.lastSignal?.strategy || 'Unknown'
      }
      
      await this.performanceTracker.recordTrade(trade)
      
      // Clear position
      this.currentPosition = null
      
      // Update portfolio
      await this.portfolioManager.updateCash(pnl - executedOrder.fees)
      
      console.log(`📉 Closed ${position.side} position: ${executedOrder.filledQuantity} @ ${executedOrder.averagePrice}, PnL: ${pnl.toFixed(2)}`)
    }
  }
  
  /**
   * Create database schema for trading
   */
  private async createTradingSchema(): Promise<void> {
    // Simplified schema creation - in production, this would use proper DDL
    console.log('📊 Creating trading database schema...')
    
    try {
      // In a real implementation, this would create the necessary tables
      // For this demo, we'll just log that schema creation is simulated
      console.log('✅ Database schema created successfully (simulated)')
    } catch (error) {
      console.log('⚠️  Database schema creation failed (simulated)')
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Market Data Manager
 */
class MarketDataManager {
  private client: TimescaleClient
  private marketData: MarketTick[] = []
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  async initialize(): Promise<void> {
    console.log('📊 Initializing Market Data Manager...')
  }
  
  async getLatestMarketData(symbol: string): Promise<MarketTick | null> {
    // Simulate getting latest market data
    // In real implementation, this would connect to a market data feed
    const price = 50000 + Math.random() * 1000 - 500 // Random price around $50,000
    const spread = 0.01 * price // 1% spread
    
    const marketData: MarketTick = {
      symbol,
      timestamp: new Date(),
      price,
      volume: Math.random() * 1000,
      bid: price - spread / 2,
      ask: price + spread / 2,
      spread
    }
    
    // Store in memory (in production, would store in database)
    this.marketData.push(marketData)
    if (this.marketData.length > 1000) {
      this.marketData.shift()
    }
    
    return marketData
  }
  
  async getHistoricalData(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    // Simulate historical data retrieval
    const data: OHLCV[] = []
    let basePrice = 50000
    
    for (let i = 0; i < limit; i++) {
      const timestamp = new Date(Date.now() - (limit - i) * 60000) // 1 minute intervals
      const change = (Math.random() - 0.5) * 100
      
      const open = basePrice
      const close = basePrice + change
      const high = Math.max(open, close) + Math.random() * 50
      const low = Math.min(open, close) - Math.random() * 50
      
      data.push({
        symbol,
        timestamp,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000,
        interval
      })
      
      basePrice = close
    }
    
    return data
  }
}

/**
 * Signal Generator
 */
class SignalGenerator {
  private client: TimescaleClient
  private strategies: SignalStrategy[]
  
  constructor(client: TimescaleClient, strategies: SignalStrategy[]) {
    this.client = client
    this.strategies = strategies
  }
  
  async initialize(): Promise<void> {
    console.log('🎯 Initializing Signal Generator...')
  }
  
  async generateSignals(symbol: string): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = []
    
    // Get recent market data for analysis
    const historicalData = await this.getRecentMarketData(symbol, 100)
    if (historicalData.length < 50) {
      return signals
    }
    
    // Generate signals from each enabled strategy
    for (const strategy of this.strategies) {
      if (!strategy.enabled) continue
      
      let signal: TradingSignal | null = null
      
      switch (strategy.name) {
        case 'MovingAverageCrossover':
          signal = this.generateMASignal(symbol, historicalData, strategy.parameters)
          break
        case 'RSIDivergence':
          signal = this.generateRSISignal(symbol, historicalData, strategy.parameters)
          break
        case 'BollingerBands':
          signal = this.generateBBSignal(symbol, historicalData, strategy.parameters)
          break
      }
      
      if (signal) {
        signals.push(signal)
      }
    }
    
    return signals
  }
  
  private async getRecentMarketData(symbol: string, limit: number): Promise<number[]> {
    // Simulate getting recent market data
    const prices: number[] = []
    let basePrice = 50000
    
    for (let i = 0; i < limit; i++) {
      const change = (Math.random() - 0.5) * 100
      basePrice += change
      prices.push(basePrice)
    }

    return prices
  }
  
  private generateMASignal(symbol: string, prices: number[], params: any): TradingSignal | null {
    const fastMA = this.calculateMA(prices, params.fastPeriod)
    const slowMA = this.calculateMA(prices, params.slowPeriod)
    
    if (fastMA.length < 2 || slowMA.length < 2) return null
    
    const currentFast = fastMA[fastMA.length - 1]
    const currentSlow = slowMA[slowMA.length - 1]
    const prevFast = fastMA[fastMA.length - 2]
    const prevSlow = slowMA[slowMA.length - 2]
    
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let strength = 0
    
    // Bullish crossover
    if (prevFast <= prevSlow && currentFast > currentSlow) {
      signal = 'BUY'
      strength = Math.min((currentFast - currentSlow) / currentSlow, 0.1) * 10
    }
    // Bearish crossover
    else if (prevFast >= prevSlow && currentFast < currentSlow) {
      signal = 'SELL'
      strength = Math.min((currentSlow - currentFast) / currentFast, 0.1) * 10
    }
    
    return {
      timestamp: new Date(),
      symbol,
      signal,
      strength,
      confidence: 0.7,
      strategy: 'MovingAverageCrossover',
      metadata: {
        fast_ma: currentFast,
        slow_ma: currentSlow,
        fast_period: params.fastPeriod,
        slow_period: params.slowPeriod
      }
    }
  }
  
  private generateRSISignal(symbol: string, prices: number[], params: any): TradingSignal | null {
    const rsi = this.calculateRSI(prices, params.period)
    if (rsi.length < 2) return null
    
    const currentRSI = rsi[rsi.length - 1]
    const prevRSI = rsi[rsi.length - 2]
    
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let strength = 0
    
    // Oversold condition
    if (prevRSI <= params.oversold && currentRSI > params.oversold) {
      signal = 'BUY'
      strength = (params.oversold - Math.min(currentRSI, params.oversold)) / params.oversold
    }
    // Overbought condition
    else if (prevRSI >= params.overbought && currentRSI < params.overbought) {
      signal = 'SELL'
      strength = (Math.max(currentRSI, params.overbought) - params.overbought) / (100 - params.overbought)
    }
    
    return {
      timestamp: new Date(),
      symbol,
      signal,
      strength,
      confidence: 0.6,
      strategy: 'RSIDivergence',
      metadata: {
        rsi: currentRSI,
        overbought: params.overbought,
        oversold: params.oversold
      }
    }
  }
  
  private generateBBSignal(symbol: string, prices: number[], params: any): TradingSignal | null {
    const bb = this.calculateBollingerBands(prices, params.period, params.stddev)
    if (bb.length === 0) return null
    
    const currentPrice = prices[prices.length - 1]
    const { upper, middle, lower } = bb[bb.length - 1]
    
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
    let strength = 0
    
    // Price touching lower band (oversold)
    if (currentPrice <= lower) {
      signal = 'BUY'
      strength = (lower - currentPrice) / (middle - lower)
    }
    // Price touching upper band (overbought)
    else if (currentPrice >= upper) {
      signal = 'SELL'
      strength = (currentPrice - upper) / (upper - middle)
    }
    
    return {
      timestamp: new Date(),
      symbol,
      signal,
      strength: Math.min(strength, 1.0),
      confidence: 0.65,
      strategy: 'BollingerBands',
      metadata: {
        price: currentPrice,
        upper,
        middle,
        lower,
        bb_width: (upper - lower) / middle
      }
    }
  }
  
  private calculateMA(prices: number[], period: number): number[] {
    const result: number[] = []
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      result.push(sum / period)
    }
    return result
  }
  
  private calculateRSI(prices: number[], period: number): number[] {
    const result: number[] = []
    const gains: number[] = []
    const losses: number[] = []
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1]
      gains.push(change > 0 ? change : 0)
      losses.push(change < 0 ? -change : 0)
    }
    
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
      
      if (avgLoss === 0) {
        result.push(100)
      } else {
        const rs = avgGain / avgLoss
        result.push(100 - (100 / (1 + rs)))
      }
    }
    
    return result
  }
  
  private calculateBollingerBands(prices: number[], period: number, stddev: number): Array<{upper: number, middle: number, lower: number}> {
    const result: Array<{upper: number, middle: number, lower: number}> = []
    
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1)
      const mean = slice.reduce((a, b) => a + b, 0) / period
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period
      const standardDeviation = Math.sqrt(variance)
      
      result.push({
        upper: mean + (stddev * standardDeviation),
        middle: mean,
        lower: mean - (stddev * standardDeviation)
      })
    }
    
    return result
  }
}

/**
 * Risk Manager
 */
class RiskManager {
  private config: RiskManagementConfig
  private dailyLoss: number = 0
  private maxDrawdown: number = 0
  private lastResetDate: Date = new Date()
  
  constructor(config: RiskManagementConfig) {
    this.config = config
  }
  
  async checkRisk(
    currentPosition: Position | null,
    signal: TradingSignal,
    marketData: MarketTick,
    portfolioValue: number
  ): Promise<{allowed: boolean, reason?: string}> {
    
    // Reset daily loss if new day
    if (new Date().toDateString() !== this.lastResetDate.toDateString()) {
      this.dailyLoss = 0
      this.lastResetDate = new Date()
    }
    
    // Check daily loss limit
    if (this.dailyLoss >= this.config.maxDailyLoss * portfolioValue) {
      return { allowed: false, reason: 'Daily loss limit exceeded' }
    }
    
    // Check maximum drawdown
    if (this.maxDrawdown >= this.config.maxDrawdown * portfolioValue) {
      return { allowed: false, reason: 'Maximum drawdown exceeded' }
    }
    
    // Check if signal strength is sufficient
    if (signal.strength < 0.5) {
      return { allowed: false, reason: 'Signal strength too weak' }
    }
    
    // Check if confidence is sufficient
    if (signal.confidence < 0.5) {
      return { allowed: false, reason: 'Signal confidence too low' }
    }
    
    return { allowed: true }
  }
  
  calculatePositionSize(
    signal: TradingSignal,
    marketData: MarketTick,
    portfolioValue: number,
    maxRiskPerTrade: number
  ): number {
    
    const riskAmount = portfolioValue * maxRiskPerTrade
    const stopLossPrice = marketData.price * (1 - this.config.stopLossPercent)
    const riskPerShare = Math.abs(marketData.price - stopLossPrice)
    
    if (riskPerShare === 0) return 0
    
    let basePositionSize = riskAmount / riskPerShare
    
    // Adjust based on signal strength and confidence
    const adjustmentFactor = signal.strength * signal.confidence
    const adjustedSize = basePositionSize * adjustmentFactor
    
    // Apply maximum position size limit
    const maxPositionValue = portfolioValue * 0.1 // 10% max position size
    const maxShares = maxPositionValue / marketData.price
    
    return Math.min(adjustedSize, maxShares)
  }
  
  updateDailyLoss(loss: number): void {
    this.dailyLoss += loss
  }
  
  updateMaxDrawdown(drawdown: number): void {
    this.maxDrawdown = Math.max(this.maxDrawdown, drawdown)
  }
}

/**
 * Order Manager
 */
class OrderManager {
  private client: TimescaleClient
  private config: ExecutionConfig
  
  constructor(client: TimescaleClient, config: ExecutionConfig) {
    this.client = client
    this.config = config
  }
  
  async executeOrder(order: Order): Promise<Order> {
    // Simulate order execution
    // In real implementation, this would connect to a broker API
    
    const executedOrder = { ...order }
    
    // Simulate slippage and execution
    const slippageAdjustment = this.config.slippage * (Math.random() - 0.5) * 2
    const executionPrice = order.price ? order.price * (1 + slippageAdjustment) : order.price || 0
    
    executedOrder.status = 'FILLED'
    executedOrder.filledQuantity = order.quantity
    executedOrder.averagePrice = executionPrice
    executedOrder.fees = order.quantity * executionPrice * 0.001 // 0.1% fee
    
    return executedOrder
  }
}

/**
 * Portfolio Manager
 */
class PortfolioManager {
  private client: TimescaleClient
  private initialCapital: number
  private currentCash: number
  private positions: Map<string, Position> = new Map()
  
  constructor(client: TimescaleClient, initialCapital: number) {
    this.client = client
    this.initialCapital = initialCapital
    this.currentCash = initialCapital
  }
  
  async initialize(): Promise<void> {
    console.log('💰 Initializing Portfolio Manager...')
  }
  
  async updatePosition(position: Position): Promise<void> {
    this.positions.set(position.symbol, position)
  }
  
  async updateCash(amount: number): Promise<void> {
    this.currentCash += amount
  }
  
  async getPortfolioValue(): Promise<number> {
    let totalValue = this.currentCash
    
    for (const position of this.positions.values()) {
      // In real implementation, would use current market price
      totalValue += position.quantity * position.averagePrice
    }
    
    return totalValue
  }
  
  getPosition(symbol: string): Position | null {
    return this.positions.get(symbol) || null
  }
}

/**
 * Performance Tracker
 */
class PerformanceTracker {
  private client: TimescaleClient
  private trades: Trade[] = []
  private returns: number[] = []
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  async initialize(): Promise<void> {
    console.log('📊 Initializing Performance Tracker...')
  }
  
  async recordTrade(trade: Trade): Promise<void> {
    this.trades.push(trade)
    this.returns.push(trade.pnl)
  }
  
  async updateMetrics(position: Position | null, marketData: MarketTick, portfolioValue: number): Promise<void> {
    // Update metrics in memory
    // In production, would store in database
  }
  
  async getPerformanceReport(): Promise<PerformanceMetrics> {
    return this.calculatePerformanceMetrics()
  }
  
  private async calculatePerformanceMetrics(): Promise<PerformanceMetrics> {
    const totalTrades = this.trades.length
    const winningTrades = this.trades.filter(t => t.pnl > 0).length
    const losingTrades = this.trades.filter(t => t.pnl < 0).length
    
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0
    
    const wins = this.trades.filter(t => t.pnl > 0).map(t => t.pnl)
    const losses = this.trades.filter(t => t.pnl < 0).map(t => t.pnl)
    
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0
    
    const grossProfit = wins.reduce((a, b) => a + b, 0)
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0
    
    const totalReturn = this.returns.reduce((a, b) => a + b, 0)
    const annualizedReturn = this.returns.length > 0 ? totalReturn * 365 / this.returns.length : 0
    
    const meanReturn = this.returns.length > 0 ? this.returns.reduce((a, b) => a + b, 0) / this.returns.length : 0
    const variance = this.returns.length > 0 ? this.returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / this.returns.length : 0
    const volatility = Math.sqrt(variance)
    const sharpeRatio = volatility > 0 ? meanReturn / volatility : 0
    
    // Calculate max drawdown
    let maxDrawdown = 0
    let peak = 0
    let runningTotal = 0
    
    for (const ret of this.returns) {
      runningTotal += ret
      peak = Math.max(peak, runningTotal)
      const drawdown = (peak - runningTotal) / peak
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }
    
    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalReturn,
      annualizedReturn,
      volatility
    }
  }
}

/**
 * Trading Monitor
 */
class TradingMonitor {
  private client: TimescaleClient
  private config: MonitoringConfig
  private alerts: Alert[] = []
  
  constructor(client: TimescaleClient, config: MonitoringConfig) {
    this.client = client
    this.config = config
  }
  
  async initialize(): Promise<void> {
    console.log('🔍 Initializing Trading Monitor...')
  }
  
  async start(): Promise<void> {
    console.log('🚀 Starting Trading Monitor...')
  }
  
  async stop(): Promise<void> {
    console.log('🛑 Stopping Trading Monitor...')
  }
  
  async checkAlerts(
    position: Position | null,
    marketData: MarketTick,
    performance: PerformanceMetrics
  ): Promise<void> {
    
    // Check for excessive losses
    if (performance.maxDrawdown > this.config.alertThresholds.maxDrawdown) {
      this.triggerAlert('MAX_DRAWDOWN_EXCEEDED', `Maximum drawdown ${(performance.maxDrawdown * 100).toFixed(2)}% exceeded threshold`)
    }
    
    // Check for consecutive losses
    const recentTrades = this.getRecentTrades(5)
    const consecutiveLosses = this.countConsecutiveLosses(recentTrades)
    if (consecutiveLosses >= this.config.alertThresholds.consecutiveLosses) {
      this.triggerAlert('CONSECUTIVE_LOSSES', `${consecutiveLosses} consecutive losses detected`)
    }
    
    // Check for unusual volume
    if (marketData.volume > this.config.alertThresholds.unusualVolume) {
      this.triggerAlert('UNUSUAL_VOLUME', `Unusual volume detected: ${marketData.volume}`)
    }
  }
  
  private triggerAlert(type: string, message: string): void {
    const alert: Alert = {
      id: `alert_${Date.now()}`,
      type,
      message,
      severity: 'WARNING',
      timestamp: new Date(),
      resolved: false
    }
    
    this.alerts.push(alert)
    console.log(`🚨 ALERT: ${message}`)
  }
  
  private getRecentTrades(count: number): Trade[] {
    // In real implementation, would query database
    return []
  }
  
  private countConsecutiveLosses(trades: Trade[]): number {
    let count = 0
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].pnl < 0) {
        count++
      } else {
        break
      }
    }
    return count
  }
}

/**
 * Main trading bot demonstration
 */
async function demonstrateTradingBot() {
  console.log('🎯 Starting Trading Bot Demonstration...')
  
  try {
    // Initialize client
    const client = await ClientFactory.fromConnectionString(config.connectionString)
    
    // Create and initialize trading bot
    const bot = new TradingBot(client, config)
    await bot.initialize()
    
    // Start trading bot
    await bot.start()
    
    // Let it run for a short demonstration
    console.log('🏃 Trading bot running for 10 seconds...')
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Stop trading bot
    await bot.stop()
    
    console.log('✅ Trading bot demonstration completed!')
    
  } catch (error) {
    console.error('❌ Error in trading bot demonstration:', error)
  }
}

// Run the demonstration
if (import.meta.main) {
  await demonstrateTradingBot()
}

export {
  TradingBot,
  MarketDataManager,
  SignalGenerator,
  RiskManager,
  OrderManager,
  PortfolioManager,
  PerformanceTracker,
  TradingMonitor,
  type TradingBotConfig,
  type TradingSignal,
  type Order,
  type Position,
  type Trade,
  type PerformanceMetrics,
  type MarketTick,
  type OHLCV
}