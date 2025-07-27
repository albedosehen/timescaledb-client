/**
 * Comprehensive mock implementation for the postgres library
 *
 * Provides a realistic mock of the postgres.js Sql interface with:
 * - Tagged template function support
 * - Query capture and result injection
 * - Connection management methods
 * - Error simulation capabilities
 * - Transaction support
 */

/**
 * Mock query result interface
 */
export interface MockQueryResult<T = Record<string, unknown>> extends Array<T> {
  command?: string
  count?: number
  state?: string
}

/**
 * Mock transaction interface
 */
export interface MockTransaction {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...parameters: unknown[]
  ): Promise<MockQueryResult<T>>

  rollback(): Promise<void>
  commit(): Promise<void>
  savepoint(name?: string): Promise<MockTransaction>
}

/**
 * Mock SQL interface matching postgres.js behavior
 */
export interface MockSql {
  /**
   * Execute a query using tagged template literals
   */
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...parameters: unknown[]
  ): Promise<MockQueryResult<T>>

  /**
   * Begin a transaction
   */
  begin<T>(callback?: (sql: MockTransaction) => Promise<T>): Promise<T>

  /**
   * Close all connections
   */
  end(): Promise<void>

  /**
   * Reserve a connection from the pool
   */
  reserve(): Promise<MockSql>

  /**
   * Release a reserved connection back to the pool
   */
  release(): Promise<void>

  /**
   * Execute raw SQL string
   */
  unsafe<T = Record<string, unknown>>(query: string, parameters?: unknown[]): Promise<MockQueryResult<T>>

  /**
   * Get connection options
   */
  options: Record<string, unknown>
}

/**
 * Query capture entry for testing
 */
export interface QueryCapture {
  readonly sql: string
  readonly parameters: readonly unknown[]
  readonly timestamp: Date
}

/**
 * Internal state for the mock
 */
interface MockState {
  capturedQueries: QueryCapture[]
  mockResults: Map<string, MockQueryResult>
  errorConditions: Map<string, Error>
  isConnected: boolean
  connectionCount: number
  transactionLevel: number
}

/**
 * Create a new PostgreSQL mock instance
 */
