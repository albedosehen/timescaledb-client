/**
 * Error scenarios and edge cases for testing error handling
 * 
 * Provides comprehensive error conditions to test the client's
 * error handling, validation, and recovery mechanisms.
 */

import type { PostgresError } from '../../src/types/errors.ts'
import { 
  ValidationError, 
  ConnectionError, 
  QueryError, 
  SchemaError, 
  ConfigurationError, 
  TimeoutError, 
  BatchError, 
  RateLimitError 
} from '../../src/types/errors.ts'

/**
 * PostgreSQL error codes and scenarios
 */
export const POSTGRES_ERRORS: Record<string, PostgresError> = {
  connectionRefused: {
    name: 'PostgresError',
    message: 'Connection refused',
    code: '08006', // connection_failure
    severity: 'FATAL'
  },

  connectionTimeout: {
    name: 'PostgresError', 
    message: 'Connection timeout',
    code: '08001', // sqlclient_unable_to_establish_sqlconnection
    severity: 'FATAL'
  },

  authenticationFailed: {
    name: 'PostgresError',
    message: 'Authentication failed for user',
    code: '28P01', // invalid_password
    severity: 'FATAL'
  },

  databaseNotExist: {
    name: 'PostgresError',
    message: 'Database does not exist',
    code: '3D000', // invalid_catalog_name
    severity: 'FATAL'
  },

  tableNotExist: {
    name: 'PostgresError',
    message: 'Relation "price_ticks" does not exist',
    code: '42P01', // undefined_table
    severity: 'ERROR',
    table: 'price_ticks'
  },

  columnNotExist: {
    name: 'PostgresError',
    message: 'Column "invalid_column" does not exist',
    code: '42703', // undefined_column
    severity: 'ERROR',
    column: 'invalid_column'
  },

  syntaxError: {
    name: 'PostgresError',
    message: 'Syntax error near "INVALID"',
    code: '42601', // syntax_error
    severity: 'ERROR',
    position: '15'
  },

  uniqueViolation: {
    name: 'PostgresError',
    message: 'Duplicate key value violates unique constraint',
    code: '23505', // unique_violation
    severity: 'ERROR',
    constraint: 'price_ticks_pkey',
    detail: 'Key (symbol, time)=(BTCUSD, 2024-01-15 10:00:00+00) already exists.'
  },

  checkViolation: {
    name: 'PostgresError',
    message: 'Check constraint violation',
    code: '23514', // check_violation
    severity: 'ERROR',
    constraint: 'price_positive',
    detail: 'Failing row contains (BTCUSD, 2024-01-15 10:00:00+00, -100.00, 1.00).'
  },

  foreignKeyViolation: {
    name: 'PostgresError',
    message: 'Foreign key constraint violation',
    code: '23503', // foreign_key_violation
    severity: 'ERROR',
    constraint: 'fk_symbol_reference'
  },

  notNullViolation: {
    name: 'PostgresError',
    message: 'Null value in column "price" violates not-null constraint',
    code: '23502', // not_null_violation
    severity: 'ERROR',
    column: 'price'
  },

  queryTimeout: {
    name: 'PostgresError',
    message: 'Query was cancelled due to statement timeout',
    code: '57014', // query_canceled
    severity: 'ERROR'
  },

  adminShutdown: {
    name: 'PostgresError',
    message: 'The database system is shutting down',
    code: '57P01', // admin_shutdown
    severity: 'FATAL'
  },

  diskFull: {
    name: 'PostgresError',
    message: 'Could not extend file: No space left on device',
    code: '53100', // disk_full
    severity: 'ERROR'
  },

  tooManyConnections: {
    name: 'PostgresError',
    message: 'Too many connections for role',
    code: '53300', // too_many_connections
    severity: 'FATAL'
  },

  cannotConnectNow: {
    name: 'PostgresError',
    message: 'The database system is starting up',
    code: '57P03', // cannot_connect_now
    severity: 'FATAL'
  }
} as const

/**
 * Client error scenarios for testing error handling
 */
