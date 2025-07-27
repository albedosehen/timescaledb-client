/**
 * Stoat logger adapter implementation
 *
 * Provides integration with the @albedosehen/stoat logging library,
 * enabling structured logging, multiple transports, and advanced features
 * while maintaining the common Logger interface.
 */

import type { Logger, StoatOptions } from '../../types/logging.ts'
import { LoggerAdapter } from '../../types/logging.ts'
import { stoat, type StoatBasicLogger } from 'jsr:@albedosehen/stoat'

/**
 * Stoat logger adapter with context inheritance
 *
 * Features:
 * - Structured logging with JSON output
 * - Multiple transport support (console, file, HTTP)
 * - Child loggers with context inheritance
 * - Performance-optimized serialization
 * - Security features (data sanitization)
 */
export class StoatLoggerAdapter extends LoggerAdapter {
  private stoatLogger: StoatBasicLogger | null = null
  private readonly options: StoatOptions
  // deno-lint-ignore no-explicit-any
  private initPromise: Promise<any> | null = null
  
  constructor(options: StoatOptions = {}, context: Record<string, unknown> = {}) {
    super(context)
    this.options = options
    // Start async initialization but don't wait for it
    this.initPromise = this.initializeStoatLogger()
  }
  
  debug(message: string, meta?: Record<string, unknown>): void {
    this.logSync('debug', message, this.mergeMetadata(meta))
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    this.logSync('info', message, this.mergeMetadata(meta))
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    this.logSync('warn', message, this.mergeMetadata(meta))
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const errorMeta = error ? {
      error: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause
    } : {}
    this.logSync('error', message, { ...this.mergeMetadata(meta), ...errorMeta })
  }
  
  /**
   * Create child logger with inherited options and merged context
   */
  override child(additionalContext: Record<string, unknown>): Logger {
    return new StoatLoggerAdapter(this.options, {
      ...this.context,
      ...additionalContext
    })
  }
  
  /**
   * Synchronous logging method that queues messages for async processing
   */
  private logSync(level: string, message: string, meta: Record<string, unknown>): void {
    if (this.stoatLogger) {
      switch (level) {
        case 'debug':
          this.stoatLogger.debug(message, meta)
          break
        case 'info':
          this.stoatLogger.info(message, meta)
          break
        case 'warn':
          this.stoatLogger.warn(message, meta)
          break
        case 'error':
          this.stoatLogger.error(message, meta)
          break
        default:
          this.stoatLogger.info(message, meta)
      }
    } else {
      // If not initialized, fall back to console logging
      const timestamp = new Date().toISOString()
      const logEntry = { timestamp, level, message, ...meta }
      console.log(JSON.stringify(logEntry))

      // Try to initialize for next time (fire and forget)
      if (this.initPromise) {
        this.initPromise.then(logger => {
          this.stoatLogger = logger
        }).catch(() => {
          // Ignore initialization errors - continue with console fallback
        })
      }
    }
  }

  /**
   * Initialize Stoat logger asynchronously
   */
  private async initializeStoatLogger(): Promise<StoatBasicLogger | null> {
    try {
      return await this.createStoatInstance(this.options)
    } catch {
      // Return null if initialization fails
      return null
    }
  }

  /**
   * Create and configure Stoat logger instance
   */
  private createStoatInstance(options: StoatOptions): StoatBasicLogger  {
    try {
      // deno-lint-ignore no-explicit-any
      const config: any = {
        level: options.level || 'info',
        prettyPrint: options.prettyPrint ?? false,
        structured: options.structured ?? true
      }

      // Add transports if specified
      if (options.transports && options.transports.length > 0) {
        config.transports = options.transports.map(transport => this.createTransport(transport))
      }

      // Add serializer configuration
      if (options.serializer) {
        config.serializer = {
          maxDepth: options.serializer.maxDepth || 10,
          includeStackTrace: options.serializer.includeStackTrace ?? false,
          includeNonEnumerable: options.serializer.includeNonEnumerable ?? false
        }
      }

      return stoat.create(config)
    } catch (error) {
      throw new Error(`Failed to initialize Stoat logger: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * Create transport configuration for Stoat
   */
  // deno-lint-ignore no-explicit-any
  private createTransport(transport: any): unknown {
    const baseConfig = {
      type: transport.type,
      minLevel: transport.minLevel || 'info'
    }
    
    switch (transport.type) {
      case 'console':
        return {
          ...baseConfig,
          format: transport.format || 'json'
        }
      
      case 'file':
        return {
          ...baseConfig,
          path: transport.options?.path || './logs/app.log',
          format: transport.format || 'json',
          async: transport.options?.async ?? true,
          bufferSize: transport.options?.bufferSize || 1000
        }
      
      case 'http':
        return {
          ...baseConfig,
          endpoint: transport.options?.endpoint,
          batchSize: transport.options?.batchSize || 100,
          headers: transport.options?.headers || {}
        }
      
      default:
        return baseConfig
    }
  }
  
  /**
   * Check if Stoat library is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await import('jsr:@albedosehen/stoat')
      return true
    } catch {
      return false
    }
  }
}

/**
 * Helper function to create Stoat transports
 */
export function createStoatTransports() {
  return {
    console: (options: { format?: 'json' | 'text'; minLevel?: string } = {}) => ({
      type: 'console' as const,
      format: options.format || 'json',
      minLevel: options.minLevel || 'debug'
    }),
    
    file: (options: { path?: string; format?: 'json' | 'text'; minLevel?: string; async?: boolean } = {}) => ({
      type: 'file' as const,
      format: options.format || 'json',
      minLevel: options.minLevel || 'info',
      options: {
        path: options.path || './logs/app.log',
        async: options.async ?? true,
        bufferSize: 1000
      }
    }),
    
    http: (options: { endpoint: string; minLevel?: string; batchSize?: number } = { endpoint: '' }) => ({
      type: 'http' as const,
      minLevel: options.minLevel || 'warn',
      options: {
        endpoint: options.endpoint,
        batchSize: options.batchSize || 100
      }
    })
  }
}