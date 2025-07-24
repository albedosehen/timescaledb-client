/**
 * Real-World Portfolio Analytics System
 *
 * This example demonstrates a comprehensive portfolio analytics system that provides
 * advanced portfolio analysis with risk metrics, performance attribution, and
 * detailed reporting capabilities using TimescaleDB. It includes features like:
 * - Portfolio construction and optimization
 * - Risk metrics calculation (VaR, CVaR, Sharpe ratio, etc.)
 * - Performance attribution analysis
 * - Sector and factor exposure analysis
 * - Historical performance tracking
 * - Benchmark comparison and tracking error
 * - Stress testing and scenario analysis
 * - Real-time portfolio monitoring
 * - Compliance and risk limit monitoring
 * - Advanced reporting and visualizations
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'

// Configuration interfaces
interface PortfolioConfig {
  connectionString: string
  portfolioId: string
  benchmarkId: string
  currency: string
  riskFreeRate: number
  confidenceLevel: number
  timeHorizon: number
  rebalanceFrequency: string
  constraints: PortfolioConstraints
  riskLimits: RiskLimits
  reporting: ReportingConfig
}

interface PortfolioConstraints {
  maxPositionSize: number
  maxSectorWeight: number
  maxCountryWeight: number
  maxCurrencyWeight: number
  minDiversification: number
  maxTurnover: number
  allowedAssetTypes: string[]
  excludedAssets: string[]
}

interface RiskLimits {
  maxVaR: number
  maxCVaR: number
  maxVolatility: number
  maxDrawdown: number
  maxBeta: number
  maxConcentration: number
  maxActiveRisk: number
  maxTrackingError: number
}

interface ReportingConfig {
  generateDaily: boolean
  generateWeekly: boolean
  generateMonthly: boolean
  generateQuarterly: boolean
  includeAttribution: boolean
  includeRiskMetrics: boolean
  includeStressTesting: boolean
  recipients: string[]
}

// Portfolio data interfaces
interface Position {
  symbol: string
  quantity: number
  market_value: number
  weight: number
  sector: string
  country: string
  currency: string
  asset_type: string
  cost_basis: number
  unrealized_pnl: number
  realized_pnl: number
  last_updated: Date
  metadata: Record<string, any>
}

interface PortfolioSnapshot {
  timestamp: Date
  portfolio_id: string
  total_value: number
  total_pnl: number
  cash: number
  positions: Position[]
  exposure_by_sector: Record<string, number>
  exposure_by_country: Record<string, number>
  exposure_by_currency: Record<string, number>
  exposure_by_asset_type: Record<string, number>
  risk_metrics: RiskMetrics
  performance_metrics: PerformanceMetrics
}

interface RiskMetrics {
  timestamp: Date
  portfolio_id: string
  var_1d: number
  var_1w: number
  var_1m: number
  cvar_1d: number
  cvar_1w: number
  cvar_1m: number
  volatility: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown: number
  beta: number
  alpha: number
  information_ratio: number
  tracking_error: number
  correlation_to_benchmark: number
}

interface PerformanceMetrics {
  timestamp: Date
  portfolio_id: string
  total_return: number
  daily_return: number
  weekly_return: number
  monthly_return: number
  quarterly_return: number
  ytd_return: number
  annual_return: number
  benchmark_return: number
  active_return: number
  hit_ratio: number
  up_capture: number
  down_capture: number
  calmar_ratio: number
  burke_ratio: number
}

interface AttributionResult {
  timestamp: Date
  portfolio_id: string
  total_return: number
  benchmark_return: number
  active_return: number
  allocation_effect: number
  selection_effect: number
  interaction_effect: number
  sector_attribution: Record<string, AttributionBreakdown>
  country_attribution: Record<string, AttributionBreakdown>
  currency_attribution: Record<string, AttributionBreakdown>
  security_attribution: Record<string, AttributionBreakdown>
}

interface AttributionBreakdown {
  portfolio_weight: number
  benchmark_weight: number
  portfolio_return: number
  benchmark_return: number
  allocation_effect: number
  selection_effect: number
  interaction_effect: number
  total_effect: number
}

interface StressTestResult {
  timestamp: Date
  portfolio_id: string
  scenario_name: string
  scenario_type: string
  portfolio_value_change: number
  portfolio_return_change: number
  worst_position: string
  worst_position_change: number
  best_position: string
  best_position_change: number
  sector_impacts: Record<string, number>
  correlation_breakdown: boolean
  liquidity_impact: number
  duration: number
}

interface ComplianceCheck {
  timestamp: Date
  portfolio_id: string
  check_type: string
  limit_name: string
  current_value: number
  limit_value: number
  utilization: number
  status: 'pass' | 'warning' | 'breach'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  details: Record<string, any>
}

// Configuration
const config: PortfolioConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  portfolioId: 'growth_portfolio_001',
  benchmarkId: 'sp500_index',
  currency: 'USD',
  riskFreeRate: 0.025, // 2.5% annual
  confidenceLevel: 0.95, // 95% confidence
  timeHorizon: 252, // 1 year in trading days
  rebalanceFrequency: 'monthly',
  constraints: {
    maxPositionSize: 0.05, // 5% max position size
    maxSectorWeight: 0.25, // 25% max sector weight
    maxCountryWeight: 0.60, // 60% max country weight
    maxCurrencyWeight: 0.70, // 70% max currency weight
    minDiversification: 20, // Minimum 20 positions
    maxTurnover: 1.0, // 100% annual turnover
    allowedAssetTypes: ['equity', 'bond', 'reit', 'commodity'],
    excludedAssets: ['TSLA', 'GME'] // Excluded for risk management
  },
  riskLimits: {
    maxVaR: 0.02, // 2% daily VaR
    maxCVaR: 0.03, // 3% daily CVaR
    maxVolatility: 0.15, // 15% annual volatility
    maxDrawdown: 0.10, // 10% maximum drawdown
    maxBeta: 1.20, // 1.2 maximum beta
    maxConcentration: 0.40, // 40% maximum concentration
    maxActiveRisk: 0.08, // 8% maximum active risk
    maxTrackingError: 0.05 // 5% maximum tracking error
  },
  reporting: {
    generateDaily: true,
    generateWeekly: true,
    generateMonthly: true,
    generateQuarterly: true,
    includeAttribution: true,
    includeRiskMetrics: true,
    includeStressTesting: true,
    recipients: ['portfolio.manager@firm.com', 'risk.manager@firm.com']
  }
}

/**
 * Portfolio Analytics System
 */
class PortfolioAnalyticsSystem {
  private client: TimescaleClient
  private config: PortfolioConfig
  private portfolioManager: PortfolioManager
  private riskCalculator: RiskCalculator
  private performanceAnalyzer: PerformanceAnalyzer
  private attributionEngine: AttributionEngine
  private stressTester: StressTester
  private complianceMonitor: ComplianceMonitor
  private reportingEngine: ReportingEngine

