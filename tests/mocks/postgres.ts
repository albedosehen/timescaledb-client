/**
 * Mock implementation of postgres.js SQL interface
 *
 * Provides comprehensive mocking for postgres.js to enable unit testing
 * without database dependencies while capturing queries and parameters.
 */

import type { SqlInstance } from '../../src/types/internal.ts'

/**
 * Mock SQL query result interface
 */
export interface MockQueryResult {
  readonly [key: string]: unknown
}

/**
 * Mock configuration for controlling SQL behavior
 */
export interface MockSqlConfig {
  /** Results to return for queries */
  mockResults?: MockQueryResult[]
  
  /** Error to throw when executing queries */
  shouldThrow?: Error | ((query: string, params: unknown[]) => Error | null)
  
  /** Whether to capture query history */
  captureQueries?: boolean
  
  /** Delay in milliseconds before resolving queries */
  queryDelay?: number
  
  /** Whether to log queries to console (for debugging) */
  logQueries?: boolean
}

/**
 * Query execution record for testing verification
 */
export interface QueryRecord {
  readonly query: string
  readonly parameters: readonly unknown[]
  readonly timestamp: Date
  readonly executionTimeMs: number
}

/**
 * Extended SQL interface with mock-specific properties
 */
export interface MockSql extends SqlInstance {
  // Mock control properties
  _mockConfig: MockSqlConfig
  _queryHistory: QueryRecord[]
  
  // Mock control methods
  setMockResults(results: MockQueryResult[]): void
  setMockError(error: Error | ((query: string, params: unknown[]) => Error | null)): void
  clearMockError(): void
  clearQueryHistory(): void
  getLastQuery(): QueryRecord | undefined
  getQueryCount(): number
  getQueriesByPattern(pattern: RegExp): QueryRecord[]

  // Additional postgres.js methods
  listen(channels: string | string[], onNotification?: (message: unknown) => void): Promise<{ unsubscribe: () => void }>
  notify(channel: string, payload?: string): Promise<void>
  cursor(query: unknown): AsyncIterable<MockQueryResult[]>
  prepare(query: string): { execute: (...params: unknown[]) => Promise<MockQueryResult[]> }
  options: {
    host: string
    port: number
    database: string
    username: string
    max: number
    idle_timeout: number
    connect_timeout: number
  }
}

/**
 * Create a mock SQL instance for testing
 */
