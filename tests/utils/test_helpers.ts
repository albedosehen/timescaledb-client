/**
 * Common testing utilities and setup functions for TimescaleDB client tests
 *
 * Provides standardized test setup, assertion helpers, and utility functions
 * following the project's testing patterns with describe/it from @std/testing/bdd.
 */

import { afterEach, beforeEach, describe } from '@std/testing/bdd'
import { assert, assertEquals, assertExists, assertInstanceOf } from '@std/assert'
import type { ClientOptions, ConnectionConfig, Logger } from '../../src/types/config.ts'
import { createPostgresMock, type ExtendedMockSql, type MockQueryResult } from '../mocks/postgres_mock.ts'

/**
 * Test configuration factory
 */
export interface TestConfig {
  readonly connection: ConnectionConfig
  readonly clientOptions: ClientOptions
  readonly logger?: TestLogger
}

/**
 * Test logger implementation
 */
export class TestLogger implements Logger {
  private logs: Array<{ level: string; message: string; meta?: Record<string, unknown>; error?: Error }> = []

  debug(message: string, meta?: Record<string, unknown>): void {
    const logEntry: { level: string; message: string; meta?: Record<string, unknown> } = { level: 'debug', message }
    if (meta !== undefined) {
      logEntry.meta = meta
    }
    this.logs.push(logEntry)
  }

  info(message: string, meta?: Record<string, unknown>): void {
    const logEntry: { level: string; message: string; meta?: Record<string, unknown> } = { level: 'info', message }
    if (meta !== undefined) {
      logEntry.meta = meta
    }
    this.logs.push(logEntry)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    const logEntry: { level: string; message: string; meta?: Record<string, unknown> } = { level: 'warn', message }
    if (meta !== undefined) {
      logEntry.meta = meta
    }
    this.logs.push(logEntry)
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const logEntry: { level: string; message: string; error?: Error; meta?: Record<string, unknown> } = {
      level: 'error',
      message,
    }
    if (error !== undefined) {
      logEntry.error = error
    }
    if (meta !== undefined) {
      logEntry.meta = meta
    }
    this.logs.push(logEntry)
  }