  private currentSnapshot: PortfolioSnapshot | null = null
  private isRunning: boolean = false

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
    this.portfolioManager = new PortfolioManager(client, config)
    this.riskCalculator = new RiskCalculator(client, config)
    this.performanceAnalyzer = new PerformanceAnalyzer(client, config)
    this.attributionEngine = new AttributionEngine(client, config)
    this.stressTester = new StressTester(client, config)
    this.complianceMonitor = new ComplianceMonitor(client, config)
    this.reportingEngine = new ReportingEngine(client, config)
  }

  /**
   * Initialize the analytics system
   */
  async initialize(): Promise<void> {
    console.log('🎯 Initializing Portfolio Analytics System...')

    // Create database schema
    await this.createAnalyticsSchema()

    // Initialize components
    await this.portfolioManager.initialize()
    await this.riskCalculator.initialize()
    await this.performanceAnalyzer.initialize()
    await this.attributionEngine.initialize()
    await this.stressTester.initialize()
    await this.complianceMonitor.initialize()
    await this.reportingEngine.initialize()

    console.log('✅ Portfolio Analytics System initialized successfully')
  }

  /**
   * Start analytics processing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Analytics system is already running')
      return
    }

    console.log('🚀 Starting Portfolio Analytics...')
    this.isRunning = true

    // Start real-time monitoring
    this.startRealTimeMonitoring()

    // Start compliance monitoring
    await this.complianceMonitor.start()

    // Start reporting engine
    await this.reportingEngine.start()

    console.log('✅ Portfolio Analytics started successfully')
  }

  /**
   * Stop analytics processing
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Portfolio Analytics...')
    this.isRunning = false

    // Stop components
    await this.complianceMonitor.stop()
    await this.reportingEngine.stop()

    // Generate final report
    const finalReport = await this.generateFinalReport()
    console.log('📊 Final Analytics Report Generated')

    console.log('✅ Portfolio Analytics stopped successfully')
  }

  /**
   * Run comprehensive portfolio analysis
   */
  async runFullAnalysis(): Promise<void> {
    console.log('🔍 Running comprehensive portfolio analysis...')

    try {
      // 1. Generate current portfolio snapshot
      this.currentSnapshot = await this.portfolioManager.generateSnapshot()
      console.log(`📊 Portfolio snapshot generated: $${this.currentSnapshot.total_value.toLocaleString()}`)

      // 2. Calculate risk metrics
      const riskMetrics = await this.riskCalculator.calculateRiskMetrics(this.currentSnapshot)
      console.log(`⚠️  VaR (1-day): ${(riskMetrics.var_1d * 100).toFixed(2)}%`)
      console.log(`📈 Sharpe Ratio: ${riskMetrics.sharpe_ratio.toFixed(2)}`)

      // 3. Calculate performance metrics
      const performanceMetrics = await this.performanceAnalyzer.calculatePerformanceMetrics(this.currentSnapshot)
      console.log(`📊 YTD Return: ${(performanceMetrics.ytd_return * 100).toFixed(2)}%`)
      console.log(`🎯 vs Benchmark: ${(performanceMetrics.active_return * 100).toFixed(2)}%`)

      // 4. Run attribution analysis
      const attribution = await this.attributionEngine.calculateAttribution(this.currentSnapshot)
      console.log(`🔍 Attribution Analysis Complete`)
      console.log(`  Allocation Effect: ${(attribution.allocation_effect * 100).toFixed(2)}%`)
      console.log(`  Selection Effect: ${(attribution.selection_effect * 100).toFixed(2)}%`)

      // 5. Run stress testing
      const stressResults = await this.stressTester.runStressTests(this.currentSnapshot)
      console.log(`🧪 Stress Testing Complete: ${stressResults.length} scenarios`)

      // 6. Run compliance checks
      const complianceResults = await this.complianceMonitor.runComplianceChecks(this.currentSnapshot)
      const violations = complianceResults.filter(c => c.status === 'breach')
      console.log(`✅ Compliance Checks: ${violations.length} violations found`)

      // 7. Store all results
      await this.storeAnalysisResults({
        snapshot: this.currentSnapshot,
        riskMetrics,
        performanceMetrics,
        attribution,
        stressResults,
        complianceResults
      })

      console.log('✅ Full portfolio analysis completed successfully')

    } catch (error) {
      console.error('❌ Error in portfolio analysis:', error)
      throw error
    }
  }

  /**
   * Start real-time monitoring
   */
  private startRealTimeMonitoring(): void {
    const monitor = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(monitor)
        return
      }

      try {
        // Run lightweight monitoring
        await this.runLightweightMonitoring()
      } catch (error) {
        console.error('❌ Error in real-time monitoring:', error)
      }
    }, 60000) // Every minute
  }

  /**
   * Run lightweight monitoring for real-time updates
   */
  private async runLightweightMonitoring(): Promise<void> {
    // Generate quick snapshot
    const snapshot = await this.portfolioManager.generateSnapshot()

    // Quick risk check
    const quickRisk = await this.riskCalculator.calculateQuickRisk(snapshot)

    // Compliance check
    const complianceIssues = await this.complianceMonitor.runQuickChecks(snapshot)

    // Alert on issues
    if (complianceIssues.length > 0) {
      console.log(`🚨 Compliance Alert: ${complianceIssues.length} issues detected`)
      for (const issue of complianceIssues) {
        if (issue.severity === 'critical') {
          console.log(`🔴 CRITICAL: ${issue.message}`)
        }
      }
    }

    // Update current snapshot
    this.currentSnapshot = snapshot
  }

  /**
   * Create database schema for analytics
   */
  private async createAnalyticsSchema(): Promise<void> {
    console.log('📊 Creating analytics database schema...')

    try {
      // In a real implementation, this would create comprehensive tables
      // For this demo, we'll simulate the schema creation
      console.log('✅ Analytics database schema created successfully (simulated)')
    } catch (error) {
      console.log('⚠️  Analytics database schema creation failed (simulated)')
    }
  }

  /**
   * Store analysis results
   */
  private async storeAnalysisResults(results: any): Promise<void> {
    try {
      // Store portfolio snapshot
      // await this.client.insertPortfolioSnapshot(results.snapshot)

      // Store risk metrics
      // await this.client.insertRiskMetrics(results.riskMetrics)

      // Store performance metrics
      // await this.client.insertPerformanceMetrics(results.performanceMetrics)

      // Store attribution results
      // await this.client.insertAttributionResults(results.attribution)

      // Store stress test results
      // await this.client.insertStressTestResults(results.stressResults)

      // Store compliance results
      // await this.client.insertComplianceResults(results.complianceResults)

      console.log('💾 Analysis results stored successfully (simulated)')
    } catch (error) {
      console.error('❌ Error storing analysis results:', error)
    }
  }

  /**
   * Generate final report
   */
  private async generateFinalReport(): Promise<any> {
    if (!this.currentSnapshot) {
      return { error: 'No portfolio snapshot available' }
    }

    return {
      portfolio_id: this.config.portfolioId,
      analysis_timestamp: new Date(),
      total_value: this.currentSnapshot.total_value,
      total_pnl: this.currentSnapshot.total_pnl,
      position_count: this.currentSnapshot.positions.length,
      risk_metrics: this.currentSnapshot.risk_metrics,
      performance_metrics: this.currentSnapshot.performance_metrics,
      summary: 'Portfolio analytics completed successfully'
    }
  }
}

/**
 * Portfolio Manager for position and exposure management
 */