export const CLIENT_ERRORS = {
  validation: {
    invalidSymbol: new ValidationError('Symbol must be 1-20 characters, alphanumeric and underscore only', 'symbol', ''),
    invalidPrice: new ValidationError('Price must be a positive finite number', 'price', -100),
    invalidVolume: new ValidationError('Volume must be a non-negative finite number', 'volume', -10),
    invalidTimestamp: new ValidationError('Invalid timestamp format', 'timestamp', 'not-a-date'),
    invalidTimeRange: new ValidationError('TimeRange.from must be before TimeRange.to'),
    oversizedBatch: new ValidationError('Batch size cannot exceed 10,000 items'),
    emptyBatch: new ValidationError('Batch cannot be empty'),
    invalidOhlc: new ValidationError('Invalid OHLC relationship: high must be >= low')
  },

  connection: {
    connectionRefused: new ConnectionError('Unable to connect to database', new Error('Connection refused')),
    sslRequired: new ConnectionError('SSL connection required but not configured'),
    authFailed: new ConnectionError('Authentication failed'),
    hostUnreachable: new ConnectionError('Host unreachable'),
    poolExhausted: new ConnectionError('Connection pool exhausted')
  },

  query: {
    syntaxError: new QueryError('SQL syntax error', new Error('Syntax error'), 'SELECT * FROM invalid_syntax'),
    tableNotFound: new QueryError('Table not found', new Error('Relation does not exist'), 'SELECT * FROM nonexistent_table'),
    permissionDenied: new QueryError('Permission denied', new Error('Access denied')),
    constraintViolation: new QueryError('Constraint violation', new Error('Unique constraint violated'))
  },

  schema: {
    missingTable: new SchemaError('Required table is missing', 'price_ticks'),
    invalidSchema: new SchemaError('Schema validation failed'),
    missingExtension: new SchemaError('TimescaleDB extension not installed'),
    hypertableNotFound: new SchemaError('Hypertable not found', 'price_ticks')
  },

  configuration: {
    invalidBatchSize: new ConfigurationError('Invalid batch size', 'defaultBatchSize', -100),
    invalidTimeout: new ConfigurationError('Invalid timeout value', 'queryTimeout', -1000),
    missingConnectionString: new ConfigurationError('Connection string is required', 'connectionString'),
    invalidSSLConfig: new ConfigurationError('Invalid SSL configuration', 'ssl')
  },

  timeout: {
    queryTimeout: new TimeoutError('Query execution timeout', 30000, 'SELECT operation'),
    connectionTimeout: new TimeoutError('Connection timeout', 10000, 'connection establishment'),
    batchTimeout: new TimeoutError('Batch operation timeout', 60000, 'batch insert')
  },

  batch: {
    partialFailure: new BatchError('Batch operation partially failed', 500, 250, [
      new Error('Row 251 validation failed'),
      new Error('Row 252 constraint violation')
    ]),
    completeFailure: new BatchError('Batch operation completely failed', 0, 1000, [
      new Error('Database connection lost')
    ])
  },

  rateLimit: {
    basicRateLimit: new RateLimitError('Rate limit exceeded'),
    rateLimitWithRetry: new RateLimitError('Rate limit exceeded', 5000)
  }
} as const

/**
 * Network and infrastructure error scenarios
 */
export const NETWORK_ERRORS = {
  connectionLost: {
    name: 'Error',
    message: 'Connection lost during query execution',
    code: 'ECONNRESET'
  },

  dnsFailure: {
    name: 'Error', 
    message: 'DNS lookup failed',
    code: 'ENOTFOUND'
  },

  networkTimeout: {
    name: 'Error',
    message: 'Network operation timed out',
    code: 'ETIMEDOUT'
  },

  connectionReset: {
    name: 'Error',
    message: 'Connection reset by peer',
    code: 'ECONNRESET'
  },

  networkUnreachable: {
    name: 'Error',
    message: 'Network is unreachable', 
    code: 'ENETUNREACH'
  }
} as const

/**
 * Data corruption and edge case scenarios
 */
