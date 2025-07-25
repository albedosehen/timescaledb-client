/**
 * Insert query builder unit tests
 *
 * Tests the SQL query generation for insert operations including
 * batch inserts, upserts, and error handling scenarios.
 */

import { afterEach, beforeEach, describe, it } from '@std/testing/bdd'
import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import { createMockSql, type MockSql } from '../../mocks/postgres.ts'
import { TestHelpers } from '../../utils/test_helpers.ts'
import { FinancialAssertions } from '../../utils/assertion_helpers.ts'
import { BatchError, ValidationError } from '../../../src/types/errors.ts'
import type { BatchResult, Ohlc, PriceTick } from '../../../src/types/interfaces.ts'
import {
  generateLargeTickDataset,
  INVALID_OHLC,
  INVALID_TICKS,
  SAMPLE_OHLC,
  SAMPLE_TICKS,
} from '../../fixtures/sample_data.ts'

// Mock insert operations (these would be implemented in src/queries/insert.ts)
interface InsertOptions {
  upsert?: boolean
  batchSize?: number
  useTransaction?: boolean
  timeoutMs?: number
  validate?: boolean
}

// Mock implementation for testing
const mockInsertOperations = {
  async insertTick(sql: MockSql, tick: PriceTick, options: InsertOptions = {}): Promise<void> {
    if (options.validate) {
      this.validateTick(tick)
    }

    const query = this.buildInsertTickQuery(tick, options)
    await sql`${query}`
  },

  async insertOhlc(sql: MockSql, candle: Ohlc, options: InsertOptions = {}): Promise<void> {
    if (options.validate) {
      this.validateOhlc(candle)
    }

    const query = this.buildInsertOhlcQuery(candle, options)
    await sql`${query}`
  },

  async insertManyTicks(sql: MockSql, ticks: PriceTick[], options: InsertOptions = {}): Promise<BatchResult> {
    const startTime = performance.now()
    let processed = 0
    let failed = 0
    const errors: Error[] = []

    if (ticks.length === 0) {
      return { processed: 0, failed: 0, durationMs: 0, errors: [] }
    }

    const batchSize = options.batchSize || 1000

    try {
      if (options.useTransaction) {
        await sql.begin(async (tx: MockSql) => {
          for (let i = 0; i < ticks.length; i += batchSize) {
            const batch = ticks.slice(i, i + batchSize)
            try {
              if (options.validate) {
                batch.forEach((tick) => this.validateTick(tick))
              }

              const query = this.buildBatchInsertTickQuery(batch, options)
              await tx`${query}`
              processed += batch.length
            } catch (error) {
              failed += batch.length
              errors.push(error instanceof Error ? error : new Error(String(error)))

              if (!options.upsert) {
                throw error // Fail fast if not using upsert
              }
            }
          }
        })
      } else {
        // Non-transactional batch insert
        for (let i = 0; i < ticks.length; i += batchSize) {
          const batch = ticks.slice(i, i + batchSize)
          try {
            if (options.validate) {
              batch.forEach((tick) => this.validateTick(tick))
            }

            const query = this.buildBatchInsertTickQuery(batch, options)
            await sql`${query}`
            processed += batch.length
          } catch (error) {
            failed += batch.length
            errors.push(error instanceof Error ? error : new Error(String(error)))
          }
        }
      }
    } catch (error) {
      throw new BatchError(
        `Batch insert failed: ${error instanceof Error ? error.message : String(error)}`,
        processed,
        failed,
        errors,
      )
    }

    const durationMs = Math.round(performance.now() - startTime)
    return { processed, failed, durationMs, errors }
  },

  async insertManyOhlc(sql: MockSql, candles: Ohlc[], options: InsertOptions = {}): Promise<BatchResult> {
    const startTime = performance.now()
    let processed = 0
    let failed = 0
    const errors: Error[] = []

    if (candles.length === 0) {
      return { processed: 0, failed: 0, durationMs: 0, errors: [] }
    }

    const batchSize = options.batchSize || 1000

    try {
      for (let i = 0; i < candles.length; i += batchSize) {
        const batch = candles.slice(i, i + batchSize)
        try {
          if (options.validate) {
            batch.forEach((candle) => this.validateOhlc(candle))
          }

          const query = this.buildBatchInsertOhlcQuery(batch, options)
          await sql`${query}`
          processed += batch.length
        } catch (error) {
          failed += batch.length
          errors.push(error instanceof Error ? error : new Error(String(error)))
        }
      }
    } catch (error) {
      throw new BatchError(
        `Batch OHLC insert failed: ${error instanceof Error ? error.message : String(error)}`,
        processed,
        failed,
        errors,
      )
    }

    const durationMs = Math.round(performance.now() - startTime)
    return { processed, failed, durationMs, errors }
  },

  buildInsertTickQuery(tick: PriceTick, options: InsertOptions): string {
    const upsertClause = options.upsert
      ? 'ON CONFLICT (symbol, time) DO UPDATE SET price = EXCLUDED.price, volume = EXCLUDED.volume'
      : ''

    return `
      INSERT INTO price_ticks (symbol, time, price, volume) 
      VALUES ('${tick.symbol}', '${tick.timestamp}', ${tick.price}, ${tick.volume || 'NULL'})
      ${upsertClause}
    `.trim()
  },

  buildInsertOhlcQuery(candle: Ohlc, options: InsertOptions): string {
    const upsertClause = options.upsert
      ? 'ON CONFLICT (symbol, interval_duration, time) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume'
      : ''

    return `
      INSERT INTO ohlc_data (symbol, time, interval_duration, open, high, low, close, volume) 
      VALUES ('${candle.symbol}', '${candle.timestamp}', '1m', ${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}, ${
      candle.volume || 'NULL'
    })
      ${upsertClause}
    `.trim()
  },

  buildBatchInsertTickQuery(ticks: PriceTick[], options: InsertOptions): string {
    const values = ticks.map((tick) =>
      `('${tick.symbol}', '${tick.timestamp}', ${tick.price}, ${tick.volume || 'NULL'})`
    ).join(', ')

    const upsertClause = options.upsert
      ? 'ON CONFLICT (symbol, time) DO UPDATE SET price = EXCLUDED.price, volume = EXCLUDED.volume'
      : ''

    return `
      INSERT INTO price_ticks (symbol, time, price, volume) 
      VALUES ${values}
      ${upsertClause}
    `.trim()
  },

  buildBatchInsertOhlcQuery(candles: Ohlc[], options: InsertOptions): string {
    const values = candles.map((candle) =>
      `('${candle.symbol}', '${candle.timestamp}', '1m', ${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}, ${
        candle.volume || 'NULL'
      })`
    ).join(', ')

    const upsertClause = options.upsert
      ? 'ON CONFLICT (symbol, interval_duration, time) DO UPDATE SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close, volume = EXCLUDED.volume'
      : ''

    return `
      INSERT INTO ohlc_data (symbol, time, interval_duration, open, high, low, close, volume) 
      VALUES ${values}
      ${upsertClause}
    `.trim()
  },

  validateTick(tick: PriceTick): void {
    if (!tick.symbol || tick.symbol.length === 0) {
      throw new ValidationError('Symbol is required', 'symbol', tick.symbol)
    }
    if (typeof tick.price !== 'number' || tick.price <= 0) {
      throw new ValidationError('Price must be a positive number', 'price', tick.price)
    }
    if (tick.volume !== undefined && (typeof tick.volume !== 'number' || tick.volume < 0)) {
      throw new ValidationError('Volume must be a non-negative number', 'volume', tick.volume)
    }
    if (!tick.timestamp) {
      throw new ValidationError('Timestamp is required', 'timestamp', tick.timestamp)
    }
  },

  validateOhlc(candle: Ohlc): void {
    if (!candle.symbol || candle.symbol.length === 0) {
      throw new ValidationError('Symbol is required', 'symbol', candle.symbol)
    }

    ;['open', 'high', 'low', 'close'].forEach((field) => {
      const value = candle[field as keyof Ohlc] as number
      if (typeof value !== 'number' || value <= 0) {
        throw new ValidationError(`${field} must be a positive number`, field, value)
      }
    })

    // OHLC relationships
    if (candle.high < candle.low) {
      throw new ValidationError('High cannot be less than low')
    }
    if (candle.high < candle.open || candle.high < candle.close) {
      throw new ValidationError('High must be >= open and close')
    }
    if (candle.low > candle.open || candle.low > candle.close) {
      throw new ValidationError('Low must be <= open and close')
    }

    if (candle.volume !== undefined && (typeof candle.volume !== 'number' || candle.volume < 0)) {
      throw new ValidationError('Volume must be a non-negative number', 'volume', candle.volume)
    }

    if (!candle.timestamp) {
      throw new ValidationError('Timestamp is required', 'timestamp', candle.timestamp)
    }
  },
}