class PortfolioManager {
  private client: TimescaleClient
  private config: PortfolioConfig
  private positions: Map<string, Position> = new Map()

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('📋 Initializing Portfolio Manager...')
    await this.loadCurrentPositions()
  }

  /**
   * Generate comprehensive portfolio snapshot
   */
  async generateSnapshot(): Promise<PortfolioSnapshot> {
    console.log('📸 Generating portfolio snapshot...')

    // Update positions with current market data
    await this.updatePositionValues()

    // Calculate portfolio totals
    const totalValue = Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.market_value, 0)
    const totalPnL = Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.unrealized_pnl + pos.realized_pnl, 0)
    const cash = 100000 // Simulated cash position

    // Calculate exposures
    const exposures = this.calculateExposures()

    // Create snapshot
    const snapshot: PortfolioSnapshot = {
      timestamp: new Date(),
      portfolio_id: this.config.portfolioId,
      total_value: totalValue + cash,
      total_pnl: totalPnL,
      cash,
      positions: Array.from(this.positions.values()),
      exposure_by_sector: exposures.sector,
      exposure_by_country: exposures.country,
      exposure_by_currency: exposures.currency,
      exposure_by_asset_type: exposures.assetType,
      risk_metrics: {} as RiskMetrics, // Will be populated by RiskCalculator
      performance_metrics: {} as PerformanceMetrics // Will be populated by PerformanceAnalyzer
    }

    return snapshot
  }

  /**
   * Load current positions from database
   */
  private async loadCurrentPositions(): Promise<void> {
    try {
      // In a real implementation, this would load from TimescaleDB
      // For demo, we'll create sample positions
      const samplePositions = this.createSamplePositions()

      for (const position of samplePositions) {
        this.positions.set(position.symbol, position)
      }

      console.log(`📊 Loaded ${this.positions.size} positions`)
    } catch (error) {
      console.error('❌ Error loading positions:', error)
    }
  }

  /**
   * Update position values with current market data
   */
  private async updatePositionValues(): Promise<void> {
    for (const [symbol, position] of this.positions) {
      // Simulate market data update
      const currentPrice = this.simulateCurrentPrice(symbol)
      const previousValue = position.market_value

      position.market_value = position.quantity * currentPrice
      position.unrealized_pnl = position.market_value - (position.quantity * position.cost_basis)
      position.weight = position.market_value / this.getTotalPortfolioValue()
      position.last_updated = new Date()
    }
  }

  /**
   * Calculate portfolio exposures
   */
  private calculateExposures(): any {
    const totalValue = this.getTotalPortfolioValue()

    const exposures = {
      sector: {} as Record<string, number>,
      country: {} as Record<string, number>,
      currency: {} as Record<string, number>,
      assetType: {} as Record<string, number>
    }

    for (const position of this.positions.values()) {
      const weight = position.market_value / totalValue

      // Sector exposure
      exposures.sector[position.sector] = (exposures.sector[position.sector] || 0) + weight

      // Country exposure
      exposures.country[position.country] = (exposures.country[position.country] || 0) + weight

      // Currency exposure
      exposures.currency[position.currency] = (exposures.currency[position.currency] || 0) + weight

      // Asset type exposure
      exposures.assetType[position.asset_type] = (exposures.assetType[position.asset_type] || 0) + weight
    }

    return exposures
  }

  /**
   * Get total portfolio value
   */
  private getTotalPortfolioValue(): number {
    return Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.market_value, 0)
  }

  /**
   * Create sample positions for demonstration
   */
  private createSamplePositions(): Position[] {
    const positions: Position[] = [
      {
        symbol: 'NVDA',
        quantity: 100,
        market_value: 17500,
        weight: 0.08,
        sector: 'Technology',
        country: 'US',
        currency: 'USD',
        asset_type: 'equity',
        cost_basis: 150,
        unrealized_pnl: 2500,
        realized_pnl: 0,
        last_updated: new Date(),
        metadata: { exchange: 'NASDAQ' }
      },
      {
        symbol: 'GOOGL',
        quantity: 50,
        market_value: 125000,
        weight: 0.12,
        sector: 'Technology',
        country: 'US',
        currency: 'USD',
        asset_type: 'equity',
        cost_basis: 2400,
        unrealized_pnl: 5000,
        realized_pnl: 0,
        last_updated: new Date(),
        metadata: { exchange: 'NASDAQ' }
      },
      {
        symbol: 'MSFT',
        quantity: 75,
        market_value: 22500,
        weight: 0.09,
        sector: 'Technology',
        country: 'US',
        currency: 'USD',
        asset_type: 'equity',
        cost_basis: 280,
        unrealized_pnl: 1500,
        realized_pnl: 0,
        last_updated: new Date(),
        metadata: { exchange: 'NASDAQ' }
      },
      {
        symbol: 'JPM',
        quantity: 200,
        market_value: 30000,
        weight: 0.06,
        sector: 'Financial',
        country: 'US',
        currency: 'USD',
        asset_type: 'equity',
        cost_basis: 140,
        unrealized_pnl: 2000,
        realized_pnl: 0,
        last_updated: new Date(),
        metadata: { exchange: 'NYSE' }
      },
      {
        symbol: 'JNJ',
        quantity: 150,
        market_value: 24000,
        weight: 0.05,
        sector: 'Healthcare',
        country: 'US',
        currency: 'USD',
        asset_type: 'equity',
        cost_basis: 155,
        unrealized_pnl: 750,
        realized_pnl: 0,
        last_updated: new Date(),
        metadata: { exchange: 'NYSE' }
      }
    ]

    return positions
  }

  /**
   * Simulate current price for demonstration
   */
  private simulateCurrentPrice(symbol: string): number {
    const basePrices: Record<string, number> = {
      'NVDA': 175,
      'GOOGL': 2500,
      'MSFT': 300,
      'JPM': 150,
      'JNJ': 160
    }

    const basePrice = basePrices[symbol] || 100
    return basePrice + (Math.random() - 0.5) * basePrice * 0.02 // ±2% random movement
  }
}

/**
 * Risk Calculator for portfolio risk metrics
 */
class RiskCalculator {
  private client: TimescaleClient
  private config: PortfolioConfig
  private historicalData: Map<string, number[]> = new Map()

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('⚠️  Initializing Risk Calculator...')
    await this.loadHistoricalData()
  }

  /**
   * Calculate comprehensive risk metrics
   */
  async calculateRiskMetrics(snapshot: PortfolioSnapshot): Promise<RiskMetrics> {
    console.log('📊 Calculating risk metrics...')

    const returns = await this.calculatePortfolioReturns(snapshot)
    const benchmarkReturns = await this.getBenchmarkReturns()

    const riskMetrics: RiskMetrics = {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      var_1d: this.calculateVaR(returns, 1),
      var_1w: this.calculateVaR(returns, 5),
      var_1m: this.calculateVaR(returns, 21),
      cvar_1d: this.calculateCVaR(returns, 1),
      cvar_1w: this.calculateCVaR(returns, 5),
      cvar_1m: this.calculateCVaR(returns, 21),
      volatility: this.calculateVolatility(returns),
      sharpe_ratio: this.calculateSharpeRatio(returns),
      sortino_ratio: this.calculateSortinoRatio(returns),
      max_drawdown: this.calculateMaxDrawdown(returns),
      beta: this.calculateBeta(returns, benchmarkReturns),
      alpha: this.calculateAlpha(returns, benchmarkReturns),
      information_ratio: this.calculateInformationRatio(returns, benchmarkReturns),
      tracking_error: this.calculateTrackingError(returns, benchmarkReturns),
      correlation_to_benchmark: this.calculateCorrelation(returns, benchmarkReturns)
    }

    return riskMetrics
  }

  /**
   * Calculate quick risk metrics for real-time monitoring
   */
  async calculateQuickRisk(snapshot: PortfolioSnapshot): Promise<any> {
    const returns = await this.calculatePortfolioReturns(snapshot)

    return {
      current_volatility: this.calculateVolatility(returns.slice(-30)), // Last 30 days
      var_1d: this.calculateVaR(returns, 1),
      concentration_risk: this.calculateConcentrationRisk(snapshot),
      liquidity_risk: this.calculateLiquidityRisk(snapshot)
    }
  }

  /**
   * Load historical data for calculations
   */
  private async loadHistoricalData(): Promise<void> {
    try {
      // In a real implementation, this would load from TimescaleDB
      // For demo, we'll simulate historical data
      const symbols = ['NVDA', 'GOOGL', 'MSFT', 'JPM', 'JNJ']

      for (const symbol of symbols) {
        const returns = this.generateSimulatedReturns(252) // 1 year of returns
        this.historicalData.set(symbol, returns)
      }

      console.log(`📊 Loaded historical data for ${symbols.length} symbols`)
    } catch (error) {
      console.error('❌ Error loading historical data:', error)
    }
  }

  /**
   * Calculate portfolio returns
   */
  private async calculatePortfolioReturns(snapshot: PortfolioSnapshot): Promise<number[]> {
    const returns: number[] = []

    // Calculate weighted returns for each day
    for (let i = 0; i < 252; i++) {
      let dailyReturn = 0

      for (const position of snapshot.positions) {
        const assetReturns = this.historicalData.get(position.symbol) || []
        if (assetReturns[i]) {
          dailyReturn += position.weight * assetReturns[i]
        }
      }

      returns.push(dailyReturn)
    }

    return returns
  }

  /**
   * Get benchmark returns
   */
  private async getBenchmarkReturns(): Promise<number[]> {
    // Simulate benchmark returns (e.g., S&P 500)
    return this.generateSimulatedReturns(252, 0.0008, 0.01) // Slightly positive drift
  }

  /**
   * Calculate Value at Risk (VaR)
   */
  private calculateVaR(returns: number[], days: number): number {
    const scaledReturns = returns.map(r => r * Math.sqrt(days))
    scaledReturns.sort((a, b) => a - b)

    const index = Math.floor((1 - this.config.confidenceLevel) * scaledReturns.length)
    return Math.abs(scaledReturns[index])
  }

  /**
   * Calculate Conditional Value at Risk (CVaR)
   */
  private calculateCVaR(returns: number[], days: number): number {
    const scaledReturns = returns.map(r => r * Math.sqrt(days))
    scaledReturns.sort((a, b) => a - b)

    const index = Math.floor((1 - this.config.confidenceLevel) * scaledReturns.length)
    const tailReturns = scaledReturns.slice(0, index)

    const avgTailReturn = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length
    return Math.abs(avgTailReturn)
  }

  /**
   * Calculate portfolio volatility
   */
  private calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
    return Math.sqrt(variance * 252) // Annualized
  }

  /**
   * Calculate Sharpe ratio
   */
  private calculateSharpeRatio(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const annualizedReturn = mean * 252
    const volatility = this.calculateVolatility(returns)

    return (annualizedReturn - this.config.riskFreeRate) / volatility
  }

  /**
   * Calculate Sortino ratio
   */
  private calculateSortinoRatio(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const annualizedReturn = mean * 252

    const negativeReturns = returns.filter(r => r < 0)
    const downside = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
    const downsideVolatility = Math.sqrt(downside * 252)

    return (annualizedReturn - this.config.riskFreeRate) / downsideVolatility
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(returns: number[]): number {
    let cumulativeReturn = 1
    let peak = 1
    let maxDrawdown = 0

    for (const ret of returns) {
      cumulativeReturn *= (1 + ret)

      if (cumulativeReturn > peak) {
        peak = cumulativeReturn
      }

      const drawdown = (peak - cumulativeReturn) / peak
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }

    return maxDrawdown
  }

  /**
   * Calculate beta
   */
  private calculateBeta(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const covariance = this.calculateCovariance(portfolioReturns, benchmarkReturns)
    const benchmarkVariance = this.calculateVariance(benchmarkReturns)

    return covariance / benchmarkVariance
  }

  /**
   * Calculate alpha
   */
  private calculateAlpha(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length
    const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / benchmarkReturns.length
    const beta = this.calculateBeta(portfolioReturns, benchmarkReturns)

    const annualizedPortfolioReturn = portfolioMean * 252
    const annualizedBenchmarkReturn = benchmarkMean * 252

    return annualizedPortfolioReturn - (this.config.riskFreeRate + beta * (annualizedBenchmarkReturn - this.config.riskFreeRate))
  }

  /**
   * Calculate information ratio
   */
  private calculateInformationRatio(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const activeReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i])
    const activeReturn = activeReturns.reduce((sum, r) => sum + r, 0) / activeReturns.length
    const trackingError = this.calculateTrackingError(portfolioReturns, benchmarkReturns)

    return (activeReturn * 252) / trackingError
  }

  /**
   * Calculate tracking error
   */
  private calculateTrackingError(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const activeReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i])
    const activeReturnMean = activeReturns.reduce((sum, r) => sum + r, 0) / activeReturns.length

    const variance = activeReturns.reduce((sum, r) => sum + Math.pow(r - activeReturnMean, 2), 0) / activeReturns.length
    return Math.sqrt(variance * 252)
  }

  /**
   * Calculate correlation
   */
  private calculateCorrelation(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const covariance = this.calculateCovariance(portfolioReturns, benchmarkReturns)
    const portfolioStd = Math.sqrt(this.calculateVariance(portfolioReturns))
    const benchmarkStd = Math.sqrt(this.calculateVariance(benchmarkReturns))

    return covariance / (portfolioStd * benchmarkStd)
  }

  /**
   * Calculate covariance
   */
  private calculateCovariance(x: number[], y: number[]): number {
    const xMean = x.reduce((sum, val) => sum + val, 0) / x.length
    const yMean = y.reduce((sum, val) => sum + val, 0) / y.length

    const covariance = x.reduce((sum, val, i) => sum + (val - xMean) * (y[i] - yMean), 0) / x.length
    return covariance
  }

  /**
   * Calculate variance
   */
  private calculateVariance(returns: number[]): number {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
    return returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
  }

  /**
   * Calculate concentration risk
   */
  private calculateConcentrationRisk(snapshot: PortfolioSnapshot): number {
    const weights = snapshot.positions.map(p => p.weight)
    const hhi = weights.reduce((sum, w) => sum + Math.pow(w, 2), 0)
    return hhi
  }

  /**
   * Calculate liquidity risk
   */
  private calculateLiquidityRisk(snapshot: PortfolioSnapshot): number {
    // Simplified liquidity risk calculation
    let liquidityScore = 0

    for (const position of snapshot.positions) {
      // Assume higher market cap = more liquid
      const marketCap = position.market_value // Simplified
      const liquidityWeight = Math.min(marketCap / 1000000, 1) // Scale to 0-1
      liquidityScore += position.weight * liquidityWeight
    }

    return 1 - liquidityScore // Higher score = more liquidity risk
  }

  /**
   * Generate simulated returns for demonstration
   */
  private generateSimulatedReturns(count: number, drift: number = 0, volatility: number = 0.015): number[] {
    const returns: number[] = []

    for (let i = 0; i < count; i++) {
      const randomShock = (Math.random() - 0.5) * 2 // Random between -1 and 1
      const dailyReturn = drift + volatility * randomShock
      returns.push(dailyReturn)
    }

    return returns
  }
}

