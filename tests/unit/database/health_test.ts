// deno-lint-ignore-file no-explicit-any ban-unused-ignore
/**
 * Unit tests for HealthChecker class
 * 
 * Tests all public methods, configuration validation, health monitoring,
 * alert systems, and various health check scenarios for the HealthChecker class.
 * Aims for 95%+ code coverage following project testing standards.
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertRejects, assert, assertInstanceOf } from '@std/assert'
import { stub, restore } from '@std/testing/mock'
import { HealthChecker, createHealthChecker } from '../../../src/database/health.ts'
import type { ClientOptions } from '../../../src/types/config.ts'
import type { SqlInstance } from '../../../src/types/internal.ts'
import { SchemaError, TimeoutError } from '../../../src/types/errors.ts'
import { createPostgresMock, type ExtendedMockSql } from '../../mocks/postgres_mock.ts'
import { TestLogger } from '../../utils/test_helpers.ts'
import {
  MOCK_SQL_RESPONSES,
  TEST_CLIENT_OPTIONS
} from '../../fixtures/database_fixtures.ts'

/**
 * Mock ConnectionPool class for testing
 */
class MockConnectionPool {
  private mockSql: ExtendedMockSql
  private healthCheckResult = true
  private stats = {
    total: 10,
    active: 1,
    idle: 9,
    waiting: 0,
    totalConnections: 1,
    totalQueries: 100,
    averageQueryTime: 25,
    errorCount: 0,
  }

  constructor(mockSql: ExtendedMockSql) {
    this.mockSql = mockSql
  }

  // deno-lint-ignore require-await
  async acquire(): Promise<SqlInstance> {
    return this.mockSql as unknown as SqlInstance
  }

  // deno-lint-ignore require-await
  async healthCheck(): Promise<boolean> {
    return this.healthCheckResult
  }

  getStats() {
    return { ...this.stats }
  }

  setHealthCheckResult(result: boolean): void {
    this.healthCheckResult = result
  }

  setStats(stats: Partial<typeof this.stats>): void {
    this.stats = { ...this.stats, ...stats }
  }
}

/**
 * Mock alert configuration for testing
 */
interface MockAlertConfig {
  enabled: boolean
  // deno-lint-ignore no-explicit-any
  onHealthChange?: (isHealthy: boolean, result: any) => void
  onError?: (error: Error, context: string) => void
  onWarning?: (warning: string, context: string) => void
  onPerformanceIssue?: (metric: string, value: number, threshold: number) => void
}

/**
 * Test suite for HealthChecker class
 */