export function createMockSql(config: MockSqlConfig = {}): MockSql {
  const mockConfig: MockSqlConfig = {
    mockResults: [],
    captureQueries: true,
    queryDelay: 0,
    logQueries: false,
    ...config
  }
  
  const queryHistory: QueryRecord[] = []
  
  // Core query execution function
  const executeQuery = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<MockQueryResult[]> => {
    const startTime = performance.now()
    
    // Reconstruct query string
    const query = strings.reduce((acc, str, i) => {
      return acc + str + (i < values.length ? `$${i + 1}` : '')
    }, '')
    
    // Log query if enabled
    if (mockConfig.logQueries) {
      console.log('Mock SQL Query:', query, 'Parameters:', values)
    }
    
    // Add delay if configured
    if (mockConfig.queryDelay && mockConfig.queryDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, mockConfig.queryDelay))
    }
    
    // Check for errors
    if (mockConfig.shouldThrow) {
      const error = typeof mockConfig.shouldThrow === 'function'
        ? mockConfig.shouldThrow(query, values)
        : mockConfig.shouldThrow
      
      if (error) {
        // Still record the query attempt
        if (mockConfig.captureQueries) {
          queryHistory.push({
            query,
            parameters: values,
            timestamp: new Date(),
            executionTimeMs: Math.round(performance.now() - startTime)
          })
        }
        throw error
      }
    }
    
    // Record query execution
    if (mockConfig.captureQueries) {
      queryHistory.push({
        query,
        parameters: values,
        timestamp: new Date(),
        executionTimeMs: Math.round(performance.now() - startTime)
      })
    }
    
    // Return mock results
    return mockConfig.mockResults || []
  }
  
  // Create the main SQL function with tagged template support
  const sqlFunction = executeQuery as MockSql
  
  // Add mock control methods
  sqlFunction.setMockResults = (results: MockQueryResult[]): void => {
    mockConfig.mockResults = results
  }
  
  sqlFunction.setMockError = (error: Error | ((query: string, params: unknown[]) => Error | null)): void => {
    mockConfig.shouldThrow = error
  }
  
  sqlFunction.clearMockError = (): void => {
    delete mockConfig.shouldThrow
  }
  
  sqlFunction.clearQueryHistory = (): void => {
    queryHistory.length = 0
  }
  
  sqlFunction.getLastQuery = (): QueryRecord | undefined => {
    return queryHistory[queryHistory.length - 1]
  }
  
  sqlFunction.getQueryCount = (): number => {
    return queryHistory.length
  }
  
  sqlFunction.getQueriesByPattern = (pattern: RegExp): QueryRecord[] => {
    return queryHistory.filter(record => pattern.test(record.query))
  }
  
  // Add mock config access
  sqlFunction._mockConfig = mockConfig
  sqlFunction._queryHistory = queryHistory
  
  // Mock postgres.js connection management methods
  sqlFunction.end = async (): Promise<void> => {
    // Mock connection cleanup
    if (mockConfig.logQueries) {
      console.log('Mock SQL connection ended')
    }
  }
  
  sqlFunction.reserve = (): Promise<MockSql> => {
    // Return a new mock instance for reserved connections
    return Promise.resolve(createMockSql(mockConfig))
  }
  
  sqlFunction.release = (): Promise<void> => {
    // Mock connection release
    return Promise.resolve()
  }
  
  sqlFunction.listen = (
    channels: string | string[],
    _onNotification?: (message: unknown) => void
  ): Promise<{ unsubscribe: () => void }> => {
    // Mock LISTEN functionality
    return Promise.resolve({
      unsubscribe: () => {
        if (mockConfig.logQueries) {
          console.log('Mock SQL unsubscribed from channels:', channels)
        }
      }
    })
  }
  
  sqlFunction.notify = (channel: string, payload?: string): Promise<void> => {
    // Mock NOTIFY functionality
    if (mockConfig.logQueries) {
      console.log('Mock SQL notify:', channel, payload)
    }
    return Promise.resolve()
  }
  
  // Mock cursor functionality for streaming
  sqlFunction.cursor = (_query: unknown): AsyncIterable<MockQueryResult[]> => {
    return {
      async *[Symbol.asyncIterator]() {
        const results = mockConfig.mockResults || []
        const batchSize = 100 // Default batch size
        
        for (let i = 0; i < results.length; i += batchSize) {
          yield results.slice(i, i + batchSize)
        }
      }
    }
  }
  
  // Mock transaction support
  sqlFunction.begin = async <T>(
    fnOrMode?: ((sql: SqlInstance) => Promise<T>) | string,
    callback?: (sql: SqlInstance) => Promise<T>
  ): Promise<T> => {
    if (typeof fnOrMode === 'string') {
      // Mode + callback signature
      if (callback) {
        return await callback(sqlFunction)
      }
      throw new Error('Callback is required when mode is provided')
    } else if (typeof fnOrMode === 'function') {
      // Callback only signature
      return await fnOrMode(sqlFunction)
    }
    // No arguments - return sql instance
    return sqlFunction as unknown as T
  }
  
  // Mock prepared statements
  sqlFunction.prepare = (_query: string): { execute: (...params: unknown[]) => Promise<MockQueryResult[]> } => {
    return {
      execute: (...params: unknown[]) => executeQuery(Object.assign([''], { raw: [''] }) as TemplateStringsArray, ...params)
    }
  }
  
  // Mock connection options access
  sqlFunction.options = {
    host: 'localhost',
    port: 5432,
    database: 'test',
    username: 'test',
    max: 10,
    idle_timeout: 0,
    connect_timeout: 30
  }
  
  return sqlFunction as MockSql
}

/**
 * Create a mock SQL instance that simulates PostgreSQL errors
 */
export function createErrorMockSql(error: Error): MockSql {
  return createMockSql({
    shouldThrow: error,
    captureQueries: true,
    logQueries: false
  })
}

/**
 * Create a mock SQL instance with specific query results
 */
export function createResultMockSql(results: MockQueryResult[]): MockSql {
  return createMockSql({
    mockResults: results,
    captureQueries: true,
    logQueries: false
  })
}

/**
 * Create a mock SQL instance with conditional error responses
 */