/**
 * Performance Analyzer for portfolio performance metrics
 */
class PerformanceAnalyzer {
  private client: TimescaleClient
  private config: PortfolioConfig

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('📈 Initializing Performance Analyzer...')
  }

  /**
   * Calculate comprehensive performance metrics
   */
  async calculatePerformanceMetrics(snapshot: PortfolioSnapshot): Promise<PerformanceMetrics> {
    console.log('📊 Calculating performance metrics...')

    const returns = await this.getPortfolioReturns(snapshot)
    const benchmarkReturns = await this.getBenchmarkReturns()

    const metrics: PerformanceMetrics = {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      total_return: this.calculateTotalReturn(returns),
      daily_return: returns[returns.length - 1] || 0,
      weekly_return: this.calculatePeriodReturn(returns, 5),
      monthly_return: this.calculatePeriodReturn(returns, 21),
      quarterly_return: this.calculatePeriodReturn(returns, 63),
      ytd_return: this.calculateYTDReturn(returns),
      annual_return: this.calculateAnnualReturn(returns),
      benchmark_return: this.calculateTotalReturn(benchmarkReturns),
      active_return: this.calculateActiveReturn(returns, benchmarkReturns),
      hit_ratio: this.calculateHitRatio(returns, benchmarkReturns),
      up_capture: this.calculateUpCapture(returns, benchmarkReturns),
      down_capture: this.calculateDownCapture(returns, benchmarkReturns),
      calmar_ratio: this.calculateCalmarRatio(returns),
      burke_ratio: this.calculateBurkeRatio(returns)
    }

    return metrics
  }

  /**
   * Get portfolio returns
   */
  private async getPortfolioReturns(snapshot: PortfolioSnapshot): Promise<number[]> {
    // Simulate portfolio returns
    return this.generateSimulatedReturns(252, 0.0005, 0.012)
  }

  /**
   * Get benchmark returns
   */
  private async getBenchmarkReturns(): Promise<number[]> {
    // Simulate benchmark returns
    return this.generateSimulatedReturns(252, 0.0003, 0.010)
  }

  /**
   * Calculate total return
   */
  private calculateTotalReturn(returns: number[]): number {
    return returns.reduce((cumulative, ret) => cumulative * (1 + ret), 1) - 1
  }

  /**
   * Calculate period return
   */
  private calculatePeriodReturn(returns: number[], days: number): number {
    if (returns.length < days) return 0

    const periodReturns = returns.slice(-days)
    return this.calculateTotalReturn(periodReturns)
  }

  /**
   * Calculate year-to-date return
   */
  private calculateYTDReturn(returns: number[]): number {
    // Simplified - assume we have YTD data
    const ytdDays = Math.min(returns.length, 252)
    return this.calculatePeriodReturn(returns, ytdDays)
  }

  /**
   * Calculate annualized return
   */
  private calculateAnnualReturn(returns: number[]): number {
    const totalReturn = this.calculateTotalReturn(returns)
    const years = returns.length / 252
    return Math.pow(1 + totalReturn, 1 / years) - 1
  }

  /**
   * Calculate active return
   */
  private calculateActiveReturn(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const portfolioReturn = this.calculateTotalReturn(portfolioReturns)
    const benchmarkReturn = this.calculateTotalReturn(benchmarkReturns)
    return portfolioReturn - benchmarkReturn
  }

  /**
   * Calculate hit ratio
   */
  private calculateHitRatio(portfolioReturns: number[], benchmarkReturns: number[]): number {
    let hits = 0

    for (let i = 0; i < Math.min(portfolioReturns.length, benchmarkReturns.length); i++) {
      if (portfolioReturns[i] > benchmarkReturns[i]) {
        hits++
      }
    }

    return hits / Math.min(portfolioReturns.length, benchmarkReturns.length)
  }

  /**
   * Calculate up capture
   */
  private calculateUpCapture(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const upPeriods = portfolioReturns
      .map((r, i) => ({ portfolio: r, benchmark: benchmarkReturns[i] }))
      .filter(p => p.benchmark > 0)

    if (upPeriods.length === 0) return 0

    const portfolioUpReturn = upPeriods.reduce((sum, p) => sum + p.portfolio, 0) / upPeriods.length
    const benchmarkUpReturn = upPeriods.reduce((sum, p) => sum + p.benchmark, 0) / upPeriods.length

    return portfolioUpReturn / benchmarkUpReturn
  }

  /**
   * Calculate down capture
   */
  private calculateDownCapture(portfolioReturns: number[], benchmarkReturns: number[]): number {
    const downPeriods = portfolioReturns
      .map((r, i) => ({ portfolio: r, benchmark: benchmarkReturns[i] }))
      .filter(p => p.benchmark < 0)

    if (downPeriods.length === 0) return 0

    const portfolioDownReturn = downPeriods.reduce((sum, p) => sum + p.portfolio, 0) / downPeriods.length
    const benchmarkDownReturn = downPeriods.reduce((sum, p) => sum + p.benchmark, 0) / downPeriods.length

    return portfolioDownReturn / benchmarkDownReturn
  }

  /**
   * Calculate Calmar ratio
   */
  private calculateCalmarRatio(returns: number[]): number {
    const annualReturn = this.calculateAnnualReturn(returns)
    const maxDrawdown = this.calculateMaxDrawdown(returns)

    return maxDrawdown > 0 ? annualReturn / maxDrawdown : 0
  }

  /**
   * Calculate Burke ratio
   */
  private calculateBurkeRatio(returns: number[]): number {
    const annualReturn = this.calculateAnnualReturn(returns)
    const drawdowns = this.calculateDrawdowns(returns)
    const sumSquaredDrawdowns = drawdowns.reduce((sum, dd) => sum + Math.pow(dd, 2), 0)
    const avgSquaredDrawdown = Math.sqrt(sumSquaredDrawdowns / drawdowns.length)

    return avgSquaredDrawdown > 0 ? annualReturn / avgSquaredDrawdown : 0
  }

  /**
   * Calculate maximum drawdown
   */
  private calculateMaxDrawdown(returns: number[]): number {
    let cumulativeReturn = 1
    let peak = 1
    let maxDrawdown = 0

    for (const ret of returns) {
      cumulativeReturn *= (1 + ret)

      if (cumulativeReturn > peak) {
        peak = cumulativeReturn
      }

      const drawdown = (peak - cumulativeReturn) / peak
      maxDrawdown = Math.max(maxDrawdown, drawdown)
    }

    return maxDrawdown
  }

  /**
   * Calculate all drawdowns
   */
  private calculateDrawdowns(returns: number[]): number[] {
    const drawdowns: number[] = []
    let cumulativeReturn = 1
    let peak = 1

    for (const ret of returns) {
      cumulativeReturn *= (1 + ret)

      if (cumulativeReturn > peak) {
        peak = cumulativeReturn
      }

      const drawdown = (peak - cumulativeReturn) / peak
      drawdowns.push(drawdown)
    }

    return drawdowns
  }

  /**
   * Generate simulated returns for demonstration
   */
  private generateSimulatedReturns(count: number, drift: number = 0, volatility: number = 0.015): number[] {
    const returns: number[] = []

    for (let i = 0; i < count; i++) {
      const randomShock = (Math.random() - 0.5) * 2
      const dailyReturn = drift + volatility * randomShock
      returns.push(dailyReturn)
    }

    return returns
  }
}

