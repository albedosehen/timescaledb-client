/**
 * Mock factory for creating test doubles
 */

import type { ConnectionConfig } from '../../src/types/config.ts'
import type { BatchResult, HealthCheckResult, PriceTick } from '../../src/types/interfaces.ts'

/**
 * Mock SQL instance for testing
 */
export interface MockSql {
  query: string
  params: unknown[]
  result: unknown[]
  error?: Error
}

/**
 * Mock SQL factory for creating test SQL instances
 */
export class MockSqlFactory {
  private queries: MockSql[] = []
  private currentIndex = 0

  constructor(private mockResults: unknown[][] = []) {}

  /**
   * Create a successful mock SQL factory
   */
  static createSuccessfulMock(mockResults: unknown[][] = []): MockSqlFactory {
    return new MockSqlFactory(mockResults)
  }

  /**
   * Create a failing mock SQL factory
   */
  static createFailingMock(error: Error): MockSqlFactory {
    const factory = new MockSqlFactory([])
    factory.setError(error)
    return factory
  }

  // Mock SQL template function
  sql = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> => {
    const query = strings.reduce((acc, str, i) => {
      return acc + str + (values[i] !== undefined ? '$' + (i + 1) : '')
    }, '')

    const queryResult = this.mockResults[this.currentIndex] || []

    const mockSql: MockSql = {
      query,
      params: values,
      result: queryResult,
    }

    this.queries.push(mockSql)

    this.currentIndex = (this.currentIndex + 1) % Math.max(this.mockResults.length, 1)

    return Promise.resolve(queryResult)
  }

  // Mock SQL unsafe method
  unsafe = (query: string, ...params: unknown[]): Promise<unknown[]> => {
    const queryResult = this.mockResults[this.currentIndex] || []

    const mockSql: MockSql = {
      query,
      params,
      result: queryResult,
    }

    this.queries.push(mockSql)

    this.currentIndex = (this.currentIndex + 1) % Math.max(this.mockResults.length, 1)

    return Promise.resolve(queryResult)
  }

  // Mock SQL cursor method
  cursor = (batchSize: number) => {
    const cursorResults = this.mockResults[this.currentIndex] || []
    return {
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < cursorResults.length; i += batchSize) {
          yield cursorResults.slice(i, i + batchSize)
        }
      },
    }
  }

  // Mock SQL end method
  end = (): Promise<void> => Promise.resolve()

  getQueries(): MockSql[] {
    return [...this.queries]
  }

  getLastQuery(): MockSql | undefined {
    return this.queries[this.queries.length - 1]
  }

  reset(): void {
    this.queries = []
    this.currentIndex = 0
  }

  setError(error: Error): void {
    const lastQuery = this.getLastQuery()
    if (lastQuery) {
      lastQuery.error = error
    }
  }
}

/**
 * Create a mock SQL instance
 */
export function createMockSql(mockResults: unknown[][] = []): MockSqlFactory {
  return new MockSqlFactory(mockResults)
}

/**
 * Create test connection configuration
 */
export function createTestConnectionConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    host: 'localhost',
    port: 5432,
    database: 'test_timescaledb',
    username: 'test_user',
    password: 'test_password',
    ssl: false,
    ...overrides,
  }
}

/**
 * Mock configuration factory class - exported as MockConfigFactory
 */
export class MockConfigFactory {
  /**
   * Create a successful mock SQL factory
   */
  static createSuccessfulMock(mockResults: unknown[][] = []): MockSqlFactory {
    return new MockSqlFactory(mockResults)
  }

  /**
   * Create a failing mock SQL factory
   */
  static createFailingMock(error: Error): MockSqlFactory {
    const factory = new MockSqlFactory([])
    factory.setError(error)
    return factory
  }

  /**
   * Create mock configuration for testing
   */
  static createMockConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
    return createTestConnectionConfig(overrides)
  }

  /**
   * Create production configuration for testing
   */
  static createProductionConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
    return createTestConnectionConfig({
      host: 'prod-timescaledb.example.com',
      port: 5432,
      database: 'production_timescaledb',
      username: 'prod_user',
      password: 'prod_password',
      ssl: true,
      ...overrides,
    })
  }

  /**
   * Create development configuration for testing
   */
  static createDevelopmentConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
    return createTestConnectionConfig({
      host: 'dev-timescaledb.example.com',
      port: 5432,
      database: 'dev_timescaledb',
      username: 'dev_user',
      password: 'dev_password',
      ssl: false,
      ...overrides,
    })
  }
}

/**
 * Create mock price tick data
 */
export function createMockTick(overrides: Partial<PriceTick> = {}): PriceTick {
  return {
    symbol: 'TEST',
    price: 100,
    volume: 1.0,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Create mock batch result
 */
export function createMockBatchResult(overrides: Partial<BatchResult> = {}): BatchResult {
  return {
    processed: 10,
    failed: 0,
    durationMs: 100,
    errors: [],
    ...overrides,
  }
}

/**
 * Create mock health check result
 */
export function createMockHealthResult(overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
  return {
    isHealthy: true,
    responseTimeMs: 50,
    version: '2.8.0',
    database: 'test_db',
    connection: {
      host: 'localhost',
      port: 5432,
      ssl: false,
    },
    timestamp: new Date(),
    ...overrides,
  }
}

/**
 * Create mock database connection that can simulate errors
 */
export function createMockDatabaseConnection() {
  return {
    connect: (config: ConnectionConfig) => {
      if (config.host === 'invalid-host') {
        throw new Error('Connection failed')
      }
      return Promise.resolve(createMockSql())
    },

    healthCheck: () => createMockHealthResult(),

    close: () => Promise.resolve(),
  }
}

/**
 * Invalid connection configurations for testing error cases
 */
export const INVALID_CONNECTIONS = {
  malformedConnectionString: {
    host: 'invalid-host',
    port: -1,
    database: '',
    username: '',
    password: '',
  },

  networkError: {
    host: '192.168.255.255', // Non-routable IP
    port: 5432,
    database: 'test',
    username: 'test',
    password: 'test',
  },

  authenticationError: {
    host: 'localhost',
    port: 5432,
    database: 'test',
    username: 'invalid_user',
    password: 'wrong_password',
  },
} as const
