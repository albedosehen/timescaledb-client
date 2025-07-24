/**
 * Basic Integration Test Example
 * 
 * Demonstrates how to test the TimescaleDB client with realistic scenarios
 * that combine multiple components working together.
 */

import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assert } from '@std/assert'
import { TimescaleClient } from '../../src/client.ts'
import { type MockSql, MockSqlFactory } from '../mocks/postgres.ts'
import { TestHelpers } from '../utils/test_helpers.ts'
import { FinancialAssertions } from '../utils/assertion_helpers.ts'
import type { PriceTick } from '../../src/types/interfaces.ts'
import {
  SAMPLE_TICKS,
  SAMPLE_OHLC,
  TIME_RANGES,
  generateLargeTickDataset
} from '../fixtures/sample_data.ts'
import { VALID_CLIENT_OPTIONS } from '../fixtures/config_data.ts'

describe('Integration Tests - Basic Scenarios', () => {
  let client: TimescaleClient
  let mockSql: MockSql
  let testEnv: Awaited<ReturnType<typeof TestHelpers.createTestEnvironment>>

  beforeAll(async () => {
    // Set up test environment
    testEnv = TestHelpers.createTestEnvironment()
  })

  afterAll(async () => {
    await TestHelpers.cleanupTestEnvironment(testEnv)
  })

  beforeEach(async () => {
    // Create fresh mock SQL instance for each test
    mockSql = MockSqlFactory.createSuccessfulMock([
      { command: 'INSERT', rowCount: 1 },
      { test: 1, timestamp: new Date() }
    ])
    
    // Create client with test configuration
    const config = VALID_CLIENT_OPTIONS.testing
    client = new TimescaleClient(mockSql, config)
    await client.initialize()
  })

  afterEach(async () => {
    if (client && !client.isClosed) {
      await client.close()
    }
  })

  describe('Complete Data Lifecycle', () => {
    it('should handle complete tick data workflow', async () => {
      // 1. Insert single tick
      const singleTick = SAMPLE_TICKS.at(0)
      if (!singleTick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run workflow tests')
      }
      await client.insertTick(singleTick)
      
      // 2. Insert batch of ticks
      const batchTicks = [...SAMPLE_TICKS.slice(1, 4)]
      const batchResult = await client.insertManyTicks(batchTicks)
      
      assertEquals(batchResult.processed, 3)
      assertEquals(batchResult.failed, 0)
      
      // 3. Query the data back
      mockSql.setMockResults(
        SAMPLE_TICKS.map(tick => ({
          symbol: tick.symbol,
          price: tick.price,
          volume: tick.volume,
          time: new Date(tick.timestamp)
        }))
      )
      
      const retrievedTicks = await client.getTicks('BTCUSD', TIME_RANGES.hour)
      
      assert(Array.isArray(retrievedTicks))
      retrievedTicks.forEach(tick => {
        FinancialAssertions.assertValidPriceTick(tick)
      })
      
      // 4. Get latest price
      mockSql.setMockResults([{ price: 45000.50 }])
      const latestPrice = await client.getLatestPrice('BTCUSD')
      assertEquals(latestPrice, 45000.50)
      
      // Verify all operations were executed
      assert(mockSql.getQueryCount() > 0)
    })

    it('should handle complete OHLC data workflow', async () => {
      // 1. Insert OHLC data
      const candles = [...SAMPLE_OHLC.slice(0, 2)]
      const batchResult = await client.insertManyOhlc(candles)
      
      assertEquals(batchResult.processed, 2)
      assertEquals(batchResult.failed, 0)
      
      // 2. Query OHLC data back
      mockSql.setMockResults(
        candles.map(candle => ({
          symbol: candle.symbol,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          time: new Date(candle.timestamp)
        }))
      )
      
      const retrievedCandles = await client.getOhlc('BTCUSD', '1h', TIME_RANGES.hour)
      
      assert(Array.isArray(retrievedCandles))
      retrievedCandles.forEach(candle => {
        FinancialAssertions.assertValidOhlc(candle)
      })
      
      // Verify OHLC price relationships
      retrievedCandles.forEach(candle => {
        assert(candle.high >= candle.low)
        assert(candle.high >= candle.open)
        assert(candle.high >= candle.close)
        assert(candle.low <= candle.open)
        assert(candle.low <= candle.close)
      })
    })

    it('should handle analytics workflow', async () => {
      // 1. Insert historical data
      const historicalTicks = generateLargeTickDataset(100, 'BTCUSD')
      const insertResult = await client.insertManyTicks(historicalTicks)
      assertEquals(insertResult.processed, 100)
      
      // 2. Calculate price delta
      mockSql.setMockResults([{
        symbol: 'BTCUSD',
        fromPrice: 45000,
        toPrice: 45500,
        delta: 500,
        percentChange: 1.11,
        fromTime: new Date('2024-01-15T10:00:00.000Z'),
        toTime: new Date('2024-01-15T11:00:00.000Z')
      }])
      
      const priceDelta = await client.getPriceDelta(
        'BTCUSD',
        new Date('2024-01-15T10:00:00.000Z'),
        new Date('2024-01-15T11:00:00.000Z')
      )
      
      assertEquals(priceDelta.delta, 500)
      assertEquals(priceDelta.percentChange, 1.11)
      
      // 3. Calculate volatility
      mockSql.setMockResults([{ volatility: 0.035 }])
      const volatility = await client.getVolatility('BTCUSD', 24)
      assertEquals(volatility, 0.035)
      
      // 4. Calculate moving average
      mockSql.setMockResults([
        { timestamp: new Date(), value: 45000 },
        { timestamp: new Date(), value: 45100 }
      ])
      
      const sma = await client.calculateSMA('BTCUSD', 20, TIME_RANGES.day)
      assertEquals(sma.length, 2)
      const firstSma = sma.at(0)
      if (!firstSma) {
        throw new Error('SMA result is empty - cannot verify value')
      }
      assertEquals(firstSma.value, 45000)
    })
  })

  describe('Error Recovery Scenarios', () => {
    it('should recover from connection failures', async () => {
      // Simulate connection failure during batch insert
      const failingMock = MockSqlFactory.createFailingMock(new Error('Connection lost'))
      const failingClient = new TimescaleClient(failingMock, VALID_CLIENT_OPTIONS.testing)
      await failingClient.initialize()
      
      const testTick = SAMPLE_TICKS[0]
      if (!testTick) {
        throw new Error('SAMPLE_TICKS[0] is undefined')
      }

      try {
        // This should fail
        await failingClient.insertTick(testTick)
        assert(false, 'Should have thrown an error')
      } catch (error) {
        assert(error instanceof Error)
        assert(error.message.includes('Connection lost'))
      }
      
      await failingClient.close()
      
      // Recovery: use working client
      await client.insertTick(testTick)
      assertEquals(mockSql.getQueryCount(), 1)
    })

    it('should handle partial batch failures gracefully', async () => {
      // Create mixed batch with valid and invalid data
      const mixedData = [
        SAMPLE_TICKS[0],
        { 
          symbol: 'INVALID',
          price: -100, // Invalid negative price
          timestamp: '2024-01-15T10:00:00.000Z'
        },
        SAMPLE_TICKS[1]
      ]
      
      // Configure mock to succeed for valid data
      mockSql.setMockResults([
        { processed: 2, failed: 1, durationMs: 100, errors: [new Error('Invalid price')] }
      ])
      
      // Filter out undefined values for type safety
      const validMixedData = mixedData.filter((tick): tick is PriceTick => tick !== undefined)
      const result = await client.insertManyTicks(validMixedData)
      
      // Should process valid records and report failures
      assertEquals(result.processed, 2)
      assertEquals(result.failed, 1)
    })

    it('should handle schema validation and creation', async () => {
      // Mock schema creation queries
      mockSql.setMockResults([
        // Check existing tables
        { table_name: 'other_table' },
        // Create price_ticks table
        { command: 'CREATE_TABLE' },
        // Create hypertable
        { result: 'hypertable_created' },
        // Create ohlc_data table
        { command: 'CREATE_TABLE' },
        // Create hypertable
        { result: 'hypertable_created' },
        // Create indexes
        { command: 'CREATE_INDEX' }
      ])
      
      // Client with auto schema creation
      const schemaClient = new TimescaleClient(mockSql, {
        ...VALID_CLIENT_OPTIONS.testing,
        autoEnsureSchema: true,
        autoCreateIndexes: true
      })
      
      await schemaClient.initialize()
      
      // Verify schema was created
      await schemaClient.ensureSchema()
      
      // Should be able to insert data after schema creation
      const firstTick = SAMPLE_TICKS[0]
      if (!firstTick) throw new Error('SAMPLE_TICKS[0] is undefined')
      await schemaClient.insertTick(firstTick)
      
      await schemaClient.close()
    })
  })

  describe('Performance and Scalability', () => {
    it('should handle large dataset efficiently', async () => {
      const largeDataset = generateLargeTickDataset(5000, 'BTCUSD')
      
      // Mock successful batch processing
      mockSql.setMockResults([
        { processed: 5000, failed: 0, durationMs: 250, errors: [] }
      ])
      
      const startTime = performance.now()
      const result = await client.insertManyTicks(largeDataset)
      const duration = performance.now() - startTime
      
      assertEquals(result.processed, 5000)
      assertEquals(result.failed, 0)
      
      // Performance assertion (with mocks should be very fast)
      assert(duration < 1000, `Operation took ${duration}ms, expected < 1000ms`)
    })

    it('should handle concurrent operations', async () => {
      // Simulate concurrent inserts
      const tick0 = SAMPLE_TICKS[0]
      const tick1 = SAMPLE_TICKS[1]
      const tick2 = SAMPLE_TICKS[2]
      if (!tick0 || !tick1 || !tick2) {
        throw new Error('Required SAMPLE_TICKS are undefined')
      }

      const operations = [
        client.insertTick(tick0),
        client.insertTick(tick1),
        client.insertTick(tick2)
      ]
      
      await Promise.all(operations)
      
      // All operations should complete successfully
      assertEquals(mockSql.getQueryCount(), 3)
    })

    it('should provide accurate health monitoring', async () => {
      // Mock health check response
      mockSql.setMockResults([
        { test: 1, timestamp: new Date() },
        { version: '2.12.1', database: 'test_db' }
      ])
      
      const health = await client.healthCheck()
      
      assert(health.isHealthy)
      assert(health.responseTimeMs >= 0)
      assertEquals(health.version, '2.12.1')
      assertEquals(health.database, 'test_db')
      assert(health.timestamp instanceof Date)
    })
  })

  describe('Configuration and Customization', () => {
    it('should work with different configurations', async () => {
      // Test with production-like configuration
      const prodClient = new TimescaleClient(mockSql, VALID_CLIENT_OPTIONS.production)
      
      await prodClient.initialize()
      const firstTick = SAMPLE_TICKS[0]
      if (!firstTick) throw new Error('SAMPLE_TICKS[0] is undefined')
      await prodClient.insertTick(firstTick)
      await prodClient.close()
      
      // Test with development configuration
      const devClient = new TimescaleClient(mockSql, VALID_CLIENT_OPTIONS.development)
      
      await devClient.initialize()
      await devClient.insertTick(firstTick)
      await devClient.close()
      
      // Both should work successfully
      assert(mockSql.getQueryCount() >= 2)
    })

    it('should handle custom error handlers', async () => {
      const customConfig = {
        ...VALID_CLIENT_OPTIONS.testing,
        errorHandlers: {
          onValidationError: () => {
            // Error handler for validation errors
          }
        }
      }
      
      const errorMock = MockSqlFactory.createFailingMock(
        new Error('Validation failed')
      )
      
      const customClient = new TimescaleClient(errorMock, customConfig)
      await customClient.initialize()
      
      try {
        const firstTick = SAMPLE_TICKS[0]
        if (!firstTick) throw new Error('SAMPLE_TICKS[0] is undefined')
        await customClient.insertTick(firstTick)
      } catch {
        // Expected to fail
      }
      
      await customClient.close()
    })
  })

  describe('Data Integrity and Validation', () => {
    it('should maintain data consistency across operations', async () => {
      // Insert OHLC data
      const testCandle = SAMPLE_OHLC[0]
      if (!testCandle) throw new Error('SAMPLE_OHLC[0] is undefined')

      await client.insertOhlc(testCandle)
      
      // Mock query response with same data
      mockSql.setMockResults([{
        symbol: testCandle.symbol,
        open: testCandle.open,
        high: testCandle.high,
        low: testCandle.low,
        close: testCandle.close,
        volume: testCandle.volume,
        time: new Date(testCandle.timestamp)
      }])
      
      // Query back and verify integrity
      const retrieved = await client.getOhlc('BTCUSD', '1h', TIME_RANGES.hour)
      
      assertEquals(retrieved.length, 1)
      const retrievedCandle = retrieved[0]
      if (!retrievedCandle) throw new Error('Retrieved candle is undefined')
      
      // Verify OHLC relationships are maintained
      assert(retrievedCandle.high >= retrievedCandle.low)
      assert(retrievedCandle.high >= retrievedCandle.open)
      assert(retrievedCandle.high >= retrievedCandle.close)
      assert(retrievedCandle.low <= retrievedCandle.open)
      assert(retrievedCandle.low <= retrievedCandle.close)
      
      // Verify data matches what was inserted
      assertEquals(retrievedCandle.symbol, testCandle.symbol)
      assertEquals(retrievedCandle.open, testCandle.open)
      assertEquals(retrievedCandle.high, testCandle.high)
      assertEquals(retrievedCandle.low, testCandle.low)
      assertEquals(retrievedCandle.close, testCandle.close)
    })

    it('should validate financial data relationships', async () => {
      // Test with sample data that should pass all validations
      for (const tick of SAMPLE_TICKS) {
        FinancialAssertions.assertValidPriceTick(tick)
        await client.insertTick(tick)
      }
      
      for (const candle of SAMPLE_OHLC) {
        FinancialAssertions.assertValidOhlc(candle)
        await client.insertOhlc(candle)
      }
      
      // All operations should complete without validation errors
      assert(mockSql.getQueryCount() === SAMPLE_TICKS.length + SAMPLE_OHLC.length)
    })
  })

  describe('Real-world Usage Patterns', () => {
    it('should handle typical trading day scenario', async () => {
      // Simulate a trading day workflow
      
      // 1. Market open - insert opening ticks
      const openingTicks = SAMPLE_TICKS.slice(0, 2)
      for (const tick of openingTicks) {
        await client.insertTick(tick)
      }
      
      // 2. Continuous data - batch insert
      const continuousData = generateLargeTickDataset(1000, 'BTCUSD')
      mockSql.setMockResults([
        { processed: 1000, failed: 0, durationMs: 150, errors: [] }
      ])
      
      const batchResult = await client.insertManyTicks(continuousData)
      assertEquals(batchResult.processed, 1000)
      
      // 3. Generate OHLC from ticks
      mockSql.setMockResults(SAMPLE_OHLC.slice(0, 1).map(candle => ({
        symbol: candle.symbol,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        time: new Date(candle.timestamp)
      })))
      const ohlcData = await client.getOhlcFromTicks('BTCUSD', 60, TIME_RANGES.hour)
      assert(Array.isArray(ohlcData))
      
      // 4. Calculate analytics
      mockSql.setMockResults([{ volatility: 0.025 }])
      const dailyVolatility = await client.getVolatility('BTCUSD', 24)
      assert(typeof dailyVolatility === 'number')
      
      // 5. Health check
      mockSql.setMockResults([
        { test: 1, timestamp: new Date() },
        { version: '2.12.1', database: 'trading_db' }
      ])
      
      const health = await client.healthCheck()
      assert(health.isHealthy)
      
      // Verify all operations completed
      assert(mockSql.getQueryCount() > 0)
    })
  })
})