/**
 * Attribution Engine for performance attribution analysis
 */
class AttributionEngine {
  private client: TimescaleClient
  private config: PortfolioConfig

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('🔍 Initializing Attribution Engine...')
  }

  /**
   * Calculate performance attribution
   */
  async calculateAttribution(snapshot: PortfolioSnapshot): Promise<AttributionResult> {
    console.log('📊 Calculating performance attribution...')

    // Get benchmark data
    const benchmarkData = await this.getBenchmarkData()

    // Calculate returns
    const portfolioReturn = 0.08 // 8% return (simulated)
    const benchmarkReturn = 0.06 // 6% return (simulated)
    const activeReturn = portfolioReturn - benchmarkReturn

    // Calculate attribution effects
    const allocationEffect = this.calculateAllocationEffect(snapshot, benchmarkData)
    const selectionEffect = this.calculateSelectionEffect(snapshot, benchmarkData)
    const interactionEffect = this.calculateInteractionEffect(snapshot, benchmarkData)

    // Calculate breakdowns
    const sectorAttribution = this.calculateSectorAttribution(snapshot, benchmarkData)
    const countryAttribution = this.calculateCountryAttribution(snapshot, benchmarkData)
    const currencyAttribution = this.calculateCurrencyAttribution(snapshot, benchmarkData)
    const securityAttribution = this.calculateSecurityAttribution(snapshot, benchmarkData)

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      total_return: portfolioReturn,
      benchmark_return: benchmarkReturn,
      active_return: activeReturn,
      allocation_effect: allocationEffect,
      selection_effect: selectionEffect,
      interaction_effect: interactionEffect,
      sector_attribution: sectorAttribution,
      country_attribution: countryAttribution,
      currency_attribution: currencyAttribution,
      security_attribution: securityAttribution
    }
  }

  /**
   * Get benchmark data
   */
  private async getBenchmarkData(): Promise<any> {
    // Simulate benchmark composition
    return {
      sectors: {
        'Technology': 0.28,
        'Financial': 0.13,
        'Healthcare': 0.12,
        'Consumer': 0.10,
        'Industrial': 0.08
      },
      countries: {
        'US': 0.60,
        'Europe': 0.20,
        'Asia': 0.15,
        'Emerging': 0.05
      },
      currencies: {
        'USD': 0.60,
        'EUR': 0.20,
        'JPY': 0.10,
        'GBP': 0.10
      }
    }
  }

  /**
   * Calculate allocation effect
   */
  private calculateAllocationEffect(snapshot: PortfolioSnapshot, benchmarkData: any): number {
    let allocationEffect = 0

    // Sector allocation effect
    for (const [sector, benchmarkWeight] of Object.entries(benchmarkData.sectors)) {
      const portfolioWeight = snapshot.exposure_by_sector[sector] || 0
      const sectorReturn = this.getSectorReturn(sector)
      const benchmarkReturn = 0.06 // Overall benchmark return

      allocationEffect += (portfolioWeight - (benchmarkWeight as number)) * (sectorReturn - benchmarkReturn)
    }

    return allocationEffect
  }

  /**
   * Calculate selection effect
   */
  private calculateSelectionEffect(snapshot: PortfolioSnapshot, benchmarkData: any): number {
    let selectionEffect = 0

    // Security selection effect
    for (const position of snapshot.positions) {
      const portfolioWeight = position.weight
      const benchmarkWeight = this.getBenchmarkWeight(position.symbol)
      const securityReturn = this.getSecurityReturn(position.symbol)
      const sectorReturn = this.getSectorReturn(position.sector)

      selectionEffect += benchmarkWeight * (securityReturn - sectorReturn)
    }

    return selectionEffect
  }

  /**
   * Calculate interaction effect
   */
  private calculateInteractionEffect(snapshot: PortfolioSnapshot, benchmarkData: any): number {
    let interactionEffect = 0

    // Interaction between allocation and selection
    for (const position of snapshot.positions) {
      const portfolioWeight = position.weight
      const benchmarkWeight = this.getBenchmarkWeight(position.symbol)
      const securityReturn = this.getSecurityReturn(position.symbol)
      const sectorReturn = this.getSectorReturn(position.sector)

      interactionEffect += (portfolioWeight - benchmarkWeight) * (securityReturn - sectorReturn)
    }

    return interactionEffect
  }

  /**
   * Calculate sector attribution
   */
  private calculateSectorAttribution(snapshot: PortfolioSnapshot, benchmarkData: any): Record<string, AttributionBreakdown> {
    const attribution: Record<string, AttributionBreakdown> = {}

    for (const [sector, benchmarkWeight] of Object.entries(benchmarkData.sectors)) {
      const portfolioWeight = snapshot.exposure_by_sector[sector] || 0
      const sectorReturn = this.getSectorReturn(sector)
      const benchmarkReturn = 0.06

      const allocationEffect = (portfolioWeight - (benchmarkWeight as number)) * (sectorReturn - benchmarkReturn)
      const selectionEffect = (benchmarkWeight as number) * (sectorReturn - benchmarkReturn)
      const interactionEffect = (portfolioWeight - (benchmarkWeight as number)) * (sectorReturn - benchmarkReturn)

      attribution[sector] = {
        portfolio_weight: portfolioWeight,
        benchmark_weight: benchmarkWeight as number,
        portfolio_return: sectorReturn,
        benchmark_return: benchmarkReturn,
        allocation_effect: allocationEffect,
        selection_effect: selectionEffect,
        interaction_effect: interactionEffect,
        total_effect: allocationEffect + selectionEffect + interactionEffect
      }
    }

    return attribution
  }

  /**
   * Calculate country attribution
   */
  private calculateCountryAttribution(snapshot: PortfolioSnapshot, benchmarkData: any): Record<string, AttributionBreakdown> {
    const attribution: Record<string, AttributionBreakdown> = {}

    for (const [country, benchmarkWeight] of Object.entries(benchmarkData.countries)) {
      const portfolioWeight = snapshot.exposure_by_country[country] || 0
      const countryReturn = this.getCountryReturn(country)
      const benchmarkReturn = 0.06

      const allocationEffect = (portfolioWeight - (benchmarkWeight as number)) * (countryReturn - benchmarkReturn)
      const selectionEffect = (benchmarkWeight as number) * (countryReturn - benchmarkReturn)
      const interactionEffect = (portfolioWeight - (benchmarkWeight as number)) * (countryReturn - benchmarkReturn)

      attribution[country] = {
        portfolio_weight: portfolioWeight,
        benchmark_weight: benchmarkWeight as number,
        portfolio_return: countryReturn,
        benchmark_return: benchmarkReturn,
        allocation_effect: allocationEffect,
        selection_effect: selectionEffect,
        interaction_effect: interactionEffect,
        total_effect: allocationEffect + selectionEffect + interactionEffect
      }
    }

    return attribution
  }

  /**
   * Calculate currency attribution
   */
  private calculateCurrencyAttribution(snapshot: PortfolioSnapshot, benchmarkData: any): Record<string, AttributionBreakdown> {
    const attribution: Record<string, AttributionBreakdown> = {}

    for (const [currency, benchmarkWeight] of Object.entries(benchmarkData.currencies)) {
      const portfolioWeight = snapshot.exposure_by_currency[currency] || 0
      const currencyReturn = this.getCurrencyReturn(currency)
      const benchmarkReturn = 0.00 // Assume base currency

      const allocationEffect = (portfolioWeight - (benchmarkWeight as number)) * (currencyReturn - benchmarkReturn)
      const selectionEffect = (benchmarkWeight as number) * (currencyReturn - benchmarkReturn)
      const interactionEffect = (portfolioWeight - (benchmarkWeight as number)) * (currencyReturn - benchmarkReturn)

      attribution[currency] = {
        portfolio_weight: portfolioWeight,
        benchmark_weight: benchmarkWeight as number,
        portfolio_return: currencyReturn,
        benchmark_return: benchmarkReturn,
        allocation_effect: allocationEffect,
        selection_effect: selectionEffect,
        interaction_effect: interactionEffect,
        total_effect: allocationEffect + selectionEffect + interactionEffect
      }
    }

    return attribution
  }

  /**
   * Calculate security attribution
   */
  private calculateSecurityAttribution(snapshot: PortfolioSnapshot, benchmarkData: any): Record<string, AttributionBreakdown> {
    const attribution: Record<string, AttributionBreakdown> = {}

    for (const position of snapshot.positions) {
      const portfolioWeight = position.weight
      const benchmarkWeight = this.getBenchmarkWeight(position.symbol)
      const securityReturn = this.getSecurityReturn(position.symbol)
      const benchmarkReturn = 0.06

      const allocationEffect = (portfolioWeight - benchmarkWeight) * (securityReturn - benchmarkReturn)
      const selectionEffect = benchmarkWeight * (securityReturn - benchmarkReturn)
      const interactionEffect = (portfolioWeight - benchmarkWeight) * (securityReturn - benchmarkReturn)

      attribution[position.symbol] = {
        portfolio_weight: portfolioWeight,
        benchmark_weight: benchmarkWeight,
        portfolio_return: securityReturn,
        benchmark_return: benchmarkReturn,
        allocation_effect: allocationEffect,
        selection_effect: selectionEffect,
        interaction_effect: interactionEffect,
        total_effect: allocationEffect + selectionEffect + interactionEffect
      }
    }

    return attribution
  }

  /**
   * Get sector return (simulated)
   */
  private getSectorReturn(sector: string): number {
    const sectorReturns: Record<string, number> = {
      'Technology': 0.12,
      'Financial': 0.08,
      'Healthcare': 0.06,
      'Consumer': 0.05,
      'Industrial': 0.07
    }

    return sectorReturns[sector] || 0.06
  }

  /**
   * Get country return (simulated)
   */
  private getCountryReturn(country: string): number {
    const countryReturns: Record<string, number> = {
      'US': 0.08,
      'Europe': 0.05,
      'Asia': 0.06,
      'Emerging': 0.04
    }

    return countryReturns[country] || 0.06
  }

  /**
   * Get currency return (simulated)
   */
  private getCurrencyReturn(currency: string): number {
    const currencyReturns: Record<string, number> = {
      'USD': 0.00,
      'EUR': -0.02,
      'JPY': 0.01,
      'GBP': -0.01
    }

    return currencyReturns[currency] || 0.00
  }

  /**
   * Get benchmark weight (simulated)
   */
  private getBenchmarkWeight(symbol: string): number {
    const benchmarkWeights: Record<string, number> = {
      'NVDA': 0.07,
      'GOOGL': 0.04,
      'MSFT': 0.06,
      'JPM': 0.01,
      'JNJ': 0.01
    }

    return benchmarkWeights[symbol] || 0.001
  }

  /**
   * Get security return (simulated)
   */
  private getSecurityReturn(symbol: string): number {
    const securityReturns: Record<string, number> = {
      'NVDA': 0.15,
      'GOOGL': 0.12,
      'MSFT': 0.18,
      'JPM': 0.08,
      'JNJ': 0.05
    }

    return securityReturns[symbol] || 0.06
  }
}

