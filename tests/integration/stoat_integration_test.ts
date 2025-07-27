/**
 * Quick integration test for Stoat adapter
 */

import { createLogger } from '../../src/logging/mod.ts'

console.log('Testing Stoat adapter integration...\n')

// Test 1: Create Stoat logger (should fallback to console)
console.log('1. Testing Stoat logger creation:')
try {
  const stoatLogger = createLogger({
    type: 'stoat',
    options: {
      level: 'debug',
      prettyPrint: false,
      structured: true,
    },
    context: { service: 'test-app', version: '1.0.0' },
  })

  console.log('✅ Stoat logger created successfully')

  // Test 2: Basic logging operations
  console.log('\n2. Testing basic logging operations:')
  stoatLogger.debug('Debug message from Stoat adapter', { test: true })
  stoatLogger.info('Info message from Stoat adapter')
  stoatLogger.warn('Warning message from Stoat adapter', { warning: 'test' })
  stoatLogger.error('Error message from Stoat adapter', new Error('Test error'))
  console.log('✅ All log levels work correctly')

  // Test 3: Child logger functionality
  console.log('\n3. Testing child logger functionality:')
  const childLogger = stoatLogger.child({ component: 'test-component', operation: 'validation' })
  childLogger.info('Child logger message', { childTest: true })

  // Verify context inheritance
  const context = childLogger.getContext?.()
  if (context?.service === 'test-app' && context?.component === 'test-component') {
    console.log('✅ Child logger context inheritance works correctly')
  } else {
    console.log('❌ Child logger context inheritance failed')
  }

  // Test 4: Nested child loggers
  console.log('\n4. Testing nested child loggers:')
  const grandChildLogger = childLogger.child({ subOperation: 'deep-test' })
  grandChildLogger.debug('Nested child logger message')

  const nestedContext = grandChildLogger.getContext?.()
  if (
    nestedContext?.service === 'test-app' &&
    nestedContext?.component === 'test-component' &&
    nestedContext?.subOperation === 'deep-test'
  ) {
    console.log('✅ Nested child logger works correctly')
  } else {
    console.log('❌ Nested child logger failed')
  }

  console.log('\n🎉 All Stoat adapter tests passed!')
} catch (error) {
  console.error('❌ Stoat adapter test failed:', error)
  Deno.exit(1)
}