export const DATA_SCENARIOS = {
  corruptedData: {
    malformedJson: '{"symbol": "BTCUSD", "price": not_a_number}',
    truncatedData: '{"symbol": "BTCUSD", "pr',
    invalidUnicode: 'Symbol with invalid unicode: \uD800',
    excessivelyLongSymbol: 'A'.repeat(10000),
    sqlInjectionAttempt: "'; DROP TABLE price_ticks; --",
    nullBytes: 'BTCUSD\x00malicious'
  },

  numericEdgeCases: {
    maxSafeInteger: Number.MAX_SAFE_INTEGER,
    minSafeInteger: Number.MIN_SAFE_INTEGER,
    infinitePrice: Infinity,
    negativeInfinity: -Infinity,
    notANumber: NaN,
    veryLargeDecimal: 999999999999.999999999,
    verySmallDecimal: 0.000000000001,
    scientificNotation: 1.23e-10
  },

  timestampEdgeCases: {
    epoch: '1970-01-01T00:00:00.000Z',
    year2038: '2038-01-19T03:14:07.000Z',
    distantFuture: '9999-12-31T23:59:59.999Z',
    invalidLeapYear: '2100-02-29T12:00:00.000Z',
    timezone24Hour: '2024-01-15T24:00:00.000Z', // Invalid: should be 00:00:00 next day
    invalidSecond: '2024-01-15T12:00:60.000Z', // Invalid: seconds go 0-59
    microsecondsOverflow: '2024-01-15T12:00:00.9999999Z'
  }
} as const

/**
 * Concurrency and race condition scenarios
 */
export const CONCURRENCY_SCENARIOS = {
  simultaneousInserts: {
    description: 'Multiple clients inserting same symbol/timestamp',
    conflictType: 'unique_violation',
    resolution: 'last_writer_wins'
  },

  connectionPoolStarvation: {
    description: 'All connections in pool are busy',
    waitTime: 30000,
    expectedBehavior: 'queue_or_timeout'
  },

  transactionDeadlock: {
    description: 'Two transactions waiting for each other',
    errorCode: '40P01', // deadlock_detected
    retryable: true
  },

  longRunningTransaction: {
    description: 'Transaction holding locks for extended period',
    duration: 120000,
    impact: 'blocking_other_operations'
  }
} as const

/**
 * Resource exhaustion scenarios
 */
export const RESOURCE_SCENARIOS = {
  memoryExhaustion: {
    description: 'Client runs out of memory during large batch operation',
    batchSize: 1000000,
    expectedError: 'out_of_memory'
  },

  diskSpaceExhaustion: {
    description: 'Database disk space full during insert',
    postgresError: POSTGRES_ERRORS.diskFull,
    retryable: false
  },

  connectionLimitReached: {
    description: 'Maximum connections to database reached',
    postgresError: POSTGRES_ERRORS.tooManyConnections,
    retryable: true
  },

  queryComplexityLimit: {
    description: 'Query too complex for available memory',
    queryType: 'large_aggregation',
    retryable: false
  }
} as const

/**
 * Security and validation edge cases
 */
export const SECURITY_SCENARIOS = {
  sqlInjection: {
    maliciousSymbol: "'; DROP TABLE price_ticks; --",
    maliciousPrice: "1; DELETE FROM price_ticks WHERE symbol = 'BTCUSD'; --",
    expectedBehavior: 'treated_as_literal_value'
  },

  oversizedInput: {
    description: 'Input larger than expected limits',
    oversizedSymbol: 'A'.repeat(1000000),
    expectedError: 'validation_error'
  },

  invalidEncoding: {
    description: 'Non-UTF8 encoded input',
    invalidSymbol: new TextDecoder('latin1').decode(new Uint8Array([0xFF, 0xFE])),
    expectedError: 'encoding_error'
  },

  timeBasedAttacks: {
    description: 'Timing attack attempts',
    measurements: 'response_time_analysis',
    mitigation: 'constant_time_validation'
  }
} as const

/**
 * Performance degradation scenarios
 */
