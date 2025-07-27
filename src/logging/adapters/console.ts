/**
 * Console logger adapter implementation
 *
 * Provides a simple console-based logger with optional formatting,
 * colors, and timestamp support. Suitable for development and
 * simple production scenarios.
 */

import type { Logger, ConsoleOptions } from '../../types/logging.ts'
import { LoggerAdapter } from '../../types/logging.ts'

/**
 * Console logger adapter with context inheritance
 *
 * Features:
 * - Color-coded log levels
 * - Pretty-printed JSON metadata
 * - Optional timestamps
 * - Context inheritance for child loggers
 */
export class ConsoleLoggerAdapter extends LoggerAdapter {
  private readonly options: Required<ConsoleOptions>
  
  constructor(options: ConsoleOptions = {}, context: Record<string, unknown> = {}) {
    super(context)
    this.options = {
      level: options.level || 'info',
      prettyPrint: options.prettyPrint ?? true,
      colors: options.colors ?? true,
      timestamp: options.timestamp ?? true
    }
  }
  
  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.log('DEBUG', message, meta)
    }
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.log('INFO', message, meta)
    }
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.log('WARN', message, meta)
    }
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorMeta = error ? { 
        error: error.message, 
        stack: error.stack,
        name: error.name 
      } : {}
      this.log('ERROR', message, { ...meta, ...errorMeta })
    }
  }
  
  /**
   * Create child logger with inherited options and merged context
   */
  override child(additionalContext: Record<string, unknown>): Logger {
    return new ConsoleLoggerAdapter(this.options, {
      ...this.context,
      ...additionalContext
    })
  }
  
  /**
   * Check if message should be logged based on level
   */
  private shouldLog(level: string): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 }
    return levels[level as keyof typeof levels] >= levels[this.options.level]
  }
  
  /**
   * Internal logging method with formatting
   */
  private log(level: string, message: string, meta?: Record<string, unknown>): void {
    const timestamp = this.options.timestamp ? new Date().toISOString() : null
    const mergedMeta = this.mergeMetadata(meta)
    
    if (this.options.prettyPrint) {
      this.logPretty(level, message, timestamp, mergedMeta)
    } else {
      this.logJson(level, message, timestamp, mergedMeta)
    }
  }
  
  /**
   * Pretty-printed console output
   */
  private logPretty(level: string, message: string, timestamp: string | null, meta: Record<string, unknown>): void {
    const coloredLevel = this.options.colors ? this.colorizeLevel(level) : level
    const timestampStr = timestamp ? `[${timestamp}] ` : ''
    const levelStr = `${coloredLevel.padEnd(5)}`
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : ''
    
    console.log(`${timestampStr}${levelStr} ${message}${metaStr}`)
  }
  
  /**
   * JSON-formatted console output
   */
  private logJson(level: string, message: string, timestamp: string | null, meta: Record<string, unknown>): void {
    const logEntry = {
      ...(timestamp && { timestamp }),
      level: level.toLowerCase(),
      message,
      ...meta
    }
    
    console.log(JSON.stringify(logEntry))
  }
  
  /**
   * Apply colors to log level for better readability
   */
  private colorizeLevel(level: string): string {
    if (!this.options.colors) return level
    
    const colors = {
      DEBUG: '\x1b[36m%s\x1b[0m', // Cyan
      INFO:  '\x1b[32m%s\x1b[0m', // Green
      WARN:  '\x1b[33m%s\x1b[0m', // Yellow
      ERROR: '\x1b[31m%s\x1b[0m'  // Red
    }
    
    const color = colors[level as keyof typeof colors]
    return color ? color.replace('%s', level) : level
  }
}