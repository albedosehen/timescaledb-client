/**
 * Error Handling Examples for TimescaleDB Client
 * 
 * This example demonstrates comprehensive error handling patterns for trading applications,
 * including connection errors, query validation, retry logic, and graceful degradation.
 * Essential for building robust production trading systems.
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'
import type { PriceTick, TimeRange } from '../../src/mod.ts'
import {
  ConnectionError,
  ValidationError,
  QueryError,
  BatchError
} from '../../src/mod.ts'

// Trading system configuration with error handling settings
interface TradingConfig {
  connectionString: string
  maxRetries: number
  retryDelayMs: number
  timeoutMs: number
  enableFallback: boolean
}

const config: TradingConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
  enableFallback: true
}

/**
 * Demonstrates connection error handling with retry logic
 */
async function demonstrateConnectionErrorHandling(): Promise<void> {
  console.log('\n=== Connection Error Handling ===')
  
  let client: TimescaleClient | null = null
  let retryCount = 0
  
  while (retryCount < config.maxRetries) {
    try {
      console.log(`Connection attempt ${retryCount + 1}/${config.maxRetries}...`)
      
      client = await ClientFactory.fromConnectionString(config.connectionString, {
        queryTimeout: config.timeoutMs
      }, {
        testConnection: true,
        autoInitialize: true
      })
      
      // Test connection with a simple health check
      const healthCheck = await client.healthCheck()
      
      if (healthCheck.isHealthy) {
        console.log('✅ Connection successful!')
        console.log(`Database: ${healthCheck.database}`)
        console.log(`Response time: ${healthCheck.responseTimeMs}ms`)
        break
      } else {
        throw new Error('Health check failed')
      }
      
    } catch (error) {
      retryCount++
      
      if (error instanceof ConnectionError) {
        console.log(`❌ Connection error: ${error.message}`)
      } else if (error instanceof Error) {
        console.log(`❌ Unexpected error: ${error.message}`)
      }
      
      if (retryCount < config.maxRetries) {
        console.log(`⏳ Retrying in ${config.retryDelayMs}ms...`)
        await sleep(config.retryDelayMs)
      } else {
        console.log('❌ Max retries reached. Connection failed.')
        
        if (config.enableFallback) {
          console.log('🔄 Switching to fallback mode...')
          await handleFallbackMode()
        }
        return
      }
    }
  }
  
  // Cleanup
  if (client) {
    await client.close()
  }
}

/**
 * Demonstrates query error handling and validation
 */
async function demonstrateQueryErrorHandling(): Promise<void> {
  console.log('\n=== Query Error Handling ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Example 1: Invalid symbol validation
    try {
      console.log('Testing invalid symbol...')
      await client.getLatestPrice('invalid-symbol!')
    } catch (error) {
      if (error instanceof ValidationError) {
        console.log(`✅ Caught validation error: ${error.message}`)
        console.log(`Field: ${error.field}, Value: ${error.value}`)
      }
    }
    
    // Example 2: Invalid time range
    try {
      console.log('Testing invalid time range...')
      const invalidRange: TimeRange = {
        from: new Date('2024-01-02'),
        to: new Date('2024-01-01') // Invalid: from > to
      }
      await client.getTicks('BTCUSD', invalidRange)
    } catch (error) {
      if (error instanceof ValidationError) {
        console.log(`✅ Caught time range validation error: ${error.message}`)
      }
    }
    
    // Example 3: Query timeout handling
    try {
      console.log('Testing query timeout...')
      const largeRange: TimeRange = {
        from: new Date('2020-01-01'),
        to: new Date('2024-01-01')
      }
      // This might timeout for large datasets
      await client.getTicks('BTCUSD', largeRange, { limit: 1000000 })
    } catch (error) {
      if (error instanceof QueryError) {
        console.log(`✅ Caught query error: ${error.message}`)
        console.log(`Query: ${error.query}`)
        console.log(`Parameters: ${JSON.stringify(error.parameters)}`)
      }
    }
    
    // Example 4: Graceful degradation for failed queries
    console.log('Testing graceful degradation...')
    const fallbackData = await getLatestPriceWithFallback(client, 'NONEXISTENT')
    console.log(`Fallback result: ${JSON.stringify(fallbackData)}`)
    
  } catch (error) {
    console.log(`❌ Unexpected error in query demonstration: ${error}`)
  } finally {
    await client.close()
  }
}

/**
 * Demonstrates batch operation error handling
 */