export const PERFORMANCE_SCENARIOS = {
  slowQuery: {
    description: 'Query that takes longer than normal',
    expectedDuration: 45000,
    timeoutThreshold: 30000,
    expectedBehavior: 'timeout_and_cancel'
  },

  highLatencyConnection: {
    description: 'Connection with high network latency',
    latency: 2000,
    impact: 'slower_operations'
  },

  memoryLeakSimulation: {
    description: 'Gradual memory increase over time',
    pattern: 'increasing_memory_usage',
    detection: 'memory_monitoring'
  },

  cpuIntensiveOperation: {
    description: 'Operation that consumes significant CPU',
    operationType: 'complex_aggregation',
    duration: 60000
  }
} as const

/**
 * Recovery scenario templates
 */
export const RECOVERY_SCENARIOS = {
  gracefulRecovery: {
    description: 'System recovers from transient error',
    errorType: 'connection_timeout',
    recoveryTime: 5000,
    expectedBehavior: 'automatic_retry_success'
  },

  partialRecovery: {
    description: 'Some operations succeed after error',
    errorType: 'batch_partial_failure',
    successRate: 0.7,
    expectedBehavior: 'report_partial_success'
  },

  failureToRecover: {
    description: 'System cannot recover from error',
    errorType: 'schema_missing',
    maxRetries: 3,
    expectedBehavior: 'permanent_failure'
  },

  circuitBreakerActivation: {
    description: 'Circuit breaker prevents further damage',
    failureThreshold: 5,
    timeWindow: 60000,
    expectedBehavior: 'fail_fast'
  }
} as const

/**
 * Helper functions for creating error scenarios
 */
export class ErrorScenarioFactory {
  
  /**
   * Create a PostgreSQL error with custom properties
   */
  static createPostgresError(
    code: string, 
    message: string, 
    additionalProps: Partial<PostgresError> = {}
  ): PostgresError {
    return {
      name: 'PostgresError',
      message,
      code,
      severity: 'ERROR',
      ...additionalProps
    } as PostgresError
  }

  /**
   * Create a series of escalating errors for testing retry logic
   */
  static createRetrySequence(finalSuccess = true): Error[] {
    const errors = [
      new ConnectionError('Temporary connection failure'),
      new TimeoutError('Query timeout', 30000),
      new QueryError('Transient query error')
    ]

    return finalSuccess ? errors : [...errors, new Error('Permanent failure')]
  }

  /**
   * Create a batch error with specific failure patterns
   */
  static createBatchError(totalCount: number, failureRate = 0.1): BatchError {
    const failedCount = Math.floor(totalCount * failureRate)
    const processedCount = totalCount - failedCount
    
    const errors = Array.from({ length: Math.min(failedCount, 5) }, (_, i) => 
      new ValidationError(`Validation failed for record ${i + 1}`)
    )

    return new BatchError(
      `Batch operation partially failed`,
      processedCount,
      failedCount,
      errors
    )
  }

  /**
   * Create a random error from available scenarios
   */
  static createRandomError(): Error {
    const allErrors: Error[] = []

    // Collect all error instances from CLIENT_ERRORS
    Object.values(CLIENT_ERRORS).forEach(errorGroup => {
      Object.values(errorGroup).forEach(error => {
        if (error instanceof Error) {
          allErrors.push(error)
        }
      })
    })

    const randomIndex = Math.floor(Math.random() * allErrors.length)
    const selectedError = allErrors[randomIndex]
    if (!selectedError) {
      throw new Error('No errors available to select from')
    }
    return selectedError
  }
}

/**
 * Test data for error scenario validation
 */
export const ERROR_TEST_CASES = [
  {
    name: 'should handle connection refused',
    error: POSTGRES_ERRORS.connectionRefused,
    expectedType: ConnectionError,
    retryable: true
  },
  {
    name: 'should handle validation error', 
    error: CLIENT_ERRORS.validation.invalidPrice,
    expectedType: ValidationError,
    retryable: false
  },
  {
    name: 'should handle query timeout',
    error: POSTGRES_ERRORS.queryTimeout,
    expectedType: TimeoutError,
    retryable: true
  },
  {
    name: 'should handle unique constraint violation',
    error: POSTGRES_ERRORS.uniqueViolation,
    expectedType: QueryError,
    retryable: false
  }
] as const