/**
 * Stress Tester for scenario analysis
 */
class StressTester {
  private client: TimescaleClient
  private config: PortfolioConfig

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('🧪 Initializing Stress Tester...')
  }

  /**
   * Run comprehensive stress tests
   */
  async runStressTests(snapshot: PortfolioSnapshot): Promise<StressTestResult[]> {
    console.log('🧪 Running stress tests...')

    const results: StressTestResult[] = []

    // Market crash scenario
    results.push(await this.runMarketCrashTest(snapshot))

    // Interest rate shock
    results.push(await this.runInterestRateShock(snapshot))

    // Sector rotation
    results.push(await this.runSectorRotationTest(snapshot))

    // Currency crisis
    results.push(await this.runCurrencyCrisisTest(snapshot))

    // Liquidity crisis
    results.push(await this.runLiquidityCrisisTest(snapshot))

    // Volatility spike
    results.push(await this.runVolatilitySpike(snapshot))

    return results
  }

  /**
   * Run market crash stress test
   */
  private async runMarketCrashTest(snapshot: PortfolioSnapshot): Promise<StressTestResult> {
    const marketShock = -0.20 // 20% market decline
    let totalImpact = 0
    let worstPosition = ''
    let worstImpact = 0
    let bestPosition = ''
    let bestImpact = 0
    const sectorImpacts: Record<string, number> = {}

    for (const position of snapshot.positions) {
      // Calculate beta-adjusted impact
      const beta = this.getPositionBeta(position.symbol)
      const positionImpact = position.market_value * marketShock * beta

      totalImpact += positionImpact

      if (positionImpact < worstImpact) {
        worstImpact = positionImpact
        worstPosition = position.symbol
      }

      if (positionImpact > bestImpact) {
        bestImpact = positionImpact
        bestPosition = position.symbol
      }

      // Track sector impacts
      if (!sectorImpacts[position.sector]) {
        sectorImpacts[position.sector] = 0
      }
      sectorImpacts[position.sector] += positionImpact
    }

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      scenario_name: 'Market Crash',
      scenario_type: 'market_shock',
      portfolio_value_change: totalImpact,
      portfolio_return_change: totalImpact / snapshot.total_value,
      worst_position: worstPosition,
      worst_position_change: worstImpact,
      best_position: bestPosition,
      best_position_change: bestImpact,
      sector_impacts: sectorImpacts,
      correlation_breakdown: true,
      liquidity_impact: 0.15,
      duration: 1 // 1 day scenario
    }
  }

  /**
   * Run interest rate shock stress test
   */
  private async runInterestRateShock(snapshot: PortfolioSnapshot): Promise<StressTestResult> {
    const rateShock = 0.02 // 200 basis points increase
    let totalImpact = 0
    let worstPosition = ''
    let worstImpact = 0
    let bestPosition = ''
    let bestImpact = 0
    const sectorImpacts: Record<string, number> = {}

    for (const position of snapshot.positions) {
      // Calculate duration-adjusted impact
      const duration = this.getPositionDuration(position.symbol)
      const positionImpact = position.market_value * (-duration * rateShock)

      totalImpact += positionImpact

      if (positionImpact < worstImpact) {
        worstImpact = positionImpact
        worstPosition = position.symbol
      }

      if (positionImpact > bestImpact) {
        bestImpact = positionImpact
        bestPosition = position.symbol
      }

      if (!sectorImpacts[position.sector]) {
        sectorImpacts[position.sector] = 0
      }
      sectorImpacts[position.sector] += positionImpact
    }

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      scenario_name: 'Interest Rate Shock',
      scenario_type: 'rate_shock',
      portfolio_value_change: totalImpact,
      portfolio_return_change: totalImpact / snapshot.total_value,
      worst_position: worstPosition,
      worst_position_change: worstImpact,
      best_position: bestPosition,
      best_position_change: bestImpact,
      sector_impacts: sectorImpacts,
      correlation_breakdown: false,
      liquidity_impact: 0.05,
      duration: 1
    }
  }

  /**
   * Run sector rotation stress test
   */
  private async runSectorRotationTest(snapshot: PortfolioSnapshot): Promise<StressTestResult> {
    // Simulate tech sector decline, value sector outperformance
    const sectorShocks: Record<string, number> = {
      'Technology': -0.15,
      'Financial': 0.10,
      'Healthcare': 0.05,
      'Consumer': -0.05,
      'Industrial': 0.08
    }

    let totalImpact = 0
    let worstPosition = ''
    let worstImpact = 0
    let bestPosition = ''
    let bestImpact = 0
    const sectorImpacts: Record<string, number> = {}

    for (const position of snapshot.positions) {
      const sectorShock = sectorShocks[position.sector] || 0
      const positionImpact = position.market_value * sectorShock

      totalImpact += positionImpact

      if (positionImpact < worstImpact) {
        worstImpact = positionImpact
        worstPosition = position.symbol
      }

      if (positionImpact > bestImpact) {
        bestImpact = positionImpact
        bestPosition = position.symbol
      }

      if (!sectorImpacts[position.sector]) {
        sectorImpacts[position.sector] = 0
      }
      sectorImpacts[position.sector] += positionImpact
    }

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      scenario_name: 'Sector Rotation',
      scenario_type: 'sector_rotation',
      portfolio_value_change: totalImpact,
      portfolio_return_change: totalImpact / snapshot.total_value,
      worst_position: worstPosition,
      worst_position_change: worstImpact,
      best_position: bestPosition,
      best_position_change: bestImpact,
      sector_impacts: sectorImpacts,
      correlation_breakdown: false,
      liquidity_impact: 0.02,
      duration: 30 // 30 day scenario
    }
  }

  /**
   * Run currency crisis stress test
   */
  private async runCurrencyCrisisTest(snapshot: PortfolioSnapshot): Promise<StressTestResult> {
    const currencyShocks: Record<string, number> = {
      'USD': 0.00,
      'EUR': -0.10,
      'JPY': 0.05,
      'GBP': -0.08
    }

    let totalImpact = 0
    let worstPosition = ''
    let worstImpact = 0
    let bestPosition = ''
    let bestImpact = 0
    const sectorImpacts: Record<string, number> = {}

    for (const position of snapshot.positions) {
      const currencyShock = currencyShocks[position.currency] || 0
      const positionImpact = position.market_value * currencyShock

      totalImpact += positionImpact

      if (positionImpact < worstImpact) {
        worstImpact = positionImpact
        worstPosition = position.symbol
      }

      if (positionImpact > bestImpact) {
        bestImpact = positionImpact
        bestPosition = position.symbol
      }

      if (!sectorImpacts[position.sector]) {
        sectorImpacts[position.sector] = 0
      }
      sectorImpacts[position.sector] += positionImpact
    }

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      scenario_name: 'Currency Crisis',
      scenario_type: 'currency_crisis',
      portfolio_value_change: totalImpact,
      portfolio_return_change: totalImpact / snapshot.total_value,
      worst_position: worstPosition,
      worst_position_change: worstImpact,
      best_position: bestPosition,
      best_position_change: bestImpact,
      sector_impacts: sectorImpacts,
      correlation_breakdown: false,
      liquidity_impact: 0.08,
      duration: 7 // 7 day scenario
    }
  }

  /**
   * Run liquidity crisis stress test
   */
  private async runLiquidityCrisisTest(snapshot: PortfolioSnapshot): Promise<StressTestResult> {
    let totalImpact = 0
    let worstPosition = ''
    let worstImpact = 0
    let bestPosition = ''
    let bestImpact = 0
    const sectorImpacts: Record<string, number> = {}

    for (const position of snapshot.positions) {
      // Larger positions face higher liquidity impact
      const liquidityImpact = -0.05 * (position.weight / 0.05) // 5% base impact, scaled by position size
      const positionImpact = position.market_value * liquidityImpact

      totalImpact += positionImpact

      if (positionImpact < worstImpact) {
        worstImpact = positionImpact
        worstPosition = position.symbol
      }

      if (positionImpact > bestImpact) {
        bestImpact = positionImpact
        bestPosition = position.symbol
      }

      if (!sectorImpacts[position.sector]) {
        sectorImpacts[position.sector] = 0
      }
      sectorImpacts[position.sector] += positionImpact
    }

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      scenario_name: 'Liquidity Crisis',
      scenario_type: 'liquidity_crisis',
      portfolio_value_change: totalImpact,
      portfolio_return_change: totalImpact / snapshot.total_value,
      worst_position: worstPosition,
      worst_position_change: worstImpact,
      best_position: bestPosition,
      best_position_change: bestImpact,
      sector_impacts: sectorImpacts,
      correlation_breakdown: true,
      liquidity_impact: 0.25,
      duration: 3 // 3 day scenario
    }
  }

  /**
   * Run volatility spike stress test
   */
  private async runVolatilitySpike(snapshot: PortfolioSnapshot): Promise<StressTestResult> {
    let totalImpact = 0
    let worstPosition = ''
    let worstImpact = 0
    let bestPosition = ''
    let bestImpact = 0
    const sectorImpacts: Record<string, number> = {}

    for (const position of snapshot.positions) {
      // Higher volatility stocks face larger impact
      const volatility = this.getPositionVolatility(position.symbol)
      const volImpact = -0.1 * (volatility / 0.2) // 10% base impact, scaled by volatility
      const positionImpact = position.market_value * volImpact

      totalImpact += positionImpact

      if (positionImpact < worstImpact) {
        worstImpact = positionImpact
        worstPosition = position.symbol
      }

      if (positionImpact > bestImpact) {
        bestImpact = positionImpact
        bestPosition = position.symbol
      }

      if (!sectorImpacts[position.sector]) {
        sectorImpacts[position.sector] = 0
      }
      sectorImpacts[position.sector] += positionImpact
    }

    return {
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      scenario_name: 'Volatility Spike',
      scenario_type: 'volatility_spike',
      portfolio_value_change: totalImpact,
      portfolio_return_change: totalImpact / snapshot.total_value,
      worst_position: worstPosition,
      worst_position_change: worstImpact,
      best_position: bestPosition,
      best_position_change: bestImpact,
      sector_impacts: sectorImpacts,
      correlation_breakdown: true,
      liquidity_impact: 0.12,
      duration: 1 // 1 day scenario
    }
  }

  /**
   * Get position beta (simulated)
   */
  private getPositionBeta(symbol: string): number {
    const betas: Record<string, number> = {
      'NVDA': 1.2,
      'GOOGL': 1.1,
      'MSFT': 0.9,
      'JPM': 1.3,
      'JNJ': 0.7
    }

    return betas[symbol] || 1.0
  }

  /**
   * Get position duration (simulated)
   */
  private getPositionDuration(symbol: string): number {
    const durations: Record<string, number> = {
      'NVDA': 0.0,
      'GOOGL': 0.0,
      'MSFT': 0.0,
      'JPM': 5.0, // Banks sensitive to rates
      'JNJ': 2.0
    }

    return durations[symbol] || 0.0
  }

  /**
   * Get position volatility (simulated)
   */
  private getPositionVolatility(symbol: string): number {
    const volatilities: Record<string, number> = {
      'NVDA': 0.25,
      'GOOGL': 0.28,
      'MSFT': 0.22,
      'JPM': 0.30,
      'JNJ': 0.15
    }

    return volatilities[symbol] || 0.20
  }
}

