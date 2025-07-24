# TimescaleDB Client - Performance Optimization Guidelines

## Overview

This document provides comprehensive performance optimization guidelines for the TimescaleDB client, covering connection management, query optimization, memory efficiency, and TimescaleDB-specific performance features.

## Connection Pool Optimization

### postgres.js Pool Configuration

Optimal connection pool settings for different deployment scenarios:

```typescript
// High-throughput production environment
const productionConfig = {
  max: 20,                    // Higher connection count for concurrent operations
  max_lifetime: 3600,         // 1 hour - balance connection freshness with overhead
  idle_timeout: 300,          // 5 minutes - reclaim idle connections
  connect_timeout: 30,        // 30 seconds - reasonable timeout
  prepare: true,              // Enable prepared statements for repeated queries
  transform: {
    undefined: null           // Consistent null handling
  }
}

// Development environment
const developmentConfig = {
  max: 5,                     // Lower overhead for development
  max_lifetime: 1800,         // 30 minutes
  idle_timeout: 60,           // 1 minute - faster cleanup
  connect_timeout: 10,        // Faster feedback on issues
  prepare: true,
  debug: true                 // Enable query logging
}

// Testing environment
const testConfig = {
  max: 3,                     // Minimal connections for tests
  max_lifetime: 300,          // 5 minutes
  idle_timeout: 10,           // 10 seconds - quick cleanup
  connect_timeout: 5,         // Fast failure for tests
  prepare: false              // Disable for test isolation
}
```

### Connection Pool Monitoring

Track connection pool health and performance:

```typescript
export class ConnectionMonitor {
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingQueries: 0,
    connectionErrors: 0,
    avgQueryTime: 0
  }

  async getPoolStats(): Promise<PoolStats> {
    // Implementation would query postgres.js internal state
    return {
      total: this.metrics.totalConnections,
      active: this.metrics.activeConnections,
      idle: this.metrics.idleConnections,
      waiting: this.metrics.waitingQueries
    }
  }

  recordQueryTime(durationMs: number): void {
    // Exponential moving average
    this.metrics.avgQueryTime = (this.metrics.avgQueryTime * 0.9) + (durationMs * 0.1)
  }

  async healthCheck(): Promise<HealthStatus> {
    const stats = await this.getPoolStats()
    
    return {
      healthy: stats.waiting < 10 && this.metrics.connectionErrors < 5,
      avgResponseTime: this.metrics.avgQueryTime,
      recommendedActions: this.getRecommendations(stats)
    }
  }

  private getRecommendations(stats: PoolStats): string[] {
    const recommendations: string[] = []
    
    if (stats.waiting > 5) {
      recommendations.push('Consider increasing max connections')
    }
    
    if (stats.idle > stats.total * 0.8) {
      recommendations.push('Consider reducing max connections or decreasing idle_timeout')
    }
    
    if (this.metrics.avgQueryTime > 1000) {
      recommendations.push('Review query performance and indexing')
    }
    
    return recommendations
  }
}
```

## Query Performance Optimization

### Index Strategy Implementation

Leverage TimescaleDB-optimized indexes for maximum performance:

```typescript
export class QueryOptimizer {
  
  /**
   * Optimize tick queries using covering indexes
   */
  async getTicksOptimized(symbol: string, range: TimeRange): Promise<PriceTick[]> {
    // Uses ix_price_ticks_symbol_time index for optimal performance
    return await this.sql`
      SELECT time, symbol, price, volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY time DESC
      LIMIT ${range.limit ?? 1000}
    `
  }

  /**
   * Optimized cross-symbol queries using time-based partitioning
   */
  async getMultiSymbolTicks(symbols: string[], range: TimeRange): Promise<PriceTick[]> {
    // Use ANY() for efficient multi-symbol queries
    return await this.sql`
      SELECT time, symbol, price, volume
      FROM price_ticks
      WHERE symbol = ANY(${symbols})
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY symbol, time DESC
      LIMIT ${range.limit ?? 1000}
    `
  }

  /**
   * High-volume tick queries using partial indexes
   */
  async getHighVolumeTicks(symbol: string, minVolume: number, range: TimeRange): Promise<PriceTick[]> {
    // Leverages ix_price_ticks_high_volume partial index
    return await this.sql`
      SELECT time, symbol, price, volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND volume >= ${minVolume}
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY volume DESC, time DESC
      LIMIT ${range.limit ?? 1000}
    `
  }
}
```

