/**
 * TimescaleClient - Main client class for TimescaleDB operations
 * 
 * Provides a comprehensive, production-ready interface for TimescaleDB operations
 * including data insertion, querying, aggregations, and analytics.
 */

import type { SqlInstance } from './types/internal.ts'
import type { DatabaseLayer } from './database/mod.ts'
import type {
  PriceTick,
  Ohlc,
  TimeRange,
  TimeInterval,
  BatchResult,
  MultiSymbolLatest,
  VolumeProfile,
  TopMover,
  HealthCheckResult,
  SchemaInfo
} from './types/interfaces.ts'
import type { ClientOptions, Logger } from './types/config.ts'
import { 
  ValidationError, 
  QueryError, 
  ConnectionError,
  BatchError 
} from './types/errors.ts'

// Import query operations
import {
  insertTick,
  insertOhlc,
  insertManyTicks,
  insertManyOhlc,
  type InsertOptions
} from './queries/insert.ts'
import {
  getTicks,
  getOhlc,
  getOhlcFromTicks,
  getLatestPrice,
  getMultiSymbolLatest,
  getTicksStream,
  getOhlcStream,
  type SelectOptions
} from './queries/select.ts'
import {
  getVwap,
  getPriceDelta,
  getVolatility,
  type AggregationOptions,
  type VwapResult,
  type PriceDeltaResult
} from './queries/aggregate.ts'
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  getTopMovers,
  getVolumeProfile,
  findSupportResistanceLevels,
  calculateCorrelation,
  type AnalyticsOptions,
  type TechnicalIndicatorResult,
  type RSIResult,
  type BollingerBandsResult,
  type SupportResistanceLevel,
  type CorrelationResult
} from './queries/analytics.ts'

/**
 * TimescaleClient configuration extending ClientOptions
 */
export interface TimescaleClientConfig extends ClientOptions {
  /** Whether to automatically ensure schema on initialization */
  readonly autoEnsureSchema?: boolean
  
  /** Custom interval duration for OHLC data (default: '1m') */
  readonly defaultInterval?: TimeInterval
  
  /** Whether to enable query statistics collection */
  readonly enableQueryStats?: boolean
  
  /** Custom error handlers */
  readonly errorHandlers?: {
    readonly onValidationError?: (error: ValidationError) => void
    readonly onQueryError?: (error: QueryError) => void
    readonly onConnectionError?: (error: ConnectionError) => void
    readonly onBatchError?: (error: BatchError) => void
  }
}

/**
 * Default client configuration
 */
const DEFAULT_CLIENT_CONFIG: Required<Omit<TimescaleClientConfig, 'logger' | 'errorHandlers'>> = {
  defaultBatchSize: 1000,
  maxRetries: 3,
  retryBaseDelay: 1000,
  queryTimeout: 30000,
  autoCreateTables: false,
  autoCreateIndexes: true,
  defaultLimit: 1000,
  validateInputs: true,
  collectStats: false,
  timezone: 'UTC',
  useStreaming: true,
  streamingThreshold: 1000,
  autoEnsureSchema: false,
  defaultInterval: '1m',
  enableQueryStats: false
}

/**
 * Main TimescaleClient class providing comprehensive TimescaleDB operations
 */
export class TimescaleClient {
  private readonly sql: SqlInstance
  private readonly config: Required<Omit<TimescaleClientConfig, 'logger' | 'errorHandlers'>>
  private readonly logger: Logger | undefined
  private readonly errorHandlers?: TimescaleClientConfig['errorHandlers']
  private readonly dbLayer?: DatabaseLayer
  
  private _isInitialized = false
  private _isClosed = false

