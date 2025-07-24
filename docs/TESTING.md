# TimescaleDB Client - Testing Strategy

## Overview

This document outlines the testing strategy for the TimescaleDB client, focusing on unit testing for core functionality with minimal infrastructure requirements while ensuring reliable, maintainable code.

## Testing Philosophy

### Core Principles

1. **Unit Testing Focus**: Test business logic in isolation using mocks and stubs
2. **Fast Execution**: Tests should run quickly without external dependencies
3. **Deterministic Results**: Tests must be repeatable and reliable
4. **Clear Intent**: Each test should have a single, well-defined purpose
5. **Easy Maintenance**: Tests should be simple to update when code changes

### Testing Pyramid

```text
    /\
   /  \    Few Integration Tests (future consideration)
  /____\
 /      \   Many Unit Tests (current focus)
/________\
```

**Current Scope**: Focus on unit tests with comprehensive coverage of core functionality.

## Testing Framework and Tools

### Deno Standard Testing

Using Deno's built-in testing framework with standard library utilities:

```typescript
import { assertEquals, assertRejects, assertThrows } from '@std/assert'
import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { spy, stub, restore } from '@std/testing/mock'
```

### Mock Strategy

#### Database Mocking

Mock the postgres.js `Sql` interface to isolate database interactions:

```typescript
// Test utilities for mocking
interface MockSql {
  lastQuery?: string
  lastParameters?: unknown[]
  mockResult?: unknown[]
  shouldThrow?: Error
}

function createMockSql(): Sql & MockSql {
  const mockSql = {
    lastQuery: undefined,
    lastParameters: undefined,
    mockResult: [],
    shouldThrow: undefined,

    // Mock the tagged template function
    [Symbol.for('tag')]: (strings: TemplateStringsArray, ...values: unknown[]) => {
      mockSql.lastQuery = strings.join('?')
      mockSql.lastParameters = values
      
      if (mockSql.shouldThrow) {
        throw mockSql.shouldThrow
      }
      
      return Promise.resolve(mockSql.mockResult || [])
    },

    // Mock connection management
    end: () => Promise.resolve(),
    reserve: () => Promise.resolve(mockSql),
    release: () => Promise.resolve(),
    listen: () => Promise.resolve({ unsubscribe: () => {} }),
    notify: () => Promise.resolve()
  }

  // Support direct function calls
  const handler = {
    apply: () => mockSql[Symbol.for('tag')](...arguments)
  }

  return new Proxy(mockSql, handler) as Sql & MockSql
}
```

## Test Structure and Organization

### Directory Structure

```text
src/tests/
├── mod.ts                     # Test utilities and exports
├── client/                    # Client class tests
│   ├── timescale-client.test.ts
│   ├── client-factory.test.ts
│   └── connection-manager.test.ts
├── config/                    # Configuration tests
│   ├── connection-config.test.ts
│   └── client-options.test.ts
├── queries/                   # Query builder tests
│   ├── insert-queries.test.ts
│   ├── select-queries.test.ts
│   └── aggregation-queries.test.ts
├── utils/                     # Utility function tests
│   ├── validator.test.ts
│   ├── error-handler.test.ts
│   └── time-utils.test.ts
└── fixtures/                  # Test data and mocks
    ├── mock-data.ts           # Sample test data
    ├── mock-sql.ts            # SQL mock implementations
    └── test-helpers.ts        # Common test utilities
```

### Test File Naming Convention

- Use `.test.ts` suffix for test files
- Mirror the source file structure
- Group related tests in describe blocks
- Use descriptive test names that explain the behavior being tested

## Unit Testing Patterns

### 1. Client Method Testing

Test public API methods in isolation:

```typescript
import { describe, it } from '@std/testing/bdd'
import { assertEquals, assertRejects } from '@std/assert'
import { TimescaleClient } from '../client/timescale-client.ts'
import { ValidationError } from '../types/errors.ts'
import { createMockSql } from './fixtures/mock-sql.ts'

describe('TimescaleClient', () => {
  describe('insertTick', () => {
    it('should insert valid tick data', async () => {
      // Arrange
      const mockSql = createMockSql()
      const client = new TimescaleClient(mockSql)
      const validTick = {
        symbol: 'BTCUSD',
        price: 45000,
        timestamp: '2024-01-15T10:00:00Z'
      }

      // Act
      await client.insertTick(validTick)

      // Assert
      assertEquals(mockSql.lastQuery?.includes('INSERT INTO price_ticks'), true)
      assertEquals(mockSql.lastParameters?.[0], 'BTCUSD')
      assertEquals(mockSql.lastParameters?.[1], 45000)
    })

    it('should reject invalid symbol', async () => {
      // Arrange
      const mockSql = createMockSql()
      const client = new TimescaleClient(mockSql, { validateInputs: true })
      const invalidTick = {
        symbol: '', // Invalid empty symbol
        price: 45000,
        timestamp: '2024-01-15T10:00:00Z'
      }

      // Act & Assert
      await assertRejects(
        () => client.insertTick(invalidTick),
        ValidationError,
        'Symbol must be a non-empty string'
      )
    })

    it('should handle database errors gracefully', async () => {
      // Arrange
      const mockSql = createMockSql()
      mockSql.shouldThrow = new Error('Connection failed')
      const client = new TimescaleClient(mockSql)
      const validTick = {
        symbol: 'BTCUSD',
        price: 45000,
        timestamp: '2024-01-15T10:00:00Z'
      }

      // Act & Assert
      await assertRejects(
        () => client.insertTick(validTick),
        Error,
        'Connection failed'
      )
    })
  })

  describe('getTicks', () => {
    it('should return formatted tick data', async () => {
      // Arrange
      const mockSql = createMockSql()
      mockSql.mockResult = [
        {
          time: new Date('2024-01-15T10:00:00Z'),
          symbol: 'BTCUSD',
          price: 45000,
          volume: 1.5
        }
      ]
      const client = new TimescaleClient(mockSql)
      const timeRange = {
        from: new Date('2024-01-15T09:00:00Z'),
        to: new Date('2024-01-15T11:00:00Z')
      }

      // Act
      const result = await client.getTicks('BTCUSD', timeRange)

      // Assert
      assertEquals(result.length, 1)
      assertEquals(result[0].symbol, 'BTCUSD')
      assertEquals(result[0].price, 45000)
      assertEquals(result[0].timestamp, '2024-01-15T10:00:00.000Z')
    })

    it('should validate time range parameters', async () => {
      // Arrange
      const mockSql = createMockSql()
      const client = new TimescaleClient(mockSql, { validateInputs: true })
      const invalidRange = {
        from: new Date('2024-01-15T11:00:00Z'),
        to: new Date('2024-01-15T09:00:00Z') // Invalid: to before from
      }

      // Act & Assert
      await assertRejects(
        () => client.getTicks('BTCUSD', invalidRange),
        ValidationError,
        'TimeRange.from must be before TimeRange.to'
      )
    })
  })
})
```

### 2. Validation Testing

Comprehensive testing of input validation logic:

```typescript
import { describe, it } from '@std/testing/bdd'
import { assertEquals, assertThrows } from '@std/assert'
import { Validator } from '../utils/validator.ts'
import { ValidationError } from '../types/errors.ts'

describe('Validator', () => {
  describe('validateTick', () => {
    it('should accept valid tick data', () => {
      const validTick = {
        symbol: 'BTCUSD',
        price: 45000.50,
        volume: 1.25,
        timestamp: '2024-01-15T10:00:00.000Z'
      }

      // Should not throw
      Validator.validateTick(validTick)
    })

    it('should reject negative prices', () => {
      const invalidTick = {
        symbol: 'BTCUSD',
        price: -100,
        timestamp: '2024-01-15T10:00:00.000Z'
      }

      assertThrows(
        () => Validator.validateTick(invalidTick),
        ValidationError,
        'Price must be a positive finite number'
      )
    })

    it('should reject invalid timestamps', () => {
      const invalidTick = {
        symbol: 'BTCUSD',
        price: 45000,
        timestamp: 'invalid-date'
      }

      assertThrows(
        () => Validator.validateTick(invalidTick),
        ValidationError,
        'Invalid timestamp format'
      )
    })

    it('should reject invalid symbol format', () => {
      const invalidTick = {
        symbol: 'invalid symbol with spaces',
        price: 45000,
        timestamp: '2024-01-15T10:00:00.000Z'
      }

      assertThrows(
        () => Validator.validateTick(invalidTick),
        ValidationError,
        'Symbol must be 1-20 characters, alphanumeric and underscore only'
      )
    })
  })

  describe('validateOhlc', () => {
    it('should accept valid OHLC data', () => {
      const validOhlc = {
        symbol: 'ETHUSD',
        timestamp: '2024-01-15T10:00:00.000Z',
        open: 3000,
        high: 3050,
        low: 2980,
        close: 3025,
        volume: 100
      }

      Validator.validateOhlc(validOhlc)
    })

    it('should reject invalid OHLC relationships', () => {
      const invalidOhlc = {
        symbol: 'ETHUSD',
        timestamp: '2024-01-15T10:00:00.000Z',
        open: 3000,
        high: 2900, // Invalid: high < open
        low: 2980,
        close: 3025
      }

      assertThrows(
        () => Validator.validateOhlc(invalidOhlc),
        ValidationError,
        'Invalid OHLC relationship'
      )
    })
  })

  describe('validateBatchSize', () => {
    it('should accept valid batch sizes', () => {
      const validBatch = new Array(1000).fill({
        symbol: 'BTCUSD',
        price: 45000,
        timestamp: '2024-01-15T10:00:00.000Z'
      })

      Validator.validateBatchSize(validBatch)
    })

    it('should reject oversized batches', () => {
      const oversizedBatch = new Array(15000).fill({})

      assertThrows(
        () => Validator.validateBatchSize(oversizedBatch),
        ValidationError,
        'Batch size cannot exceed 10,000 items'
      )
    })

    it('should reject empty batches', () => {
      assertThrows(
        () => Validator.validateBatchSize([]),
        ValidationError,
        'Batch cannot be empty'
      )
    })
  })
})
```

### 3. Error Handling Testing

Test error scenarios and error type handling:

```typescript
import { describe, it } from '@std/testing/bdd'
import { assertEquals, assertInstanceOf } from '@std/assert'
import { ErrorHandler } from '../utils/error-handler.ts'
import {
  ConnectionError,
  ValidationError,
  QueryError
} from '../types/errors.ts'

describe('ErrorHandler', () => {
  describe('wrapPostgresError', () => {
    it('should map connection errors correctly', () => {
      const pgError = {
        name: 'PostgresError',
        message: 'Connection refused',
        code: '08006'
      }

      const wrappedError = ErrorHandler.wrapPostgresError(pgError)

      assertInstanceOf(wrappedError, ConnectionError)
      assertEquals(wrappedError.code, 'CONNECTION_ERROR')
    })

    it('should map constraint violations to validation errors', () => {
      const pgError = {
        name: 'PostgresError',
        message: 'Unique constraint violation',
        code: '23505'
      }

      const wrappedError = ErrorHandler.wrapPostgresError(pgError)

      assertInstanceOf(wrappedError, ValidationError)
      assertEquals(wrappedError.code, 'VALIDATION_ERROR')
    })

    it('should default to QueryError for unknown codes', () => {
      const pgError = {
        name: 'PostgresError',
        message: 'Unknown error',
        code: '99999'
      }

      const wrappedError = ErrorHandler.wrapPostgresError(pgError)

      assertInstanceOf(wrappedError, QueryError)
      assertEquals(wrappedError.code, 'QUERY_ERROR')
    })
  })

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0
      const operation = () => {
        attempts++
        return Promise.resolve('success')
      }

      const result = await ErrorHandler.withRetry(operation, 3)

      assertEquals(result, 'success')
      assertEquals(attempts, 1)
    })

    it('should retry on transient errors', async () => {
      let attempts = 0
      const operation = () => {
        attempts++
        if (attempts < 3) {
          throw new ConnectionError('Temporary failure')
        }
        return Promise.resolve('success')
      }

      const result = await ErrorHandler.withRetry(operation, 3)

      assertEquals(result, 'success')
      assertEquals(attempts, 3)
    })

    it('should not retry validation errors', async () => {
      let attempts = 0
      const operation = () => {
        attempts++
        throw new ValidationError('Invalid data')
      }

      try {
        await ErrorHandler.withRetry(operation, 3)
      } catch (error) {
        assertInstanceOf(error, ValidationError)
        assertEquals(attempts, 1) // Should not retry
      }
    })
  })
})
```