export function createConditionalMockSql(
  errorCondition: (query: string, params: unknown[]) => boolean,
  error: Error,
  defaultResults: MockQueryResult[] = []
): MockSql {
  return createMockSql({
    mockResults: defaultResults,
    shouldThrow: (query: string, params: unknown[]) => {
      return errorCondition(query, params) ? error : null
    },
    captureQueries: true,
    logQueries: false
  })
}

/**
 * Mock factory for common test scenarios
 */
export class MockSqlFactory {
  
  /**
   * Create a mock for successful INSERT operations
   */
  static createInsertMock(rowsAffected = 1): MockSql {
    return createMockSql({
      mockResults: [{ command: 'INSERT', rowCount: rowsAffected }],
      captureQueries: true
    })
  }
  
  /**
   * Create a mock for SELECT operations with sample data
   */
  static createSelectMock(sampleData: MockQueryResult[]): MockSql {
    return createMockSql({
      mockResults: sampleData,
      captureQueries: true
    })
  }
  
  /**
   * Create a mock that throws connection errors
   */
  static createConnectionErrorMock(): MockSql {
    const error = new Error('Connection failed')
    ;(error as any).code = '08006' // PostgreSQL connection failure code
    return createErrorMockSql(error)
  }
  
  /**
   * Create a mock that throws query timeout errors
   */
  static createTimeoutErrorMock(): MockSql {
    const error = new Error('Query timeout')
    ;(error as any).code = '57014' // PostgreSQL query timeout code
    return createErrorMockSql(error)
  }
  
  /**
   * Create a mock that throws constraint violation errors
   */
  static createConstraintErrorMock(): MockSql {
    const error = new Error('Unique constraint violation')
    ;(error as any).code = '23505' // PostgreSQL unique violation code
    return createErrorMockSql(error)
  }
  
  /**
   * Create a mock with query execution delay
   */
  static createSlowQueryMock(delayMs: number, results: MockQueryResult[] = []): MockSql {
    return createMockSql({
      mockResults: results,
      queryDelay: delayMs,
      captureQueries: true
    })
  }
  
  /**
   * Create a mock that simulates empty result sets
   */
  static createEmptyResultMock(): MockSql {
    return createMockSql({
      mockResults: [],
      captureQueries: true
    })
  }

  /**
   * Create a successful mock with custom results
   */
  static createSuccessfulMock(mockResults: MockQueryResult[]): MockSql {
    return createMockSql({
      mockResults,
      captureQueries: true
    })
  }

  /**
   * Create a mock that fails with the specified error
   */
  static createFailingMock(error: Error): MockSql {
    return createErrorMockSql(error)
  }
}

/**
 * Query assertion helpers for testing
 */
export class QueryAssertions {
  
  /**
   * Assert that a specific query was executed
   */
  static assertQueryExecuted(mockSql: MockSql, expectedQuery: string | RegExp): void {
    const queries = mockSql._queryHistory
    const found = queries.some(record => 
      typeof expectedQuery === 'string' 
        ? record.query.includes(expectedQuery)
        : expectedQuery.test(record.query)
    )
    
    if (!found) {
      throw new Error(
        `Expected query not found. Expected: ${expectedQuery.toString()}\n` +
        `Executed queries: ${queries.map(q => q.query).join('\n')}`
      )
    }
  }
  
  /**
   * Assert that a query was executed with specific parameters
   */
  static assertQueryParameters(mockSql: MockSql, expectedParams: unknown[]): void {
    const lastQuery = mockSql.getLastQuery()
    if (!lastQuery) {
      throw new Error('No queries have been executed')
    }
    
    if (!this.arraysEqual(lastQuery.parameters, expectedParams)) {
      throw new Error(
        `Query parameters mismatch.\nExpected: ${JSON.stringify(expectedParams)}\n` +
        `Actual: ${JSON.stringify(lastQuery.parameters)}`
      )
    }
  }
  
  /**
   * Assert that a specific number of queries were executed
   */
  static assertQueryCount(mockSql: MockSql, expectedCount: number): void {
    const actualCount = mockSql.getQueryCount()
    if (actualCount !== expectedCount) {
      throw new Error(`Expected ${expectedCount} queries, but ${actualCount} were executed`)
    }
  }
  
  /**
   * Assert that no queries were executed
   */
  static assertNoQueries(mockSql: MockSql): void {
    this.assertQueryCount(mockSql, 0)
  }
  
  private static arraysEqual(a: readonly unknown[], b: unknown[]): boolean {
    if (a.length !== b.length) return false
    return a.every((val, i) => val === b[i])
  }
}