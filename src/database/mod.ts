/**
 * Database layer module exports
 * 
 * Provides database connection management, pooling, health monitoring,
 * and utility functions for TimescaleDB integration.
 */

// Export types
export type { 
  DatabaseLayer,
  DatabaseLayerConfig
} from './client.ts'

export type { 
  ConnectionState,
  SqlInstance
} from '../types/internal.ts'

// Export main factory functions
export {
  createDatabaseLayer,
  createSimplePool,
  createDatabaseLayerFromEnv,
  testConnection,
  checkTimescaleDB
} from './client.ts'

// Export connection utilities
export {
  DatabaseConnection,
  createDatabaseConnection
} from './connection.ts'

// Export pool management
export {
  ConnectionPool,
  createConnectionPool
} from './pool.ts'

// Export health monitoring
export {
  HealthChecker,
  createHealthChecker
} from './health.ts'