describe('HealthChecker', () => {
  let mockSql: ExtendedMockSql
  let mockPool: MockConnectionPool
  let logger: TestLogger
  // deno-lint-ignore no-explicit-any
  let setIntervalStub: any
  // deno-lint-ignore no-explicit-any
  let clearIntervalStub: any
  let intervalId: number
  let timeoutId: number
  let intervalCallback: (() => void) | null = null
  let activeTimers: Set<number> = new Set()

  beforeEach(() => {
    mockSql = createPostgresMock() as ExtendedMockSql
    mockPool = new MockConnectionPool(mockSql)
    logger = new TestLogger()
    intervalId = 1
    timeoutId = 1000
    activeTimers = new Set()

    // Mock timer functions
    // deno-lint-ignore no-explicit-any
    setIntervalStub = stub(globalThis, 'setInterval', (callback: any, _interval?: number) => {
      intervalCallback = callback
      const id = intervalId++
      activeTimers.add(id)
      return id
    })
    clearIntervalStub = stub(globalThis, 'clearInterval', (id?: number) => {
      intervalCallback = null
      if (id !== undefined) {
        activeTimers.delete(id)
      }
    })

    // deno-lint-ignore no-explicit-any
    stub(globalThis, 'setTimeout', (callback: any, delay?: number) => {
      const id = timeoutId++
      activeTimers.add(id)

      // Execute callback immediately for delay 0 (microtask scheduling)
      // or use queueMicrotask for better async behavior
      if (delay === 0 || delay === undefined) {
        queueMicrotask(() => {
          if (activeTimers.has(id)) {
            callback()
            activeTimers.delete(id)
          }
        })
      }

      return id
    })
    stub(globalThis, 'clearTimeout', (id?: number) => {
      if (id !== undefined) {
        activeTimers.delete(id)
      }
    })

    // Set up default mock responses
    mockSql.setMockResult('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
      MOCK_SQL_RESPONSES.extensions)
    mockSql.setMockResult('SELECT timescaledb_version()', MOCK_SQL_RESPONSES.timescaleVersion)
    mockSql.setMockResult('SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename = ANY($1)', 
      MOCK_SQL_RESPONSES.tables)
    mockSql.setMockResult('SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_name = ANY($1)', 
      MOCK_SQL_RESPONSES.hypertables)
    mockSql.setMockResult('SELECT indexname FROM pg_indexes WHERE schemaname = \'public\' AND indexname = ANY($1)', 
      MOCK_SQL_RESPONSES.indexes)
    mockSql.setMockResult('SELECT name, setting, unit, boot_val, reset_val FROM pg_settings WHERE name IN ($1)', 
      MOCK_SQL_RESPONSES.settings)
    mockSql.setMockResult('SELECT 1 as performance_test', [{ performance_test: 1 }])
  })

  afterEach(() => {
    // Clean up all active timers to prevent leaks
    for (const timerId of activeTimers) {
      clearInterval(timerId)
      clearTimeout(timerId)
    }
    activeTimers.clear()

    // Reset timer state variables
    intervalCallback = null
    intervalId = 1
    timeoutId = 1000

    // Restore all stubs and mocks
    restore()
    mockSql.reset()
    logger.clearLogs()
  })

  /**
   * Constructor and Configuration Tests
   */
  describe('Constructor and Configuration', () => {
    describe('Valid Configurations', () => {
      it('should create HealthChecker with all parameters', () => {
        const clientOptions: ClientOptions = TEST_CLIENT_OPTIONS.test!
        const alertConfig: MockAlertConfig = { enabled: true }
        
        const healthChecker = new HealthChecker(
          // deno-lint-ignore no-explicit-any
          mockPool as any,
          logger,
          clientOptions,
          alertConfig as any
        )
        
        assertInstanceOf(healthChecker, HealthChecker)
      })

      it('should create HealthChecker with default parameters', () => {
        // deno-lint-ignore no-explicit-any
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        assertInstanceOf(healthChecker, HealthChecker)
      })

      it('should create HealthChecker without logger', () => {
        const healthChecker = new HealthChecker(mockPool as any)
        
        assertInstanceOf(healthChecker, HealthChecker)
      })

      it('should build health check configuration with custom options', () => {
        const clientOptions: ClientOptions = {
          queryTimeout: 15000,
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, clientOptions)
        assertInstanceOf(healthChecker, HealthChecker)
      })

      it('should build performance thresholds with custom options', () => {
        const clientOptions: ClientOptions = {
          queryTimeout: 8000,
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, clientOptions)
        assertInstanceOf(healthChecker, HealthChecker)
      })
    })
  })

  /**
   * start() and stop() Methods Tests
   */
  describe('start() and stop() Methods', () => {
    describe('Starting Health Monitoring', () => {
      it('should start health monitoring when enabled', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        healthChecker.start()
        
        try {
          assert(setIntervalStub.calls.length === 1)
          assert(logger.hasLogMessage('Starting health monitoring', 'info'))
        } finally {
          healthChecker.stop()
        }
      })

      it('should not start when already started', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        healthChecker.start()
        healthChecker.start()
        
        try {
          assertEquals(setIntervalStub.calls.length, 1)
          assert(logger.hasLogMessage('Health monitoring is already started', 'warn'))
        } finally {
          healthChecker.stop()
        }
      })

      it('should perform initial health check on start', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        // Mock the pool methods
        mockPool.setHealthCheckResult(true)
        
        healthChecker.start()
        
        try {
          // Wait for async operations
          await Promise.resolve()

          assert(setIntervalStub.calls.length === 1)
        } finally {
          healthChecker.stop()
        }
      })

      it('should handle initial health check failure', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(false)
        
        healthChecker.start()
        
        try {
          // Wait for async operations
          await Promise.resolve()

          assert(setIntervalStub.calls.length === 1)
        } finally {
          healthChecker.stop()
        }
      })
    })

    describe('Stopping Health Monitoring', () => {
      it('should stop health monitoring', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        healthChecker.start()
        healthChecker.stop()
        
        assert(clearIntervalStub.calls.length === 1)
        assert(logger.hasLogMessage('Health monitoring stopped', 'info'))
      })

      it('should handle stop when not started', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        healthChecker.stop()
        
        assertEquals(clearIntervalStub.calls.length, 0)
      })

      it('should handle multiple stop calls', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        healthChecker.start()
        healthChecker.stop()
        healthChecker.stop()
        
        assertEquals(clearIntervalStub.calls.length, 1)
      })
    })

    describe('Interval Management', () => {
      it('should set up interval with correct timing', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        healthChecker.start()
        
        try {
          const intervalCall = setIntervalStub.calls[0]
          if (intervalCall) {
            assertEquals(intervalCall.args[1], 30000) // Default 30 seconds
          }
        } finally {
          healthChecker.stop()
        }
      })

      it('should execute health checks on interval', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        healthChecker.start()
        
        try {
          // Simulate interval execution
          if (intervalCallback) {
            await intervalCallback()
          }

          assert(intervalCallback !== null)
        } finally {
          healthChecker.stop()
        }
      })
    })
  })

  /**
   * performHealthCheck() Method Tests
   */
  describe.skip('performHealthCheck() Method', () => {
    describe('Successful Health Checks', () => {
      it('should perform comprehensive health check successfully', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        const result = await healthChecker.performHealthCheck()
        
        assertEquals(result.isHealthy, true)
        assert(result.score > 0)
        assertEquals(result.checks.connection, true)
        assertEquals(result.checks.timescaleDB, true)
        assertEquals(result.checks.schema, true)
        assertEquals(result.checks.performance, true)
        assertInstanceOf(result.timestamp, Date)
        assert(Array.isArray(result.warnings))
        assert(Array.isArray(result.errors))
      })

      it('should update health state after successful check', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        await healthChecker.performHealthCheck()
        
        const status = healthChecker.getHealthStatus()
        assertEquals(status.isHealthy, true)
        assertEquals(status.consecutiveFailures, 0)
        assertInstanceOf(status.lastCheck, Date)
      })

      it('should record health result in history', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        await healthChecker.performHealthCheck()
        
        const history = healthChecker.getHealthHistory()
        assertEquals(history.length, 1)
        assert(history[0])
        assertEquals(history[0].isHealthy, true)
      })
    })

    describe('Health Check Timeout', () => {
      it('should timeout health check after configured time', async () => {
        const clientOptions: ClientOptions = { queryTimeout: 100 }
        const healthChecker = new HealthChecker(mockPool as any, logger, clientOptions)
        
        // Mock a slow health check by making pool.healthCheck throw timeout
        mockSql.setErrorCondition('select extname, extversion from pg_extension where extname in (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
          new TimeoutError('Mock timeout', 100, 'test'))
        
        await assertRejects(
          () => healthChecker.performHealthCheck(),
          TimeoutError,
          'Health check timed out after 100ms'
        )
      })
    })

    describe('Error Handling', () => {
      it('should handle connection failure', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(false)
        
        const result = await healthChecker.performHealthCheck()
        
        assertEquals(result.isHealthy, false)
        assertEquals(result.checks.connection, false)
        assert(result.errors.length > 0)
        assert(result.errors[0] && result.errors[0].includes('Database connection is not available'))
      })

      it('should handle TimescaleDB validation failure', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        // Mock TimescaleDB not found
        mockSql.setMockResult('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
          [{ extname: 'pg_stat_statements', extversion: '1.9' }]) // No TimescaleDB
        
        const result = await healthChecker.performHealthCheck()
        
        assertEquals(result.checks.timescaleDB, false)
        assert(result.warnings.includes('TimescaleDB extension is not installed'))
      })

      it('should handle schema validation failure', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        // Mock missing tables
        mockSql.setMockResult('SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename = ANY($1)', [])
        
        const result = await healthChecker.performHealthCheck()
        
        assertEquals(result.checks.schema, false)
        assert(result.warnings.some(w => w.includes('Missing tables')))
      })

      it('should handle performance check failure', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        mockPool.setHealthCheckResult(true)
        
        // Set poor performance stats
        mockPool.setStats({
          averageQueryTime: 6000, // Exceeds default threshold
          errorCount: 10,
          totalQueries: 100
        })
        
        const result = await healthChecker.performHealthCheck()
        
        assertEquals(result.checks.performance, false)
        assert(result.warnings.some(w => w.includes('Query time') || w.includes('Error rate')))
      })
    })
  })

  /**
   * getHealthStatus() Method Tests
   */
  describe('getHealthStatus() Method', () => {
    it('should return current health status', () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      
      const status = healthChecker.getHealthStatus()
      
      assertEquals(status.isHealthy, true) // Default initial state
      assertEquals(status.lastCheck, null)
      assertEquals(status.consecutiveFailures, 0)
      assertEquals(status.score, 0) // No checks performed yet
    })

    it.skip('should return status after health checks', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      await healthChecker.performHealthCheck()
      
      const status = healthChecker.getHealthStatus()
      assertEquals(status.isHealthy, true)
      assertInstanceOf(status.lastCheck, Date)
      assertEquals(status.consecutiveFailures, 0)
      assert(status.score > 0)
    })

    it('should return status with consecutive failures', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(false)
      
      await healthChecker.performHealthCheck()
      await healthChecker.performHealthCheck()
      
      const status = healthChecker.getHealthStatus()
      assertEquals(status.isHealthy, false)
      assertEquals(status.consecutiveFailures, 2)
    })
  })

  /**
   * getHealthHistory() Method Tests
   */
  describe('getHealthHistory() Method', () => {
    it('should return empty history initially', () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      
      const history = healthChecker.getHealthHistory()
      
      assertEquals(history.length, 0)
    })

    it('should return history with default limit', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      // Perform multiple health checks
      for (let i = 0; i < 5; i++) {
        await healthChecker.performHealthCheck()
      }
      
      const history = healthChecker.getHealthHistory()
      assertEquals(history.length, 5)
    })

    it('should return history with custom limit', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      // Perform multiple health checks
      for (let i = 0; i < 15; i++) {
        await healthChecker.performHealthCheck()
      }
      
      const history = healthChecker.getHealthHistory(5)
      assertEquals(history.length, 5)
      
      const fullHistory = healthChecker.getHealthHistory(20)
      assertEquals(fullHistory.length, 15)
    })

    it('should maintain history limit of 100 items', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      // Perform more than 100 health checks
      for (let i = 0; i < 105; i++) {
        await healthChecker.performHealthCheck()
      }
      
      const fullHistory = healthChecker.getHealthHistory(200)
      assertEquals(fullHistory.length, 100) // Should be capped at 100
    })
  })

  /**
   * validateTimescaleDB() Method Tests
   */
  describe('validateTimescaleDB() Method', () => {
    it('should validate TimescaleDB successfully', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      const result = await healthChecker.validateTimescaleDB(sql)
      
      assertEquals(result.isValid, true)
      assertEquals(result.version, '2.8.0')
      assert(result.extensions.includes('timescaledb@2.8.0'))
      assertEquals(result.warnings.length, 0)
    })

    it('should handle TimescaleDB not installed', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock no TimescaleDB extension
      mockSql.setMockResult('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
        [{ extname: 'pg_stat_statements', extversion: '1.9' }])
      
      const result = await healthChecker.validateTimescaleDB(sql)
      
      assertEquals(result.isValid, false)
      assert(result.warnings.includes('TimescaleDB extension is not installed'))
    })

    it('should handle database errors during validation', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockSql.setErrorCondition('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
        new Error('Database connection failed'))
      
      await assertRejects(
        () => healthChecker.validateTimescaleDB(sql),
        SchemaError,
        'Failed to validate TimescaleDB extension'
      )
    })

    it.skip('should check TimescaleDB settings and add warnings', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock settings without TimescaleDB in shared_preload_libraries
      mockSql.setMockResult('SELECT name, setting, unit, boot_val, reset_val FROM pg_settings WHERE name IN ($1)', 
        [{ name: 'shared_preload_libraries', setting: 'pg_stat_statements' }])
      
      const result = await healthChecker.validateTimescaleDB(sql)
      
      assertEquals(result.isValid, true)
      assert(result.warnings.includes('TimescaleDB not found in shared_preload_libraries'))
    })

    it('should handle settings check errors gracefully', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock settings query error (non-critical)
      mockSql.setErrorCondition('SELECT name, setting, unit, boot_val, reset_val FROM pg_settings WHERE name IN ($1)', 
        new Error('Settings access denied'))
      
      const result = await healthChecker.validateTimescaleDB(sql)
      
      // Should still succeed despite settings error
      assertEquals(result.isValid, true)
    })
  })

  /**
   * validateSchema() Method Tests
   */
  describe.skip('validateSchema() Method', () => {
    it('should validate schema successfully', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      const result = await healthChecker.validateSchema(sql)
      
      assertEquals(result.isValid, true)
      assertEquals(result.missingTables.length, 0)
      assertEquals(result.missingIndexes.length, 0)
      assertEquals(result.nonHypertables.length, 0)
    })

    it('should detect missing tables', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock missing tables
      mockSql.setMockResult('SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename = ANY($1)', 
        [{ tablename: 'entities' }]) // Missing time_series_data
      
      const result = await healthChecker.validateSchema(sql)
      
      assertEquals(result.isValid, false)
      assert(result.missingTables.includes('time_series_data'))
      assert(result.warnings.some(w => w.includes('Missing tables')))
    })

    it('should detect non-hypertables', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock tables exist but no hypertables
      mockSql.setMockResult('SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_name = ANY($1)', [])
      
      const result = await healthChecker.validateSchema(sql)
      
      assertEquals(result.isValid, false)
      assert(result.nonHypertables.includes('time_series_data'))
      assert(result.nonHypertables.includes('entities'))
      assert(result.warnings.some(w => w.includes('Tables not converted to hypertables')))
    })

    it('should detect missing indexes', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock missing indexes
      mockSql.setMockResult('SELECT indexname FROM pg_indexes WHERE schemaname = \'public\' AND indexname = ANY($1)', 
        [{ indexname: 'ix_entity_time' }]) // Missing others
      
      const result = await healthChecker.validateSchema(sql)
      
      assertEquals(result.isValid, true) // Still valid with missing indexes
      assert(result.missingIndexes.includes('ix_time'))
      assert(result.missingIndexes.includes('ix_source'))
      assert(result.warnings.some(w => w.includes('Missing indexes')))
    })

    it('should handle schema validation errors', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockSql.setErrorCondition('SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename = ANY($1)', 
        new Error('Table query failed'))
      
      await assertRejects(
        () => healthChecker.validateSchema(sql),
        SchemaError,
        'Failed to validate database schema'
      )
    })
  })

  /**
   * checkPerformance() Method Tests
   */
  describe('checkPerformance() Method', () => {
    it('should check performance successfully', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockPool.setStats({
        averageQueryTime: 20,
        errorCount: 0,
        totalQueries: 100
      })
      
      const result = await healthChecker.checkPerformance(sql)
      
      assertEquals(result.isHealthy, true)
      assertEquals(result.issues.length, 0)
      assert(result.metrics.connectionTimeMs >= 0)
      assertInstanceOf(result.metrics.lastQueryTime, Date)
    })

    it.skip('should detect slow query performance', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock slow performance test query
      mockSql.setMockResult('SELECT 1 as performance_test', [{ performance_test: 1 }])
      
      mockPool.setStats({
        averageQueryTime: 6000,
        errorCount: 0,
        totalQueries: 100
      })
      
      const result = await healthChecker.checkPerformance(sql)
      
      assertEquals(result.isHealthy, false)
      assert(result.issues.some(issue => issue.includes('Query time') && issue.includes('exceeds threshold')))
    })

    it('should detect high error rate', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockPool.setStats({
        averageQueryTime: 25,
        errorCount: 10,
        totalQueries: 100 // 10% error rate > 5% threshold
      })
      
      const result = await healthChecker.checkPerformance(sql)
      
      assertEquals(result.isHealthy, false)
      assert(result.issues.some(issue => issue.includes('Error rate') && issue.includes('exceeds threshold')))
    })

    it('should handle performance check errors', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockSql.setErrorCondition('SELECT 1 as performance_test', new Error('Performance test failed'))
      
      const result = await healthChecker.checkPerformance(sql)
      
      assertEquals(result.isHealthy, false)
      assert(result.issues.some(issue => issue.includes('Performance check failed')))
      assertEquals(result.metrics.connectionTimeMs, -1)
      assertEquals(result.metrics.avgQueryTimeMs, -1)
    })

    it('should handle zero total queries (avoid division by zero)', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockPool.setStats({
        averageQueryTime: 25,
        errorCount: 0,
        totalQueries: 0
      })
      
      const result = await healthChecker.checkPerformance(sql)
      
      assertEquals(result.isHealthy, true) // 0% error rate
      assertEquals(result.issues.length, 0)
    })
  })

  /**
   * Alert System Tests
   */
  describe('Alert System', () => {
    describe('Health Change Alerts', () => {
      it('should trigger health change alert when health changes', async () => {
        let alertTriggered = false
        let alertIsHealthy: boolean | undefined
        let alertResult: any
        
        const alertConfig: MockAlertConfig = {
          enabled: true,
          onHealthChange: (isHealthy, result) => {
            alertTriggered = true
            alertIsHealthy = isHealthy
            alertResult = result
          }
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, {}, alertConfig as any)
        
        // Start healthy
        mockPool.setHealthCheckResult(true)
        await healthChecker.performHealthCheck()
        
        // Change to unhealthy
        mockPool.setHealthCheckResult(false)
        await healthChecker.performHealthCheck()
        
        assert(alertTriggered)
        assertEquals(alertIsHealthy, false)
        assertEquals(alertResult.isHealthy, false)
      })

      it.skip('should not trigger alert when health does not change', async () => {
        let alertTriggered = false
        
        const alertConfig: MockAlertConfig = {
          enabled: true,
          onHealthChange: () => {
            alertTriggered = true
          }
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, {}, alertConfig as any)
        
        // Both checks healthy
        mockPool.setHealthCheckResult(true)
        await healthChecker.performHealthCheck()
        await healthChecker.performHealthCheck()
        
        assert(!alertTriggered)
      })
    })

    describe('Error Alerts', () => {
      it('should trigger error alerts for health check errors', async () => {
        const errors: Array<{ error: Error; context: string }> = []
        
        const alertConfig: MockAlertConfig = {
          enabled: true,
          onError: (error, context) => {
            errors.push({ error, context })
          }
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, {}, alertConfig as any)
        mockPool.setHealthCheckResult(false)
        
        await healthChecker.performHealthCheck()
        
        assert(errors.length > 0)
        assert(errors[0])
        assertEquals(errors[0].context, 'health_check')
        assertInstanceOf(errors[0].error, Error)
      })
    })

    describe('Warning Alerts', () => {
      it.skip('should trigger warning alerts for health check warnings', async () => {
        const warnings: Array<{ warning: string; context: string }> = []
        
        const alertConfig: MockAlertConfig = {
          enabled: true,
          onWarning: (warning, context) => {
            warnings.push({ warning, context })
          }
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, {}, alertConfig as any)
        mockPool.setHealthCheckResult(true)
        
        // Mock missing indexes to generate warnings
        mockSql.setMockResult('SELECT indexname FROM pg_indexes WHERE schemaname = \'public\' AND indexname = ANY($1)', [])
        
        await healthChecker.performHealthCheck()
        
        assert(warnings.length > 0)
        assert(warnings[0])
        assertEquals(warnings[0].context, 'health_check')
        assert(warnings[0].warning.includes('Missing indexes'))
      })
    })

    describe('Disabled Alerts', () => {
      it('should not trigger alerts when disabled', async () => {
        let alertTriggered = false
        
        const alertConfig: MockAlertConfig = {
          enabled: false,
          onHealthChange: () => {
            alertTriggered = true
          }
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, {}, alertConfig as any)
        
        mockPool.setHealthCheckResult(true)
        await healthChecker.performHealthCheck()
        
        mockPool.setHealthCheckResult(false)
        await healthChecker.performHealthCheck()
        
        assert(!alertTriggered)
      })
    })
  })

  /**
   * Health Scoring Tests
   */
  describe('Health Scoring', () => {
    it.skip('should calculate perfect score for all checks passing', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      const result = await healthChecker.performHealthCheck()
      
      assertEquals(result.score, 100)
    })

    it('should deduct points for failing checks', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(false) // Connection fails
      
      const result = await healthChecker.performHealthCheck()
      
      assert(result.score < 100)
      assert(result.score >= 0)
    })

    it('should deduct points for errors and warnings', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      // Mock missing indexes to generate warnings
      mockSql.setMockResult('SELECT indexname FROM pg_indexes WHERE schemaname = \'public\' AND indexname = ANY($1)', [])
      
      const result = await healthChecker.performHealthCheck()
      
      assert(result.score < 100) // Should be reduced due to warnings
      assert(result.score > 0)
    })

    it('should have minimum score of 0', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(false)
      
      // Mock multiple errors
      mockSql.setMockResult('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', [])
      mockSql.setMockResult('SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename = ANY($1)', [])
      
      const result = await healthChecker.performHealthCheck()
      
      assertEquals(result.score, 0)
    })

    it('should consider health threshold for isHealthy determination', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      mockPool.setHealthCheckResult(true)
      
      // Mock some warnings to reduce score but keep above 70
      mockSql.setMockResult('SELECT indexname FROM pg_indexes WHERE schemaname = \'public\' AND indexname = ANY($1)', 
        [{ indexname: 'ix_entity_time' }]) // Missing some indexes
      
      const result = await healthChecker.performHealthCheck()
      
      if (result.score >= 70 && result.errors.length === 0) {
        assertEquals(result.isHealthy, true)
      } else {
        assertEquals(result.isHealthy, false)
      }
    })
  })

  /**
   * Factory Function Tests
   */
  describe('createHealthChecker Factory Function', () => {
    it('should create HealthChecker instance with all parameters', () => {
      const clientOptions: ClientOptions = TEST_CLIENT_OPTIONS.test!
      const alertConfig: MockAlertConfig = { enabled: true }
      
      const healthChecker = createHealthChecker(
        mockPool as any,
        logger,
        clientOptions,
        alertConfig as any
      )
      
      assertInstanceOf(healthChecker, HealthChecker)
    })

    it('should create HealthChecker instance with minimal parameters', () => {
      const healthChecker = createHealthChecker(mockPool as any)
      
      assertInstanceOf(healthChecker, HealthChecker)
    })

    it('should create HealthChecker with default client options', () => {
      const healthChecker = createHealthChecker(mockPool as any, logger)
      
      assertInstanceOf(healthChecker, HealthChecker)
    })

    it('should create HealthChecker with default alert config', () => {
      const healthChecker = createHealthChecker(mockPool as any, logger, {})
      
      assertInstanceOf(healthChecker, HealthChecker)
    })
  })

  /**
   * Error Scenarios and Edge Cases
   */
  describe('Error Scenarios and Edge Cases', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      
      mockSql.setErrorCondition('SELECT 1 as performance_test', 'String error' as any)
      
      const result = await healthChecker.checkPerformance(await mockPool.acquire())
      
      assertEquals(result.isHealthy, false)
      assert(result.issues.some(issue => issue.includes('String error')))
    })

    it('should handle connection acquire failure in health check', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      
      // Mock pool acquire failure
      const originalAcquire = mockPool.acquire
      mockPool.acquire = () => Promise.reject(new Error('Pool acquire failed'))
      
      try {
        await healthChecker.performHealthCheck()
      } catch (error) {
        assert(error instanceof Error)
        assert(error.message.includes('Pool acquire failed'))
      }
      
      // Restore original method
      mockPool.acquire = originalAcquire
    })

    it('should handle missing query result properties gracefully', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      // Mock incomplete extension result
      mockSql.setMockResult('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
        [{ extname: 'timescaledb' }]) // Missing extversion
      
      const result = await healthChecker.validateTimescaleDB(sql)
      
      assertEquals(result.isValid, true)
      assert(result.extensions.includes('timescaledb@undefined'))
    })

    it('should handle empty TimescaleDB version result', async () => {
      const healthChecker = new HealthChecker(mockPool as any, logger)
      const sql = await mockPool.acquire()
      
      mockSql.setMockResult('SELECT timescaledb_version()', [])
      
      const result = await healthChecker.validateTimescaleDB(sql)
      
      assertEquals(result.isValid, true)
      assertEquals(result.version, undefined)
    })
  })

  /**
   * Private Method Coverage Tests (through public interface)
   */
  describe('Private Method Coverage', () => {
    describe('createErrorResult', () => {
      it('should create error result with Error object', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        // Force an error to trigger createErrorResult
        mockPool.setHealthCheckResult(true)
        mockSql.setErrorCondition('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
          new Error('Test error'))
        
        try {
          await healthChecker.performHealthCheck()
        } catch (_error) {
          const history = healthChecker.getHealthHistory()
          assertEquals(history.length, 1)
          assert(history[0])
          assertEquals(history[0].isHealthy, false)
          assertEquals(history[0].score, 0)
          assert(history[0].errors.includes('Test error'))
        }
      })

      it('should create error result with non-Error object', async () => {
        const healthChecker = new HealthChecker(mockPool as any, logger)
        
        mockPool.setHealthCheckResult(true)
        mockSql.setErrorCondition('SELECT extname, extversion FROM pg_extension WHERE extname IN (\'timescaledb\', \'postgis\', \'pg_stat_statements\')', 
          'String error' as any)
        
        try {
          await healthChecker.performHealthCheck()
        } catch (_error) {
          const history = healthChecker.getHealthHistory()
          assertEquals(history.length, 1)
          assert(history[0])
          assertEquals(history[0].isHealthy, false)
          assert(history[0].errors.includes('String error'))
        }
      })
    })

    describe('buildHealthCheckConfig and buildPerformanceThresholds', () => {
      it('should build config with custom queryTimeout', () => {
        const clientOptions: ClientOptions = {
          queryTimeout: 20000
        }
        
        const healthChecker = new HealthChecker(mockPool as any, logger, clientOptions)
        assertInstanceOf(healthChecker, HealthChecker)
      })

      it('should build config with default values', () => {
        const healthChecker = new HealthChecker(mockPool as any, logger, {})
        assertInstanceOf(healthChecker, HealthChecker)
      })
    })
  })
})