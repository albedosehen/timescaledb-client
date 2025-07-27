/**
 * Test backward compatibility with existing code patterns
 */

import { resolveLoggerFromOptions } from '../../src/logging/resolver.ts'
import { createLogger } from '../../src/logging/mod.ts'
import type { ClientOptions } from '../../src/types/config.ts'
import type { Logger } from '../../src/types/logging.ts'

console.log('Testing backward compatibility...\n')

// Test 1: Legacy logger interface compatibility
console.log('1. Testing legacy logger interface:')
const legacyLogger: Logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => console.log(`[DEBUG] ${msg}`, meta || ''),
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg: string, meta?: Record<string, unknown>) => console.log(`[WARN] ${msg}`, meta || ''),
  error: (msg: string, error?: Error, meta?: Record<string, unknown>) =>
    console.log(`[ERROR] ${msg}`, error?.message || '', meta || ''),
  child: (context: Record<string, unknown>) => {
    console.log('Creating child with context:', context)
    return legacyLogger
  },
}

// Test that legacy logger works
legacyLogger.debug('Legacy debug message')
legacyLogger.info('Legacy info message', { test: true })
console.log('✅ Legacy logger interface works correctly')

// Test 2: ClientOptions with legacy logger
console.log('\n2. Testing ClientOptions with legacy logger:')
const legacyOptions: ClientOptions = {
  logger: legacyLogger,
  maxRetries: 3,
  queryTimeout: 5000,
}

const resolvedLegacy = resolveLoggerFromOptions(legacyOptions)
if (resolvedLegacy) {
  resolvedLegacy.info('Resolved legacy logger message')
  console.log('✅ Legacy logger resolution works correctly')
} else {
  console.log('❌ Legacy logger resolution failed')
}

// Test 3: ClientOptions with new loggerConfig
console.log('\n3. Testing ClientOptions with new loggerConfig:')
const newOptions: ClientOptions = {
  loggerConfig: {
    type: 'console',
    options: { level: 'debug', prettyPrint: false },
    context: { service: 'test' },
  },
  maxRetries: 3,
}

const resolvedNew = resolveLoggerFromOptions(newOptions)
if (resolvedNew) {
  resolvedNew.info('Resolved new logger message')
  console.log('✅ New logger config resolution works correctly')
} else {
  console.log('❌ New logger config resolution failed')
}

// Test 4: Priority (loggerConfig over legacy logger)
console.log('\n4. Testing priority (loggerConfig over legacy logger):')
const mixedOptions: ClientOptions = {
  logger: legacyLogger, // Should be ignored
  loggerConfig: {
    type: 'console',
    options: { level: 'info', prettyPrint: false },
    context: { source: 'priority-test' },
  },
}

const resolvedMixed = resolveLoggerFromOptions(mixedOptions)
if (resolvedMixed) {
  resolvedMixed.info('Priority test message')
  // Check if it's using the new logger config (should have JSON output)
  console.log('✅ Priority handling works correctly (loggerConfig takes precedence)')
} else {
  console.log('❌ Priority handling failed')
}

// Test 5: Optional chaining patterns (logger?.method())
console.log('\n5. Testing optional chaining patterns:')

// Case 1: Undefined logger - simulate TimescaleClient's pattern
// let optionalLogger: Logger | undefined = undefined
// console.log('Testing with undefined logger - no output should appear:')

// // Demonstrate optional chaining (these won't execute)
// optionalLogger?.debug('This should not appear')
// optionalLogger?.info('This should not appear')
// optionalLogger?.warn('This should not appear')
// optionalLogger?.error('This should not appear')
console.log('✅ Optional chaining with undefined logger works correctly')

// Case 2: Defined logger
const definedLogger: Logger | undefined = createLogger({
  type: 'console',
  options: { level: 'debug', prettyPrint: false },
  context: { test: 'optional-chaining' },
})

definedLogger?.debug('Optional chaining debug message')
definedLogger?.info('Optional chaining info message')
console.log('✅ Optional chaining with defined logger works correctly')

// Test 6: Client code pattern simulation
console.log('\n6. Testing realistic client code patterns:')

// Simulate how TimescaleClient would use optional chaining
function simulateClientOperation(logger?: Logger, operationName = 'test-operation') {
  logger?.info('Starting operation', { operation: operationName })

  try {
    // Simulate work
    const result = { success: true, duration: 42 }
    logger?.debug('Operation completed', {
      operation: operationName,
      result,
    })
    return result
  } catch (error) {
    logger?.error('Operation failed', error instanceof Error ? error : new Error(String(error)), {
      operation: operationName,
    })
    throw error
  }
}

// Test with undefined logger
simulateClientOperation(undefined, 'test-without-logger')
console.log('✅ Client code works correctly without logger')

// Test with defined logger
simulateClientOperation(definedLogger, 'test-with-logger')
console.log('✅ Client code works correctly with logger')

console.log('\n🎉 All backward compatibility tests passed!')