### Prepared Statement Optimization

Maximize prepared statement benefits:

```typescript
export class PreparedQueries {
  
  // Pre-define commonly used queries for automatic preparation
  static readonly QUERIES = {
    INSERT_TICK: `
      INSERT INTO price_ticks (time, symbol, price, volume)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (symbol, time) DO UPDATE SET
        price = EXCLUDED.price,
        volume = EXCLUDED.volume
    `,
    
    GET_LATEST_PRICE: `
      SELECT price FROM price_ticks
      WHERE symbol = $1
      ORDER BY time DESC
      LIMIT 1
    `,
    
    GET_TICKS_RANGE: `
      SELECT time, symbol, price, volume
      FROM price_ticks
      WHERE symbol = $1 AND time >= $2 AND time < $3
      ORDER BY time DESC
      LIMIT $4
    `
  }

  constructor(private sql: Sql) {}

  async insertTickPrepared(tick: PriceTick): Promise<void> {
    // postgres.js automatically prepares frequently used queries
    await this.sql.unsafe(PreparedQueries.QUERIES.INSERT_TICK, [
      tick.timestamp,
      tick.symbol,
      tick.price,
      tick.volume
    ])
  }
}
```

## Batch Operation Optimization

### Optimal Batch Sizing

Dynamic batch sizing based on data characteristics:

```typescript
export class BatchOptimizer {
  
  /**
   * Calculate optimal batch size based on data characteristics
   */
  calculateOptimalBatchSize(
    recordSize: number,
    availableMemory: number,
    networkLatency: number
  ): number {
    // Base calculation considering memory constraints
    const memoryBasedSize = Math.floor(availableMemory * 0.1 / recordSize)
    
    // Adjust for network latency (larger batches for higher latency)
    const latencyMultiplier = Math.min(networkLatency / 10, 5)
    const networkAdjustedSize = Math.floor(memoryBasedSize * latencyMultiplier)
    
    // Clamp to reasonable bounds
    return Math.max(100, Math.min(10000, networkAdjustedSize))
  }

  /**
   * Adaptive batching with performance monitoring
   */
  async insertTicksAdaptive(ticks: PriceTick[]): Promise<BatchResult> {
    const startTime = Date.now()
    let optimalBatchSize = this.calculateOptimalBatchSize(
      this.estimateTickSize(ticks[0]),
      this.getAvailableMemory(),
      await this.measureNetworkLatency()
    )

    const results: BatchResult[] = []
    
    for (let i = 0; i < ticks.length; i += optimalBatchSize) {
      const batch = ticks.slice(i, i + optimalBatchSize)
      const batchStart = Date.now()
      
      const result = await this.insertBatch(batch)
      const batchDuration = Date.now() - batchStart
      
      results.push(result)
      
      // Adjust batch size based on performance
      optimalBatchSize = this.adjustBatchSize(
        optimalBatchSize,
        batchDuration,
        batch.length
      )
    }

    return this.consolidateResults(results)
  }

  private adjustBatchSize(
    currentSize: number,
    durationMs: number,
    recordCount: number
  ): number {
    const targetDuration = 500 // 500ms target per batch
    const performanceRatio = targetDuration / durationMs
    
    if (performanceRatio > 1.2) {
      // Batch was too fast, increase size
      return Math.min(currentSize * 1.5, 10000)
    } else if (performanceRatio < 0.8) {
      // Batch was too slow, decrease size
      return Math.max(currentSize * 0.7, 100)
    }
    
    return currentSize
  }
}
```

### Memory-Efficient Bulk Operations

Prevent memory exhaustion during large operations:

