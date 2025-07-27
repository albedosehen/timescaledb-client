/**
 * Database layer module exports
 *
 * Provides database connection management, pooling, health monitoring,
 * and utility functions for TimescaleDB integration.
 */

// Export types
export type { DatabaseLayer, DatabaseLayerConfig } from './client.ts'

export type { ConnectionState, SqlInstance } from '../types/internal.ts'

// Export main factory functions
export {
  checkTimescaleDB,
  createDatabaseLayer,
  createDatabaseLayerFromEnv,
  createSimplePool,
  testConnection,
} from './client.ts'

// Export connection utilities
export { createDatabaseConnection, DatabaseConnection } from './connection.ts'

// Export pool management
export { ConnectionPool, createConnectionPool } from './pool.ts'

// Export health monitoring
export { createHealthChecker, HealthChecker } from './health.ts'
