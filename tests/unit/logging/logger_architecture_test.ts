/**
 * Tests for enhanced logger architecture
 *
 * Validates the complete logger system including adapters, factory,
 * presets, and backward compatibility features.
 */

import { assertEquals, assertExists, assertInstanceOf } from '@std/assert'

import { 
  createLogger, 
  createAutoLogger, 
  LOGGER_PRESETS,
  ConsoleLoggerAdapter,
  type Logger 
} from '../../../src/logging/mod.ts'
import { resolveLoggerFromOptions } from '../../../src/logging/resolver.ts'
import type { ClientOptions } from '../../../src/types/config.ts'

Deno.test('Logger Factory - should create console logger with configuration', () => {
  const logger = createLogger({
    type: 'console',
    options: { level: 'debug', prettyPrint: true },
    context: { service: 'test' }
  })
  
  assertExists(logger)
  assertInstanceOf(logger, ConsoleLoggerAdapter)
  assertEquals(typeof logger.debug, 'function')
  assertEquals(typeof logger.child, 'function')
})

Deno.test('Logger Factory - should create auto-detected logger', () => {
  const logger = createAutoLogger({ component: 'test' })

  assertExists(logger)
  assertEquals(typeof logger.debug, 'function')
  assertEquals(typeof logger.child, 'function')
})

Deno.test('Logger Factory - should create logger from presets', () => {
  const logger = createLogger(LOGGER_PRESETS.development)

  assertExists(logger)
  assertInstanceOf(logger, ConsoleLoggerAdapter)
})

Deno.test('Child Logger Support - should create child logger with inherited context', () => {
  const parentLogger = createLogger({
    type: 'console',
    options: { level: 'debug', prettyPrint: false },
    context: { service: 'parent', version: '1.0.0' }
  })
  
  const childLogger = parentLogger.child({ component: 'child', operation: 'test' })

  assertExists(childLogger)
  assertEquals(typeof childLogger.debug, 'function')
  assertEquals(typeof childLogger.child, 'function')

  // Verify context inheritance
  const childContext = childLogger.getContext?.()
  assertExists(childContext)
  assertEquals(childContext.service, 'parent')
  assertEquals(childContext.version, '1.0.0')
  assertEquals(childContext.component, 'child')
  assertEquals(childContext.operation, 'test')
})

Deno.test('Child Logger Support - should support nested child loggers', () => {
  const root = createLogger({
    type: 'console',
    context: { service: 'app' }
  })
  
  const level1 = root.child({ module: 'database' })
  const level2 = level1.child({ operation: 'query' })
  const level3 = level2.child({ queryId: '123' })

  const finalContext = level3.getContext?.()
  assertExists(finalContext)
  assertEquals(finalContext.service, 'app')
  assertEquals(finalContext.module, 'database')
  assertEquals(finalContext.operation, 'query')
  assertEquals(finalContext.queryId, '123')
})

Deno.test('Backward Compatibility - should resolve logger from legacy ClientOptions', () => {
  const mockLegacyLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => mockLegacyLogger
  }

  const options: ClientOptions = {
    logger: mockLegacyLogger
  }

  const resolvedLogger = resolveLoggerFromOptions(options)
  assertExists(resolvedLogger)
  assertEquals(typeof resolvedLogger.debug, 'function')
  assertEquals(typeof resolvedLogger.child, 'function')
})

Deno.test('Backward Compatibility - should resolve logger from new loggerConfig', () => {
  const options: ClientOptions = {
    loggerConfig: {
      type: 'console',
      options: { level: 'info' },
      context: { app: 'test' }
    }
  }

  const resolvedLogger = resolveLoggerFromOptions(options)
  assertExists(resolvedLogger)
  assertInstanceOf(resolvedLogger, ConsoleLoggerAdapter)
})

Deno.test('Backward Compatibility - should prioritize loggerConfig over legacy logger', () => {
  const mockLegacyLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => mockLegacyLogger
  }

  const options: ClientOptions = {
    logger: mockLegacyLogger,
    loggerConfig: {
      type: 'console',
      options: { level: 'debug' }
    }
  }

  const resolvedLogger = resolveLoggerFromOptions(options)
  assertExists(resolvedLogger)
  assertInstanceOf(resolvedLogger, ConsoleLoggerAdapter)
})

Deno.test('Logger Presets - should provide development preset', () => {
  const preset = LOGGER_PRESETS.development
  assertEquals(preset.type, 'console')
  assertEquals(preset.options?.level, 'debug')
  assertEquals(preset.options?.prettyPrint, true)
})

Deno.test('Logger Presets - should provide production preset', () => {
  const preset = LOGGER_PRESETS.production
  assertEquals(preset.type, 'stoat')
  assertEquals(preset.options?.level, 'info')
  assertEquals(preset.options?.prettyPrint, false)
})

Deno.test('Logger Presets - should provide testing preset', () => {
  const preset = LOGGER_PRESETS.testing
  assertEquals(preset.type, 'console')
  assertEquals(preset.options?.level, 'error')
  assertEquals(preset.options?.prettyPrint, false)
})

Deno.test('Console Logger Adapter - should handle different log levels', () => {
  const logger = new ConsoleLoggerAdapter({
    level: 'debug',
    prettyPrint: false,
    colors: false
  })
  
  // These should not throw
  logger.debug('Debug message', { meta: 'data' })
  logger.info('Info message')
  logger.warn('Warning message', { warning: true })
  logger.error('Error message', new Error('Test error'))
})

Deno.test('Console Logger Adapter - should respect log level filtering', () => {
  const logger = new ConsoleLoggerAdapter({
    level: 'warn', // Only warn and error should log
    prettyPrint: false
  })

  // These should work (though we can't easily test console output)
  logger.warn('This should log')
  logger.error('This should log')
  logger.debug('This should be filtered out')
  logger.info('This should be filtered out')
})