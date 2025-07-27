/**
 * Enhanced logging interfaces and adapters for TimescaleDB client
 *
 * This module provides a flexible logging architecture with support for:
 * - Child loggers with context inheritance
 * - Multiple logging libraries through adapter pattern
 * - Backward compatibility with existing Logger interface
 * - Type-safe configuration and metadata handling
 */

/**
 * Enhanced Logger interface with child logger support
 *
 * Maintains backward compatibility with existing 4-method interface
 * while adding child logger functionality for contextual logging.
 */
export interface Logger {
  /** Log debug-level messages with optional metadata */
  debug(message: string, meta?: Record<string, unknown>): void
  
  /** Log info-level messages with optional metadata */
  info(message: string, meta?: Record<string, unknown>): void
  
  /** Log warning-level messages with optional metadata */
  warn(message: string, meta?: Record<string, unknown>): void
  
  /** Log error-level messages with optional error object and metadata */
  error(message: string, error?: Error, meta?: Record<string, unknown>): void
  
  /** Create child logger with inherited context */
  child(context: Record<string, unknown>): Logger
  
  /** Get current logger context (optional) */
  getContext?(): Record<string, unknown>
}

/**
 * Base adapter class for logger implementations
 *
 * Provides common functionality for all logger adapters including:
 * - Context management and inheritance
 * - Child logger creation
 * - Metadata merging
 */
export abstract class LoggerAdapter implements Logger {
  protected readonly context: Record<string, unknown>
  
  constructor(context: Record<string, unknown> = {}) {
    this.context = Object.freeze({ ...context })
  }
  
  /**
   * Create child logger with inherited context
   * @param additionalContext Additional context to merge with parent context
   * @returns New logger instance with merged context
   */
  child(additionalContext: Record<string, unknown>): Logger {
    const ChildClass = this.constructor as new (context: Record<string, unknown>) => LoggerAdapter
    return new ChildClass({
      ...this.context,
      ...additionalContext
    })
  }
  
  /**
   * Get current logger context
   * @returns Copy of current context
   */
  getContext(): Record<string, unknown> {
    return { ...this.context }
  }
  
  /**
   * Merge call-specific metadata with logger context
   * @param meta Optional metadata from logging call
   * @returns Merged metadata object
   */
  protected mergeMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.context, ...meta }
  }
  
  // Abstract methods that must be implemented by concrete adapters
  abstract debug(message: string, meta?: Record<string, unknown>): void
  abstract info(message: string, meta?: Record<string, unknown>): void
  abstract warn(message: string, meta?: Record<string, unknown>): void
  abstract error(message: string, error?: Error, meta?: Record<string, unknown>): void
}

/**
 * Configuration options for Stoat logger
 */
export interface StoatOptions {
  readonly level?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  readonly prettyPrint?: boolean
  readonly structured?: boolean
  readonly transports?: ReadonlyArray<{
    readonly type: 'console' | 'file' | 'http'
    readonly minLevel?: string
    readonly format?: 'json' | 'text'
    readonly options?: Record<string, unknown>
  }>
  readonly serializer?: {
    readonly maxDepth?: number
    readonly includeStackTrace?: boolean
    readonly includeNonEnumerable?: boolean
  }
}

/**
 * Configuration options for console logger
 */
export interface ConsoleOptions {
  readonly level?: 'debug' | 'info' | 'warn' | 'error'
  readonly prettyPrint?: boolean
  readonly colors?: boolean
  readonly timestamp?: boolean
}

/**
 * Stoat logger configuration
 */
export interface StoatLoggerConfig {
  readonly type: 'stoat'
  readonly options?: StoatOptions
  readonly context?: Record<string, unknown>
}

/**
 * Console logger configuration
 */
export interface ConsoleLoggerConfig {
  readonly type: 'console'
  readonly options?: ConsoleOptions
  readonly context?: Record<string, unknown>
}

/**
 * Custom logger configuration for user-provided loggers
 */
export interface CustomLoggerConfig {
  readonly type: 'custom'
  readonly logger: Logger
  readonly context?: Record<string, unknown>
}

/**
 * Union type for all supported logger configurations
 */
export type LoggerConfig = 
  | StoatLoggerConfig
  | ConsoleLoggerConfig
  | CustomLoggerConfig
  | 'auto'

/**
 * Logger factory interface for creating logger instances
 */
export interface LoggerFactory {
  create(config: LoggerConfig): Logger
  createAuto(context?: Record<string, unknown>): Logger
}