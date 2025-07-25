/**
 * Mock implementation of postgres.js SQL interface
 *
 * Provides comprehensive mocking for postgres.js to enable unit testing
 * without database dependencies while capturing queries and parameters.
 */

// Import postgres.js types
// Transform type removed as it's no longer used

/**
 * PostgreSQL error interface with error code support
 */
interface PostgreSQLError extends Error {
  readonly name: 'PostgresError'
  severity_local: string
  severity: string
  code: string
  position: string
  file: string
  line: string
  routine: string
  where: string
  schema?: string | undefined
  table?: string | undefined
  column?: string | undefined
  data_type?: string | undefined
  constraint?: string | undefined
  query: string
  parameters: unknown[]
}

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
 * Uses 'any' for maximum compatibility with postgres.js
 */
// deno-lint-ignore no-explicit-any
export type MockSql = any & {
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
    ...config,
  }

  const queryHistory: QueryRecord[] = []

  // Core query execution function
  const executeQuery = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<MockQueryResult[]> => {
    const startTime = performance.now()

    // Reconstruct query string
    const query = strings.reduce((acc, str, i) => {
      return acc + str + (i < values.length ? `$${i + 1}` : '')
    }, '')

    const executeAsync = async (): Promise<MockQueryResult[]> => {
      // Log query if enabled
      if (mockConfig.logQueries) {
        console.log('Mock SQL Query:', query, 'Parameters:', values)
      }

      // Add delay if configured
      if (mockConfig.queryDelay && mockConfig.queryDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, mockConfig.queryDelay))
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
              executionTimeMs: Math.round(performance.now() - startTime),
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
          executionTimeMs: Math.round(performance.now() - startTime),
        })
      }

      // Return mock results
      return mockConfig.mockResults || []
    }

    const promise = executeAsync()

    // Add PendingQuery methods
    return Object.assign(promise, {
      describe: () => Promise.resolve({}),
      values: () => Promise.resolve([]),
      raw: () => promise,
      simple: () => promise,
      stream: () => ({} as unknown),
      cursor: () => ({} as unknown),
      readable: () => ({} as unknown),
      writable: () => ({} as unknown),
      execute: () => promise,
      cancel: () => Promise.resolve(),
      listen: () => Promise.resolve({} as unknown),
      unlisten: () => Promise.resolve({} as unknown),
    })
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
    return queryHistory.filter((record) => pattern.test(record.query))
  }

  // Add mock config access
  sqlFunction._mockConfig = mockConfig
  sqlFunction._queryHistory = queryHistory

  // Mock postgres.js connection management methods
  sqlFunction.end = (): Promise<void> => {
    // Mock connection cleanup
    if (mockConfig.logQueries) {
      console.log('Mock SQL connection ended')
    }
    return Promise.resolve()
  }

  // Mock unsafe method for raw SQL execution
  sqlFunction.unsafe = <T = MockQueryResult[]>(sql: string): Promise<T> => {
    const startTime = performance.now()

    // Log query if enabled
    if (mockConfig.logQueries) {
      console.log('Mock SQL Unsafe Query:', sql)
    }

    const executeUnsafe = async (): Promise<T> => {
      // Add delay if configured
      if (mockConfig.queryDelay && mockConfig.queryDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, mockConfig.queryDelay))
      }

      // Check for errors
      if (mockConfig.shouldThrow) {
        const error = typeof mockConfig.shouldThrow === 'function'
          ? mockConfig.shouldThrow(sql, [])
          : mockConfig.shouldThrow

        if (error) {
          // Still record the query attempt
          if (mockConfig.captureQueries) {
            queryHistory.push({
              query: sql,
              parameters: [],
              timestamp: new Date(),
              executionTimeMs: Math.round(performance.now() - startTime),
            })
          }
          throw error
        }
      }

      // Record query execution
      if (mockConfig.captureQueries) {
        queryHistory.push({
          query: sql,
          parameters: [],
          timestamp: new Date(),
          executionTimeMs: Math.round(performance.now() - startTime),
        })
      }

      // Return mock results
      return (mockConfig.mockResults || []) as T
    }

    const promise = executeUnsafe()

    // Add PendingQuery methods
    return Object.assign(promise, {
      describe: () => Promise.resolve({}),
      values: () => Promise.resolve([]),
      raw: () => promise,
      simple: () => promise,
      stream: () => ({} as unknown),
      cursor: () => ({} as unknown),
      readable: () => ({} as unknown),
      writable: () => ({} as unknown),
      execute: () => promise,
      cancel: () => Promise.resolve(),
      listen: () => Promise.resolve({} as unknown),
      unlisten: () => Promise.resolve({} as unknown),
    })
  }

  sqlFunction.reserve = (): Promise<MockSql & { release(): Promise<void> }> => {
    // Return a new mock instance for reserved connections with release method
    const reservedSql = createMockSql(mockConfig)
    const reservedWithRelease = Object.assign(reservedSql, {
      release: (): Promise<void> => Promise.resolve(),
    })
    return Promise.resolve(reservedWithRelease)
  }

  sqlFunction.listen = (
    channels: string | string[],
    _onNotification?: (message: unknown) => void,
  ): Promise<{ unsubscribe: () => void }> => {
    // Mock LISTEN functionality
    return Promise.resolve({
      unsubscribe: () => {
        if (mockConfig.logQueries) {
          console.log('Mock SQL unsubscribed from channels:', channels)
        }
      },
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
      },
    }
  }

  // Mock transaction support
  sqlFunction.begin = async <T>(
    fnOrMode?: ((sql: MockSql) => Promise<T>) | string,
    callback?: (sql: MockSql) => Promise<T>,
  ): Promise<T> => {
    if (typeof fnOrMode === 'string') {
      // Mode + callback signature
      if (callback) {
        return await callback(sqlFunction as MockSql)
      }
      throw new Error('Callback is required when mode is provided')
    } else if (typeof fnOrMode === 'function') {
      // Callback only signature
      return await fnOrMode(sqlFunction as MockSql)
    }
    // No arguments - return sql instance
    return sqlFunction as unknown as T
  }

  // Mock prepared statements
  sqlFunction.prepare = (_query: string): { execute: (...params: unknown[]) => Promise<MockQueryResult[]> } => {
    return {
      execute: (...params: unknown[]) =>
        executeQuery(Object.assign([''], { raw: [''] }) as TemplateStringsArray, ...params),
    }
  }

  // Mock connection options access
  sqlFunction.options = {
    host: ['localhost'],
    port: [5432],
    database: 'test',
    username: 'test',
    pass: null,
    max: 10,
    idle_timeout: 0,
    connect_timeout: 30,
    ssl: false,
    connection: {},
    transform: {
      undefined: null,
      column: undefined,
      value: undefined,
      row: undefined,
    },
    user: 'test',
    db: 'test',
    connect_retries: 5,
    serialization_failure_retries: 5,
    max_lifetime: 0,
    fetch_types: true,
    fetch_array_types: true,
    debug: false,
    keep_alive: 0,
    serializers: {},
    parsers: {},
    types: {},
    prepare: true,
    // deno-lint-ignore no-explicit-any
  } as any

  // Add missing postgres.js constants and properties
  sqlFunction.CLOSE = Symbol('CLOSE')
  sqlFunction.END = Symbol('END')

  // Create a constructor function that returns PostgreSQLError instances
  function MockPostgresErrorConstructor(this: unknown, message?: string): PostgreSQLError {
    // Create a new instance that properly inherits from Error
    const instance = Object.create(MockPostgresErrorConstructor.prototype)
    Error.captureStackTrace?.(instance, MockPostgresErrorConstructor)

    // Set Error properties
    Object.defineProperty(instance, 'name', {
      value: 'PostgresError' as const,
      writable: false,
      enumerable: false,
      configurable: false,
    })
    instance.message = message || 'PostgreSQL Error'
    instance.stack = instance.stack || (new Error()).stack

    // Set PostgreSQL-specific properties
    instance.severity_local = 'ERROR'
    instance.severity = 'ERROR'
    instance.code = '42000'
    instance.position = ''
    instance.file = ''
    instance.line = ''
    instance.routine = ''
    instance.where = ''
    instance.schema = undefined
    instance.table = undefined
    instance.column = undefined
    instance.data_type = undefined
    instance.constraint = undefined
    instance.query = ''
    instance.parameters = []

    return instance
  }

  // Set up prototype chain to inherit from Error
  MockPostgresErrorConstructor.prototype = Object.create(Error.prototype)
  MockPostgresErrorConstructor.prototype.constructor = MockPostgresErrorConstructor
  MockPostgresErrorConstructor.prototype.name = 'PostgresError'

  // Add static properties to match ErrorConstructor interface
  MockPostgresErrorConstructor.captureStackTrace = Error.captureStackTrace || (() => {})
  MockPostgresErrorConstructor.stackTraceLimit = Error.stackTraceLimit || 10
  MockPostgresErrorConstructor.isError = (value: unknown): value is Error => value instanceof Error

  sqlFunction.PostgresError = MockPostgresErrorConstructor as unknown as {
    new (message?: string): PostgreSQLError
    captureStackTrace: typeof Error.captureStackTrace
    stackTraceLimit: number
    isError: (value: unknown) => value is Error
  }
  sqlFunction.parameters = {}
  sqlFunction.typed = {}
  sqlFunction.types = {}

  // Mock file method
  sqlFunction.file = (path: string, parameters?: unknown[]): Promise<MockQueryResult[]> => {
    if (mockConfig.logQueries) {
      console.log('Mock SQL file:', path, 'Parameters:', parameters)
    }
    return Promise.resolve(mockConfig.mockResults || [])
  }

  // Mock forEach method
  sqlFunction.forEach = (fn: (row: MockQueryResult, index: number) => void): Promise<void> => {
    const results = mockConfig.mockResults || []
    results.forEach((row, index) => fn(row, index))
    return Promise.resolve()
  }

  // Mock simple method
  sqlFunction.simple = (): Promise<MockQueryResult[]> => {
    return Promise.resolve(mockConfig.mockResults || [])
  }

  // Mock subscribe method
  sqlFunction.subscribe = (
    channel: string,
    _onNotification?: (message: unknown) => void,
    _onError?: (error: Error) => void,
  ): Promise<{ unsubscribe: () => void }> => {
    return Promise.resolve({
      unsubscribe: () => {
        if (mockConfig.logQueries) {
          console.log('Mock SQL unsubscribed from channel:', channel)
        }
      },
    })
  }

  // Mock largeObject method
  sqlFunction.largeObject = (_oid?: number): Promise<{ writable: boolean; readable: boolean }> => {
    return Promise.resolve({ writable: true, readable: true })
  }

  // Mock array method
  sqlFunction.array = (_arrayOid: number, _parse?: (value: string) => unknown) => {
    return (value: string): unknown[] => {
      try {
        return JSON.parse(value)
      } catch {
        return []
      }
    }
  }

  // Mock json method
  sqlFunction.json = (value: unknown): string => {
    return JSON.stringify(value)
  }

  // deno-lint-ignore no-explicit-any
  return sqlFunction as any as MockSql
}