export function createPostgresMock(): MockSql {
  const state: MockState = {
    capturedQueries: [],
    mockResults: new Map(),
    errorConditions: new Map(),
    isConnected: true,
    connectionCount: 0,
    transactionLevel: 0,
  }

  /**
   * Build query string from template
   */
  function buildQuery(strings: TemplateStringsArray, parameters: unknown[]): string {
    let query = strings[0] || ''

    for (let i = 0; i < parameters.length; i++) {
      const param = parameters[i]
      const paramStr = Array.isArray(param)
        ? `(${param.map((p) => typeof p === 'string' ? `'${p}'` : String(p)).join(',')})`
        : typeof param === 'string'
        ? `'${param}'`
        : String(param)

      query += paramStr + (strings[i + 1] || '')
    }

    return query.trim()
  }

  /**
   * Normalize query for matching (remove extra whitespace, etc.)
   */
  function normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  /**
   * Get default result for common queries
   */
  function getDefaultResult<T>(sql: string): MockQueryResult<T> {
    const normalizedSql = normalizeQuery(sql)

    // Health check queries
    if (normalizedSql.includes('select 1')) {
      return [{ test: 1, version: 'PostgreSQL 14.0 on TimescaleDB 2.8.0' }] as MockQueryResult<T>
    }

    // Version queries
    if (normalizedSql.includes('version()')) {
      return [{ version: 'PostgreSQL 14.0 on TimescaleDB 2.8.0' }] as MockQueryResult<T>
    }

    // TimescaleDB version queries
    if (normalizedSql.includes('timescaledb_version()')) {
      return [{ timescaledb_version: '2.8.0' }] as MockQueryResult<T>
    }

    // Extension queries
    if (normalizedSql.includes('pg_extension')) {
      return [
        { extname: 'timescaledb', extversion: '2.8.0' },
        { extname: 'pg_stat_statements', extversion: '1.9' },
      ] as MockQueryResult<T>
    }

    // Table queries
    if (normalizedSql.includes('pg_tables')) {
      return [
        { tablename: 'time_series_data' },
        { tablename: 'entities' },
      ] as MockQueryResult<T>
    }

    // Hypertable queries
    if (normalizedSql.includes('timescaledb_information.hypertables')) {
      return [
        { hypertable_name: 'time_series_data' },
      ] as MockQueryResult<T>
    }

    // Index queries
    if (normalizedSql.includes('pg_indexes')) {
      return [
        { indexname: 'ix_entity_time' },
        { indexname: 'ix_time' },
        { indexname: 'ix_source' },
      ] as MockQueryResult<T>
    }

    // Settings queries
    if (normalizedSql.includes('pg_settings')) {
      return [
        { name: 'shared_preload_libraries', setting: 'timescaledb' },
        { name: 'max_connections', setting: '100' },
      ] as MockQueryResult<T>
    }

    // Insert/Update/Delete queries
    if (normalizedSql.includes('insert') || normalizedSql.includes('update') || normalizedSql.includes('delete')) {
      const result = [] as MockQueryResult<T>
      result.command = normalizedSql.includes('insert')
        ? 'INSERT'
        : normalizedSql.includes('update')
        ? 'UPDATE'
        : 'DELETE'
      result.count = 1
      return result
    }

    // Default empty result
    const result = [] as MockQueryResult<T>
    result.command = 'SELECT'
    result.count = 0
    return result
  }

  /**
   * Main query execution function
   */
  function executeQuery<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...parameters: unknown[]
  ): Promise<MockQueryResult<T>> {
    const sql = buildQuery(strings, parameters)

    // Capture query for inspection
    state.capturedQueries.push({
      sql,
      parameters,
      timestamp: new Date(),
    })

    // Check for error conditions
    const errorKey = normalizeQuery(sql)
    if (state.errorConditions.has(errorKey)) {
      throw state.errorConditions.get(errorKey)!
    }

    // Check if connection is available
    if (!state.isConnected) {
      throw new Error('Connection terminated')
    }

    // Return mock result or default
    const resultKey = normalizeQuery(sql)
    const mockResult = state.mockResults.get(resultKey)

    if (mockResult) {
      return Promise.resolve(mockResult as MockQueryResult<T>)
    }

    // Default behavior for common queries
    return Promise.resolve(getDefaultResult<T>(sql))
  }

  /**
   * Begin transaction
   */
  async function begin<T>(callback?: (sql: MockTransaction) => Promise<T>): Promise<T> {
    state.transactionLevel++

    const transaction: MockTransaction = (strings, ...parameters) => {
      return executeQuery(strings, ...parameters)
    }

    transaction.rollback = () => {
      state.transactionLevel = Math.max(0, state.transactionLevel - 1)
      return Promise.resolve()
    }

    transaction.commit = () => {
      state.transactionLevel = Math.max(0, state.transactionLevel - 1)
      return Promise.resolve()
    }

    transaction.savepoint = (_name?: string) => {
      return Promise.resolve(transaction)
    }

    if (callback) {
      try {
        const result = await callback(transaction)
        await transaction.commit()
        return result
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    }

    return transaction as unknown as T
  }

  /**
   * Close connections
   */
  function end(): Promise<void> {
    state.isConnected = false
    state.connectionCount = 0
    state.transactionLevel = 0
    return Promise.resolve()
  }

  /**
   * Reserve connection
   */
  function reserve(): Promise<MockSql> {
    if (!state.isConnected) {
      throw new Error('Connection pool is closed')
    }
    state.connectionCount++
    return Promise.resolve(sql)
  }

  /**
   * Release connection
   */
  function release(): Promise<void> {
    state.connectionCount = Math.max(0, state.connectionCount - 1)
    return Promise.resolve()
  }

  /**
   * Execute unsafe query
   */
  function unsafe<T = Record<string, unknown>>(
    query: string,
    parameters: unknown[] = [],
  ): Promise<MockQueryResult<T>> {
    // Convert to template call
    const strings = [query] as unknown as TemplateStringsArray
    return executeQuery<T>(strings, ...parameters)
  }

  // Create the main function with attached methods
  const sql = executeQuery as MockSql
  sql.begin = begin
  sql.end = end
  sql.reserve = reserve
  sql.release = release
  sql.unsafe = unsafe
  sql.options = {
    host: 'localhost',
    port: 5432,
    database: 'test',
    username: 'test',
    max: 10,
  }

  // Add testing helper methods using type assertion to ExtendedMockSql
  const extendedSql = sql as ExtendedMockSql
  extendedSql.setMockResult = (query: string, result: MockQueryResult): void => {
    const normalizedQuery = normalizeQuery(query)
    state.mockResults.set(normalizedQuery, result)
  }
  extendedSql.setErrorCondition = (query: string, error: Error): void => {
    const normalizedQuery = normalizeQuery(query)
    state.errorConditions.set(normalizedQuery, error)
  }
  extendedSql.getCapturedQueries = (): readonly QueryCapture[] => {
    return [...state.capturedQueries]
  }
  extendedSql.clearCapturedQueries = (): void => {
    state.capturedQueries = []
  }
  extendedSql.reset = (): void => {
    state.capturedQueries = []
    state.mockResults.clear()
    state.errorConditions.clear()
    state.isConnected = true
    state.connectionCount = 0
    state.transactionLevel = 0
  }
  extendedSql.simulateConnectionFailure = (): void => {
    state.isConnected = false
  }
  extendedSql.restoreConnection = (): void => {
    state.isConnected = true
  }
  extendedSql.getConnectionStats = (): {
    isConnected: boolean
    connectionCount: number
    transactionLevel: number
  } => {
    return {
      isConnected: state.isConnected,
      connectionCount: state.connectionCount,
      transactionLevel: state.transactionLevel,
    }
  }

  return sql
}

/**
 * Extended mock SQL interface with testing helpers
 */
export interface ExtendedMockSql extends MockSql {
  setMockResult(query: string, result: MockQueryResult): void
  setErrorCondition(query: string, error: Error): void
  getCapturedQueries(): readonly QueryCapture[]
  clearCapturedQueries(): void
  reset(): void
  simulateConnectionFailure(): void
  restoreConnection(): void
  getConnectionStats(): {
    isConnected: boolean
    connectionCount: number
    transactionLevel: number
  }
}

/**
 * Create a postgres mock that can be used as a drop-in replacement
 */
export function createPostgresModuleMock(): typeof import('postgres').default {
  return (() => createPostgresMock()) as unknown as typeof import('postgres').default
}