```typescript
export class MemoryEfficientBulkOperator {
  
  /**
   * Stream-based bulk insert to handle very large datasets
   */
  async insertTicksStream(
    tickSource: AsyncIterable<PriceTick>,
    batchSize = 5000
  ): Promise<void> {
    const batch: PriceTick[] = []
    
    for await (const tick of tickSource) {
      batch.push(tick)
      
      if (batch.length >= batchSize) {
        await this.insertBatch([...batch])
        batch.length = 0 // Clear array efficiently
        
        // Allow event loop to process other tasks
        await new Promise(resolve => setImmediate(resolve))
      }
    }
    
    // Process remaining items
    if (batch.length > 0) {
      await this.insertBatch(batch)
    }
  }

  /**
   * Backpressure-aware bulk processing
   */
  async processWithBackpressure<T>(
    items: T[],
    processor: (batch: T[]) => Promise<void>,
    concurrency = 3,
    batchSize = 1000
  ): Promise<void> {
    const semaphore = new Semaphore(concurrency)
    const batches: T[][] = []
    
    // Create batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    
    // Process batches with concurrency control
    await Promise.all(
      batches.map(async (batch) => {
        await semaphore.acquire()
        try {
          await processor(batch)
        } finally {
          semaphore.release()
        }
      })
    )
  }
}

class Semaphore {
  private permits: number
  private waiting: (() => void)[] = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve)
    })
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!
      next()
    } else {
      this.permits++
    }
  }
}
```

## TimescaleDB-Specific Optimizations

### Hypertable Chunk Management

Optimize chunk configuration for access patterns:

```typescript
export class ChunkOptimizer {
  
  /**
   * Analyze and optimize chunk intervals based on data patterns
   */
  async optimizeChunkIntervals(): Promise<void> {
    // Analyze data ingestion patterns
    const ingestionStats = await this.analyzeIngestionPatterns()
    
    // Recommend optimal chunk intervals
    const recommendations = this.calculateOptimalChunkSize(ingestionStats)
    
    // Apply optimizations
    await this.applyChunkOptimizations(recommendations)
  }

  private async analyzeIngestionPatterns(): Promise<IngestionStats> {
    const stats = await this.sql`
      SELECT 
        date_trunc('hour', time) as hour,
        count(*) as tick_count,
        count(DISTINCT symbol) as symbol_count,
        avg(pg_column_size(row(price_ticks.*))) as avg_row_size
      FROM price_ticks
      WHERE time > NOW() - INTERVAL '7 days'
      GROUP BY hour
      ORDER BY hour
    `
    
    return this.calculateIngestionMetrics(stats)
  }

  private async applyChunkOptimizations(recommendations: ChunkRecommendations): Promise<void> {
    if (recommendations.newChunkInterval !== recommendations.currentChunkInterval) {
      // Note: This requires TimescaleDB admin privileges
      await this.sql`
        SELECT set_chunk_time_interval('price_ticks', INTERVAL '${recommendations.newChunkInterval}')
      `
    }
    
    // Optimize chunk compression
    if (recommendations.enableCompression) {
      await this.sql`
        ALTER TABLE price_ticks SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = 'symbol',
          timescaledb.compress_orderby = 'time DESC'
        )
      `
    }
  }
}
```

### Continuous Aggregate Optimization

Optimize materialized views for query performance:

```typescript
export class ContinuousAggregateOptimizer {
  
  /**
   * Create performance-optimized continuous aggregates
   */
  async createOptimizedAggregates(): Promise<void> {
    // High-frequency 1-minute OHLC for real-time applications
    await this.sql`
      CREATE MATERIALIZED VIEW ohlc_1min
      WITH (timescaledb.continuous) AS
      SELECT 
        time_bucket('1 minute', time) AS bucket,
        symbol,
        first(price, time) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price, time) AS close,
        sum(volume) AS volume,
        count(*) AS tick_count
      FROM price_ticks
      GROUP BY bucket, symbol
      WITH NO DATA
    `

    // Refresh policy for real-time updates
    await this.sql`
      SELECT add_continuous_aggregate_policy('ohlc_1min',
        start_offset => INTERVAL '10 minutes',
        end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '30 seconds'
      )
    `

    // Daily aggregates for historical analysis
    await this.sql`
      CREATE MATERIALIZED VIEW daily_stats
      WITH (timescaledb.continuous) AS
      SELECT 
        time_bucket('1 day', time) AS day,
        symbol,
        first(price, time) AS open,
        max(price) AS high,
        min(price) AS low,
        last(price, time) AS close,
        sum(volume) AS volume,
        count(*) AS tick_count,
        stddev(price) AS volatility,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median_price
      FROM price_ticks
      GROUP BY day, symbol
      WITH NO DATA
    `
  }

  /**
   * Query optimization using continuous aggregates
   */
  async getOhlcFast(
    symbol: string,
    interval: '1m' | '1h' | '1d',
    range: TimeRange
  ): Promise<Ohlc[]> {
    // Route to appropriate aggregate based on interval
    switch (interval) {
      case '1m':
        return this.getFromContinuousAggregate('ohlc_1min', symbol, range)
      case '1h':
        return this.getHourlyFromMinutes(symbol, range)
      case '1d':
        return this.getFromContinuousAggregate('daily_stats', symbol, range)
      default:
        throw new Error(`Unsupported interval: ${interval}`)
    }
  }

  private async getHourlyFromMinutes(symbol: string, range: TimeRange): Promise<Ohlc[]> {
    // Aggregate 1-minute data to hourly for better performance
    return await this.sql`
      SELECT 
        time_bucket('1 hour', bucket) AS time,
        symbol,
        first(open, bucket) AS open,
        max(high) AS high,
        min(low) AS low,
        last(close, bucket) AS close,
        sum(volume) AS volume
      FROM ohlc_1min
      WHERE symbol = ${symbol}
        AND bucket >= ${range.from}
        AND bucket < ${range.to}
      GROUP BY time_bucket('1 hour', bucket), symbol
      ORDER BY time DESC
      LIMIT ${range.limit ?? 1000}
    `
  }
}
```

## Memory Management

### Connection Memory Optimization

```typescript
export class MemoryOptimizer {
  
  /**
   * Monitor and optimize memory usage
   */
  async optimizeMemoryUsage(): Promise<void> {
    // Monitor connection memory usage
    const memStats = await this.getConnectionMemoryStats()
    
    if (memStats.totalMemory > memStats.maxAllowed * 0.8) {
      await this.reduceMemoryFootprint()
    }
  }

  private async reduceMemoryFootprint(): Promise<void> {
    // Reduce connection pool size temporarily
    await this.adjustConnectionPool('reduce')
    
    // Clear any internal caches
    this.clearQueryCache()
    
    // Force garbage collection if needed
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Stream large result sets to avoid memory exhaustion
   */
  async queryLargeDataset(
    symbol: string,
    range: TimeRange,
    processor: (chunk: PriceTick[]) => Promise<void>
  ): Promise<void> {
    const cursor = this.sql`
      SELECT time, symbol, price, volume
      FROM price_ticks
      WHERE symbol = ${symbol}
        AND time >= ${range.from}
        AND time < ${range.to}
      ORDER BY time DESC
    `.cursor(1000) // Process 1000 rows at a time

    for await (const rows of cursor) {
      await processor(rows.map(this.mapRowToTick))
      
      // Allow garbage collection between chunks
      await new Promise(resolve => setImmediate(resolve))
    }
  }
}
```

## Query Result Optimization

### Efficient Data Transformation

```typescript
export class ResultOptimizer {
  
  /**
   * Optimize data transformation for large result sets
   */
  optimizeResultMapping<T>(
    rows: any[],
    mapper: (row: any) => T
  ): T[] {
    // Pre-allocate array for better performance
    const results = new Array<T>(rows.length)
    
    // Use for loop instead of map for better performance
    for (let i = 0; i < rows.length; i++) {
      results[i] = mapper(rows[i])
    }
    
    return results
  }

  /**
   * Lazy evaluation for large datasets
   */
  createLazyResultSet<T>(
    query: Promise<any[]>,
    mapper: (row: any) => T
  ): AsyncIterable<T> {
    return {
      async *[Symbol.asyncIterator]() {
        const rows = await query
        
        for (const row of rows) {
          yield mapper(row)
        }
      }
    }
  }

  /**
   * Optimized tick mapping with reused objects
   */
  private tickMapper = {
    reusableResult: {
      symbol: '',
      price: 0,
      volume: undefined as number | undefined,
      timestamp: ''
    },

    mapRow(row: any): PriceTick {
      // Reuse object to reduce allocations
      this.reusableResult.symbol = row.symbol
      this.reusableResult.price = row.price
      this.reusableResult.volume = row.volume
      this.reusableResult.timestamp = row.time.toISOString()
      
      // Return a copy for safety
      return { ...this.reusableResult }
    }
  }
}
```

