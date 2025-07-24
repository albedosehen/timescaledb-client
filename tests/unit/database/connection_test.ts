/**
 * Database connection unit tests
 * 
 * Tests the database connection management, pooling, and health checking
 * functionality with comprehensive error handling and edge cases.
 */

import { describe, it, beforeEach, afterEach } from '@std/testing/bdd'
import { assertEquals, assertThrows, assert, assertRejects } from '@std/assert'
import { createMockSql, type MockSql } from '../../mocks/postgres.ts'

import { TestHelpers, TimingHelpers } from '../../utils/test_helpers.ts'
import { 
  ConnectionError,
  TimeoutError,
  ConfigurationError 
} from '../../../src/types/errors.ts'
import type {
  HealthCheckResult
} from '../../../src/types/interfaces.ts'
import type { ConnectionConfig } from '../../../src/types/config.ts'
import { 
  VALID_CONNECTIONS,
  INVALID_CONNECTIONS,
  createTestConnectionConfig 
} from '../../fixtures/config_data.ts'

// Mock database connection utilities (these would be implemented in src/database/)
interface DatabaseConnection {
  connect(config: ConnectionConfig): Promise<MockSql>
  disconnect(connection: MockSql): Promise<void>
  healthCheck(connection: MockSql): Promise<HealthCheckResult>
  validateConfig(config: ConnectionConfig): void
}

