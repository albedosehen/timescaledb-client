/**
 * Logger resolution utilities for TimescaleDB client
 *
 * Provides centralized logic for resolving logger instances from
 * ClientOptions, handling backward compatibility and migration.
 */

import type { Logger as LegacyLogger } from '../types/config.ts'
import type { Logger, LoggerConfig } from '../types/logging.ts'
import type { ClientOptions } from '../types/config.ts'
import { loggerFactory } from './factory.ts'

/**
 * Resolve logger instance from ClientOptions
 *
 * Priority order:
 * 1. loggerConfig (new enhanced approach)
 * 2. logger (legacy backward compatibility)
 * 3. auto-detection based on environment
 *
 * @param options Client configuration options
 * @returns Resolved logger instance
 */
export function resolveLoggerFromOptions(options: ClientOptions): Logger | undefined {
  // Priority 1: New enhanced loggerConfig
  if (options.loggerConfig) {
    return loggerFactory.create(options.loggerConfig)
  }

  // Priority 2: Legacy logger for backward compatibility
  if (options.logger) {
    return wrapLegacyLogger(options.logger)
  }

  // Priority 3: Return undefined to maintain existing optional behavior
  // The client code will use optional chaining (logger?.method())
  return undefined
}

/**
 * Create auto-detected logger when no specific configuration is provided
 * @param context Optional initial context
 * @returns Logger instance based on environment
 */
export function createDefaultClientLogger(context?: Record<string, unknown>): Logger {
  return loggerFactory.createAuto(context)
}

/**
 * Wrap legacy logger to provide child logger functionality
 * @param legacyLogger Existing logger instance
 * @returns Enhanced logger with child support
 */
function wrapLegacyLogger(legacyLogger: LegacyLogger): Logger {
  // Check if logger already has child method (enhanced logger)
  if ('child' in legacyLogger && typeof legacyLogger.child === 'function') {
    return legacyLogger as Logger
  }

  // Wrap legacy logger to add child support
  return new LegacyLoggerWrapper(legacyLogger)
}

/**
 * Wrapper class to add child logger support to legacy loggers
 */
class LegacyLoggerWrapper implements Logger {
  constructor(
    private readonly wrappedLogger: LegacyLogger,
    private readonly context: Record<string, unknown> = {},
  ) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.wrappedLogger.debug(message, { ...this.context, ...meta })
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.wrappedLogger.info(message, { ...this.context, ...meta })
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.wrappedLogger.warn(message, { ...this.context, ...meta })
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.wrappedLogger.error(message, error, { ...this.context, ...meta })
  }

  child(additionalContext: Record<string, unknown>): Logger {
    return new LegacyLoggerWrapper(this.wrappedLogger, {
      ...this.context,
      ...additionalContext,
    })
  }

  getContext(): Record<string, unknown> {
    return { ...this.context }
  }
}

/**
 * Utility to check if a logger configuration is valid
 * @param config Logger configuration to validate
 * @returns True if configuration is valid
 */
export function isValidLoggerConfig(config: unknown): config is LoggerConfig {
  if (!config) {
    return false
  }

  if (config === 'auto') {
    return true
  }

  if (typeof config !== 'object') {
    return false
  }

  // deno-lint-ignore no-explicit-any
  const typedConfig = config as any

  // Check for required type property
  if (!typedConfig.type || typeof typedConfig.type !== 'string') {
    return false
  }

  // Validate known logger types
  const validTypes = ['console', 'stoat', 'custom']
  if (!validTypes.includes(typedConfig.type)) {
    return false
  }

  // Additional validation for custom type
  if (typedConfig.type === 'custom' && !typedConfig.logger) {
    return false
  }

  return true
}

/**
 * Migration helper for converting legacy logger configuration
 * @param legacyConfig Configuration with legacy logger
 * @returns Updated configuration with loggerConfig
 */
export function migrateLegacyLoggerConfig(legacyConfig: { logger?: LegacyLogger }): LoggerConfig | undefined {
  if (!legacyConfig.logger) {
    return undefined
  }

  return {
    type: 'custom',
    logger: legacyConfig.logger as Logger,
  }
}