async function demonstrateBatchErrorHandling(): Promise<void> {
  console.log('\n=== Batch Operation Error Handling ===')
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Create mixed batch with some invalid data
    const mixedBatch: PriceTick[] = [
      {
        symbol: 'BTCUSD',
        price: 45000.50,
        volume: 1.5,
        timestamp: new Date().toISOString()
      },
      {
        symbol: 'ETHUSD',
        price: -100, // Invalid: negative price
        volume: 2.0,
        timestamp: new Date().toISOString()
      },
      {
        symbol: 'INVALID!', // Invalid: special characters
        price: 200.50,
        volume: 1.0,
        timestamp: new Date().toISOString()
      },
      {
        symbol: 'ADAUSD',
        price: 0.85,
        volume: 1000,
        timestamp: new Date().toISOString()
      }
    ]
    
    try {
      console.log('Inserting mixed batch with validation...')
      const result = await client.insertManyTicks(mixedBatch)
      console.log(`✅ Batch completed: ${result.processed} processed, ${result.failed} failed`)
      
      if (result.errors && result.errors.length > 0) {
        console.log('Batch errors:')
        result.errors.forEach((error: Error, index: number) => {
          console.log(`  ${index + 1}. ${error.message}`)
        })
      }
      
    } catch (error) {
      if (error instanceof BatchError) {
        console.log(`❌ Batch operation failed: ${error.message}`)
        console.log(`Processed: ${error.processedCount}, Failed: ${error.failedCount}`)
        
        // Batch errors always contain some results, implement recovery
        console.log('Implementing recovery strategy for failed batch...')
        await handlePartialBatchFailure(error)
      }
    }
    
  } catch (error) {
    console.log(`❌ Unexpected error in batch demonstration: ${error}`)
  } finally {
    await client.close()
  }
}

/**
 * Demonstrates circuit breaker pattern for external API calls
 */
class CircuitBreaker {
  private failures: number = 0
  private lastFailureTime: number = 0
  private isOpen: boolean = false
  
  constructor(
    private threshold: number = 5,
    private resetTimeMs: number = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.isOpen && Date.now() - this.lastFailureTime > this.resetTimeMs) {
      this.reset()
    }
    
    // Fail fast if circuit is open
    if (this.isOpen) {
      throw new Error('Circuit breaker is open - failing fast')
    }
    
    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  private onSuccess(): void {
    this.failures = 0
  }
  
  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()
    
    if (this.failures >= this.threshold) {
      this.isOpen = true
      console.log('🔴 Circuit breaker opened due to failures')
    }
  }
  
  private reset(): void {
    this.failures = 0
    this.isOpen = false
    console.log('🟢 Circuit breaker reset')
  }
}

/**
 * Demonstrates circuit breaker usage in trading system
 */
async function demonstrateCircuitBreaker(): Promise<void> {
  console.log('\n=== Circuit Breaker Pattern ===')
  
  const circuitBreaker = new CircuitBreaker(3, 5000) // 3 failures, 5s reset
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Simulate multiple failing operations
    for (let i = 1; i <= 6; i++) {
      try {
        console.log(`Attempt ${i}: Calling external pricing API...`)
        
        await circuitBreaker.execute(async () => {
          // Simulate external API call that fails
          if (i <= 4) {
            throw new Error('External API unavailable')
          }
          return { price: 45000 + Math.random() * 1000 }
        })
        
        console.log('✅ External API call successful')
        
      } catch (error) {
        if (error instanceof Error) {
          console.log(`❌ ${error.message}`)
        }
      }
      
      await sleep(1000)
    }
    
  } finally {
    await client.close()
  }
}

/**
 * Demonstrates comprehensive error monitoring and logging
 */
async function demonstrateErrorMonitoring(): Promise<void> {
  console.log('\n=== Error Monitoring & Logging ===')
  
  const errorMetrics = {
    connectionErrors: 0,
    queryErrors: 0,
    validationErrors: 0,
    batchErrors: 0,
    totalErrors: 0
  }
  
  const client = await ClientFactory.fromConnectionString(config.connectionString)
  
  try {
    // Set up error event listeners (simulated)
    const handleError = (error: Error, type: string) => {
      errorMetrics.totalErrors++
      
      switch (type) {
        case 'connection':
          errorMetrics.connectionErrors++
          break
        case 'query':
          errorMetrics.queryErrors++
          break
        case 'validation':
          errorMetrics.validationErrors++
          break
        case 'batch':
          errorMetrics.batchErrors++
          break
      }
      
      // Log error details
      console.log(`📊 Error recorded: ${type} - ${error.message}`)
      
      // In production, send to monitoring service
      sendToMonitoring({
        type,
        message: error.message,
        timestamp: new Date().toISOString(),
        stack: error.stack
      })
    }
    
    // Simulate various errors for monitoring
    const errorCases = [
      () => { throw new ValidationError('Invalid symbol format', 'symbol', 'INVALID!') },
      () => { throw new QueryError('Query timeout', new Error('Timeout')) },
      () => { throw new ConnectionError('Connection lost', new Error('Network error')) },
      () => { throw new BatchError('Batch validation failed', 2, 1, [new Error('Validation failed')]) }
    ]
    
    for (const [index, errorCase] of errorCases.entries()) {
      try {
        errorCase()
      } catch (error) {
        if (error instanceof Error) {
          const errorType = error.constructor.name.toLowerCase().replace('error', '')
          handleError(error, errorType)
        }
      }
    }
    
    // Display error metrics
    console.log('\n📈 Error Metrics Summary:')
    console.log(`Total Errors: ${errorMetrics.totalErrors}`)
    console.log(`Connection Errors: ${errorMetrics.connectionErrors}`)
    console.log(`Query Errors: ${errorMetrics.queryErrors}`)
    console.log(`Validation Errors: ${errorMetrics.validationErrors}`)
    console.log(`Batch Errors: ${errorMetrics.batchErrors}`)
    
    // Calculate error rates
    const totalOperations = 100 // Simulated
    const errorRate = (errorMetrics.totalErrors / totalOperations) * 100
    console.log(`Error Rate: ${errorRate.toFixed(2)}%`)
    
    if (errorRate > 5) {
      console.log('⚠️  High error rate detected - investigate system health')
    }
    
  } finally {
    await client.close()
  }
}