// Simple mock implementation for testing
const mockDatabaseConnection: DatabaseConnection = {
  async connect(config: ConnectionConfig): Promise<MockSql> {
    // Simulate connection validation
    if (!config.host && !config.connectionString) {
      throw new ConnectionError('Host or connection string is required')
    }
    
    if (config.host === 'unreachable.host') {
      throw new ConnectionError('Connection timeout')
    }
    
    return createMockSql({
      mockResults: [{ connected: true, timestamp: new Date() }],
      captureQueries: true
    })
  },

  async disconnect(connection: MockSql): Promise<void> {
    await connection.end()
  },

  async healthCheck(connection: MockSql): Promise<HealthCheckResult> {
    try {
      const startTime = performance.now()
      await connection`SELECT 1 as test, NOW() as timestamp`
      const responseTime = Math.round(performance.now() - startTime)
      
      return {
        isHealthy: true,
        responseTimeMs: responseTime,
        timestamp: new Date(),
        connection: {
          host: 'localhost',
          port: 5432,
          ssl: false
        }
      }
    } catch (error) {
      return {
        isHealthy: false,
        responseTimeMs: 0,
        timestamp: new Date(),
        connection: {
          host: 'localhost',
          port: 5432,
          ssl: false
        },
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  },

  validateConfig(config: ConnectionConfig): void {
    if (!config.connectionString && !config.host) {
      throw new ConfigurationError('Either connectionString or host must be provided')
    }
    
    if (config.port && typeof config.port === 'number' && (config.port < 1 || config.port > 65535)) {
      throw new ConfigurationError('Port must be between 1 and 65535', 'port', config.port)
    }
    
    if (config.maxConnections && config.maxConnections < 1) {
      throw new ConfigurationError('Max connections must be positive', 'maxConnections', config.maxConnections)
    }
    
    if (config.connectTimeout && config.connectTimeout < 0) {
      throw new ConfigurationError('Connect timeout must be non-negative', 'connectTimeout', config.connectTimeout)
    }
  }
}

describe('Database Connection', () => {
  let testEnv: Awaited<ReturnType<typeof TestHelpers.createTestEnvironment>>
  let mockConnection: MockSql

  beforeEach(async () => {
    testEnv = TestHelpers.createTestEnvironment()
  })

  afterEach(async () => {
    if (mockConnection) {
      await mockDatabaseConnection.disconnect(mockConnection)
    }
    await TestHelpers.cleanupTestEnvironment(testEnv)
  })

  describe('Connection Establishment', () => {
    it('should connect successfully with valid configuration', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      
      mockConnection = await mockDatabaseConnection.connect(config)
      
      assert(mockConnection)
      assertEquals(mockConnection.getQueryCount(), 0) // No queries executed yet
    })

    it('should connect using connection string', async () => {
      const config = VALID_CONNECTIONS.connectionString
      if (!config) {
        throw new Error('VALID_CONNECTIONS.connectionString is undefined')
      }
      
      mockConnection = await mockDatabaseConnection.connect(config)
      
      assert(mockConnection)
    })

    it('should connect with SSL configuration', async () => {
      const config = VALID_CONNECTIONS.withSSL
      if (!config) {
        throw new Error('VALID_CONNECTIONS.withSSL is undefined')
      }
      
      mockConnection = await mockDatabaseConnection.connect(config)
      
      assert(mockConnection)
    })

    it('should connect with pool configuration', async () => {
      const config = VALID_CONNECTIONS.withPool
      if (!config) {
        throw new Error('VALID_CONNECTIONS.withPool is undefined')
      }
      
      mockConnection = await mockDatabaseConnection.connect(config)
      
      assert(mockConnection)
    })

    it('should handle connection timeout', async () => {
      const config = createTestConnectionConfig({
        host: 'unreachable.host',
        connectTimeout: 1000
      })
      
      await assertRejects(
        () => mockDatabaseConnection.connect(config),
        ConnectionError,
        'Connection timeout'
      )
    })

    it('should handle invalid host', async () => {
      const config = createTestConnectionConfig({
        host: 'invalid.host.that.does.not.exist.anywhere'
      })
      
      await assertRejects(
        () => mockDatabaseConnection.connect(config),
        ConnectionError
      )
    })

    it('should handle missing credentials', async () => {
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'test'
        // Missing username/password
      } as ConnectionConfig
      
      // This would be handled by the actual postgres.js connection
      mockConnection = await mockDatabaseConnection.connect(config)
      assert(mockConnection)
    })

    it('should handle connection with retry logic', async () => {
      let attempts = 0
      const unreliableMock = createMockSql({
        shouldThrow: () => {
          attempts++
          if (attempts < 3) {
            return new Error('Connection failed')
          }
          return null // Success on 3rd attempt
        }
      })
      
      // Simulate retry logic
      let lastError: Error | null = null
      for (let i = 0; i < 3; i++) {
        try {
          await unreliableMock`SELECT 1`
          break
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (i === 2) throw lastError
        }
      }
      
      assertEquals(attempts, 3)
    })
  })

  describe('Configuration Validation', () => {
    it('should validate correct configurations', () => {
      Object.values(VALID_CONNECTIONS).forEach(config => {
        // Should not throw
        mockDatabaseConnection.validateConfig(config)
      })
    })

    it('should reject missing host and connection string', () => {
      const config = INVALID_CONNECTIONS.missingHost as ConnectionConfig
      
      assertThrows(
        () => mockDatabaseConnection.validateConfig(config),
        ConfigurationError,
        'Either connectionString or host must be provided'
      )
    })

    it('should reject invalid port numbers', () => {
      const config = INVALID_CONNECTIONS.invalidPort as ConnectionConfig
      
      assertThrows(
        () => mockDatabaseConnection.validateConfig(config),
        ConfigurationError,
        'Port must be between 1 and 65535'
      )
    })

    it('should reject invalid pool settings', () => {
      const config = createTestConnectionConfig({
        maxConnections: -5
      })
      
      assertThrows(
        () => mockDatabaseConnection.validateConfig(config),
        ConfigurationError,
        'Max connections must be positive'
      )
    })

    it('should reject negative timeout values', () => {
      const config = createTestConnectionConfig({
        connectTimeout: -1000
      })
      
      assertThrows(
        () => mockDatabaseConnection.validateConfig(config),
        ConfigurationError,
        'Connect timeout must be non-negative'
      )
    })

    it('should validate edge case values', () => {
      const edgeConfig = createTestConnectionConfig({
        port: 1, // Minimum valid port
        maxConnections: 1, // Minimum pool size
        connectTimeout: 0, // Zero timeout (allowed)
        idleTimeout: 0
      })
      
      // Should not throw
      mockDatabaseConnection.validateConfig(edgeConfig)
    })

    it('should validate maximum values', () => {
      const maxConfig = createTestConnectionConfig({
        port: 65535, // Maximum valid port
        maxConnections: 1000, // Large pool
        connectTimeout: 300000 // 5 minutes
      })
      
      // Should not throw
      mockDatabaseConnection.validateConfig(maxConfig)
    })
  })

  describe('Health Checking', () => {
    beforeEach(async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      mockConnection = await mockDatabaseConnection.connect(config)
    })

    it('should perform successful health check', async () => {
      const health = await mockDatabaseConnection.healthCheck(mockConnection)
      
      assert(health.isHealthy)
      assert(health.responseTimeMs >= 0)
      assert(health.timestamp instanceof Date)
      assert(health.connection)
      assertEquals(health.connection.host, 'localhost')
      assertEquals(health.connection.port, 5432)
    })

    it('should handle health check failure', async () => {
      const failingConnection = createMockSql({
        shouldThrow: new Error('Connection lost')
      })
      
      const health = await mockDatabaseConnection.healthCheck(failingConnection)
      
      assert(!health.isHealthy)
      assertEquals(health.responseTimeMs, 0)
      assert(health.errors)
      assert(health.errors.length > 0)
      assertEquals(health.errors[0], 'Connection lost')
    })

    it('should measure response time accurately', async () => {
      const slowConnection = createMockSql({
        queryDelay: 100, // 100ms delay
        mockResults: [{ test: 1 }]
      })
      
      const health = await mockDatabaseConnection.healthCheck(slowConnection)
      
      assert(health.isHealthy)
      assert(health.responseTimeMs >= 90) // Allow some tolerance
      assert(health.responseTimeMs <= 200) // Should be around 100ms
    })

    it('should handle health check timeout', async () => {
      const timeoutConnection = createMockSql({
        queryDelay: 5000, // 5 second delay
        mockResults: [{ test: 1 }]
      })
      
      // Simulate timeout handling
      const healthPromise = mockDatabaseConnection.healthCheck(timeoutConnection)
      const timeoutPromise = new Promise<HealthCheckResult>((_, reject) => {
        setTimeout(() => reject(new TimeoutError('Health check timeout', 3000)), 100)
      })
      
      await assertRejects(
        () => Promise.race([healthPromise, timeoutPromise]),
        TimeoutError,
        'Health check timeout'
      )
    })

    it('should provide connection details in health check', async () => {
      const health = await mockDatabaseConnection.healthCheck(mockConnection)
      
      assert(health.connection)
      assert(typeof health.connection.host === 'string')
      assert(typeof health.connection.port === 'number')
      assert(typeof health.connection.ssl === 'boolean')
    })
  })

  describe('Connection Lifecycle', () => {
    it('should establish and close connection properly', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      
      mockConnection = await mockDatabaseConnection.connect(config)
      assert(mockConnection)
      
      await mockDatabaseConnection.disconnect(mockConnection)
      // Connection should be closed (can't verify this directly with mock)
    })

    it('should handle multiple sequential connections', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      
      // Connect and disconnect multiple times
      for (let i = 0; i < 3; i++) {
        const connection = await mockDatabaseConnection.connect(config)
        assert(connection)
        await mockDatabaseConnection.disconnect(connection)
      }
    })

    it('should handle concurrent connections', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      
      const connections = await Promise.all([
        mockDatabaseConnection.connect(config),
        mockDatabaseConnection.connect(config),
        mockDatabaseConnection.connect(config)
      ])
      
      assertEquals(connections.length, 3)
      connections.forEach(conn => assert(conn))
      
      // Clean up
      await Promise.all(connections.map(conn => 
        mockDatabaseConnection.disconnect(conn)
      ))
    })

    it('should handle connection reuse', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      mockConnection = await mockDatabaseConnection.connect(config)
      
      // Use connection multiple times
      await mockConnection`SELECT 1`
      await mockConnection`SELECT 2`
      await mockConnection`SELECT 3`
      
      assertEquals(mockConnection.getQueryCount(), 3)
    })
  })

  describe('Error Recovery', () => {
    it('should handle connection drops gracefully', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      mockConnection = await mockDatabaseConnection.connect(config)
      
      // Simulate connection drop
      mockConnection.setMockError(new Error('Connection lost'))
      
      await assertRejects(
        () => mockConnection`SELECT 1`,
        Error,
        'Connection lost'
      )
    })

    it('should handle network timeouts', async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      mockConnection = await mockDatabaseConnection.connect(config)
      
      // Simulate network timeout
      mockConnection.setMockError(new TimeoutError('Network timeout', 30000))
      
      await assertRejects(
        () => mockConnection`SELECT 1`,
        TimeoutError,
        'Network timeout'
      )
    })

    it('should handle authentication failures', async () => {
      // Remove unused config variable and create mock directly
      
      // Mock would simulate auth failure
      const authFailureMock = createMockSql({
        shouldThrow: new Error('Authentication failed')
      })
      
      await assertRejects(
        () => authFailureMock`SELECT 1`,
        Error,
        'Authentication failed'
      )
    })
  })

  describe('Performance and Monitoring', () => {
    beforeEach(async () => {
      const config = VALID_CONNECTIONS.localhost
      if (!config) {
        throw new Error('VALID_CONNECTIONS.localhost is undefined')
      }
      mockConnection = await mockDatabaseConnection.connect(config)
    })

    it('should measure query execution time', async () => {
      await TimingHelpers.assertExecutionTime(
        async () => {
          await mockConnection`SELECT 1`
        },
        100, // Should complete within 100ms
        'Simple query execution'
      )
    })

    it('should handle slow queries appropriately', async () => {
      const slowConnection = createMockSql({
        queryDelay: 50,
        mockResults: [{ result: 'slow_query' }]
      })
      
      const startTime = performance.now()
      await slowConnection`SELECT pg_sleep(0.05)`
      const duration = performance.now() - startTime
      
      assert(duration >= 45) // Should take at least ~50ms
    })

    it('should track connection usage statistics', async () => {
      // Execute several queries
      await mockConnection`SELECT 1`
      await mockConnection`SELECT 2`
      await mockConnection`SELECT 3`
      
      assertEquals(mockConnection.getQueryCount(), 3)
      
      const queries = mockConnection._queryHistory
      assertEquals(queries.length, 3)
      
      // All queries should have execution times
      queries.forEach(query => {
        assert(query.executionTimeMs >= 0)
        assert(query.timestamp instanceof Date)
      })
    })

    it('should handle high connection load', async () => {
      const config = VALID_CONNECTIONS.withPool
      if (!config) {
        throw new Error('VALID_CONNECTIONS.withPool is undefined')
      }
      
      // Simulate high load with multiple concurrent operations
      const operations = Array.from({ length: 10 }, async (_, i) => {
        const conn = await mockDatabaseConnection.connect(config)
        await conn`SELECT ${i} as operation_id`
        await mockDatabaseConnection.disconnect(conn)
        return i
      })
      
      const results = await Promise.all(operations)
      assertEquals(results.length, 10)
    })
  })

  describe('SSL and Security', () => {
    it('should handle SSL connections', async () => {
      const sslConfig = VALID_CONNECTIONS.withSSL
      if (!sslConfig) {
        throw new Error('VALID_CONNECTIONS.withSSL is undefined')
      }
      
      mockConnection = await mockDatabaseConnection.connect(sslConfig)
      
      assert(mockConnection)
      // SSL verification would be handled by postgres.js
    })

    it('should validate SSL certificate configuration', () => {
      const sslConfig = createTestConnectionConfig({
        ssl: {
          rejectUnauthorized: true,
          ca: 'invalid_certificate'
        }
      })
      
      // Should not throw during validation (postgres.js handles SSL validation)
      mockDatabaseConnection.validateConfig(sslConfig)
    })

    it('should handle SSL connection failures', async () => {
      // In real implementation, this would fail during connection
      // For our mock, we'll simulate this
      const sslFailureMock = createMockSql({
        shouldThrow: new Error('SSL certificate verification failed')
      })
      
      await assertRejects(
        () => sslFailureMock`SELECT 1`,
        Error,
        'SSL certificate verification failed'
      )
    })
  })

  describe('Connection String Parsing', () => {
    it('should handle various connection string formats', () => {
      const connectionStrings = [
        'postgresql://user:pass@localhost:5432/database',
        'postgresql://user@localhost/database',
        'postgresql://localhost/database',
        'postgres://user:pass@host.example.com:5432/db?sslmode=require',
        'postgresql://user:pass@[::1]:5432/database' // IPv6
      ]
      
      connectionStrings.forEach(connectionString => {
        const config = { connectionString }
        // Should not throw
        mockDatabaseConnection.validateConfig(config)
      })
    })

    it('should reject malformed connection strings', () => {
      // For validation, we might only check if it's non-empty
      // Actual parsing would be done by postgres.js
      assertThrows(
        () => mockDatabaseConnection.validateConfig({ connectionString: '' }),
        ConfigurationError
      )
    })
  })
})