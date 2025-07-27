/**
 * Logger configuration presets for common scenarios
 *
 * Provides ready-to-use logger configurations for development,
 * production, testing, and other common environments.
 */

import type { LoggerConfig } from '../types/logging.ts'

/**
 * Predefined logger configurations for common use cases
 */
export const LOGGER_PRESETS = {
  /**
   * Development configuration
   * - Pretty-printed console output with colors
   * - Debug level logging
   * - Timestamps enabled
   */
  development: {
    type: 'console' as const,
    options: {
      level: 'debug' as const,
      prettyPrint: true,
      colors: true,
      timestamp: true
    }
  },

  /**
   * Production configuration
   * - Structured JSON logging
   * - Info level logging
   * - No pretty printing for log aggregation
   */
  production: {
    type: 'stoat' as const,
    options: {
      level: 'info' as const,
      prettyPrint: false,
      structured: true,
      transports: [
        {
          type: 'console' as const,
          format: 'json' as const,
          minLevel: 'warn'
        }
      ]
    }
  },

  /**
   * Testing configuration
   * - Minimal error-only logging
   * - No colors or pretty printing
   * - No timestamps for deterministic output
   */
  testing: {
    type: 'console' as const,
    options: {
      level: 'error' as const,
      prettyPrint: false,
      colors: false,
      timestamp: false
    }
  },

  /**
   * Cloud/containerized environment configuration
   * - JSON structured logging for log aggregation
   * - Info level with file and HTTP transports
   * - Optimized for centralized logging systems
   */
  cloud: {
    type: 'stoat' as const,
    options: {
      level: 'info' as const,
      prettyPrint: false,
      structured: true,
      transports: [
        {
          type: 'console' as const,
          format: 'json' as const,
          minLevel: 'info'
        },
        {
          type: 'file' as const,
          format: 'json' as const,
          minLevel: 'warn',
          options: {
            path: '/var/log/app.log',
            async: true
          }
        }
      ]
    }
  },

  /**
   * Debug configuration for troubleshooting
   * - Trace level logging
   * - Pretty printed with full context
   * - Stack traces enabled
   */
  debug: {
    type: 'stoat' as const,
    options: {
      level: 'trace' as const,
      prettyPrint: true,
      structured: true,
      serializer: {
        maxDepth: 20,
        includeStackTrace: true,
        includeNonEnumerable: true
      }
    }
  },

  /**
   * High-performance configuration
   * - Async logging for minimal latency impact
   * - Info level to reduce volume
   * - Optimized serialization
   */
  performance: {
    type: 'stoat' as const,
    options: {
      level: 'info' as const,
      prettyPrint: false,
      structured: true,
      transports: [
        {
          type: 'file' as const,
          format: 'json' as const,
          minLevel: 'info',
          options: {
            path: './logs/performance.log',
            async: true,
            bufferSize: 5000
          }
        }
      ]
    }
  }
} as const

/**
 * Get logger preset by name with type safety
 * @param presetName Name of the preset to retrieve
 * @returns Logger configuration for the specified preset
 */
export function getLoggerPreset(presetName: keyof typeof LOGGER_PRESETS): LoggerConfig {
  return LOGGER_PRESETS[presetName]
}

/**
 * Create custom preset based on environment variables
 * @param fallback Fallback preset if environment detection fails
 * @returns Logger configuration based on current environment
 */
export function getEnvironmentPreset(fallback: keyof typeof LOGGER_PRESETS = 'development'): LoggerConfig {
  const env = Deno.env.get('DENO_ENV') || Deno.env.get('NODE_ENV') || 'development'
  
  switch (env.toLowerCase()) {
    case 'development':
    case 'dev':
      return LOGGER_PRESETS.development
    
    case 'production':
    case 'prod':
      return LOGGER_PRESETS.production
    
    case 'test':
    case 'testing':
      return LOGGER_PRESETS.testing
    
    case 'debug':
      return LOGGER_PRESETS.debug
    
    case 'cloud':
    case 'container':
      return LOGGER_PRESETS.cloud
    
    default:
      return LOGGER_PRESETS[fallback]
  }
}

/**
 * Create context-aware preset with additional metadata
 * @param basePreset Base preset to extend
 * @param context Additional context to include
 * @returns Extended logger configuration with context
 */
export function createContextualPreset(
  basePreset: keyof typeof LOGGER_PRESETS,
  context: Record<string, unknown>
): LoggerConfig {
  const preset = LOGGER_PRESETS[basePreset]
  
  return {
    ...preset,
    context
  } as LoggerConfig
}