## Performance Monitoring

### Real-time Performance Metrics

```typescript
export class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric[]>()
  
  async recordOperation(
    operation: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const metric: PerformanceMetric = {
      timestamp: Date.now(),
      operation,
      duration,
      metadata
    }
    
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, [])
    }
    
    const operationMetrics = this.metrics.get(operation)!
    operationMetrics.push(metric)
    
    // Keep only last 1000 measurements
    if (operationMetrics.length > 1000) {
      operationMetrics.shift()
    }
  }

  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {
      operations: {},
      summary: {
        totalOperations: 0,
        avgResponseTime: 0,
        slowestOperations: []
      }
    }

    for (const [operation, metrics] of this.metrics) {
      const durations = metrics.map(m => m.duration)
      const operationStats = {
        count: metrics.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        p95Duration: this.percentile(durations, 0.95),
        p99Duration: this.percentile(durations, 0.99)
      }
      
      report.operations[operation] = operationStats
      report.summary.totalOperations += operationStats.count
    }

    // Calculate overall averages
    const allDurations = Array.from(this.metrics.values())
      .flat()
      .map(m => m.duration)
    
    report.summary.avgResponseTime = allDurations.reduce((a, b) => a + b, 0) / allDurations.length
    
    // Find slowest operations
    report.summary.slowestOperations = Object.entries(report.operations)
      .sort(([,a], [,b]) => b.avgDuration - a.avgDuration)
      .slice(0, 5)
      .map(([operation, stats]) => ({ operation, avgDuration: stats.avgDuration }))

    return report
  }

  private percentile(values: number[], p: number): number {
    const sorted = values.slice().sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[index] || 0
  }
}

interface PerformanceMetric {
  timestamp: number
  operation: string
  duration: number
  metadata?: Record<string, unknown>
}

interface PerformanceReport {
  operations: Record<string, {
    count: number
    avgDuration: number
    minDuration: number
    maxDuration: number
    p95Duration: number
    p99Duration: number
  }>
  summary: {
    totalOperations: number
    avgResponseTime: number
    slowestOperations: Array<{
      operation: string
      avgDuration: number
    }>
  }
}
```

## Production Optimization Checklist

### Database Configuration

- [ ] Enable TimescaleDB compression for chunks older than 7 days
- [ ] Configure appropriate retention policies (2 years for ticks, 5 years for OHLC)
- [ ] Set up continuous aggregates for common query patterns
- [ ] Optimize chunk intervals based on ingestion patterns
- [ ] Configure parallel workers for query execution

### Connection Pool Settings

- [ ] Set `max` connections based on load testing results
- [ ] Configure `max_lifetime` to balance connection freshness (1-2 hours)
- [ ] Set `idle_timeout` to reclaim unused connections (5-10 minutes)
- [ ] Enable prepared statements for repeated queries
- [ ] Monitor connection pool utilization

### Query Optimization

- [ ] Use appropriate indexes for query patterns
- [ ] Leverage continuous aggregates for OHLC queries
- [ ] Implement streaming for large result sets
- [ ] Use batch operations for bulk inserts
- [ ] Monitor query execution plans

### Memory Management

- [ ] Configure appropriate batch sizes (1000-5000 records)
- [ ] Implement backpressure for high-throughput scenarios
- [ ] Use streaming for large data processing
- [ ] Monitor memory usage and garbage collection
- [ ] Set up memory alerts and limits

### Monitoring and Alerting

- [ ] Set up performance monitoring dashboards
- [ ] Configure alerts for slow queries (>1s)
- [ ] Monitor connection pool health
- [ ] Track batch operation success rates
- [ ] Set up TimescaleDB-specific monitoring

This comprehensive performance optimization guide ensures the TimescaleDB client operates efficiently under various load conditions while maintaining data integrity and query performance.