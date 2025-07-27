/**
 * Error type definitions for TimescaleDB client
 *
 * Provides a hierarchy of error types for different failure scenarios
 * with proper error codes and context information.
 */

/**
 * Base interface for all TimescaleDB client errors
 */
export interface ITimescaleClientError extends Error {
  /** Structured error code for programmatic handling */
  readonly code: string
  /** Optional underlying error that caused this error */
  readonly rootCause?: Error | undefined
  /** Additional context information for debugging */
  readonly details?: Record<string, unknown> | undefined

  /** Convert error to JSON for logging/serialization */
  toJSON(): Record<string, unknown>

  /** Get a user-friendly error message without internal details */
  getUserMessage(): string
}

/**
 * Base error class for all TimescaleDB client errors
 *
 * Provides structured error handling with error codes, root causes,
 * and additional context information for debugging and monitoring.
 *
 * @public
 */
export class TimescaleClientError extends Error implements ITimescaleClientError {
  /**
   * Create a new TimescaleClientError
   *
   * @param message Human-readable error message
   * @param code Structured error code for programmatic handling
   * @param rootCause Optional underlying error that caused this error
   * @param details Additional context information for debugging
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly rootCause?: Error,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'TimescaleClientError'

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimescaleClientError)
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   *
   * @returns Object representation of the error with all relevant information
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
      rootCause: this.rootCause
        ? {
          name: this.rootCause.name,
          message: this.rootCause.message,
          stack: this.rootCause.stack,
        }
        : undefined,
    }
  }

  /**
   * Get a user-friendly error message without internal details
   *
   * @returns User-friendly error message suitable for display to end users
   */
  getUserMessage(): string {
    return this.message
  }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends TimescaleClientError {
  /**
   * Create a new ConnectionError
   *
   * @param message - Human-readable error message
   * @param rootCause - Optional underlying error that caused this connection error
   * @param details - Additional context information for debugging
   */
  constructor(message: string, rootCause?: Error, details?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', rootCause, details)
    this.name = 'ConnectionError'
  }

  /** Get a user-friendly error message for connection errors */
  override getUserMessage(): string {
    return 'Unable to connect to TimescaleDB. Please check your connection configuration.'
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends TimescaleClientError {
  /**
   * Create a new ValidationError
   *
   * @param message - Human-readable error message
   * @param field - Optional field name that failed validation
   * @param value - Optional value that failed validation
   */
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
  ) {
    super(message, 'VALIDATION_ERROR', undefined, { field, value })
    this.name = 'ValidationError'
  }

  /** Get a user-friendly error message for validation errors */
  override getUserMessage(): string {
    if (this.field) {
      return `Invalid value for field '${this.field}': ${this.message}`
    }
    return `Validation error: ${this.message}`
  }
}

/**
 * SQL query execution errors
 */
export class QueryError extends TimescaleClientError {
  /**
   * Create a new QueryError
   *
   * @param message - Human-readable error message
   * @param rootCause - Optional underlying error that caused this query error
   * @param query - Optional SQL query that failed
   * @param parameters - Optional query parameters
   */
  constructor(
    message: string,
    rootCause?: Error,
    public readonly query?: string,
    public readonly parameters?: unknown[],
  ) {
    super(message, 'QUERY_ERROR', rootCause, { query, parameters })
    this.name = 'QueryError'
  }

  /** Get a user-friendly error message for query errors */
  override getUserMessage(): string {
    return 'Database query failed. Please check your data and try again.'
  }
}

/**
 * Schema-related errors (missing tables, indexes, etc.)
 */
export class SchemaError extends TimescaleClientError {
  /**
   * Create a new SchemaError
   *
   * @param message - Human-readable error message
   * @param tableName - Optional table name related to the schema error
   * @param expectedSchema - Optional expected schema information
   */
  constructor(
    message: string,
    public readonly tableName?: string,
    public readonly expectedSchema?: string,
  ) {
    super(message, 'SCHEMA_ERROR', undefined, { tableName, expectedSchema })
    this.name = 'SchemaError'
  }

  /** Get a user-friendly error message for schema errors */
  override getUserMessage(): string {
    return 'Database schema issue detected. Please ensure TimescaleDB is properly configured.'
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends TimescaleClientError {
  /**
   * Create a new ConfigurationError
   *
   * @param message - Human-readable error message
   * @param configField - Optional configuration field that caused the error
   * @param configValue - Optional configuration value that caused the error
   */
  constructor(
    message: string,
    public readonly configField?: string,
    public readonly configValue?: unknown,
  ) {
    super(message, 'CONFIGURATION_ERROR', undefined, { configField, configValue })
    this.name = 'ConfigurationError'
  }

  /** Get a user-friendly error message for configuration errors */
  override getUserMessage(): string {
    return 'Configuration error. Please check your client configuration.'
  }
}

/**
 * Timeout errors for operations that exceed time limits
 */
export class TimeoutError extends TimescaleClientError {
  /**
   * Create a new TimeoutError
   *
   * @param message - Human-readable error message
   * @param timeoutMs - Timeout duration in milliseconds
   * @param operation - Optional operation that timed out
   */
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation?: string,
  ) {
    super(message, 'TIMEOUT_ERROR', undefined, { timeoutMs, operation })
    this.name = 'TimeoutError'
  }

  /** Get a user-friendly error message for timeout errors */
  override getUserMessage(): string {
    return `Operation timed out after ${this.timeoutMs}ms. Please try again.`
  }
}

/**
 * Batch operation errors with partial results
 */
export class BatchError extends TimescaleClientError {
  /**
   * Create a new BatchError
   *
   * @param message - Human-readable error message
   * @param processedCount - Number of items that were successfully processed
   * @param failedCount - Number of items that failed to process
   * @param errors - Array of errors that occurred during batch processing
   */
  constructor(
    message: string,
    public readonly processedCount: number,
    public readonly failedCount: number,
    public readonly errors: Error[],
  ) {
    super(message, 'BATCH_ERROR', undefined, { processedCount, failedCount, errors })
    this.name = 'BatchError'
  }

  /** Get a user-friendly error message for batch errors */
  override getUserMessage(): string {
    return `Batch operation partially failed: ${this.processedCount} succeeded, ${this.failedCount} failed.`
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends TimescaleClientError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message, 'RATE_LIMIT_ERROR', undefined, { retryAfterMs })
    this.name = 'RateLimitError'
  }

  override getUserMessage(): string {
    if (this.retryAfterMs) {
      return `Rate limit exceeded. Please retry after ${this.retryAfterMs}ms.`
    }
    return 'Rate limit exceeded. Please retry later.'
  }
}

/**
 * Error codes enumeration for programmatic handling
 */
export const ERROR_CODES = {
  // Connection errors
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ENTITY_ID: 'INVALID_ENTITY_ID',
  INVALID_TIMESTAMP: 'INVALID_TIMESTAMP',
  INVALID_VALUE: 'INVALID_VALUE',
  INVALID_ENTITY_TYPE: 'INVALID_ENTITY_TYPE',
  INVALID_TIME_SERIES_RECORD: 'INVALID_TIME_SERIES_RECORD',
  INVALID_TIME_RANGE: 'INVALID_TIME_RANGE',
  BATCH_SIZE_EXCEEDED: 'BATCH_SIZE_EXCEEDED',

  // Query errors
  QUERY_ERROR: 'QUERY_ERROR',
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',

  // Schema errors
  SCHEMA_ERROR: 'SCHEMA_ERROR',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  HYPERTABLE_NOT_FOUND: 'HYPERTABLE_NOT_FOUND',
  INDEX_MISSING: 'INDEX_MISSING',

  // Configuration errors
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  INVALID_CONNECTION_STRING: 'INVALID_CONNECTION_STRING',
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  SSL_CONFIG_ERROR: 'SSL_CONFIG_ERROR',

  // Operational errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  BATCH_ERROR: 'BATCH_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
} as const

/**
 * Type for error codes
 */
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

/**
 * PostgreSQL error interface (from postgres.js)
 */
export interface PostgresError extends Error {
  severity?: string
  code?: string
  detail?: string
  hint?: string
  position?: string
  internalPosition?: string
  internalQuery?: string
  where?: string
  schema?: string
  table?: string
  column?: string
  dataType?: string
  constraint?: string
  file?: string
  line?: string
  routine?: string
}

/**
 * Error context for debugging and logging
 */
export interface ErrorContext {
  /** Operation that was being performed when the error occurred */
  readonly operation?: string | undefined
  /** Database table involved in the operation */
  readonly table?: string | undefined
  /** SQL query that was being executed */
  readonly query?: string | undefined
  /** Parameters passed to the query */
  readonly parameters?: unknown[] | undefined
  /** Connection information for the database */
  readonly connectionInfo?: {
    readonly host?: string | undefined
    readonly database?: string | undefined
    readonly applicationName?: string | undefined
  } | undefined
  /** Timestamp when the error occurred */
  readonly timestamp: Date
  /** Additional metadata about the error context */
  readonly metadata?: Record<string, unknown> | undefined
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Check if an error is a specific type of TimescaleDB client error
   */
  static isTimescaleError(error: unknown): error is TimescaleClientError {
    return error instanceof TimescaleClientError
  }

  /**
   * Check if an error is a connection-related error
   */
  static isConnectionError(error: unknown): error is ConnectionError {
    return error instanceof ConnectionError ||
      (ErrorUtils.isTimescaleError(error) && error.code === 'CONNECTION_ERROR')
  }

  /**
   * Check if an error is a validation error
   */
  static isValidationError(error: unknown): error is ValidationError {
    return error instanceof ValidationError ||
      (ErrorUtils.isTimescaleError(error) && error.code === 'VALIDATION_ERROR')
  }

  /**
   * Check if an error is retryable
   */
  static isRetryableError(error: unknown): boolean {
    if (!ErrorUtils.isTimescaleError(error)) {
      return false
    }

    // Don't retry validation errors
    if (error instanceof ValidationError) {
      return false
    }

    // Don't retry configuration errors
    if (error instanceof ConfigurationError) {
      return false
    }

    // Retry connection errors, timeouts, and some query errors
    return error instanceof ConnectionError ||
      error instanceof TimeoutError ||
      (error instanceof QueryError && ErrorUtils.isTransientPostgresError(error.rootCause))
  }

  /**
   * Check if a PostgreSQL error is transient and worth retrying
   */
  static isTransientPostgresError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const pgError = error as PostgresError

    // Connection-related errors
    const transientCodes = [
      '08000', // connection_exception
      '08003', // connection_does_not_exist
      '08006', // connection_failure
      '08001', // sqlclient_unable_to_establish_sqlconnection
      '08004', // sqlserver_rejected_establishment_of_sqlconnection
      '57P01', // admin_shutdown
      '57P02', // crash_shutdown
      '57P03', // cannot_connect_now
    ]

    return transientCodes.includes(pgError.code || '')
  }

  /**
   * Extract meaningful error message from various error types
   */
  static extractMessage(error: unknown): string {
    if (error instanceof TimescaleClientError) {
      return error.getUserMessage()
    }

    if (error instanceof Error) {
      return error.message
    }

    if (typeof error === 'string') {
      return error
    }

    return 'An unknown error occurred'
  }

  /**
   * Create error context for logging
   */
  static createContext(
    operation?: string,
    additionalContext?: Partial<ErrorContext>,
  ): ErrorContext {
    return {
      operation,
      timestamp: new Date(),
      ...additionalContext,
    }
  }
}
