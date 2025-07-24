# TimescaleDB Client - File Structure & Organization Plan

## Overview

This document outlines the complete file structure for the TimescaleDB client implementation, following the architectural principles defined in LLM.md.

## Project Root Structure

```
timescaledb-client/
├── mod.ts                      # Main module exports
├── deno.json                   # Deno configuration
├── deno.lock                   # Dependency lock file
├── LLM.md                      # Project development guidelines
├── README.md                   # Project documentation
├── LICENSE                     # MIT license
├── .gitignore                  # Git ignore patterns
├── CHANGELOG.md                # Version history
├── docs/                       # Documentation directory
│   ├── ARCHITECTURE.md         # This file - architecture documentation
│   ├── API.md                  # API reference documentation
│   ├── SCHEMA.md               # Database schema documentation
│   └── examples/               # Usage examples
│       ├── basic-usage.ts      # Basic client usage
│       ├── batch-operations.ts # Batch insert examples
│       └── aggregations.ts     # Query and aggregation examples
└── src/                        # Source code directory
    ├── mod.ts                  # Internal exports
    ├── types/                  # TypeScript interfaces and types
    │   ├── mod.ts              # Type exports
    │   ├── interfaces.ts       # Core data interfaces (PriceTick, Ohlc)
    │   ├── config.ts           # Configuration interfaces
    │   ├── errors.ts           # Error type definitions
    │   └── internal.ts         # Internal type definitions
    ├── client/                 # Core client implementation
    │   ├── mod.ts              # Client exports
    │   ├── timescale-client.ts # Main TimescaleClient class
    │   ├── client-factory.ts   # Factory for client creation
    │   └── connection-manager.ts # Connection lifecycle management
    ├── config/                 # Configuration and connection setup
    │   ├── mod.ts              # Config exports
    │   ├── connection-config.ts # Connection configuration
    │   ├── client-options.ts   # Client behavior options
    │   └── defaults.ts         # Default configuration values
    ├── queries/                # SQL query builders and templates
    │   ├── mod.ts              # Query exports
    │   ├── insert-queries.ts   # Insert operation queries
    │   ├── select-queries.ts   # Select operation queries
    │   ├── aggregation-queries.ts # Aggregation and time-bucket queries
    │   └── schema-queries.ts   # Schema creation and management
    ├── utils/                  # Utilities and helper functions
    │   ├── mod.ts              # Utility exports
    │   ├── validator.ts        # Input validation functions
    │   ├── error-handler.ts    # Error handling utilities
    │   ├── time-utils.ts       # Time and date utilities
    │   └── sql-builder.ts      # SQL query building helpers
    └── tests/                  # Unit tests
        ├── mod.ts              # Test exports and utilities
        ├── client/             # Client tests
        │   ├── timescale-client.test.ts
        │   ├── client-factory.test.ts
        │   └── connection-manager.test.ts
        ├── config/             # Configuration tests
        │   ├── connection-config.test.ts
        │   └── client-options.test.ts
        ├── queries/            # Query builder tests
        │   ├── insert-queries.test.ts
        │   ├── select-queries.test.ts
        │   └── aggregation-queries.test.ts
        ├── utils/              # Utility tests
        │   ├── validator.test.ts
        │   ├── error-handler.test.ts
        │   └── time-utils.test.ts
        └── fixtures/           # Test data and mocks
            ├── mock-data.ts    # Sample test data
            ├── mock-sql.ts     # postgres.js mock implementations
            └── test-config.ts  # Test configuration helpers
```

## File Responsibilities & Dependencies

### Root Level Files

#### `mod.ts` - Main Module Export
```typescript
// Public API exports only
export { TimescaleClient } from './src/client/mod.ts'
export { ClientFactory } from './src/client/mod.ts'
export type { 
  PriceTick, 
  Ohlc, 
  TimeRange, 
  ConnectionConfig,
  ClientOptions 
} from './src/types/mod.ts'
export {
  TimescaleClientError,
  ConnectionError,
  ValidationError,
  QueryError
} from './src/types/mod.ts'
```

### Source Directory Structure

#### `src/types/` - Type Definitions