/**
 * Helper function: Get latest price with fallback logic
 */
async function getLatestPriceWithFallback(
  client: TimescaleClient,
  symbol: string
): Promise<{ price: number | null, source: string }> {
  try {
    // Primary: Get from TimescaleDB
    const latest = await client.getLatestPrice(symbol)
    return {
      price: latest,
      source: 'timescaledb'
    }
  } catch (error) {
    console.log(`❌ Primary source failed: ${error instanceof Error ? error.message : error}`)
    
    try {
      // Fallback 1: Get from cache/Redis (simulated)
      console.log('🔄 Trying cache fallback...')
      const cachedPrice = await getCachedPrice(symbol)
      return {
        price: cachedPrice,
        source: 'cache'
      }
    } catch (cacheError) {
      console.log(`❌ Cache fallback failed: ${cacheError instanceof Error ? cacheError.message : cacheError}`)
      
      // Fallback 2: External API (simulated)
      try {
        console.log('🔄 Trying external API fallback...')
        const externalPrice = await getExternalPrice(symbol)
        return {
          price: externalPrice,
          source: 'external_api'
        }
      } catch (apiError) {
        console.log(`❌ External API fallback failed: ${apiError instanceof Error ? apiError.message : apiError}`)
        
        // Final fallback: Return null with warning
        console.log('⚠️  All fallbacks exhausted - returning null')
        return {
          price: null,
          source: 'none'
        }
      }
    }
  }
}

/**
 * Helper function: Handle fallback mode operations
 */
async function handleFallbackMode(): Promise<void> {
  console.log('📱 Operating in fallback mode:')
  console.log('  - Using cached data where available')
  console.log('  - Queuing writes for later retry')
  console.log('  - Reducing query frequency')
  console.log('  - Alerting operations team')
  
  // Simulate fallback operations
  await sleep(1000)
  console.log('✅ Fallback mode configured')
}

/**
 * Helper function: Handle partial batch failure recovery
 */
async function handlePartialBatchFailure(error: BatchError): Promise<void> {
  console.log('🔧 Implementing batch recovery strategy:')
  console.log(`  - ${error.processedCount} records were saved successfully`)
  console.log(`  - ${error.failedCount} records failed validation`)
  console.log('  - Retrying failed records with corrections...')
  
  // In production, implement actual retry logic
  await sleep(1000)
  console.log('✅ Recovery strategy implemented')
}

/**
 * Helper function: Send error data to monitoring service
 */
function sendToMonitoring(errorData: any): void {
  // In production, send to actual monitoring service
  // console.log('📤 Sending to monitoring service:', JSON.stringify(errorData, null, 2))
}

/**
 * Simulated helper functions for fallback scenarios
 */
async function getCachedPrice(symbol: string): Promise<number> {
  // Simulate cache lookup
  await sleep(100)
  if (symbol === 'NONEXISTENT') {
    throw new Error('Symbol not found in cache')
  }
  return 45000 + Math.random() * 1000
}

async function getExternalPrice(symbol: string): Promise<number> {
  // Simulate external API call
  await sleep(500)
  if (symbol === 'NONEXISTENT') {
    throw new Error('Symbol not found in external API')
  }
  return 45000 + Math.random() * 1000
}

/**
 * Helper function: Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Main demonstration function
 */
async function main(): Promise<void> {
  console.log('🛡️  TimescaleDB Client - Error Handling Examples')
  console.log('=' .repeat(50))
  
  try {
    await demonstrateConnectionErrorHandling()
    await demonstrateQueryErrorHandling()
    await demonstrateBatchErrorHandling()
    await demonstrateCircuitBreaker()
    await demonstrateErrorMonitoring()
    
    console.log('\n✅ All error handling examples completed successfully!')
    console.log('\n📚 Key Takeaways:')
    console.log('  1. Always implement retry logic for transient failures')
    console.log('  2. Use specific error types for better error handling')
    console.log('  3. Implement fallback strategies for critical operations')
    console.log('  4. Monitor error rates and patterns in production')
    console.log('  5. Use circuit breakers for external dependencies')
    console.log('  6. Validate data early to prevent downstream errors')
    console.log('  7. Log errors with sufficient context for debugging')
    
  } catch (error) {
    console.error('❌ Failed to run error handling examples:', error)
    Deno.exit(1)
  }
}

// Run the examples
if (import.meta.main) {
  await main()
}