  /**
   * Create a new TimescaleClient instance
   * 
   * @param sql - postgres.js SqlInstance or DatabaseLayer
   * @param config - Client configuration options
   */
  constructor(
    sql: SqlInstance | DatabaseLayer,
    config: TimescaleClientConfig = {}
  ) {
    // Handle both SqlInstance and DatabaseLayer
    if ('pool' in sql) {
      this.dbLayer = sql
      // We'll get the SQL instance lazily when needed
      this.sql = null as unknown as SqlInstance // Will be set on first use
    } else {
      this.sql = sql
    }
    
    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config }
    this.logger = config.logger ?? undefined
    this.errorHandlers = config.errorHandlers
  }

  /**
   * Initialize the client - ensures schema if configured
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      return
    }

    try {
      if (this.config.autoEnsureSchema) {
        await this.ensureSchema()
      }

      // Start database layer health monitoring if available
      if (this.dbLayer) {
        this.dbLayer.start()
      }

      this._isInitialized = true
      this.logger?.info('TimescaleClient initialized successfully')
    } catch (error) {
      const err = new ConnectionError(
        'Failed to initialize TimescaleClient',
        error instanceof Error ? error : new Error(String(error))
      )
      this.handleError(err)
      throw err
    }
  }

  /**
   * Check if client is initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized
  }

  /**
   * Check if client is closed
   */
  get isClosed(): boolean {
    return this._isClosed
  }

  // ==================== INSERTION OPERATIONS ====================

  /**
   * Insert a single price tick
   */
  async insertTick(tick: PriceTick, options?: InsertOptions): Promise<void> {
    this.validateNotClosed()
    
    try {
      const sql = await this.getSqlInstance()
      const insertOptions = this.mergeInsertOptions(options)
      await insertTick(sql, tick, insertOptions)
      this.logger?.debug('Inserted price tick', { symbol: tick.symbol, price: tick.price })
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Insert a single OHLC candle
   */
  async insertOhlc(candle: Ohlc, options?: InsertOptions): Promise<void> {
    this.validateNotClosed()
    
    try {
      const insertOptions = this.mergeInsertOptions(options)
      await insertOhlc(this.sql, candle, insertOptions)
      this.logger?.debug('Inserted OHLC candle', { symbol: candle.symbol, interval: this.config.defaultInterval })
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Insert multiple price ticks efficiently
   */
  async insertManyTicks(ticks: PriceTick[], options?: InsertOptions): Promise<BatchResult> {
    this.validateNotClosed()
    
    if (ticks.length === 0) {
      return { processed: 0, failed: 0, durationMs: 0, errors: [] }
    }

    try {
      const insertOptions = this.mergeInsertOptions(options)
      const result = await insertManyTicks(this.sql, ticks, insertOptions)
      
      this.logger?.info('Batch inserted price ticks', {
        total: ticks.length,
        processed: result.processed,
        failed: result.failed,
        durationMs: result.durationMs
      })
      
      return result
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Insert multiple OHLC candles efficiently
   */
  async insertManyOhlc(candles: Ohlc[], options?: InsertOptions): Promise<BatchResult> {
    this.validateNotClosed()
    
    if (candles.length === 0) {
      return { processed: 0, failed: 0, durationMs: 0, errors: [] }
    }

    try {
      const insertOptions = this.mergeInsertOptions(options)
      const result = await insertManyOhlc(this.sql, candles, insertOptions)
      
      this.logger?.info('Batch inserted OHLC candles', {
        total: candles.length,
        processed: result.processed,
        failed: result.failed,
        durationMs: result.durationMs
      })
      
      return result
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== QUERY OPERATIONS ====================

  /**
   * Get price ticks for a symbol and time range
   */
  async getTicks(symbol: string, range: TimeRange, options?: SelectOptions): Promise<PriceTick[]> {
    this.validateNotClosed()
    
    try {
      const selectOptions = this.mergeSelectOptions(options)
      const ticks = await getTicks(this.sql, symbol, range, selectOptions)
      
      this.logger?.debug('Retrieved price ticks', {
        symbol,
        count: ticks.length,
        from: range.from,
        to: range.to
      })
      
      return ticks
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get OHLC data for a symbol, interval, and time range
   */
  async getOhlc(symbol: string, interval: TimeInterval, range: TimeRange, options?: SelectOptions): Promise<Ohlc[]> {
    this.validateNotClosed()
    
    try {
      const selectOptions = this.mergeSelectOptions(options)
      const candles = await getOhlc(this.sql, symbol, interval, range, selectOptions)
      
      this.logger?.debug('Retrieved OHLC data', {
        symbol,
        interval,
        count: candles.length,
        from: range.from,
        to: range.to
      })
      
      return candles
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Generate OHLC data from tick data using TimescaleDB aggregation
   */
  async getOhlcFromTicks(symbol: string, intervalMinutes: number, range: TimeRange, options?: SelectOptions): Promise<Ohlc[]> {
    this.validateNotClosed()
    
    try {
      const selectOptions = this.mergeSelectOptions(options)
      const candles = await getOhlcFromTicks(this.sql, symbol, intervalMinutes, range, selectOptions)
      
      this.logger?.debug('Generated OHLC from ticks', {
        symbol,
        intervalMinutes,
        count: candles.length,
        from: range.from,
        to: range.to
      })
      
      return candles
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get the latest price for a symbol
   */
  async getLatestPrice(symbol: string): Promise<number | null> {
    this.validateNotClosed()
    
    try {
      const price = await getLatestPrice(this.sql, symbol)
      this.logger?.debug('Retrieved latest price', { symbol, price })
      return price
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get latest prices for multiple symbols
   */
  async getMultiSymbolLatest(symbols: string[]): Promise<MultiSymbolLatest> {
    this.validateNotClosed()
    
    try {
      const result = await getMultiSymbolLatest(this.sql, symbols)
      
      this.logger?.debug('Retrieved multi-symbol latest prices', {
        requested: result.requested,
        found: result.found
      })
      
      return result
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== AGGREGATION OPERATIONS ====================

  /**
   * Calculate price delta between two time points
   */
  async getPriceDelta(symbol: string, from: Date, to: Date): Promise<PriceDeltaResult> {
    this.validateNotClosed()
    
    try {
      const delta = await getPriceDelta(this.sql, symbol, from, to)
      this.logger?.debug('Calculated price delta', { symbol, delta: delta.delta, percentChange: delta.percentChange })
      return delta
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Calculate volatility over a time period
   */
  async getVolatility(symbol: string, hours: number): Promise<number> {
    this.validateNotClosed()
    
    try {
      const volatility = await getVolatility(this.sql, symbol, hours)
      this.logger?.debug('Calculated volatility', { symbol, hours, volatility })
      return volatility
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get VWAP (Volume Weighted Average Price) for time buckets
   */
  async getVwap(symbol: string, bucketInterval: string, range: TimeRange, options?: AggregationOptions): Promise<VwapResult[]> {
    this.validateNotClosed()
    
    try {
      const aggregationOptions = this.mergeAggregationOptions(options)
      const vwapData = await getVwap(this.sql, symbol, bucketInterval, range, aggregationOptions)
      
      this.logger?.debug('Retrieved VWAP data', {
        symbol,
        bucketInterval,
        count: vwapData.length
      })
      
      return vwapData
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== ANALYTICS OPERATIONS ====================

  /**
   * Calculate Simple Moving Average
   */
  async calculateSMA(symbol: string, period: number, range: TimeRange, options?: AnalyticsOptions): Promise<TechnicalIndicatorResult[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const sma = await calculateSMA(this.sql, symbol, period, range, analyticsOptions)
      
      this.logger?.debug('Calculated SMA', { symbol, period, count: sma.length })
      return sma
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Calculate Exponential Moving Average
   */
  async calculateEMA(symbol: string, period: number, range: TimeRange, options?: AnalyticsOptions): Promise<TechnicalIndicatorResult[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const ema = await calculateEMA(this.sql, symbol, period, range, analyticsOptions)
      
      this.logger?.debug('Calculated EMA', { symbol, period, count: ema.length })
      return ema
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  async calculateRSI(symbol: string, period: number, range: TimeRange, options?: AnalyticsOptions): Promise<RSIResult[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const rsi = await calculateRSI(this.sql, symbol, range, period, analyticsOptions)
      
      this.logger?.debug('Calculated RSI', { symbol, period, count: rsi.length })
      return rsi
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Calculate Bollinger Bands
   */
  async calculateBollingerBands(symbol: string, period: number, stdDevMultiplier: number, range: TimeRange, options?: AnalyticsOptions): Promise<BollingerBandsResult[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const bands = await calculateBollingerBands(this.sql, symbol, range, period, stdDevMultiplier, analyticsOptions)
      
      this.logger?.debug('Calculated Bollinger Bands', { symbol, period, stdDevMultiplier, count: bands.length })
      return bands
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get top price movers
   */
  async getTopMovers(options?: AnalyticsOptions, limit: number = 10, hours: number = 24): Promise<TopMover[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const movers = await getTopMovers(this.sql, analyticsOptions, limit, hours)
      
      this.logger?.debug('Retrieved top movers', { limit, hours, count: movers.length })
      return movers
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get volume profile analysis
   */
  async getVolumeProfile(symbol: string, range: TimeRange, options?: AnalyticsOptions, buckets: number = 20): Promise<VolumeProfile[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const profile = await getVolumeProfile(this.sql, symbol, range, buckets, analyticsOptions)
      
      this.logger?.debug('Retrieved volume profile', { symbol, buckets, count: profile.length })
      return profile
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Find support and resistance levels
   */
  async findSupportResistanceLevels(symbol: string, range: TimeRange, options?: AnalyticsOptions, tolerance: number = 0.005, minTouches: number = 3): Promise<SupportResistanceLevel[]> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const levels = await findSupportResistanceLevels(this.sql, symbol, range, tolerance, minTouches, analyticsOptions)
      
      this.logger?.debug('Found support/resistance levels', { symbol, tolerance, minTouches, count: levels.length })
      return levels
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Calculate correlation between two symbols
   */
  async calculateCorrelation(symbol1: string, symbol2: string, range: TimeRange, options?: AnalyticsOptions): Promise<CorrelationResult> {
    this.validateNotClosed()
    
    try {
      const analyticsOptions = this.mergeAnalyticsOptions(options)
      const correlation = await calculateCorrelation(this.sql, symbol1, symbol2, range, analyticsOptions)
      
      this.logger?.debug('Calculated correlation', { symbol1, symbol2, correlation: correlation.correlation })
      return correlation
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== STREAMING OPERATIONS ====================

  /**
   * Stream price ticks for large datasets
   */
  getTicksStream(symbol: string, range: TimeRange, options?: { batchSize?: number }): AsyncIterable<PriceTick[]> {
    this.validateNotClosed()
    
    try {
      const streamingOptions = { batchSize: options?.batchSize || this.config.defaultBatchSize }
      const stream = getTicksStream(this.sql, symbol, range, streamingOptions)
      
      this.logger?.debug('Started ticks stream', { symbol, batchSize: streamingOptions.batchSize })
      return stream
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Stream OHLC data for large datasets
   */
  getOhlcStream(symbol: string, interval: TimeInterval, range: TimeRange, options?: { batchSize?: number }): AsyncIterable<Ohlc[]> {
    this.validateNotClosed()
    
    try {
      const streamingOptions = { batchSize: options?.batchSize || this.config.defaultBatchSize }
      const stream = getOhlcStream(this.sql, symbol, interval, range, streamingOptions)
      
      this.logger?.debug('Started OHLC stream', { symbol, interval, batchSize: streamingOptions.batchSize })
      return stream
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  // ==================== MANAGEMENT OPERATIONS ====================

  /**
   * Check database connectivity and health
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const startTime = performance.now()
      const sql = await this.getSqlInstance()
      
      // Basic connectivity test
      const result = await sql`SELECT 1 as test, NOW() as timestamp`
      const responseTime = Math.round(performance.now() - startTime)
      
      // Check TimescaleDB extension
      const versionResult = await sql`
        SELECT
          extversion as version,
          current_database() as database
        FROM pg_extension
        WHERE extname = 'timescaledb'
      `
      
      const isHealthy = result.length > 0 && versionResult.length > 0
      const version = versionResult[0]?.version as string
      const database = versionResult[0]?.database as string
      
      // Get database layer health if available
      const dbLayerHealth = this.dbLayer?.getHealthStatus()
      
      return {
        isHealthy: isHealthy && (!dbLayerHealth || dbLayerHealth.isHealthy),
        responseTimeMs: responseTime,
        version,
        database,
        connection: {
          host: 'unknown', // Would need connection info from postgres.js
          port: 5432,
          ssl: false
        },
        errors: isHealthy ? undefined : ['TimescaleDB extension not available'],
        timestamp: new Date()
      }
    } catch (error) {
      this.handleError(error)
      
      return {
        isHealthy: false,
        responseTimeMs: 0,
        connection: {
          host: 'unknown',
          port: 5432,
          ssl: false
        },
        errors: [error instanceof Error ? error.message : String(error)],
        timestamp: new Date()
      }
    }
  }

  /**
   * Ensure database schema exists and is up to date
   */
  async ensureSchema(): Promise<void> {
    this.validateNotClosed()
    
    try {
      // This would typically read and execute SQL files from src/schema/
      // For now, we'll implement basic table creation
      
      // Check if tables exist
      const tables = await this.sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('price_ticks', 'ohlc_data')
      `
      
      const existingTables = tables.map(t => t.table_name)
      
      if (!existingTables.includes('price_ticks')) {
        await this.sql`
          CREATE TABLE IF NOT EXISTS price_ticks (
            time TIMESTAMPTZ NOT NULL,
            symbol TEXT NOT NULL,
            price NUMERIC NOT NULL CHECK (price > 0),
            volume NUMERIC CHECK (volume >= 0),
            exchange TEXT,
            data_source TEXT,
            bid_price NUMERIC,
            ask_price NUMERIC,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (symbol, time)
          )
        `
        
        // Convert to hypertable
        await this.sql`SELECT create_hypertable('price_ticks', 'time', if_not_exists => true)`
        
        this.logger?.info('Created price_ticks hypertable')
      }
      
      if (!existingTables.includes('ohlc_data')) {
        await this.sql`
          CREATE TABLE IF NOT EXISTS ohlc_data (
            time TIMESTAMPTZ NOT NULL,
            symbol TEXT NOT NULL,
            interval_duration TEXT NOT NULL,
            open NUMERIC NOT NULL CHECK (open > 0),
            high NUMERIC NOT NULL CHECK (high > 0),
            low NUMERIC NOT NULL CHECK (low > 0),
            close NUMERIC NOT NULL CHECK (close > 0),
            volume NUMERIC CHECK (volume >= 0),
            price_change NUMERIC,
            price_change_percent NUMERIC,
            data_source TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (symbol, interval_duration, time)
          )
        `
        
        // Convert to hypertable
        await this.sql`SELECT create_hypertable('ohlc_data', 'time', if_not_exists => true)`
        
        this.logger?.info('Created ohlc_data hypertable')
      }
      
      // Create indexes if autoCreateIndexes is enabled
      if (this.config.autoCreateIndexes) {
        await this.createIndexes()
      }
      
      this.logger?.info('Schema ensured successfully')
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Get schema information
   */
  async getSchemaInfo(): Promise<SchemaInfo> {
    this.validateNotClosed()
    
    try {
      // Get TimescaleDB version
      const versionResult = await this.sql`SELECT timescaledb_version()`
      const version = versionResult[0]?.timescaledb_version as string
      
      // Get hypertables info
      const hypertablesResult = await this.sql`
        SELECT 
          hypertable_name as table_name,
          hypertable_schema as schema_name,
          main_dimension_column as time_column,
          chunk_time_interval,
          num_dimensions,
          compression_enabled,
          created as created_at
        FROM timescaledb_information.hypertables
        WHERE hypertable_schema = 'public'
      `
      
      const hypertables = hypertablesResult.map(h => ({
        tableName: String(h.table_name),
        schemaName: String(h.schema_name),
        timeColumn: String(h.time_column),
        chunkTimeInterval: String(h.chunk_time_interval),
        numDimensions: Number(h.num_dimensions) || 1,
        numChunks: 0, // Would need additional query
        compressionEnabled: Boolean(h.compression_enabled),
        tableSizeBytes: 0, // Would need additional query
        createdAt: new Date(String(h.created_at))
      }))
      
      // Get indexes info
      const indexesResult = await this.sql`
        SELECT 
          indexname as index_name,
          tablename as table_name,
          indexdef as definition
        FROM pg_indexes 
        WHERE schemaname = 'public'
          AND tablename IN ('price_ticks', 'ohlc_data')
      `
      
      const indexes = indexesResult.map(idx => ({
        indexName: String(idx.index_name),
        tableName: String(idx.table_name),
        columns: [], // Would need to parse from definition
        isUnique: String(idx.definition).includes('UNIQUE'),
        isPartial: String(idx.definition).includes('WHERE'),
        sizeBytes: 0, // Would need additional query
        definition: String(idx.definition)
      }))
      
      return {
        version,
        hypertables,
        indexes,
        compressionEnabled: hypertables.some(h => h.compressionEnabled),
        retentionPolicies: [], // Would need additional query
        validatedAt: new Date()
      }
    } catch (error) {
      this.handleError(error)
      throw error
    }
  }

  /**
   * Close the client and all connections
   */
  async close(): Promise<void> {
    if (this._isClosed) {
      return
    }
    
    try {
      // Stop database layer if available
      if (this.dbLayer) {
        await this.dbLayer.stop()
      } else if (this.sql) {
        // Close postgres.js connection
        await this.sql.end()
      }
      
      this._isClosed = true
      this.logger?.info('TimescaleClient closed successfully')
    } catch (error) {
      this.logger?.error('Error closing TimescaleClient', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Get SQL instance from either database layer pool or direct connection
   * @returns Promise resolving to SQL instance
   * @throws ConnectionError if no SQL instance is available
   */
  private async getSqlInstance(): Promise<SqlInstance> {
    if (this.dbLayer) {
      // Get SQL instance from database layer pool
      return await this.dbLayer.pool.acquire()
    } else if (this.sql) {
      return this.sql
    } else {
      throw new ConnectionError('No SQL instance available')
    }
  }

  /**
   * Validate that the client has not been closed
   * @throws ConnectionError if client has been closed
   */
  private validateNotClosed(): void {
    if (this._isClosed) {
      throw new ConnectionError('TimescaleClient has been closed')
    }
  }

  /**
   * Create database indexes for optimizing query performance
   * @throws Error if index creation fails (logged but not thrown)
   */
  private async createIndexes(): Promise<void> {
    try {
      // Primary indexes for price_ticks
      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_price_ticks_symbol_time 
        ON price_ticks (symbol, time DESC)
      `
      
      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_price_ticks_time 
        ON price_ticks (time DESC)
      `
      
      // Primary indexes for ohlc_data
      await this.sql`
        CREATE INDEX IF NOT EXISTS ix_ohlc_data_symbol_interval_time 
        ON ohlc_data (symbol, interval_duration, time DESC)
      `
      
      this.logger?.debug('Created database indexes')
    } catch (error) {
      this.logger?.warn('Failed to create some indexes', { error: error instanceof Error ? error.message : String(error) })
      // Don't throw - indexes are optional optimization
    }
  }

  /**
   * Merge user-provided insert options with client defaults
   * @param options - User-provided insert options (optional)
   * @returns Merged insert options with defaults applied
   */
  private mergeInsertOptions(options?: InsertOptions): InsertOptions {
    return {
      upsert: true,
      batchSize: this.config.defaultBatchSize,
      useTransaction: true,
      timeoutMs: this.config.queryTimeout,
      validate: this.config.validateInputs,
      ...options
    }
  }

  /**
   * Merge user-provided select options with client defaults
   * @param options - User-provided select options (optional)
   * @returns Merged select options with defaults applied
   */
  private mergeSelectOptions(options?: SelectOptions): SelectOptions {
    return {
      limit: this.config.defaultLimit,
      offset: 0,
      orderBy: { column: 'time', direction: 'desc' },
      where: {},
      includeStats: this.config.collectStats,
      includeMetadata: false,
      customOrderBy: '',
      useStreaming: this.config.useStreaming,
      ...options
    }
  }

  /**
   * Merge user-provided aggregation options with client defaults
   * @param options - User-provided aggregation options (optional)
   * @returns Merged aggregation options with defaults applied
   */
  private mergeAggregationOptions(options?: AggregationOptions): AggregationOptions {
    return {
      limit: this.config.defaultLimit,
      offset: 0,
      orderBy: { column: 'bucket', direction: 'desc' },
      where: {},
      includeStats: this.config.collectStats,
      fillGaps: false,
      fillValue: null,
      includeMetadata: false,
      ...options
    }
  }

  /**
   * Merge user-provided analytics options with client defaults
   * @param options - User-provided analytics options (optional)
   * @returns Merged analytics options with defaults applied
   */
  private mergeAnalyticsOptions(options?: AnalyticsOptions): AnalyticsOptions {
    return {
      limit: this.config.defaultLimit,
      offset: 0,
      orderBy: { column: 'time', direction: 'desc' },
      where: {},
      includeStats: this.config.collectStats,
      minVolume: 0,
      smoothingFactor: 0.1,
      ...options
    }
  }

  /**
   * Handle errors by calling appropriate error handlers and logging
   * @param error - The error to handle (unknown type)
   */
  private handleError(error: unknown): void {
    if (error instanceof ValidationError && this.errorHandlers?.onValidationError) {
      this.errorHandlers.onValidationError(error)
    } else if (error instanceof QueryError && this.errorHandlers?.onQueryError) {
      this.errorHandlers.onQueryError(error)
    } else if (error instanceof ConnectionError && this.errorHandlers?.onConnectionError) {
      this.errorHandlers.onConnectionError(error)
    } else if (error instanceof BatchError && this.errorHandlers?.onBatchError) {
      this.errorHandlers.onBatchError(error)
    }
    
    // Log all errors
    this.logger?.error(
      'TimescaleClient operation failed',
      error instanceof Error ? error : new Error(String(error))
    )
  }
}