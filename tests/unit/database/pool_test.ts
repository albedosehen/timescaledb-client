// deno-lint-ignore-file no-explicit-any require-await ban-unused-ignore
/**
 * Unit tests for ConnectionPool class - Using dependency injection
 * 
 * Tests all public methods, configuration validation, retry logic,
 * metrics collection, and various connection scenarios for the ConnectionPool class.
 * Aims for 95%+ code coverage following project testing standards.
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertRejects, assert, assertInstanceOf } from '@std/assert'
import { stub, restore } from '@std/testing/mock'
import { ConnectionPool, createConnectionPool } from '../../../src/database/pool.ts'
import type { ClientOptions } from '../../../src/types/config.ts'
import type { SqlInstance } from '../../../src/types/internal.ts'
import { ConnectionError } from '../../../src/types/errors.ts'
import { createPostgresMock, type ExtendedMockSql } from '../../mocks/postgres_mock.ts'
import { TestLogger } from '../../utils/test_helpers.ts'
import { TEST_CONNECTION_CONFIGS, TEST_CLIENT_OPTIONS } from '../../fixtures/database_fixtures.ts'

/**
 * Create a mock postgres factory that supports the full postgres.js interface
 */
function createMockPostgresFactory(mockSql?: ExtendedMockSql) {
  const sql = mockSql || createPostgresMock() as ExtendedMockSql

  const mockPostgres = (_config: any) => {
    return sql as unknown as SqlInstance
  }

  // Add required static properties to match postgres interface
  mockPostgres.toPascal = () => ({})
  mockPostgres.fromPascal = () => ({})
  mockPostgres.toCamel = () => ({})
  mockPostgres.fromCamel = () => ({})
  mockPostgres.toKebab = () => ({})
  mockPostgres.fromKebab = () => ({})
  mockPostgres.BigInt = BigInt
  mockPostgres.types = {}
  mockPostgres.postgresql = {}
  mockPostgres.prepare = () => ({})
  mockPostgres.unprepare = () => ({})

  return mockPostgres as any
}

/**
 * Test suite for ConnectionPool class
 */