/**
 * Compliance Monitor for risk limit monitoring
 */
class ComplianceMonitor {
  private client: TimescaleClient
  private config: PortfolioConfig
  private isRunning: boolean = false

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('✅ Initializing Compliance Monitor...')
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Compliance Monitor...')
    this.isRunning = true
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Compliance Monitor...')
    this.isRunning = false
  }

  /**
   * Run comprehensive compliance checks
   */
  async runComplianceChecks(snapshot: PortfolioSnapshot): Promise<ComplianceCheck[]> {
    const checks: ComplianceCheck[] = []

    // Position size limits
    checks.push(...this.checkPositionSizes(snapshot))

    // Sector concentration limits
    checks.push(...this.checkSectorConcentration(snapshot))

    // Risk metric limits
    checks.push(...this.checkRiskLimits(snapshot))

    // Liquidity limits
    checks.push(...this.checkLiquidityLimits(snapshot))

    return checks
  }

  /**
   * Run quick compliance checks
   */
  async runQuickChecks(snapshot: PortfolioSnapshot): Promise<ComplianceCheck[]> {
    const checks: ComplianceCheck[] = []

    // Check critical limits only
    checks.push(...this.checkPositionSizes(snapshot).filter(c => c.severity === 'critical'))
    checks.push(...this.checkRiskLimits(snapshot).filter(c => c.severity === 'critical'))

    return checks
  }

  /**
   * Check position size limits
   */
  private checkPositionSizes(snapshot: PortfolioSnapshot): ComplianceCheck[] {
    const checks: ComplianceCheck[] = []

    for (const position of snapshot.positions) {
      const utilization = position.weight / this.config.constraints.maxPositionSize

      let status: 'pass' | 'warning' | 'breach' = 'pass'
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

      if (utilization > 1.0) {
        status = 'breach'
        severity = 'critical'
      } else if (utilization > 0.8) {
        status = 'warning'
        severity = 'high'
      }

      checks.push({
        timestamp: new Date(),
        portfolio_id: snapshot.portfolio_id,
        check_type: 'position_size',
        limit_name: `${position.symbol} Position Size`,
        current_value: position.weight,
        limit_value: this.config.constraints.maxPositionSize,
        utilization,
        status,
        severity,
        message: `Position ${position.symbol} weight is ${(position.weight * 100).toFixed(2)}% (limit: ${(this.config.constraints.maxPositionSize * 100).toFixed(2)}%)`,
        details: {
          symbol: position.symbol,
          market_value: position.market_value,
          total_portfolio_value: snapshot.total_value
        }
      })
    }

    return checks
  }

  /**
   * Check sector concentration limits
   */
  private checkSectorConcentration(snapshot: PortfolioSnapshot): ComplianceCheck[] {
    const checks: ComplianceCheck[] = []

    for (const [sector, weight] of Object.entries(snapshot.exposure_by_sector)) {
      const utilization = weight / this.config.constraints.maxSectorWeight

      let status: 'pass' | 'warning' | 'breach' = 'pass'
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

      if (utilization > 1.0) {
        status = 'breach'
        severity = 'critical'
      } else if (utilization > 0.8) {
        status = 'warning'
        severity = 'high'
      }

      checks.push({
        timestamp: new Date(),
        portfolio_id: snapshot.portfolio_id,
        check_type: 'sector_concentration',
        limit_name: `${sector} Sector Weight`,
        current_value: weight,
        limit_value: this.config.constraints.maxSectorWeight,
        utilization,
        status,
        severity,
        message: `Sector ${sector} weight is ${(weight * 100).toFixed(2)}% (limit: ${(this.config.constraints.maxSectorWeight * 100).toFixed(2)}%)`,
        details: {
          sector,
          positions: snapshot.positions.filter(p => p.sector === sector).length
        }
      })
    }

    return checks
  }

  /**
   * Check risk limits
   */
  private checkRiskLimits(snapshot: PortfolioSnapshot): ComplianceCheck[] {
    const checks: ComplianceCheck[] = []

    // Check VaR limit
    if (snapshot.risk_metrics.var_1d) {
      const utilization = snapshot.risk_metrics.var_1d / this.config.riskLimits.maxVaR

      let status: 'pass' | 'warning' | 'breach' = 'pass'
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

      if (utilization > 1.0) {
        status = 'breach'
        severity = 'critical'
      } else if (utilization > 0.8) {
        status = 'warning'
        severity = 'high'
      }

      checks.push({
        timestamp: new Date(),
        portfolio_id: snapshot.portfolio_id,
        check_type: 'risk_limit',
        limit_name: 'Daily VaR',
        current_value: snapshot.risk_metrics.var_1d,
        limit_value: this.config.riskLimits.maxVaR,
        utilization,
        status,
        severity,
        message: `Daily VaR is ${(snapshot.risk_metrics.var_1d * 100).toFixed(2)}% (limit: ${(this.config.riskLimits.maxVaR * 100).toFixed(2)}%)`,
        details: {
          confidence_level: this.config.confidenceLevel,
          time_horizon: 1
        }
      })
    }

    return checks
  }

  /**
   * Check liquidity limits
   */
  private checkLiquidityLimits(snapshot: PortfolioSnapshot): ComplianceCheck[] {
    const checks: ComplianceCheck[] = []

    // Calculate liquidity score
    let liquidityScore = 0
    for (const position of snapshot.positions) {
      const marketCap = position.market_value // Simplified
      const liquidityWeight = Math.min(marketCap / 1000000, 1)
      liquidityScore += position.weight * liquidityWeight
    }

    const minLiquidity = 0.8 // 80% minimum liquidity
    const utilization = liquidityScore / minLiquidity

    let status: 'pass' | 'warning' | 'breach' = 'pass'
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

    if (utilization < 0.8) {
      status = 'breach'
      severity = 'high'
    } else if (utilization < 0.9) {
      status = 'warning'
      severity = 'medium'
    }

    checks.push({
      timestamp: new Date(),
      portfolio_id: snapshot.portfolio_id,
      check_type: 'liquidity_limit',
      limit_name: 'Portfolio Liquidity',
      current_value: liquidityScore,
      limit_value: minLiquidity,
      utilization,
      status,
      severity,
      message: `Portfolio liquidity score is ${(liquidityScore * 100).toFixed(2)}% (minimum: ${(minLiquidity * 100).toFixed(2)}%)`,
      details: {
        illiquid_positions: snapshot.positions.filter(p => p.market_value < 1000000).length
      }
    })

    return checks
  }
}

