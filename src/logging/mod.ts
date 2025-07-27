/**
 * Logging module exports for TimescaleDB client
 *
 * Provides a complete logging solution with adapters for multiple
 * libraries, configuration presets, and factory patterns.
 *
 * @example
 * ```typescript
 * import { createLogger, LOGGER_PRESETS } from './logging/mod.ts'
 *
 * // Simple auto-detected logger
 * const logger = createAutoLogger({ service: 'my-app' })
 *
 * // Configured logger
 * const logger = createLogger({
 *   type: 'console',
 *   options: { level: 'debug', prettyPrint: true },
 *   context: { component: 'database' }
 * })
 *
 * // Using presets
 * const logger = createLogger(LOGGER_PRESETS.development)
 * ```
 */

// Core types and interfaces
export type {
  Logger,
  LoggerConfig,
  LoggerFactory as ILoggerFactory,
  StoatOptions,
  ConsoleOptions,
  StoatLoggerConfig,
  ConsoleLoggerConfig,
  CustomLoggerConfig
} from '../types/logging.ts'

export { LoggerAdapter } from '../types/logging.ts'

// Adapter implementations
export { ConsoleLoggerAdapter } from './adapters/console.ts'
export { StoatLoggerAdapter, createStoatTransports } from './adapters/stoat.ts'

// Factory and creation functions
export { LoggerFactory, loggerFactory, createLogger, createAutoLogger } from './factory.ts'

// Configuration presets
export { LOGGER_PRESETS, getLoggerPreset, getEnvironmentPreset, createContextualPreset } from './presets.ts'

// Import required types and functions for local use
import type { Logger, LoggerConfig } from '../types/logging.ts'
import { createLogger, createAutoLogger } from './factory.ts'

/**
 * Convenience function to create logger with environment-based auto-detection
 * @param context Optional initial context
 * @returns Logger instance configured for current environment
 */
export function createDefaultLogger(context?: Record<string, unknown>): Logger {
  return createAutoLogger(context)
}

/**
 * Create logger from environment configuration
 * Uses LOGGER_CONFIG environment variable if available, otherwise auto-detects
 * @param context Optional initial context
 * @returns Configured logger instance
 */
export function createLoggerFromEnv(context?: Record<string, unknown>): Logger {
  const configEnv = Deno.env.get('LOGGER_CONFIG')
  
  if (configEnv) {
    try {
      const config = JSON.parse(configEnv) as LoggerConfig
      return createLogger(config)
    } catch (error) {
      console.warn(`Failed to parse LOGGER_CONFIG environment variable: ${error}`)
    }
  }
  
  return createAutoLogger(context)
}

/**
 * Create child logger with additional context
 * Convenience function for creating contextual loggers
 * @param parentLogger Parent logger instance
 * @param context Additional context to add
 * @returns Child logger with merged context
 */
export function createChildLogger(
  parentLogger: Logger,
  context: Record<string, unknown>
): Logger {
  return parentLogger.child(context)
}