**`src/types/mod.ts`** - Type Module Exports
```typescript
// Core data interfaces
export type { PriceTick, Ohlc, TimeRange } from './interfaces.ts'

// Configuration interfaces  
export type { 
  ConnectionConfig, 
  ClientOptions,
  SSLConfig 
} from './config.ts'

// Error types
export {
  TimescaleClientError,
  ConnectionError,
  ValidationError,
  QueryError
} from './errors.ts'

// Internal types (not exported from main mod.ts)
export type { 
  SqlInstance,
  QueryBuilder,
  BatchInsertOptions 
} from './internal.ts'
```

**`src/types/interfaces.ts`** - Core Data Interfaces
- `PriceTick` interface matching README spec
- `Ohlc` interface matching README spec  
- `TimeRange` interface for query ranges
- Time interval enums and types

**`src/types/config.ts`** - Configuration Types
- `ConnectionConfig` interface with all postgres.js options
- `ClientOptions` interface for client behavior
- `SSLConfig` interface for SSL configuration
- Connection pool configuration types

**`src/types/errors.ts`** - Error Class Definitions
- Base `TimescaleClientError` class
- Specific error types: `ConnectionError`, `ValidationError`, `QueryError`
- Error code enumerations

**`src/types/internal.ts`** - Internal Types
- Internal interfaces not exposed in public API
- Helper types for query building
- Internal state management types

#### `src/client/` - Client Implementation

**`src/client/mod.ts`** - Client Module Exports
```typescript
export { TimescaleClient } from './timescale-client.ts'
export { ClientFactory } from './client-factory.ts'
export { ConnectionManager } from './connection-manager.ts'
```

**`src/client/timescale-client.ts`** - Main Client Class
- Primary `TimescaleClient` class implementation
- All public API methods (insertTick, getOhlc, etc.)
- Delegates to query builders and validators
- Dependencies: types, utils, queries

**`src/client/client-factory.ts`** - Factory Pattern Implementation
- `ClientFactory` class for creating configured clients
- Factory methods for different initialization patterns
- Connection string parsing and validation
- Dependencies: config, connection-manager

**`src/client/connection-manager.ts`** - Connection Lifecycle
- Manages postgres.js connection instances
- Connection pooling configuration
- Graceful shutdown handling
- Dependencies: config, postgres

#### `src/config/` - Configuration Management

**`src/config/mod.ts`** - Configuration Exports
```typescript
export { ConnectionConfig } from './connection-config.ts'
export { ClientOptions } from './client-options.ts'
export * from './defaults.ts'
```

**`src/config/connection-config.ts`** - Connection Configuration
- Connection parameter validation
- SSL configuration handling
- Environment variable integration
- Connection string parsing

**`src/config/client-options.ts`** - Client Behavior Options
- Client-specific configuration (batch sizes, timeouts)
- Performance tuning options
- Validation rules configuration

**`src/config/defaults.ts`** - Default Values
- Default configuration constants
- Fallback values for optional parameters
- Environment-specific defaults

#### `src/queries/` - SQL Query Management

**`src/queries/mod.ts`** - Query Module Exports
```typescript
export { InsertQueries } from './insert-queries.ts'
export { SelectQueries } from './select-queries.ts'
export { AggregationQueries } from './aggregation-queries.ts'
export { SchemaQueries } from './schema-queries.ts'
```

**`src/queries/insert-queries.ts`** - Insert Operations
- Single and batch insert query builders
- Prepared statement optimization
- Bulk insert with postgres.js patterns
- Dependencies: types, sql-builder

**`src/queries/select-queries.ts`** - Select Operations
- Time range queries
- Symbol-based filtering
- Pagination support
- Dependencies: types, sql-builder

**`src/queries/aggregation-queries.ts`** - TimescaleDB Aggregations
- `time_bucket` aggregation queries
- OHLC calculations from tick data
- Statistical aggregations (volatility, delta)
- Dependencies: types, sql-builder

**`src/queries/schema-queries.ts`** - Schema Management
- Hypertable creation queries
- Index creation and optimization
- Schema validation queries
- Dependencies: sql-builder

#### `src/utils/` - Utilities and Helpers

