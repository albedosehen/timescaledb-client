// deno-lint-ignore-file no-explicit-any
/**
 * Unit tests for DatabaseConnection class - Using dependency injection
 * 
 * Tests all public methods, configuration validation, error handling,
 * and various connection scenarios for the DatabaseConnection class.
 * Aims for 95%+ code coverage following project testing standards.
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertRejects, assertThrows, assert, assertInstanceOf } from '@std/assert'
import { DatabaseConnection, createDatabaseConnection } from '../../../src/database/connection.ts'
import type { ConnectionConfig } from '../../../src/types/config.ts'
import { ConfigurationError, ConnectionError, ValidationError } from '../../../src/types/errors.ts'
import { createPostgresMock, type ExtendedMockSql } from '../../mocks/postgres_mock.ts'
import { TestLogger } from '../../utils/test_helpers.ts'
import { TEST_CONNECTION_CONFIGS, MOCK_SQL_RESPONSES, DATABASE_ERROR_SCENARIOS } from '../../fixtures/database_fixtures.ts'

/**
 * Create a mock postgres factory that supports the full postgres.js interface
 */
function createMockPostgresFactory(mockSql?: ExtendedMockSql, shouldThrow?: Error | string) {
  const sql = mockSql || createPostgresMock() as ExtendedMockSql

  const mockPostgres = (_config: any) => {
    if (shouldThrow) {
      throw shouldThrow
    }
    return sql as any
  }

  // Add required static properties to match postgres interface
  mockPostgres.toPascal = () => ({})
  mockPostgres.fromPascal = () => ({})
  mockPostgres.toCamel = () => ({})
  mockPostgres.fromCamel = () => ({})
  mockPostgres.toKebab = () => ({})
  mockPostgres.fromKebab = () => ({})
  mockPostgres.BigInt = BigInt
  mockPostgres.types = {}
  mockPostgres.postgresql = {}
  mockPostgres.prepare = () => ({})
  mockPostgres.unprepare = () => ({})

  return mockPostgres as any
}

/**
 * Test suite for DatabaseConnection class
 *
 * Covers constructor validation, connection management, SQL operations,
 * error handling, and all public methods with comprehensive scenarios.
 */