/**
 * Create a mock SQL instance that simulates PostgreSQL errors
 */
export function createErrorMockSql(error: Error): MockSql {
  return createMockSql({
    shouldThrow: error,
    captureQueries: true,
    logQueries: false,
  })
}

/**
 * Create a mock SQL instance with specific query results
 */
export function createResultMockSql(results: MockQueryResult[]): MockSql {
  return createMockSql({
    mockResults: results,
    captureQueries: true,
    logQueries: false,
  })
}

/**
 * Create a mock SQL instance with conditional error responses
 */
export function createConditionalMockSql(
  errorCondition: (query: string, params: unknown[]) => boolean,
  error: Error,
  defaultResults: MockQueryResult[] = [],
): MockSql {
  return createMockSql({
    mockResults: defaultResults,
    shouldThrow: (query: string, params: unknown[]) => {
      return errorCondition(query, params) ? error : null
    },
    captureQueries: true,
    logQueries: false,
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
      captureQueries: true,
    })
  }

  /**
   * Create a mock for SELECT operations with sample data
   */
  static createSelectMock(sampleData: MockQueryResult[]): MockSql {
    return createMockSql({
      mockResults: sampleData,
      captureQueries: true,
    })
  }

  /**
   * Create a mock that throws connection errors
   */
  static createConnectionErrorMock(): MockSql {
    const error = new Error('Connection failed')
    const postgresError = error as PostgreSQLError
    postgresError.code = '08006' // PostgreSQL connection failure code
    return createErrorMockSql(error)
  }

  /**
   * Create a mock that throws query timeout errors
   */
  static createTimeoutErrorMock(): MockSql {
    const error = new Error('Query timeout')
    const postgresError = error as PostgreSQLError
    postgresError.code = '57014' // PostgreSQL query timeout code
    return createErrorMockSql(error)
  }

  /**
   * Create a mock that throws constraint violation errors
   */
  static createConstraintErrorMock(): MockSql {
    const error = new Error('Unique constraint violation')
    const postgresError = error as PostgreSQLError
    postgresError.code = '23505' // PostgreSQL unique violation code
    return createErrorMockSql(error)
  }

  /**
   * Create a mock with query execution delay
   */
  static createSlowQueryMock(delayMs: number, results: MockQueryResult[] = []): MockSql {
    return createMockSql({
      mockResults: results,
      queryDelay: delayMs,
      captureQueries: true,
    })
  }

  /**
   * Create a mock that simulates empty result sets
   */
  static createEmptyResultMock(): MockSql {
    return createMockSql({
      mockResults: [],
      captureQueries: true,
    })
  }

  /**
   * Create a successful mock with custom results
   */
  static createSuccessfulMock(mockResults: MockQueryResult[]): MockSql {
    return createMockSql({
      mockResults,
      captureQueries: true,
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
    const found = queries.some((record: QueryRecord) =>
      typeof expectedQuery === 'string' ? record.query.includes(expectedQuery) : expectedQuery.test(record.query)
    )

    if (!found) {
      throw new Error(
        `Expected query not found. Expected: ${expectedQuery.toString()}\n` +
          `Executed queries: ${queries.map((q: QueryRecord) => q.query).join('\n')}`,
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
          `Actual: ${JSON.stringify(lastQuery.parameters)}`,
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