/**
 * Reporting Engine for analytics reports
 */
class ReportingEngine {
  private client: TimescaleClient
  private config: PortfolioConfig
  private isRunning: boolean = false

  constructor(client: TimescaleClient, config: PortfolioConfig) {
    this.client = client
    this.config = config
  }

  async initialize(): Promise<void> {
    console.log('📊 Initializing Reporting Engine...')
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Reporting Engine...')
    this.isRunning = true

    // Schedule reports
    if (this.config.reporting.generateDaily) {
      this.scheduleReports('daily')
    }

    if (this.config.reporting.generateWeekly) {
      this.scheduleReports('weekly')
    }

    if (this.config.reporting.generateMonthly) {
      this.scheduleReports('monthly')
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Reporting Engine...')
    this.isRunning = false
  }

  /**
   * Schedule periodic reports
   */
  private scheduleReports(frequency: string): void {
    const intervals: Record<string, number> = {
      'daily': 24 * 60 * 60 * 1000, // 24 hours
      'weekly': 7 * 24 * 60 * 60 * 1000, // 7 days
      'monthly': 30 * 24 * 60 * 60 * 1000 // 30 days
    }

    const interval = intervals[frequency]
    if (interval) {
      setInterval(async () => {
        if (this.isRunning) {
          console.log(`📊 Generating ${frequency} report...`)
          await this.generateReport(frequency)
        }
      }, interval)
    }
  }

  /**
   * Generate analytics report
   */
  private async generateReport(type: string): Promise<void> {
    console.log(`📊 Generating ${type} analytics report...`)

    // In a real implementation, this would:
    // 1. Query historical data from TimescaleDB
    // 2. Generate charts and visualizations
    // 3. Create PDF/HTML reports
    // 4. Send to recipients

    console.log(`✅ ${type} report generated successfully (simulated)`)
  }
}

/**
 * Main demonstration function
 */
async function demonstratePortfolioAnalytics() {
  console.log('🎯 Starting Portfolio Analytics Demonstration...')

  try {
    // Initialize client
    const client = await ClientFactory.fromConnectionString(config.connectionString)

    // Create and initialize analytics system
    const analyticsSystem = new PortfolioAnalyticsSystem(client, config)
    await analyticsSystem.initialize()

    // Start analytics
    await analyticsSystem.start()

    // Run full analysis
    await analyticsSystem.runFullAnalysis()

    // Let it run for demonstration
    console.log('🏃 Portfolio analytics running for 30 seconds...')
    await new Promise(resolve => setTimeout(resolve, 30000))

    // Stop analytics
    await analyticsSystem.stop()

    console.log('✅ Portfolio Analytics demonstration completed!')

  } catch (error) {
    console.error('❌ Error in portfolio analytics demonstration:', error)
  }
}

// Run the demonstration
if (import.meta.main) {
  await demonstratePortfolioAnalytics()
}

export {
  PortfolioAnalyticsSystem,
  PortfolioManager,
  RiskCalculator,
  PerformanceAnalyzer,
  AttributionEngine,
  StressTester,
  ComplianceMonitor,
  ReportingEngine,
  type PortfolioConfig,
  type PortfolioSnapshot,
  type Position,
  type RiskMetrics,
  type PerformanceMetrics,
  type AttributionResult,
  type StressTestResult,
  type ComplianceCheck
}