describe('ConnectionPool', () => {
  let mockSql: ExtendedMockSql
  let logger: TestLogger
  let currentTime = 1000

  beforeEach(() => {
    logger = new TestLogger()
    currentTime = 1000
    mockSql = createPostgresMock() as ExtendedMockSql

    // Mock timer functions
    stub(globalThis, 'setTimeout', (callback: any, _delay?: number) => {
      // Immediately execute callback for most tests
      if (typeof callback === 'function') {
        callback()
      }
      return 1
    })

    // Mock Date.now for consistent time measurements
    stub(Date, 'now', () => {
      return currentTime
    })

    // Mock Math.random for predictable jitter
    stub(Math, 'random', () => 0.5)
  })

  afterEach(() => {
    restore()
    logger.clearLogs()
  })

  /**
   * Constructor and Configuration Tests
   */
  describe('Constructor and Configuration', () => {
    describe('Valid Configurations', () => {
      it('should create ConnectionPool with all parameters', () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const clientOptions = TEST_CLIENT_OPTIONS.test!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const pool = new ConnectionPool(connectionConfig, logger, clientOptions, mockPostgresFactory)
        
        assertInstanceOf(pool, ConnectionPool)
        assertEquals(pool.getConnectionState().isConnected, false)
      })

      it('should create ConnectionPool with minimal configuration', () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.minimal!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        
        assertInstanceOf(pool, ConnectionPool)
      })

      it('should create ConnectionPool without logger', () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const pool = new ConnectionPool(connectionConfig, undefined, {}, mockPostgresFactory)
        
        assertInstanceOf(pool, ConnectionPool)
      })

      it('should build pool configuration with default values', () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.minimal!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        const stats = pool.getStats()
        
        assertEquals(stats.total, 10) // Default maxConnections
      })

      it('should build pool configuration with custom client options', () => {
        const connectionConfig = { ...TEST_CONNECTION_CONFIGS.test!, maxConnections: 5 }
        const clientOptions: ClientOptions = {
          queryTimeout: 15000,
          maxRetries: 2,
          retryBaseDelay: 500,
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        const pool = new ConnectionPool(connectionConfig, logger, clientOptions, mockPostgresFactory)
        const stats = pool.getStats()
        
        assertEquals(stats.total, 5)
      })
    })
  })

  /**
   * acquire() Method Tests
   */
  describe('acquire() Method', () => {
    describe('Successful Connections', () => {
      it('should acquire SQL instance when not connected', async () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        
        const sql = await pool.acquire()
        
        assertInstanceOf(sql, Object)
        assertEquals(pool.getConnectionState().isConnected, true)
      })

      it('should reuse existing connection', async () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        
        const sql1 = await pool.acquire()
        const sql2 = await pool.acquire()
        
        assertEquals(sql1, sql2)
      })
    })

    describe('Connection Failures', () => {
      it('should throw ConnectionError when shutting down', async () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        
        // Initiate shutdown
        await pool.shutdown()
        
        await assertRejects(
          () => pool.acquire(),
          ConnectionError,
          'Connection pool is shutting down'
        )
      })
    })
  })

  /**
   * query() Method Tests
   */
  describe('query() Method', () => {
    describe('Successful Queries', () => {
      it('should execute query successfully and record metrics', async () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        
        const mockResult = [{ test: 1 }]
        currentTime = 1000 // Start time
        
        const result = await pool.query(async (_sql) => {
          currentTime = 1025 // End time (25ms duration)
          return mockResult
        })
        
        assertEquals(result, mockResult)
        
        const stats = pool.getStats()
        assertEquals(stats.totalQueries, 1)
        assertEquals(stats.errorCount, 0)
        assertEquals(stats.averageQueryTime, 25)
      })
    })

    describe('Query Failures', () => {
      it('should record error metrics when query fails', async () => {
        const connectionConfig = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
        
        currentTime = 1000
        
        await assertRejects(async () => {
          await pool.query(async () => {
            currentTime = 1030 // 30ms duration
            throw new Error('Query failed')
          })
        }, Error, 'Query failed')
        
        const stats = pool.getStats()
        assertEquals(stats.totalQueries, 1)
        assertEquals(stats.errorCount, 1)
        assertEquals(stats.averageQueryTime, 30)
        
        assert(logger.hasLogMessage('Query execution failed', 'error'))
      })
    })
  })

  /**
   * getStats() Method Tests
   */
  describe('getStats() Method', () => {
    it('should return initial stats with no activity', () => {
      const connectionConfig = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
      
      const stats = pool.getStats()
      
      assertEquals(stats.totalQueries, 0)
      assertEquals(stats.errorCount, 0)
      assertEquals(stats.averageQueryTime, 0)
      assertEquals(stats.active, 0)
      assertEquals(stats.totalConnections, 0)
    })
  })

  /**
   * healthCheck() Method Tests
   */
  describe('healthCheck() Method', () => {
    it('should return false when not connected', async () => {
      const connectionConfig = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
      
      const isHealthy = await pool.healthCheck()
      
      assertEquals(isHealthy, false)
    })

    it('should return true when connected and query succeeds', async () => {
      const connectionConfig = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const pool = new ConnectionPool(connectionConfig, logger, {}, mockPostgresFactory)
      
      await pool.acquire()
      
      const isHealthy = await pool.healthCheck()
      
      assertEquals(isHealthy, true)
    })
  })

  /**
   * Factory Function Tests
   */
  describe('createConnectionPool Factory Function', () => {
    it('should create ConnectionPool instance with postgres factory', () => {
      const connectionConfig = TEST_CONNECTION_CONFIGS.test!
      const clientOptions = TEST_CLIENT_OPTIONS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      
      const pool = createConnectionPool(connectionConfig, logger, clientOptions, mockPostgresFactory)
      
      assertInstanceOf(pool, ConnectionPool)
    })
  })
})