### 4. Configuration Testing

Test configuration parsing and validation:

```typescript
import { describe, it } from '@std/testing/bdd'
import { assertEquals, assertThrows } from '@std/assert'
import { ConfigBuilder, ConfigPresets } from '../types/config.ts'
import { ConfigurationError } from '../types/errors.ts'

describe('ConfigBuilder', () => {
  it('should build valid configuration', () => {
    const { connectionConfig, clientOptions } = ConfigBuilder
      .create()
      .connectionString('postgresql://user:pass@host:5432/db')
      .ssl(true)
      .clientOptions({ validateInputs: true })
      .build()

    assertEquals(connectionConfig.connectionString, 'postgresql://user:pass@host:5432/db')
    assertEquals(connectionConfig.ssl, true)
    assertEquals(clientOptions.validateInputs, true)
  })

  it('should apply default values', () => {
    const { connectionConfig, clientOptions } = ConfigBuilder
      .create()
      .build()

    assertEquals(connectionConfig.host, 'localhost')
    assertEquals(connectionConfig.port, 5432)
    assertEquals(clientOptions.defaultBatchSize, 1000)
  })
})

describe('ConfigPresets', () => {
  it('should create development preset', () => {
    const { connectionConfig, clientOptions } = ConfigPresets
      .development('test_db')
      .build()

    assertEquals(connectionConfig.database, 'test_db')
    assertEquals(connectionConfig.debug, true)
    assertEquals(clientOptions.autoCreateTables, true)
  })

  it('should create production preset', () => {
    const { connectionConfig, clientOptions } = ConfigPresets
      .production('postgresql://prod-url')
      .build()

    assertEquals(connectionConfig.connectionString, 'postgresql://prod-url')
    assertEquals(connectionConfig.ssl, true)
    assertEquals(clientOptions.maxRetries, 5)
  })
})
```

## Test Data Management

### Fixture Data

Create reusable test data in `fixtures/mock-data.ts`:

```typescript
import type { PriceTick, Ohlc } from '../types/interfaces.ts'

export const sampleTicks: PriceTick[] = [
  {
    symbol: 'BTCUSD',
    price: 45000,
    volume: 1.5,
    timestamp: '2024-01-15T10:00:00.000Z'
  },
  {
    symbol: 'ETHUSD',
    price: 3000,
    volume: 10.0,
    timestamp: '2024-01-15T10:01:00.000Z'
  },
  {
    symbol: 'BTCUSD',
    price: 45100,
    volume: 2.0,
    timestamp: '2024-01-15T10:02:00.000Z'
  }
]

export const sampleOhlc: Ohlc[] = [
  {
    symbol: 'BTCUSD',
    timestamp: '2024-01-15T10:00:00.000Z',
    open: 45000,
    high: 45200,
    low: 44800,
    close: 45100,
    volume: 50.5
  },
  {
    symbol: 'ETHUSD',
    timestamp: '2024-01-15T10:00:00.000Z',
    open: 3000,
    high: 3050,
    low: 2980,
    close: 3025,
    volume: 200.0
  }
]

export const invalidTicks = {
  negativePrice: {
    symbol: 'BTCUSD',
    price: -100,
    timestamp: '2024-01-15T10:00:00.000Z'
  },
  invalidSymbol: {
    symbol: '',
    price: 45000,
    timestamp: '2024-01-15T10:00:00.000Z'
  },
  invalidTimestamp: {
    symbol: 'BTCUSD',
    price: 45000,
    timestamp: 'not-a-date'
  }
}
```