**`src/utils/mod.ts`** - Utility Exports
```typescript
export { validate } from './validator.ts'
export { handleError, wrapError } from './error-handler.ts'
export { formatTimestamp, parseTimeRange } from './time-utils.ts'
export { buildInsertQuery, buildSelectQuery } from './sql-builder.ts'
```

**`src/utils/validator.ts`** - Input Validation
- `PriceTick` and `Ohlc` validation functions
- Symbol format validation
- Timestamp validation
- Batch size validation
- Dependencies: types

**`src/utils/error-handler.ts`** - Error Management
- Error wrapping and context addition
- postgres.js error translation
- Error logging and formatting
- Dependencies: types

**`src/utils/time-utils.ts`** - Time Utilities
- Timestamp formatting and parsing
- Time range calculations
- Timezone handling
- Dependencies: none (pure functions)

**`src/utils/sql-builder.ts`** - SQL Building Helpers
- Common SQL pattern builders
- Parameterized query helpers
- Query composition utilities
- Dependencies: postgres types

### Testing Structure

#### `src/tests/` - Test Organization

**`src/tests/mod.ts`** - Test Utilities
```typescript
export { createMockSql } from './fixtures/mock-sql.ts'
export { sampleTicks, sampleOhlc } from './fixtures/mock-data.ts'
export { testConfig } from './fixtures/test-config.ts'
```

**Test Categories:**
- **Client Tests**: Test public API methods and client behavior
- **Config Tests**: Test configuration parsing and validation
- **Query Tests**: Test SQL generation and query building
- **Utility Tests**: Test validation, error handling, and utilities
- **Fixtures**: Mock data and helper functions

## Module Dependencies Graph

```
mod.ts
├── src/client/mod.ts
│   ├── timescale-client.ts
│   │   ├── src/types/mod.ts
│   │   ├── src/queries/mod.ts
│   │   └── src/utils/mod.ts
│   ├── client-factory.ts
│   │   ├── src/config/mod.ts
│   │   └── connection-manager.ts
│   └── connection-manager.ts
│       ├── src/config/mod.ts
│       └── postgres.js
├── src/types/mod.ts
│   ├── interfaces.ts
│   ├── config.ts
│   ├── errors.ts
│   └── internal.ts
└── src/utils/mod.ts
    ├── validator.ts
    ├── error-handler.ts
    ├── time-utils.ts
    └── sql-builder.ts
```

## Import Patterns

### External Dependencies
```typescript
// Only in root mod.ts and connection-manager.ts
import postgres from 'postgres'
import type { Sql } from 'postgres'
```

### Internal Dependencies
```typescript
// Always use relative imports within src/
import type { PriceTick } from '../types/interfaces.ts'
import { validate } from '../utils/validator.ts'

// Always use mod.ts for cross-module imports
import { TimescaleClient } from '../client/mod.ts'
import type { ConnectionConfig } from '../config/mod.ts'
```

### Test Dependencies
```typescript
// Standard testing imports
import { assertEquals, assertRejects } from '@std/assert'
import { describe, it } from '@std/testing/bdd'
import { spy, stub } from '@std/testing/mock'

// Test utilities
import { createMockSql, sampleTicks } from '../fixtures/mod.ts'
```

## Build and Export Strategy

### Public API Surface
The main `mod.ts` exposes only:
- `TimescaleClient` class
- `ClientFactory` class  
- Core interfaces: `PriceTick`, `Ohlc`, `TimeRange`
- Configuration interfaces: `ConnectionConfig`, `ClientOptions`
- Error classes for proper error handling

### Internal Implementation
All implementation details remain internal:
- Query builders
- Utility functions
- Internal types
- Connection management details

### Backwards Compatibility
- Maintain stable public API
- Internal refactoring without breaking changes
- Semantic versioning for API changes

## Performance Considerations

### Module Loading
- Lazy loading of query builders
- Minimal dependencies in core types
- Tree-shaking friendly exports

### Memory Usage
- Single postgres.js instance per client
- Shared query builders across operations
- Minimal object allocation in hot paths

### Development Experience
- Clear module boundaries
- Predictable import patterns
- Fast TypeScript compilation
- Easy testing and mocking

This file structure provides a scalable, maintainable architecture that follows TypeScript and Deno best practices while implementing the TimescaleDB client requirements efficiently.