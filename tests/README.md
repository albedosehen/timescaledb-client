# TimescaleDB Client - Testing Framework

This directory contains the comprehensive testing framework for the TimescaleDB client, implementing the testing strategy defined in `docs/TESTING.md`.

## Directory Structure

```
tests/
├── unit/           # Unit tests mirroring src/ structure
│   ├── types/      # Type validation tests (100% coverage required)
│   ├── client/     # TimescaleClient tests (95% coverage required)
│   ├── database/   # Connection and pooling tests
│   ├── queries/    # SQL query builder tests
│   ├── schema/     # Schema management tests
│   └── factory/    # Factory pattern tests
├── fixtures/       # Test data and mock configurations
│   ├── sample_data.ts     # Representative tick and OHLC test data
│   ├── config_data.ts     # Test configurations for different scenarios
│   ├── error_scenarios.ts # Error conditions and edge cases
│   └── schema_fixtures.ts # Mock schema validation results
├── utils/          # Testing utilities and helpers
│   ├── test_helpers.ts    # Common testing utilities and assertions
│   ├── mock_factory.ts    # Factory functions for creating test mocks
│   ├── data_generators.ts # Functions to generate realistic test data
│   └── assertion_helpers.ts # Custom assertions for financial data
├── mocks/          # Mock implementations and factories
│   ├── postgres.ts        # Mock postgres.js SQL interface
│   └── database.ts        # Mock database layer implementations
└── integration/    # Integration test examples (minimal)
    ├── basic_integration_test.ts
    ├── schema_integration_test.ts
    └── README.md
```

## Testing Standards

### Coverage Requirements
- **100% coverage** for all validation functions in `src/types/`
- **95% coverage** for core TimescaleClient methods
- **80% overall** project coverage
- All public API methods must be tested

### Mock Strategy
- Mock postgres.js SQL interface at the lowest level
- Capture and verify SQL queries generated
- Simulate various response scenarios (success, error, empty results)
- Test retry logic and error handling
- Mock connection pool behavior

### Running Tests

```bash
# Run all tests
deno task test

# Run with coverage
deno task test:coverage

# Run only unit tests
deno task test:unit

# Generate coverage report
deno task coverage

# Watch mode for development
deno task test:watch
```

## Key Testing Principles

1. **Unit Testing Focus**: Test business logic in isolation using mocks
2. **Fast Execution**: Tests run quickly without external dependencies
3. **Deterministic Results**: Tests are repeatable and reliable
4. **Clear Intent**: Each test has a single, well-defined purpose
5. **Easy Maintenance**: Tests are simple to update when code changes

## Test Organization

- Mirror the `src/` directory structure in `tests/unit/`
- One test file per source file where appropriate
- Group related tests logically with `describe/it` blocks
- Use descriptive test names explaining behavior being tested
- Follow Arrange-Act-Assert pattern

This testing framework ensures reliability and correctness of the TimescaleDB client while maintaining fast test execution and minimal infrastructure dependencies.