  /**
   * Get all captured logs
   */
  getLogs(): Array<{ level: string; message: string; meta?: Record<string, unknown>; error?: Error }> {
    return [...this.logs]
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(
    level: string,
  ): Array<{ level: string; message: string; meta?: Record<string, unknown>; error?: Error }> {
    return this.logs.filter((log) => log.level === level)
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = []
  }

  /**
   * Check if a specific message was logged
   */
  hasLogMessage(message: string, level?: string): boolean {
    return this.logs.some((log) =>
      log.message.includes(message) &&
      (level ? log.level === level : true)
    )
  }
}

/**
 * Create a test configuration with sensible defaults
 */
export function createTestConfig(overrides: Partial<TestConfig> = {}): TestConfig {
  const defaultConnection: ConnectionConfig = {
    host: 'localhost',
    port: 5432,
    database: 'timescale_test',
    username: 'test_user',
    password: 'test_password',
    maxConnections: 5,
    connectTimeout: 10,
    debug: false,
  }

  const defaultClientOptions: ClientOptions = {
    defaultBatchSize: 100,
    maxRetries: 1,
    retryBaseDelay: 100,
    queryTimeout: 5000,
    autoCreateTables: true,
    validateInputs: true,
    collectStats: false,
  }

  return {
    connection: { ...defaultConnection, ...overrides.connection },
    clientOptions: { ...defaultClientOptions, ...overrides.clientOptions },
    logger: overrides.logger || new TestLogger(),
  }
}

/**
 * Mock SQL instance with extended testing capabilities
 */
export function createMockSql(): ExtendedMockSql {
  return createPostgresMock() as ExtendedMockSql
}

/**
 * Setup common test environment
 */
export interface TestEnvironment {
  readonly mockSql: ExtendedMockSql
  readonly config: TestConfig
  readonly logger: TestLogger
}

/**
 * Create a complete test environment
 */
export function createTestEnvironment(configOverrides: Partial<TestConfig> = {}): TestEnvironment {
  const config = createTestConfig(configOverrides)
  const mockSql = createMockSql()
  const logger = config.logger instanceof TestLogger ? config.logger : new TestLogger()

  return {
    mockSql,
    config: { ...config, logger },
    logger,
  }
}

/**
 * Common assertion helpers
 */
export const TestAssertions = {
  /**
   * Assert that a query was captured by the mock
   */
  assertQueryCaptured(mockSql: ExtendedMockSql, expectedSql: string): void {
    const queries = mockSql.getCapturedQueries()
    const found = queries.some((query) => query.sql.toLowerCase().includes(expectedSql.toLowerCase()))
    assert(
      found,
      `Expected query containing "${expectedSql}" to be captured. Captured queries: ${
        JSON.stringify(queries.map((q) => q.sql))
      }`,
    )
  },

  /**
   * Assert that a specific number of queries were captured
   */
  assertQueryCount(mockSql: ExtendedMockSql, expectedCount: number): void {
    const queries = mockSql.getCapturedQueries()
    assertEquals(queries.length, expectedCount, `Expected ${expectedCount} queries, but got ${queries.length}`)
  },

  /**
   * Assert that no queries were captured
   */
  assertNoQueriesCaptured(mockSql: ExtendedMockSql): void {
    TestAssertions.assertQueryCount(mockSql, 0)
  },

  /**
   * Assert that a log message was recorded
   */
  assertLogMessage(logger: TestLogger, message: string, level?: string): void {
    assert(
      logger.hasLogMessage(message, level),
      `Expected log message "${message}"${level ? ` with level "${level}"` : ''} to be recorded`,
    )
  },

  /**
   * Assert that an error was thrown with a specific message
   */
  async assertThrowsWithMessage(
    fn: () => Promise<unknown> | unknown,
    expectedMessage: string,
  ): Promise<void> {
    let thrownError: Error | undefined

    try {
      const result = fn()
      if (result instanceof Promise) {
        await result
      }
    } catch (error) {
      thrownError = error as Error
    }

    assertExists(thrownError, 'Expected function to throw an error')
    assert(
      thrownError.message.includes(expectedMessage),
      `Expected error message to contain "${expectedMessage}", but got "${thrownError.message}"`,
    )
  },

  /**
   * Assert that a value is a valid timestamp
   */
  assertValidTimestamp(value: unknown): void {
    assertInstanceOf(value, Date)
    assert(!isNaN((value as Date).getTime()), 'Expected valid timestamp')
  },

  /**
   * Assert that a value is a valid entity ID
   */
  assertValidEntityId(entityId: unknown): void {
    assert(typeof entityId === 'string', 'Entity ID must be a string')
    assert(entityId.length > 0, 'Entity ID must not be empty')
    assert(
      /^[a-zA-Z0-9_-]+$/.test(entityId),
      'Entity ID must contain only alphanumeric characters, underscores, and dashes',
    )
  },

  /**
   * Assert that a value is a finite number
   */
  assertValidValue(value: unknown): void {
    assert(typeof value === 'number', 'Value must be a number')
    assert(Number.isFinite(value), 'Value must be finite')
  },
}

/**
 * Time-related test utilities
 */
export const TimeUtils = {
  /**
   * Create a timestamp string for testing
   */
  createTimestamp(offsetMinutes = 0): string {
    const date = new Date()
    date.setMinutes(date.getMinutes() + offsetMinutes)
    return date.toISOString()
  },

  /**
   * Create a date range for testing
   */
  createTimeRange(
    startOffsetMinutes = -60,
    endOffsetMinutes = 0,
  ): { from: Date; to: Date } {
    const now = new Date()
    const from = new Date(now.getTime() + startOffsetMinutes * 60 * 1000)
    const to = new Date(now.getTime() + endOffsetMinutes * 60 * 1000)
    return { from, to }
  },

  /**
   * Create a series of timestamps
   */
  createTimestampSeries(count: number, intervalMinutes = 1): string[] {
    const timestamps: string[] = []
    for (let i = 0; i < count; i++) {
      timestamps.push(TimeUtils.createTimestamp(i * intervalMinutes))
    }
    return timestamps
  },
}

/**
 * Common test setup and teardown
 */
export const TestSetup = {
  /**
   * Setup function for database tests
   */
  setupDatabaseTest(): TestEnvironment {
    const env = createTestEnvironment({
      clientOptions: {
        autoCreateTables: true,
        validateInputs: true,
        maxRetries: 1,
        queryTimeout: 5000,
      },
    })

    // Setup common mock responses
    env.mockSql.setMockResult('SELECT 1', [{ test: 1 }])
    env.mockSql.setMockResult('SELECT version()', [{ version: 'PostgreSQL 14.0' }])
    env.mockSql.setMockResult('SELECT timescaledb_version()', [{ timescaledb_version: '2.8.0' }])

    return env
  },

  /**
   * Cleanup function for tests
   */
  cleanupTest(env: TestEnvironment): void {
    env.mockSql.reset()
    env.logger.clearLogs()
  },

  /**
   * Create a describe block with automatic setup/cleanup
   */
  describeWithSetup(
    name: string,
    setupFn: () => TestEnvironment,
    testFn: (getEnv: () => TestEnvironment) => void,
  ): void {
    describe(name, () => {
      let env: TestEnvironment

      beforeEach(() => {
        env = setupFn()
      })

      afterEach(() => {
        if (env) {
          TestSetup.cleanupTest(env)
        }
      })

      testFn(() => env)
    })
  },
}

/**
 * Mock result builders for common queries
 */
export const MockResultBuilders = {
  /**
   * Build a mock result for health check queries
   */
  healthCheck(): MockQueryResult {
    return [{ test: 1, version: 'PostgreSQL 14.0 on TimescaleDB 2.8.0' }] as MockQueryResult
  },

  /**
   * Build a mock result for TimescaleDB extension queries
   */
  timescaleExtension(): MockQueryResult {
    return [
      { extname: 'timescaledb', extversion: '2.8.0' },
      { extname: 'pg_stat_statements', extversion: '1.9' },
    ] as MockQueryResult
  },

  /**
   * Build a mock result for table existence queries
   */
  existingTables(): MockQueryResult {
    return [
      { tablename: 'time_series_data' },
      { tablename: 'entities' },
    ] as MockQueryResult
  },

  /**
   * Build a mock result for hypertable queries
   */
  hypertables(): MockQueryResult {
    return [
      { hypertable_name: 'time_series_data', num_dimensions: 1, compression_enabled: true },
    ] as MockQueryResult
  },

  /**
   * Build a mock result for successful insert/update operations
   */
  successfulOperation(command: 'INSERT' | 'UPDATE' | 'DELETE', count = 1): MockQueryResult {
    const result = [] as MockQueryResult
    result.command = command
    result.count = count
    return result
  },

  /**
   * Build an empty result set
   */
  emptyResult(): MockQueryResult {
    const result = [] as MockQueryResult
    result.command = 'SELECT'
    result.count = 0
    return result
  },
}

/**
 * Export all utilities as a single namespace
 */
export const TestUtils = {
  createTestConfig,
  createMockSql,
  createTestEnvironment,
  TestAssertions,
  TimeUtils,
  TestSetup,
  MockResultBuilders,
  TestLogger,
}