### Test Helpers

Common testing utilities in `fixtures/test-helpers.ts`:

```typescript
import type { TimeRange } from '../types/interfaces.ts'

export function createTimeRange(hoursAgo: number = 1): TimeRange {
  const to = new Date()
  const from = new Date(to.getTime() - hoursAgo * 60 * 60 * 1000)

  return { from, to, limit: 1000 }
}

export function createMockDate(isoString: string): Date {
  return new Date(isoString)
}

export function expectToThrow<T extends Error>(
  fn: () => void,
  ErrorClass: new (...args: any[]) => T,
  message?: string
): void {
  let threw = false
  let actualError: Error | undefined

  try {
    fn()
  } catch (error) {
    threw = true
    actualError = error as Error
  }

  if (!threw) {
    throw new Error('Expected function to throw an error')
  }

  if (!(actualError instanceof ErrorClass)) {
    throw new Error(`Expected error to be instance of ${ErrorClass.name}, got ${actualError?.constructor.name}`)
  }

  if (message && !actualError.message.includes(message)) {
    throw new Error(`Expected error message to contain "${message}", got "${actualError.message}"`)
  }
}
```

## Running Tests

### Test Commands

```bash
# Run all tests
deno test --allow-read --allow-write --allow-net --allow-sys

# Run tests with coverage
deno test --allow-read --allow-write --allow-net --allow-sys --coverage=coverage/

# Run specific test file
deno test src/tests/client/timescale-client.test.ts

# Run tests in watch mode
deno test --allow-read --allow-write --allow-net --allow-sys --watch

# Generate coverage report
deno coverage coverage/ --html
```

### Test Configuration

Add test-specific configuration to `deno.json`:

```json
{
  "tasks": {
    "test": "deno test --allow-read --allow-write --allow-net --allow-sys -q",
    "test:watch": "deno test --allow-read --allow-write --allow-net --allow-sys --watch -q",
    "test:coverage": "deno test --allow-read --allow-write --allow-net --allow-sys --coverage=coverage/ -q",
    "test:unit": "deno test src/tests/unit --allow-read --allow-write --allow-net --allow-sys -q"
  }
}
```

## Coverage Requirements

### Minimum Coverage Targets

- **Overall Coverage**: 80% minimum
- **Core Client Methods**: 95% minimum
- **Validation Functions**: 100% required
- **Error Handling**: 90% minimum
- **Configuration**: 85% minimum

### Coverage Exclusions

- External library integration points (postgres.js)
- Platform-specific code
- Debug/logging statements
- Type definitions

## Continuous Testing

### Pre-commit Testing

Ensure all tests pass before code commits:

```bash
#!/bin/bash
# .githooks/pre-commit

echo "Running tests before commit..."
deno test --allow-read --allow-write --allow-net --allow-sys -q

if [ $? -ne 0 ]; then
  echo "Tests failed! Commit aborted."
  exit 1
fi

echo "All tests passed!"
```

### Testing Best Practices

1. **Arrange-Act-Assert Pattern**: Structure tests clearly
2. **One Assertion Per Test**: Focus on single behaviors
3. **Descriptive Test Names**: Explain what is being tested
4. **Mock External Dependencies**: Isolate units under test
5. **Test Both Happy and Error Paths**: Cover success and failure scenarios
6. **Use Test Data Builders**: Create reusable test data factories
7. **Clean Up After Tests**: Restore mocks and clear state

This testing strategy provides a solid foundation for maintaining code quality while keeping the testing infrastructure simple and focused on unit testing with comprehensive coverage of the core functionality.
