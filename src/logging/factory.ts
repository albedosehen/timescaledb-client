/**
 * Logger factory for creating and configuring logger instances
 *
 * Provides centralized logger creation with support for multiple
 * logger implementations, auto-detection, and configuration-driven selection.
 */

import type { Logger, LoggerConfig, LoggerFactory as ILoggerFactory } from '../types/logging.ts'
import { ConsoleLoggerAdapter } from './adapters/console.ts'

/**
 * Logger factory implementation
 *
 * Handles creation of different logger types based on configuration,
 * with fallback to console logging and environment-aware auto-detection.
 */
export class LoggerFactory implements ILoggerFactory {
  
  /**
   * Create logger instance based on configuration
   * @param config Logger configuration specifying type and options
   * @returns Configured logger instance
   */
  create(config: LoggerConfig): Logger {
    if (config === 'auto') {
      return this.createAuto()
    }
    
    switch (config.type) {
      case 'console':
        return new ConsoleLoggerAdapter(config.options, config.context)
      
      case 'stoat':
        // Import Stoat adapter dynamically to avoid import errors when package not available
        return this.createStoatLogger(config)
      
      case 'custom':
        return this.wrapCustomLogger(config.logger, config.context)
      
      default:
        // TypeScript should ensure this never happens, but provide fallback
        console.warn(`Unknown logger type, falling back to console logger`)
        return new ConsoleLoggerAdapter({}, {})
    }
  }
  
  /**
   * Create logger with auto-detection based on environment
   * @param context Optional initial context for the logger
   * @returns Best available logger instance
   */
  createAuto(context: Record<string, unknown> = {}): Logger {
    const environment = this.detectEnvironment()
    
    switch (environment) {
      case 'development':
        return new ConsoleLoggerAdapter({
          level: 'debug',
          prettyPrint: true,
          colors: true,
          timestamp: true
        }, context)
      
      case 'test':
        return new ConsoleLoggerAdapter({
          level: 'error',
          prettyPrint: false,
          colors: false,
          timestamp: false
        }, context)
      
      case 'production':
        // Try Stoat first, fallback to console
        if (this.isStoatAvailable()) {
          return this.createStoatLogger({
            type: 'stoat',
            options: {
              level: 'info',
              prettyPrint: false,
              structured: true
            },
            context
          })
        }
        return new ConsoleLoggerAdapter({
          level: 'info',
          prettyPrint: false,
          colors: false,
          timestamp: true
        }, context)
      
      default:
        return new ConsoleLoggerAdapter({
          level: 'info',
          prettyPrint: true,
          colors: true,
          timestamp: true
        }, context)
    }
  }
  
  /**
   * Detect current environment
   */
  private detectEnvironment(): 'development' | 'test' | 'production' | 'unknown' {
    const denoEnv = Deno.env.get('DENO_ENV')
    const nodeEnv = Deno.env.get('NODE_ENV')
    
    if (denoEnv === 'test' || nodeEnv === 'test') return 'test'
    if (denoEnv === 'development' || nodeEnv === 'development') return 'development'
    if (denoEnv === 'production' || nodeEnv === 'production') return 'production'
    
    return 'unknown'
  }
  
  /**
   * Check if Stoat library is available
   */
  private isStoatAvailable(): boolean {
    try {
      // This is a simplified check - in real implementation would use dynamic import
      return false // For now, always return false until package is properly installed
    } catch {
      return false
    }
  }
  
  /**
   * Create Stoat logger instance
   */
  // deno-lint-ignore no-explicit-any
  private createStoatLogger(config: { type: 'stoat'; options?: any; context?: Record<string, unknown> }): Logger {
    // For now, fallback to console logger since Stoat package isn't available
    // In real implementation, this would dynamically import StoatLoggerAdapter
    console.warn('Stoat logger requested but not available, falling back to console logger')
    return new ConsoleLoggerAdapter({
      level: config.options?.level || 'info',
      prettyPrint: config.options?.prettyPrint ?? false,
      colors: false,
      timestamp: true
    }, config.context || {})
  }
  
  /**
   * Wrap custom logger to add child logger support if missing
   */
  private wrapCustomLogger(logger: Logger, context?: Record<string, unknown>): Logger {
    // If logger already has child method, return as-is
    if (typeof logger.child === 'function') {
      return logger
    }
    
    // Wrap logger to add child support
    return new CustomLoggerWrapper(logger, context || {})
  }
}

/**
 * Wrapper class to add child logger support to custom loggers
 */
class CustomLoggerWrapper implements Logger {
  constructor(
    private readonly wrappedLogger: Logger,
    private readonly context: Record<string, unknown> = {}
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
    return new CustomLoggerWrapper(this.wrappedLogger, {
      ...this.context,
      ...additionalContext
    })
  }
  
  getContext(): Record<string, unknown> {
    return { ...this.context }
  }
}

/**
 * Default factory instance for convenient access
 */
export const loggerFactory = new LoggerFactory()

/**
 * Convenience functions for common use cases
 */
export function createLogger(config: LoggerConfig): Logger {
  return loggerFactory.create(config)
}

export function createAutoLogger(context?: Record<string, unknown>): Logger {
  return loggerFactory.createAuto(context)
}