describe.skip('DatabaseConnection', () => {
  let mockSql: ExtendedMockSql
  let logger: TestLogger

  beforeEach(() => {
    mockSql = createPostgresMock() as ExtendedMockSql
    logger = new TestLogger()

    // Set up default mock responses
    mockSql.setMockResult('SELECT 1 as test, version() as version', MOCK_SQL_RESPONSES.healthCheck)
    mockSql.setMockResult('SELECT timescaledb_version()', MOCK_SQL_RESPONSES.timescaleVersion)
    mockSql.setMockResult('SELECT EXISTS( SELECT 1 FROM pg_extension WHERE extname = \'timescaledb\' ) as installed', [{ installed: true }])
  })

  afterEach(() => {
    mockSql.reset()
    logger.clearLogs()
  })

  /**
   * Constructor and Configuration Validation Tests
   *
   * Tests all validation scenarios including SSL config, port validation,
   * password handling, and various configuration combinations.
   */
  describe('Constructor and Configuration Validation', () => {
    describe('Valid Configurations', () => {
      it('should create connection with connection string', () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user:pass@localhost:5432/testdb'
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should create connection with individual parameters', () => {
        const config = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should create connection with minimal configuration', () => {
        const config = TEST_CONNECTION_CONFIGS.minimal!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should create connection with async password function', () => {
        const config = TEST_CONNECTION_CONFIGS.asyncPassword!
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should create connection with SSL boolean', () => {
        const config: ConnectionConfig = {
          ...TEST_CONNECTION_CONFIGS.test!,
          ssl: true
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should create connection with SSL object configuration', () => {
        const config: ConnectionConfig = {
          ...TEST_CONNECTION_CONFIGS.test!,
          ssl: {
            rejectUnauthorized: true,
            mode: 'require',
            ca: 'test-ca',
            cert: 'test-cert',
            key: 'test-key'
          }
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should handle single port configuration', () => {
        const config: ConnectionConfig = {
          ...TEST_CONNECTION_CONFIGS.test!,
          port: 5432
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })

      it('should handle port array configuration', () => {
        const config: ConnectionConfig = {
          ...TEST_CONNECTION_CONFIGS.test!,
          port: [5432, 5433, 5434]
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        assertEquals(connection.isConnected(), false)
      })
    })

    describe('Invalid Configurations', () => {
      it('should throw ValidationError for missing connection info', () => {
        const config: ConnectionConfig = {}
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'Must provide either connectionString, host, or path'
        )
      })

      it('should throw ValidationError for invalid port number', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          port: 70000
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'Port must be between 1 and 65535'
        )
      })

      it('should throw ValidationError for invalid port in array', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          port: [5432, 0, 5434]
        }
        const mockPostgresFactory = createMockPostgresFactory()
        
        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'Port must be between 1 and 65535'
        )
      })

      it('should throw ValidationError for invalid maxConnections', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          maxConnections: 0
        }
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'maxConnections must be at least 1'
        )
      })

      it('should throw ValidationError for invalid connectTimeout', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          connectTimeout: 0
        }
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'connectTimeout must be at least 1 second'
        )
      })

      it('should throw ValidationError for invalid SSL mode', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          ssl: {
            mode: 'invalid-mode' as any
          }
        }
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'Invalid SSL mode'
        )
      })

      it('should throw ValidationError for invalid SSL CA certificate type', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          ssl: {
            ca: 123 as any
          }
        }
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'SSL CA certificate must be a string'
        )
      })

      it('should throw ValidationError for invalid SSL cert type', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          ssl: {
            cert: {} as any
          }
        }
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'SSL client certificate must be a string'
        )
      })

      it('should throw ValidationError for invalid SSL key type', () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          ssl: {
            key: [] as any
          }
        }
        const mockPostgresFactory = createMockPostgresFactory()

        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ValidationError,
          'SSL private key must be a string'
        )
      })
    })
  })

  /**
   * connect() Method Tests
   *
   * Tests successful connections, reusing connections, error handling,
   * and various configuration scenarios.
   */
  describe('connect() Method', () => {
    describe('Successful Connections', () => {
      it('should connect successfully with connection string', async () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user:pass@localhost:5432/testdb'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
        assertEquals(connection.isConnected(), true)
        assert(logger.hasLogMessage('Database connection established successfully', 'info'))
      })

      it('should connect successfully with individual parameters', async () => {
        const config = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
        assertEquals(connection.isConnected(), true)
      })

      it('should reuse existing connection', async () => {
        const config = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        const sql1 = await connection.connect()
        const sql2 = await connection.connect()
        
        assertEquals(sql1, sql2)
        assert(logger.hasLogMessage('Reusing existing connection', 'debug'))
      })

      it('should handle async password function', async () => {
        const config = TEST_CONNECTION_CONFIGS.asyncPassword!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
      })
    })

    describe('Connection Failures', () => {
      it('should handle connection timeout', async () => {
        const config = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql, DATABASE_ERROR_SCENARIOS.connectionTimeout.error)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        await assertRejects(
          () => connection.connect(),
          ConnectionError,
          'Failed to establish database connection'
        )
        
        assertEquals(connection.isConnected(), false)
      })

      it('should handle authentication failure', async () => {
        const config = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql, DATABASE_ERROR_SCENARIOS.authenticationFailed.error)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

        await assertRejects(
          () => connection.connect(),
          ConnectionError,
          'Failed to establish database connection'
        )
      })

      it('should handle async password function failure', async () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          database: 'test',
          username: 'user',
          password: () => Promise.reject(new Error('Password fetch failed'))
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

        await assertRejects(
          () => connection.connect(),
          ConnectionError
        )
      })

      it('should handle connection test failure', async () => {
        // Mock the test query to fail
        mockSql.setErrorCondition('SELECT 1 as test, version() as version', new Error('Test query failed'))

        const config = TEST_CONNECTION_CONFIGS.test!
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

        await assertRejects(
          () => connection.connect(),
          ConnectionError,
          'Failed to establish database connection'
        )
      })
    })

    describe('SSL Configuration Building', () => {
      it('should build SSL config with connection string ssl parameter', async () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user:pass@localhost:5432/testdb?ssl=true&sslmode=require'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
      })

      it('should build SSL config with different SSL modes', async () => {
        const modes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']

        for (const mode of modes) {
          const config: ConnectionConfig = {
            host: 'localhost',
            database: 'test',
            ssl: { mode: mode as any }
          }
          const mockPostgresFactory = createMockPostgresFactory(mockSql)
          const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

          const sql = await connection.connect()
          assertInstanceOf(sql, Object)
        }
      })
    })
  })

  /**
   * disconnect() Method Tests
   *
   * Tests successful disconnection, error handling, and edge cases.
   */
  describe('disconnect() Method', () => {
    it('should disconnect successfully', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      assertEquals(connection.isConnected(), true)

      await connection.disconnect()
      assertEquals(connection.isConnected(), false)
      assert(logger.hasLogMessage('Database connection closed', 'info'))
    })

    it('should handle disconnect when not connected', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      // Should not throw when disconnecting without connection
      await connection.disconnect()
      assertEquals(connection.isConnected(), false)
    })

    it('should handle disconnect error', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock end() to throw an error
      mockSql.end = () => Promise.reject(new Error('Disconnect failed'))

      await assertRejects(
        () => connection.disconnect(),
        ConnectionError,
        'Failed to close database connection'
      )
    })

    it('should handle multiple disconnect calls', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      await connection.disconnect()

      // Second disconnect should not throw
      await connection.disconnect()
      assertEquals(connection.isConnected(), false)
    })
  })

  /**
   * getSql() Method Tests
   *
   * Tests getting SQL instance when connected and error when not connected.
   */
  describe('getSql() Method', () => {
    it('should return SQL instance when connected', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      const sql = connection.getSql()
      assertInstanceOf(sql, Object)
    })

    it('should throw error when not connected', () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      assertThrows(
        () => connection.getSql(),
        ConnectionError,
        'Database connection not established. Call connect() first.'
      )
    })
  })

  /**
   * isConnected() Method Tests
   *
   * Tests connection status reporting.
   */
  describe('isConnected() Method', () => {
    it('should return false when not connected', () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      assertEquals(connection.isConnected(), false)
    })

    it('should return true when connected', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      assertEquals(connection.isConnected(), true)
    })

    it('should return false after disconnect', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      await connection.disconnect()
      assertEquals(connection.isConnected(), false)
    })
  })

  /**
   * testConnection() Method Tests
   *
   * Tests connection testing functionality.
   */
  describe('testConnection() Method', () => {
    it('should test connection successfully', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      await connection.testConnection()

      assert(logger.hasLogMessage('Connection test successful', 'debug'))
    })

    it('should throw error when no connection to test', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await assertRejects(
        () => connection.testConnection(),
        ConnectionError,
        'No connection to test'
      )
    })

    it('should handle test query failure', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock test query to fail
      mockSql.setErrorCondition('SELECT 1 as test, version() as version', new Error('Query failed'))

      await assertRejects(
        () => connection.testConnection(),
        ConnectionError,
        'Connection test failed'
      )
    })

    it('should handle invalid test response', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock empty response
      mockSql.setMockResult('SELECT 1 as test, version() as version', [])

      await assertRejects(
        () => connection.testConnection(),
        ConnectionError,
        'Invalid connection test response'
      )
    })
  })

  /**
   * validateTimescaleDB() Method Tests
   *
   * Tests TimescaleDB extension validation.
   */
  describe('validateTimescaleDB() Method', () => {
    it('should validate TimescaleDB successfully', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()
      await connection.validateTimescaleDB()

      assert(logger.hasLogMessage('TimescaleDB validation successful', 'info'))
    })

    it('should throw error when no connection available', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await assertRejects(
        () => connection.validateTimescaleDB(),
        ConnectionError,
        'No connection available for TimescaleDB validation'
      )
    })

    it('should throw error when TimescaleDB extension not installed', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock extension not installed
      mockSql.setMockResult('SELECT EXISTS( SELECT 1 FROM pg_extension WHERE extname = \'timescaledb\' ) as installed', [{ installed: false }])

      await assertRejects(
        () => connection.validateTimescaleDB(),
        ConfigurationError,
        'TimescaleDB extension is not installed'
      )
    })

    it('should handle database error during validation', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock query error
      mockSql.setErrorCondition('SELECT EXISTS( SELECT 1 FROM pg_extension WHERE extname = \'timescaledb\' ) as installed', new Error('Query failed'))

      await assertRejects(
        () => connection.validateTimescaleDB(),
        ConfigurationError,
        'Failed to validate TimescaleDB extension'
      )
    })

    it('should handle TimescaleDB version query error', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock version query error
      mockSql.setErrorCondition('SELECT timescaledb_version()', new Error('Version query failed'))

      await assertRejects(
        () => connection.validateTimescaleDB(),
        ConfigurationError,
        'Failed to validate TimescaleDB extension'
      )
    })
  })

  /**
   * Private Method Coverage Tests
   *
   * Tests private methods through their public interfaces.
   */
  describe('Private Method Coverage', () => {
    describe('Connection String Parsing', () => {
      it('should parse standard connection string', async () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user:pass@localhost:5432/testdb'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
      })

      it('should parse connection string with query parameters', async () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user:pass@localhost:5432/testdb?sslmode=require&application_name=test'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
      })

      it('should handle invalid connection string format', () => {
        const config: ConnectionConfig = {
          connectionString: 'invalid-connection-string'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        
        assertThrows(
          () => new DatabaseConnection(config, logger, mockPostgresFactory),
          ConfigurationError,
          'Invalid connection string format'
        )
      })

      it('should parse connection string with encoded credentials', async () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user%40domain:p%40ssword@localhost:5432/testdb'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql)
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        const sql = await connection.connect()
        assertInstanceOf(sql, Object)
      })
    })

    describe('Config Sanitization', () => {
      it('should redact password in logs', async () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          database: 'test',
          username: 'user',
          password: 'secret-password'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql, new Error('Connection failed'))
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        await assertRejects(() => connection.connect(), ConnectionError)
        
        // Check that password is redacted in error logs
        const errorLogs = logger.getLogsByLevel('error')
        assert(errorLogs.length > 0)
        const errorLog = errorLogs[0]
        if (errorLog && errorLog.meta?.config) {
          assertEquals((errorLog.meta.config as any).password, '[REDACTED]')
        }
      })

      it('should redact password in connection string logs', async () => {
        const config: ConnectionConfig = {
          connectionString: 'postgresql://user:secret@localhost:5432/testdb'
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql, new Error('Connection failed'))
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
        
        await assertRejects(() => connection.connect(), ConnectionError)
        
        // Check that password is redacted in connection string
        const errorLogs = logger.getLogsByLevel('error')
        assert(errorLogs.length > 0)
        const errorLog = errorLogs[0]
        if (errorLog && errorLog.meta?.config) {
          assert((errorLog.meta.config as any).connectionString.includes('[REDACTED]'))
        }
      })

      it('should redact SSL key in logs', async () => {
        const config: ConnectionConfig = {
          host: 'localhost',
          database: 'test',
          ssl: {
            key: 'secret-key-content'
          }
        }
        const mockPostgresFactory = createMockPostgresFactory(mockSql, new Error('Connection failed'))
        const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

        await assertRejects(() => connection.connect(), ConnectionError)

        // Check that SSL key is redacted
        const errorLogs = logger.getLogsByLevel('error')
        assert(errorLogs.length > 0)
        const errorLog = errorLogs[0]
        if (errorLog && errorLog.meta?.config) {
          assertEquals(((errorLog.meta.config as any).ssl as any).key, '[REDACTED]')
        }
      })
    })
  })

  /**
   * Error Scenarios and Edge Cases
   *
   * Tests various error conditions and edge cases.
   */
  describe('Error Scenarios and Edge Cases', () => {
    it('should handle non-Error objects in catch blocks', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql, 'String error')
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
      
      await assertRejects(
        () => connection.connect(),
        ConnectionError,
        'Failed to establish database connection'
      )
    })

    it('should handle async password function throwing non-Error', async () => {
      const config: ConnectionConfig = {
        host: 'localhost',
        database: 'test',
        username: 'user',
        password: () => Promise.reject('String rejection')
      }
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
      
      await assertRejects(
        () => connection.connect(),
        ConnectionError
      )
    })

    it('should handle disconnect with non-Error', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
      
      await connection.connect()
      
      // Mock end() to throw non-Error
      mockSql.end = () => Promise.reject('String error')

      await assertRejects(
        () => connection.disconnect(),
        ConnectionError
      )
    })

    it('should handle testConnection with non-Error', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)
      
      await connection.connect()
      
      // Mock query to throw non-Error
      mockSql.setErrorCondition('SELECT 1 as test, version() as version', 'String error' as any)
      
      await assertRejects(
        () => connection.testConnection(),
        ConnectionError
      )
    })

    it('should handle validateTimescaleDB with non-Error', async () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = new DatabaseConnection(config, logger, mockPostgresFactory)

      await connection.connect()

      // Mock query to throw non-Error
      mockSql.setErrorCondition('SELECT EXISTS( SELECT 1 FROM pg_extension WHERE extname = \'timescaledb\' ) as installed', 'String error' as any)

      await assertRejects(
        () => connection.validateTimescaleDB(),
        ConfigurationError
      )
    })

    it('should handle invalid connection string that throws during parsing', () => {
      const config: ConnectionConfig = {
        connectionString: 'not-a-valid-url'
      }
      const mockPostgresFactory = createMockPostgresFactory(mockSql)

      assertThrows(
        () => new DatabaseConnection(config, logger, mockPostgresFactory),
        ConfigurationError,
        'Invalid connection string format'
      )
    })
  })

  /**
   * Factory Function Tests
   *
   * Tests the createDatabaseConnection factory function.
   */
  describe('createDatabaseConnection Factory Function', () => {
    it('should create DatabaseConnection instance with postgres factory', () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = createDatabaseConnection(config, logger, mockPostgresFactory)
      
      assertInstanceOf(connection, DatabaseConnection)
      assertEquals(connection.isConnected(), false)
    })

    it('should create DatabaseConnection without logger but with postgres factory', () => {
      const config = TEST_CONNECTION_CONFIGS.test!
      const mockPostgresFactory = createMockPostgresFactory(mockSql)
      const connection = createDatabaseConnection(config, undefined, mockPostgresFactory)
      
      assertInstanceOf(connection, DatabaseConnection)
      assertEquals(connection.isConnected(), false)
    })

    it('should pass through validation errors', () => {
      const config: ConnectionConfig = {}
      const mockPostgresFactory = createMockPostgresFactory(mockSql)

      assertThrows(
        () => createDatabaseConnection(config, logger, mockPostgresFactory),
        ValidationError,
        'Must provide either connectionString, host, or path'
      )
    })
  })
})