# Contributing to TimescaleDB Client

Thank you for your interest in contributing to the TimescaleDB Client! This document provides guidelines and information for contributors to help ensure a smooth and effective contribution process.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Project Structure](#project-structure)
5. [Contributing Guidelines](#contributing-guidelines)
6. [Development Workflow](#development-workflow)
7. [Testing](#testing)
8. [Documentation](#documentation)
9. [Code Style](#code-style)
10. [Performance Considerations](#performance-considerations)
11. [Security Guidelines](#security-guidelines)
12. [Release Process](#release-process)
13. [Support](#support)

---

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please be respectful, inclusive, and professional in all interactions.

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

---

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js/Deno**: Version 18+ (recommended: 20+)
- **PostgreSQL**: Version 13+ with TimescaleDB extension
- **Git**: For version control
- **TypeScript**: Basic knowledge of TypeScript
- **TimescaleDB**: Understanding of time-series databases

### Types of Contributions

We welcome various types of contributions:

- **Bug Reports**: Help us identify and fix issues
- **Feature Requests**: Suggest new features or improvements
- **Code Contributions**: Implement new features or fix bugs
- **Documentation**: Improve guides, examples, and API documentation
- **Testing**: Add test cases or improve test coverage
- **Performance**: Optimize existing code or add benchmarks

---

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/your-username/timescaledb-client.git
cd timescaledb-client

# Add upstream remote
git remote add upstream https://github.com/original-org/timescaledb-client.git
```

### 2. Install Dependencies

```bash
# Install dependencies
npm install

# Or using Deno
deno cache src/mod.ts
```

### 3. Database Setup

```bash
# Start PostgreSQL with TimescaleDB
docker run -d \
  --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=password \
  timescale/timescaledb:latest-pg15

# Create test database
psql -h localhost -U postgres -c "CREATE DATABASE timescale_test;"
psql -h localhost -U postgres -d timescale_test -c "CREATE EXTENSION timescaledb;"
```

### 4. Environment Configuration

```bash
# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://postgres:password@localhost:5432/timescale_test
NODE_ENV=development
LOG_LEVEL=debug
EOF
```

### 5. Verify Setup

```bash
# Run tests to verify setup
npm test

# Or using Deno
deno test --allow-net --allow-env
```

---

## Project Structure

```text
timescaledb-client/
├── src/                    # Source code
│   ├── client.ts          # Main client class
│   ├── factory.ts         # Client factory
│   ├── mod.ts             # Module exports
│   ├── types/             # Type definitions
│   ├── queries/           # Query operations
│   ├── database/          # Database layer
│   └── schema/            # Schema definitions
├── tests/                 # Test files
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── performance/      # Performance tests
├── examples/             # Usage examples
│   ├── basic/           # Basic examples
│   ├── advanced/        # Advanced examples
│   └── real_world/      # Real-world examples
├── docs/                # Documentation
│   ├── GETTING_STARTED.md
│   ├── API_REFERENCE.md
│   ├── DEPLOYMENT.md
│   └── TROUBLESHOOTING.md
├── scripts/             # Development scripts
├── deno.json           # Deno configuration
├── package.json        # Node.js configuration
└── tsconfig.json       # TypeScript configuration
```

---

## Contributing Guidelines

### Before You Start

1. **Check existing issues**: Look for existing issues or discussions
2. **Create an issue**: For new features or bugs, create an issue first
3. **Discuss approach**: Discuss your approach in the issue before coding
4. **Keep it focused**: One feature or bug fix per pull request

### Issue Templates

When creating issues, use the appropriate template:

#### Bug Report Template

```markdown
## Bug Description

Brief description of the bug

## Steps to Reproduce

1. Step one
2. Step two
3. Step three

## Expected Behavior

What should happen

## Actual Behavior

What actually happens

## Environment

- OS: [e.g., Ubuntu 20.04]
- Node.js/Deno version: [e.g., 20.0.0]
- TimescaleDB version: [e.g., 2.11.0]
- Client version: [e.g., 1.0.0]

## Additional Context

Any additional information
```

#### Feature Request Template

```markdown
## Feature Description

Brief description of the feature

## Use Case

Describe the use case and why this feature is needed

## Proposed Implementation

How you think this should be implemented

## Alternatives Considered

Other approaches you've considered

## Additional Context

Any additional information
```

---

## Development Workflow

### 1. Create Feature Branch

```bash
# Update your fork
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Development Process

```bash
# Make changes
# Add tests
# Update documentation
# Run tests
npm test

# Check code style
npm run lint

# Build project
npm run build
```

### 3. Commit Guidelines

Follow conventional commit format:

```bash
# Format: type(scope): description
git commit -m "feat(client): add streaming support for large datasets"
git commit -m "fix(queries): handle edge case in time range validation"
git commit -m "docs(api): update examples for batch operations"
```

**Commit Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `perf`: Performance improvements
- `chore`: Build process or auxiliary tool changes

### 4. Pull Request Process

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create pull request on GitHub
# Fill out the PR template
# Link to related issues
```

#### Pull Request Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement

## Related Issues

Closes #123

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Performance tests pass
- [ ] Manual testing completed

## Documentation

- [ ] Code comments updated
- [ ] README updated
- [ ] API documentation updated
- [ ] Examples updated

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or marked as breaking)
```

---

## Testing

### Test Structure

```typescript
// tests/unit/client/example_test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.200.0/testing/asserts.ts'
import { afterEach, beforeEach, describe, it } from 'https://deno.land/std@0.200.0/testing/bdd.ts'
import { TimescaleClient } from '../../../src/client.ts'

describe('TimescaleClient', () => {
  let client: TimescaleClient

  beforeEach(async () => {
    client = new TimescaleClient(mockSql)
  })

  afterEach(async () => {
    await client.close()
  })

  it('should insert tick data successfully', async () => {
    const tick = {
      symbol: 'BTCUSD',
      price: 45000,
      timestamp: new Date().toISOString(),
    }

    await client.insertTick(tick)

    const latest = await client.getLatestPrice('BTCUSD')
    assertEquals(latest, 45000)
  })
})
```

### Test Categories

#### Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Focus on edge cases and error handling

#### Integration Tests

- Test complete workflows
- Use real database connections
- Verify data integrity

#### Performance Tests

- Benchmark operations
- Test with large datasets
- Validate memory usage

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/client/client_test.ts

# Run tests with coverage
npm run test:coverage

# Run performance tests
npm run test:performance
```

### Test Guidelines

1. **Test Coverage**: Maintain >90% test coverage
2. **Test Names**: Use descriptive names that explain what is being tested
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Mock External Dependencies**: Don't depend on external services
5. **Test Edge Cases**: Include boundary conditions and error scenarios

---

## Documentation

### Types of Documentation

#### API Documentation

- Use JSDoc comments for all public methods
- Include parameter descriptions and return types
- Provide usage examples

````typescript
/**
 * Insert a single price tick into the database
 * 
 * @param tick - The price tick data to insert
 * @param options - Optional insert configuration
 * @returns Promise that resolves when insertion is complete
 * 
 * @example
 * ```typescript
 * await client.insertTick({
 *   symbol: 'BTCUSD',
 *   price: 45000,
 *   timestamp: new Date().toISOString()
 * })
 * ```
 * 
 * @throws {ValidationError} When tick data is invalid
 * @throws {ConnectionError} When database connection fails
 */
async insertTick(tick: PriceTick, options?: InsertOptions): Promise<void>
````

#### User Documentation

- Keep documentation up-to-date with code changes
- Include practical examples
- Explain complex concepts clearly
- Provide troubleshooting information

#### Code Comments

- Explain complex logic
- Document architectural decisions
- Include TODO items for future improvements

### Documentation Standards

1. **Accuracy**: Ensure documentation matches implementation
2. **Completeness**: Cover all public APIs
3. **Clarity**: Write for developers of all skill levels
4. **Examples**: Include working code examples
5. **Updates**: Update documentation with code changes

---

## Code Style

### TypeScript Standards

```typescript
// Use strict types
interface PriceTick {
  readonly symbol: string
  readonly price: number
  readonly volume?: number
  readonly timestamp: string
}

// Use descriptive names
const calculateMovingAverage = (prices: number[], period: number): number => {
  // Implementation
}

// Use error handling
try {
  await client.insertTick(tick)
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation error
  }
  throw error
}
```

### Naming Conventions

- **Variables**: `camelCase`
- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Files**: `snake_case.ts`

### Code Organization

```typescript
// 1. Imports
import { TimescaleClient } from './client.ts'
import type { PriceTick } from './types.ts'

// 2. Types and interfaces
interface Config {
  readonly timeout: number
}

// 3. Constants
const DEFAULT_TIMEOUT = 30000

// 4. Functions
const validateTick = (tick: PriceTick): boolean => {
  // Implementation
}

// 5. Classes
export class DataProcessor {
  // Implementation
}
```

### ESLint Configuration

```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

---

## Performance Considerations

### Guidelines

1. **Avoid Blocking Operations**: Use async/await properly
2. **Batch Operations**: Group operations when possible
3. **Memory Management**: Release resources promptly
4. **Connection Pooling**: Reuse database connections
5. **Indexing**: Ensure proper database indexes

### Performance Testing

```typescript
// Benchmark example
const benchmarkInsert = async () => {
  const testData = generateTestData(10000)

  const start = performance.now()
  await client.insertManyTicks(testData)
  const duration = performance.now() - start

  console.log(`Inserted ${testData.length} ticks in ${duration}ms`)
  console.log(`Throughput: ${testData.length / duration * 1000} ticks/sec`)
}
```

### Memory Usage

```typescript
// Monitor memory usage
const monitorMemory = () => {
  const usage = process.memoryUsage()
  console.log(`Memory: ${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`)
}
```

---

## Security Guidelines

### Input Validation

```typescript
// Always validate inputs
const validateSymbol = (symbol: string): boolean => {
  return /^[A-Z0-9_]+$/.test(symbol) && symbol.length <= 20
}

const validatePrice = (price: number): boolean => {
  return typeof price === 'number' && price > 0 && isFinite(price)
}
```

### SQL Injection Prevention

```typescript
// Use parameterized queries
const query = `SELECT * FROM price_ticks WHERE symbol = $1 AND time >= $2`
const result = await sql.query(query, [symbol, startTime])
```

### Error Handling

```typescript
// Don't expose internal details
try {
  await dangerousOperation()
} catch (error) {
  // Log internal error
  logger.error('Internal error', error)

  // Return safe error to user
  throw new Error('Operation failed')
}
```

### Dependencies

- Keep dependencies up-to-date
- Use `npm audit` to check for vulnerabilities
- Minimize dependency count
- Pin dependency versions

---

## Release Process

### Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **Major** (`X.0.0`): Breaking changes
- **Minor** (`1.X.0`): New features (backward compatible)
- **Patch** (`1.0.X`): Bug fixes

### Release Steps

1. **Prepare Release**

   ```bash
   # Update version
   npm version patch|minor|major

   # Update CHANGELOG.md
   # Update documentation
   ```

2. **Testing**

   ```bash
   # Run full test suite
   npm test

   # Run performance tests
   npm run test:performance

   # Manual testing
   ```

3. **Create Release**

   ```bash
   # Create release branch
   git checkout -b release/v1.0.1

   # Final commits
   git commit -m "chore: prepare release v1.0.1"

   # Create tag
   git tag -a v1.0.1 -m "Release v1.0.1"
   ```

4. **Publish**

   ```bash
   # Publish to npm
   npm publish

   # Publish to JSR
   deno publish

   # Create GitHub release
   ```

### Release Checklist

- [ ] Version updated in package.json
- [ ] CHANGELOG.md updated
- [ ] Documentation updated
- [ ] Tests passing
- [ ] Performance benchmarks run
- [ ] Security audit completed
- [ ] Examples tested
- [ ] Breaking changes documented
- [ ] Migration guide created (if needed)

---

## Support

### Getting Help

- **Documentation**: Check the docs/ directory
- **Examples**: Look at examples/ directory
- **Issues**: Search existing GitHub issues
- **Discussions**: Use GitHub Discussions for questions

### Reporting Issues

When reporting issues:

1. Use the appropriate issue template
2. Provide minimal reproduction case
3. Include environment details
4. Check for existing similar issues
5. Be respectful and constructive

### Community Guidelines

- Be patient with responses
- Help others when possible
- Follow the code of conduct
- Provide constructive feedback
- Celebrate others' contributions

---

## Additional Resources

### Learning Resources

- [TimescaleDB Documentation](https://docs.timescale.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Deno Manual](https://deno.land/manual)

### Development Tools

- **IDE**: VS Code with TypeScript extensions
- **Database**: pgAdmin or similar for database management
- **Testing**: Built-in Deno testing framework
- **Linting**: ESLint with TypeScript support
- **Formatting**: Prettier for code formatting

### Best Practices

- Follow the existing code style
- Write tests for new features
- Update documentation
- Use meaningful commit messages
- Keep pull requests focused
- Be responsive to feedback

---

Thank you for contributing to the TimescaleDB Client! Your contributions help make this project better for everyone in the financial technology and time-series data community.

For questions or clarifications about contributing, please open an issue or start a discussion on GitHub.