describe('Insert Query Operations', () => {
  let mockSql: MockSql
  let testEnv: Awaited<ReturnType<typeof TestHelpers.createTestEnvironment>>

  beforeEach(() => {
    testEnv = TestHelpers.createTestEnvironment()
    mockSql = createMockSql({
      mockResults: [{ command: 'INSERT', rowCount: 1 }],
      captureQueries: true,
    })
  })

  afterEach(async () => {
    await TestHelpers.cleanupTestEnvironment(testEnv)
  })

  describe('Single Record Inserts', () => {
    it('should insert single price tick', async () => {
      const tick = SAMPLE_TICKS.at(0)
      if (!tick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run insert tests')
      }

      await mockInsertOperations.insertTick(mockSql, tick)

      assertEquals(mockSql.getQueryCount(), 1)
      const lastQuery = mockSql.getLastQuery()
      assert(lastQuery?.query.includes('INSERT INTO price_ticks'))
      assert(lastQuery?.query.includes(tick.symbol))
      assert(lastQuery?.query.includes(tick.price.toString()))
    })

    it('should insert single OHLC candle', async () => {
      const candle = SAMPLE_OHLC.at(0)
      if (!candle) {
        throw new Error('SAMPLE_OHLC is empty - cannot run insert tests')
      }

      await mockInsertOperations.insertOhlc(mockSql, candle)

      assertEquals(mockSql.getQueryCount(), 1)
      const lastQuery = mockSql.getLastQuery()
      assert(lastQuery?.query.includes('INSERT INTO ohlc_data'))
      assert(lastQuery?.query.includes(candle.symbol))
      assert(lastQuery?.query.includes(candle.open.toString()))
    })

    it('should insert with upsert option', async () => {
      const tick = SAMPLE_TICKS.at(0)
      if (!tick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run upsert tests')
      }
      const options: InsertOptions = { upsert: true }

      await mockInsertOperations.insertTick(mockSql, tick, options)

      const lastQuery = mockSql.getLastQuery()
      assert(lastQuery?.query.includes('ON CONFLICT'))
      assert(lastQuery?.query.includes('DO UPDATE SET'))
    })

    it('should insert without upsert option', async () => {
      const tick = SAMPLE_TICKS.at(0)
      if (!tick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run upsert tests')
      }
      const options: InsertOptions = { upsert: false }

      await mockInsertOperations.insertTick(mockSql, tick, options)

      const lastQuery = mockSql.getLastQuery()
      assert(!lastQuery?.query.includes('ON CONFLICT'))
    })

    it('should handle tick with no volume', async () => {
      const tick: PriceTick = {
        symbol: 'BTCUSD',
        price: 45000,
        timestamp: '2024-01-15T10:00:00.000Z',
        // No volume field
      }

      await mockInsertOperations.insertTick(mockSql, tick)

      const lastQuery = mockSql.getLastQuery()
      assert(lastQuery?.query.includes('NULL'))
    })

    it('should validate input when validation enabled', async () => {
      const invalidTick = INVALID_TICKS.negativePrice
      const options: InsertOptions = { validate: true }

      await assertRejects(
        () => mockInsertOperations.insertTick(mockSql, invalidTick as PriceTick, options),
        ValidationError,
        'Price must be a positive number',
      )
    })

    it('should skip validation when disabled', async () => {
      const invalidTick = INVALID_TICKS.negativePrice
      const options: InsertOptions = { validate: false }

      // Should not throw during validation
      await mockInsertOperations.insertTick(mockSql, invalidTick as PriceTick, options)

      assertEquals(mockSql.getQueryCount(), 1)
    })
  })

  describe('Batch Inserts', () => {
    it('should insert batch of ticks successfully', async () => {
      const ticks = [...SAMPLE_TICKS.slice(0, 3)]

      const result = await mockInsertOperations.insertManyTicks(mockSql, ticks)

      assertEquals(result.processed, 3)
      assertEquals(result.failed, 0)
      assert(result.durationMs >= 0)
      assertEquals(result.errors?.length || 0, 0)
      assertEquals(mockSql.getQueryCount(), 1) // Single batch query
    })

    it('should insert batch of OHLC candles successfully', async () => {
      const candles = [...SAMPLE_OHLC.slice(0, 2)]

      const result = await mockInsertOperations.insertManyOhlc(mockSql, candles)

      assertEquals(result.processed, 2)
      assertEquals(result.failed, 0)
      assertEquals(result.errors?.length || 0, 0)
    })

    it('should handle empty batch', async () => {
      const result = await mockInsertOperations.insertManyTicks(mockSql, [])

      assertEquals(result.processed, 0)
      assertEquals(result.failed, 0)
      assertEquals(result.durationMs, 0)
      assertEquals(result.errors?.length || 0, 0)
      assertEquals(mockSql.getQueryCount(), 0) // No queries executed
    })

    it('should handle large batch with custom batch size', async () => {
      const largeBatch = generateLargeTickDataset(2500)
      const options: InsertOptions = { batchSize: 1000 }

      const result = await mockInsertOperations.insertManyTicks(mockSql, largeBatch, options)

      assertEquals(result.processed, 2500)
      assertEquals(result.failed, 0)
      assertEquals(mockSql.getQueryCount(), 3) // 3 batch queries (1000, 1000, 500)
    })

    it('should use transactions when specified', async () => {
      const ticks = [...SAMPLE_TICKS.slice(0, 3)]
      const options: InsertOptions = { useTransaction: true }

      const result = await mockInsertOperations.insertManyTicks(mockSql, ticks, options)

      assertEquals(result.processed, 3)
      assertEquals(result.failed, 0)
    })

    it('should handle partial batch failures gracefully', async () => {
      const firstTick = SAMPLE_TICKS.at(0)
      const secondTick = SAMPLE_TICKS.at(1)
      if (!firstTick || !secondTick) {
        throw new Error('SAMPLE_TICKS does not have enough elements for batch failure test')
      }

      const ticks = [
        firstTick,
        INVALID_TICKS.negativePrice as PriceTick,
        secondTick,
      ]
      const options: InsertOptions = { validate: true, batchSize: 1 }

      const result = await mockInsertOperations.insertManyTicks(mockSql, ticks, options)

      // Should have 2 successful and 1 failed
      assertEquals(result.processed, 2)
      assertEquals(result.failed, 1)
      assertEquals(result.errors?.length || 0, 1)
      assert(result.errors && result.errors[0] instanceof ValidationError)
    })

    it('should fail fast on transaction errors when not using upsert', async () => {
      const failingMock = createMockSql({
        shouldThrow: new Error('Constraint violation'),
      })

      const ticks = [...SAMPLE_TICKS.slice(0, 3)]
      const options: InsertOptions = { useTransaction: true, upsert: false }

      await assertRejects(
        () => mockInsertOperations.insertManyTicks(failingMock, ticks, options),
        BatchError,
        'Batch insert failed',
      )
    })
  })

  describe('Query Generation', () => {
    it('should generate correct INSERT query for ticks', () => {
      const tick = SAMPLE_TICKS.at(0)
      if (!tick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run query generation tests')
      }
      const query = mockInsertOperations.buildInsertTickQuery(tick, {})

      assert(query.includes('INSERT INTO price_ticks'))
      assert(query.includes('symbol, time, price, volume'))
      assert(query.includes(tick.symbol))
      assert(query.includes(tick.price.toString()))
      assert(query.includes(tick.timestamp))
    })

    it('should generate correct INSERT query for OHLC', () => {
      const candle = SAMPLE_OHLC.at(0)
      if (!candle) {
        throw new Error('SAMPLE_OHLC is empty - cannot run query generation tests')
      }
      const query = mockInsertOperations.buildInsertOhlcQuery(candle, {})

      assert(query.includes('INSERT INTO ohlc_data'))
      assert(query.includes('symbol, time, interval_duration, open, high, low, close, volume'))
      assert(query.includes(candle.symbol))
      assert(query.includes(candle.open.toString()))
      assert(query.includes(candle.high.toString()))
      assert(query.includes(candle.low.toString()))
      assert(query.includes(candle.close.toString()))
    })

    it('should generate batch INSERT query', () => {
      const ticks = [...SAMPLE_TICKS.slice(0, 2)]
      const query = mockInsertOperations.buildBatchInsertTickQuery(ticks, {})

      assert(query.includes('INSERT INTO price_ticks'))
      assert(query.includes('VALUES'))

      // Should contain values for both ticks
      ticks.forEach((tick) => {
        assert(query.includes(tick.symbol))
        assert(query.includes(tick.price.toString()))
      })
    })

    it('should include UPSERT clause when requested', () => {
      const tick = SAMPLE_TICKS.at(0)
      if (!tick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run upsert query tests')
      }
      const query = mockInsertOperations.buildInsertTickQuery(tick, { upsert: true })

      assert(query.includes('ON CONFLICT (symbol, time)'))
      assert(query.includes('DO UPDATE SET'))
      assert(query.includes('price = EXCLUDED.price'))
      assert(query.includes('volume = EXCLUDED.volume'))
    })

    it('should handle NULL volumes correctly', () => {
      const tickWithoutVolume: PriceTick = {
        symbol: 'BTCUSD',
        price: 45000,
        timestamp: '2024-01-15T10:00:00.000Z',
      }

      const query = mockInsertOperations.buildInsertTickQuery(tickWithoutVolume, {})
      assert(query.includes('NULL'))
    })

    it('should generate proper OHLC batch query', () => {
      const candles = [...SAMPLE_OHLC.slice(0, 2)]
      const query = mockInsertOperations.buildBatchInsertOhlcQuery(candles, { upsert: true })

      assert(query.includes('INSERT INTO ohlc_data'))
      assert(query.includes('ON CONFLICT (symbol, interval_duration, time)'))

      // Should contain values for both candles
      candles.forEach((candle) => {
        assert(query.includes(candle.symbol))
        assert(query.includes(candle.open.toString()))
      })
    })
  })

  describe('Validation', () => {
    it('should validate tick fields correctly', () => {
      const firstTick = SAMPLE_TICKS.at(0)
      if (!firstTick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run validation tests')
      }

      // Valid tick should not throw
      mockInsertOperations.validateTick(firstTick)

      // Invalid ticks should throw
      Object.entries(INVALID_TICKS).forEach(([key, invalidTick]) => {
        assertThrows(
          () => mockInsertOperations.validateTick(invalidTick as PriceTick),
          ValidationError,
          `Invalid tick ${key} should fail validation`,
        )
      })
    })

    it('should validate OHLC fields correctly', () => {
      const firstOhlc = SAMPLE_OHLC.at(0)
      if (!firstOhlc) {
        throw new Error('SAMPLE_OHLC is empty - cannot run validation tests')
      }

      // Valid OHLC should not throw
      mockInsertOperations.validateOhlc(firstOhlc)

      // Invalid OHLC should throw
      Object.entries(INVALID_OHLC).forEach(([key, invalidOhlc]) => {
        assertThrows(
          () => mockInsertOperations.validateOhlc(invalidOhlc as Ohlc),
          ValidationError,
          `Invalid OHLC ${key} should fail validation`,
        )
      })
    })

    it('should validate OHLC price relationships', () => {
      const invalidOhlc: Ohlc = {
        symbol: 'BTCUSD',
        timestamp: '2024-01-15T10:00:00.000Z',
        open: 45000,
        high: 44000, // High < Open (invalid)
        low: 44500,
        close: 44800,
      }

      assertThrows(
        () => mockInsertOperations.validateOhlc(invalidOhlc),
        ValidationError,
        'High must be >= open and close',
      )
    })

    it('should validate tick with specific error messages', () => {
      try {
        mockInsertOperations.validateTick({
          symbol: '',
          price: 45000,
          timestamp: '2024-01-15T10:00:00.000Z',
        })
        assert(false, 'Should have thrown ValidationError')
      } catch (error) {
        assert(error instanceof ValidationError)
        assertEquals(error.field, 'symbol')
        assert(error.message.includes('Symbol is required'))
      }
    })

    it('should provide detailed validation errors', () => {
      const invalidTick: PriceTick = {
        symbol: 'BTCUSD',
        price: -100, // Invalid negative price
        volume: -5, // Invalid negative volume
        timestamp: '2024-01-15T10:00:00.000Z',
      }

      assertThrows(
        () => mockInsertOperations.validateTick(invalidTick),
        ValidationError,
        'Price must be a positive number',
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle database constraint violations', async () => {
      const constraintViolationMock = createMockSql({
        shouldThrow: new Error('Unique constraint violation'),
      })

      const tick = SAMPLE_TICKS.at(0)
      if (!tick) {
        throw new Error('SAMPLE_TICKS is empty - cannot run constraint violation tests')
      }

      await assertRejects(
        () => mockInsertOperations.insertTick(constraintViolationMock, tick),
        Error,
        'Unique constraint violation',
      )
    })

    it('should handle network timeouts', async () => {
      const timeoutMock = createMockSql({
        shouldThrow: new Error('Query timeout'),
      })

      const ticks = [...SAMPLE_TICKS.slice(0, 3)]

      await assertRejects(
        () => mockInsertOperations.insertManyTicks(timeoutMock, ticks),
        BatchError,
        'Batch insert failed',
      )
    })

    it('should collect multiple validation errors in batch', async () => {
      const firstTick = SAMPLE_TICKS.at(0)
      const secondTick = SAMPLE_TICKS.at(1)
      if (!firstTick || !secondTick) {
        throw new Error('SAMPLE_TICKS does not have enough elements for batch error test')
      }

      const mixedTicks = [
        firstTick,
        INVALID_TICKS.negativePrice as PriceTick,
        INVALID_TICKS.emptySymbol as PriceTick,
        secondTick,
      ]

      const options: InsertOptions = { validate: true, batchSize: 1 }
      const result = await mockInsertOperations.insertManyTicks(mockSql, mixedTicks, options)

      assertEquals(result.processed, 2) // 2 valid ticks
      assertEquals(result.failed, 2) // 2 invalid ticks
      assertEquals(result.errors?.length || 0, 2)
      result.errors?.forEach((error) => {
        assert(error instanceof ValidationError)
      })
    })

    it('should handle transaction rollback', async () => {
      const rollbackMock = createMockSql({
        shouldThrow: new Error('Transaction rolled back'),
      })

      const ticks = [...SAMPLE_TICKS.slice(0, 3)]
      const options: InsertOptions = { useTransaction: true }

      await assertRejects(
        () => mockInsertOperations.insertManyTicks(rollbackMock, ticks, options),
        BatchError,
      )
    })
  })

  describe('Performance and Optimization', () => {
    it('should handle large datasets efficiently', async () => {
      const largeBatch = generateLargeTickDataset(5000)
      const startTime = performance.now()

      const result = await mockInsertOperations.insertManyTicks(mockSql, largeBatch, {
        batchSize: 1000,
      })

      const duration = performance.now() - startTime

      assertEquals(result.processed, 5000)
      assertEquals(result.failed, 0)
      assert(duration < 1000) // Should complete within 1 second with mocks
    })

    it('should optimize batch sizes appropriately', async () => {
      const testSizes = [100, 500, 1000, 2000]

      for (const size of testSizes) {
        const batch = generateLargeTickDataset(size * 2)
        const result = await mockInsertOperations.insertManyTicks(mockSql, batch, {
          batchSize: size,
        })

        assertEquals(result.processed, size * 2)
        assertEquals(result.failed, 0)

        // Number of queries should be ceil(totalRecords / batchSize)
        // Note: This would need to be verified with actual query counting
      }
    })

    it('should track execution metrics', async () => {
      const ticks = [...SAMPLE_TICKS.slice(0, 10)]

      const result = await mockInsertOperations.insertManyTicks(mockSql, ticks)

      // Should provide timing information
      assert(result.durationMs >= 0)
      assert(typeof result.durationMs === 'number')

      // Should provide accurate counts
      assertEquals(result.processed + result.failed, ticks.length)
    })
  })

  describe('Integration with Financial Assertions', () => {
    it('should work with validated financial data', async () => {
      // Pre-validate data using our financial assertions
      SAMPLE_TICKS.forEach((tick) => {
        FinancialAssertions.assertValidPriceTick(tick)
      })

      // Insert should succeed
      const result = await mockInsertOperations.insertManyTicks(mockSql, [...SAMPLE_TICKS])

      assertEquals(result.processed, SAMPLE_TICKS.length)
      assertEquals(result.failed, 0)
    })

    it('should work with validated OHLC data', async () => {
      // Pre-validate OHLC data
      SAMPLE_OHLC.forEach((candle) => {
        FinancialAssertions.assertValidOhlc(candle)
      })

      // Insert should succeed
      const result = await mockInsertOperations.insertManyOhlc(mockSql, [...SAMPLE_OHLC])

      assertEquals(result.processed, SAMPLE_OHLC.length)
      assertEquals(result.failed, 0)
    })
  })
})
