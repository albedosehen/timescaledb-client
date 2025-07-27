/**
 * Factory functions for creating test data and mocks
 *
 * Provides convenient factory methods for generating consistent test data
 * for TimescaleDB client testing scenarios.
 */

import type { EntityMetadata, TimeRange, TimeSeriesRecord } from '../../src/types/interfaces.ts'
import type { ClientOptions, ConnectionConfig, Logger } from '../../src/types/config.ts'
import type { ConnectionHealthMetrics, SchemaValidationResult } from '../../src/types/internal.ts'
import { TestLogger } from './test_helpers.ts'

/**
 * Factory options for customizing generated data
 */
export interface FactoryOptions {
  readonly count?: number
  readonly startTime?: Date
  readonly intervalMinutes?: number
  readonly entityPrefix?: string
  readonly valueRange?: { min: number; max: number }
}

/**
 * Time series record factory
 */
export const TimeSeriesRecordFactory = {
  /**
   * Create a single time series record
   */
  create(overrides: Partial<TimeSeriesRecord> = {}): TimeSeriesRecord {
    const defaultRecord: TimeSeriesRecord = {
      time: new Date().toISOString(),
      entity_id: 'test_entity_001',
      value: Math.random() * 100,
      value2: Math.random() * 50,
      value3: Math.random() * 25,
      value4: Math.random() * 10,
      metadata: { source: 'test', location: 'warehouse_a' },
    }

    return { ...defaultRecord, ...overrides }
  },

  /**
   * Create multiple time series records
   */
  createBatch(options: FactoryOptions = {}): TimeSeriesRecord[] {
    const {
      count = 10,
      startTime = new Date(),
      intervalMinutes = 1,
      entityPrefix = 'test_entity',
      valueRange = { min: 0, max: 100 },
    } = options

    const records: TimeSeriesRecord[] = []

    for (let i = 0; i < count; i++) {
      const timestamp = new Date(startTime.getTime() + i * intervalMinutes * 60000)
      const value = valueRange.min + Math.random() * (valueRange.max - valueRange.min)

      records.push(TimeSeriesRecordFactory.create({
        time: timestamp.toISOString(),
        entity_id: `${entityPrefix}_${String(i + 1).padStart(3, '0')}`,
        value,
        value2: value * 0.8,
        value3: value * 0.6,
        value4: value * 0.4,
        metadata: {
          source: 'test_factory',
          batch_id: Math.floor(i / 5),
          index: i,
        },
      }))
    }

    return records
  },

  /**
   * Create IoT sensor records
   */
  createIoTSensorRecords(sensorCount = 3, recordsPerSensor = 5): TimeSeriesRecord[] {
    const records: TimeSeriesRecord[] = []
    const startTime = new Date()

    for (let sensorIndex = 0; sensorIndex < sensorCount; sensorIndex++) {
      for (let recordIndex = 0; recordIndex < recordsPerSensor; recordIndex++) {
        const timestamp = new Date(startTime.getTime() + recordIndex * 60000) // 1 minute intervals

        records.push(TimeSeriesRecordFactory.create({
          time: timestamp.toISOString(),
          entity_id: `sensor_${String(sensorIndex + 1).padStart(3, '0')}`,
          value: 20 + Math.random() * 10, // Temperature 20-30°C
          value2: 40 + Math.random() * 20, // Humidity 40-60%
          value3: 1010 + Math.random() * 20, // Pressure 1010-1030 hPa
          metadata: {
            location: `warehouse_${String.fromCharCode(65 + sensorIndex)}`, // A, B, C
            device_type: 'environmental',
            firmware_version: '1.2.3',
          },
        }))
      }
    }

    return records
  },

  /**
   * Create server monitoring records
   */
  createServerMonitoringRecords(serverCount = 2, recordsPerServer = 5): TimeSeriesRecord[] {
    const records: TimeSeriesRecord[] = []
    const startTime = new Date()

    for (let serverIndex = 0; serverIndex < serverCount; serverIndex++) {
      for (let recordIndex = 0; recordIndex < recordsPerServer; recordIndex++) {
        const timestamp = new Date(startTime.getTime() + recordIndex * 300000) // 5 minute intervals

        records.push(TimeSeriesRecordFactory.create({
          time: timestamp.toISOString(),
          entity_id: `server_${String(serverIndex + 1).padStart(2, '0')}`,
          value: 30 + Math.random() * 40, // CPU usage 30-70%
          value2: 50 + Math.random() * 30, // Memory usage 50-80%
          value3: 100 + Math.random() * 50, // Network KB/s 100-150
          value4: 20 + Math.random() * 10, // Disk usage 20-30%
          metadata: {
            datacenter: serverIndex % 2 === 0 ? 'us-east-1' : 'us-west-2',
            role: serverIndex % 2 === 0 ? 'web_server' : 'database_server',
            instance_type: 't3.medium',
          },
        }))
      }
    }

    return records
  },

  /**
   * Create invalid records for validation testing
   */
  createInvalidRecords(): Partial<TimeSeriesRecord>[] {
    return [
      // Missing entity_id
      {
        time: new Date().toISOString(),
        value: 23.5,
      },
      // Invalid time format
      {
        time: 'invalid-date',
        entity_id: 'sensor_001',
        value: 23.5,
      },
      // Invalid value (NaN)
      {
        time: new Date().toISOString(),
        entity_id: 'sensor_001',
        value: NaN,
      },
      // Empty entity_id
      {
        time: new Date().toISOString(),
        entity_id: '',
        value: 23.5,
      },
      // Invalid entity_id format
      {
        time: new Date().toISOString(),
        entity_id: 'invalid entity id with spaces!',
        value: 23.5,
      },
    ]
  },
}

/**
 * Entity metadata factory
 */
export const EntityMetadataFactory = {
  /**
   * Create a single entity metadata record
   */
  create(overrides: Partial<EntityMetadata> = {}): EntityMetadata {
    const defaultEntity: EntityMetadata = {
      entity_id: 'test_entity_001',
      entity_type: 'test_device',
      name: 'Test Device #1',
      description: 'A test device for unit testing',
      metadata: { location: 'test_lab', calibrated: true },
      created_at: new Date(),
      updated_at: new Date(),
      is_active: true,
    }

    return { ...defaultEntity, ...overrides }
  },

  /**
   * Create multiple entity metadata records
   */
  createBatch(count = 5, entityType = 'test_device'): EntityMetadata[] {
    const entities: EntityMetadata[] = []
    const now = new Date()

    for (let i = 0; i < count; i++) {
      entities.push(EntityMetadataFactory.create({
        entity_id: `test_entity_${String(i + 1).padStart(3, '0')}`,
        entity_type: entityType,
        name: `Test ${entityType} #${i + 1}`,
        description: `A test ${entityType} for unit testing (${i + 1})`,
        metadata: {
          location: `location_${i + 1}`,
          calibrated: i % 2 === 0,
          batch: Math.floor(i / 3),
        },
        created_at: new Date(now.getTime() - (count - i) * 86400000), // Stagger creation dates
        updated_at: new Date(now.getTime() - Math.random() * 86400000),
        is_active: i < count - 1, // Last one inactive
      }))
    }

    return entities
  },

  /**
   * Create IoT sensor entities
   */
  createIoTSensorEntities(count = 3): EntityMetadata[] {
    return EntityMetadataFactory.createBatch(count, 'sensor').map((entity, index) => ({
      ...entity,
      name: `Environmental Sensor #${index + 1}`,
      description: `Temperature, humidity, and pressure sensor in warehouse ${String.fromCharCode(65 + index)}`,
      metadata: {
        location: `warehouse_${String.fromCharCode(65 + index)}`,
        installation_date: '2024-01-01',
        calibrated: true,
        sensor_type: 'environmental',
      },
    }))
  },

  /**
   * Create server entities
   */
  createServerEntities(count = 2): EntityMetadata[] {
    return EntityMetadataFactory.createBatch(count, 'server').map((entity, index) => ({
      ...entity,
      name: `Server ${String(index + 1).padStart(2, '0')}`,
      description: `${index % 2 === 0 ? 'Web' : 'Database'} server in ${
        index % 2 === 0 ? 'US East' : 'US West'
      } datacenter`,
      metadata: {
        datacenter: index % 2 === 0 ? 'us-east-1' : 'us-west-2',
        instance_type: 't3.medium',
        operating_system: 'ubuntu-22.04',
        role: index % 2 === 0 ? 'web_server' : 'database_server',
      },
    }))
  },
}

/**
 * Configuration factory
 */
export const ConfigFactory = {
  /**
   * Create test connection configuration
   */
  createConnectionConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
    const defaultConfig: ConnectionConfig = {
      host: 'localhost',
      port: 5432,
      database: 'timescale_test',
      username: 'test_user',
      password: 'test_password',
      maxConnections: 5,
      connectTimeout: 10,
      idleTimeout: 0,
      debug: false,
      ssl: false,
    }

    return { ...defaultConfig, ...overrides }
  },

  /**
   * Create test client options
   */
  createClientOptions(overrides: Partial<ClientOptions> = {}): ClientOptions {
    const defaultOptions: ClientOptions = {
      defaultBatchSize: 100,
      maxRetries: 1,
      retryBaseDelay: 100,
      queryTimeout: 5000,
      autoCreateTables: true,
      autoCreateIndexes: true,
      validateInputs: true,
      collectStats: false,
      useStreaming: false,
    }

    return { ...defaultOptions, ...overrides }
  },

  /**
   * Create a test logger
   */
  createLogger(): Logger {
    return new TestLogger()
  },
}

/**
 * Time range factory
 */
export const TimeRangeFactory = {
  /**
   * Create a time range
   */
  create(options: {
    startOffsetMinutes?: number
    endOffsetMinutes?: number
    limit?: number
  } = {}): TimeRange {
    const {
      startOffsetMinutes = -60,
      endOffsetMinutes = 0,
      limit = 1000,
    } = options

    const now = new Date()
    const from = new Date(now.getTime() + startOffsetMinutes * 60000)
    const to = new Date(now.getTime() + endOffsetMinutes * 60000)

    return { from, to, limit }
  },

  /**
   * Create a time range for the last hour
   */
  lastHour(): TimeRange {
    return TimeRangeFactory.create({ startOffsetMinutes: -60, endOffsetMinutes: 0 })
  },

  /**
   * Create a time range for the last day
   */
  lastDay(): TimeRange {
    return TimeRangeFactory.create({ startOffsetMinutes: -1440, endOffsetMinutes: 0 })
  },

  /**
   * Create a time range for the last week
   */
  lastWeek(): TimeRange {
    return TimeRangeFactory.create({ startOffsetMinutes: -10080, endOffsetMinutes: 0 })
  },
}

/**
 * Health metrics factory
 */
export const HealthMetricsFactory = {
  /**
   * Create connection health metrics
   */
  create(overrides: Partial<ConnectionHealthMetrics> = {}): ConnectionHealthMetrics {
    const defaultMetrics: ConnectionHealthMetrics = {
      connectionTimeMs: 15,
      lastQueryTime: new Date(),
      failedQueries: 0,
      successfulQueries: 100,
      avgQueryTimeMs: 25,
      uptimeSeconds: 3600,
    }

    return { ...defaultMetrics, ...overrides }
  },

  /**
   * Create healthy metrics
   */
  createHealthy(): ConnectionHealthMetrics {
    return HealthMetricsFactory.create({
      connectionTimeMs: 10,
      failedQueries: 0,
      successfulQueries: 150,
      avgQueryTimeMs: 20,
      uptimeSeconds: 7200,
    })
  },

  /**
   * Create unhealthy metrics
   */
  createUnhealthy(): ConnectionHealthMetrics {
    return HealthMetricsFactory.create({
      connectionTimeMs: 5000,
      failedQueries: 25,
      successfulQueries: 75,
      avgQueryTimeMs: 1000,
      uptimeSeconds: 300,
    })
  },
}

/**
 * Schema validation result factory
 */
export const SchemaValidationFactory = {
  /**
   * Create a valid schema validation result
   */
  createValid(): SchemaValidationResult {
    return {
      isValid: true,
      missingTables: [],
      missingIndexes: [],
      nonHypertables: [],
      warnings: [],
    }
  },

  /**
   * Create an invalid schema validation result
   */
  createInvalid(): SchemaValidationResult {
    return {
      isValid: false,
      missingTables: ['time_series_data', 'entities'],
      missingIndexes: ['ix_entity_time', 'ix_time'],
      nonHypertables: ['time_series_data'],
      warnings: ['TimescaleDB extension not found in shared_preload_libraries'],
    }
  },

  /**
   * Create a schema validation result with warnings only
   */
  createWithWarnings(): SchemaValidationResult {
    return {
      isValid: true,
      missingTables: [],
      missingIndexes: ['ix_source'],
      nonHypertables: [],
      warnings: ['Index ix_source is missing but not critical for operation'],
    }
  },
}

/**
 * Export all factories as a single namespace
 */
export const MockFactory = {
  TimeSeriesRecord: TimeSeriesRecordFactory,
  EntityMetadata: EntityMetadataFactory,
  Config: ConfigFactory,
  TimeRange: TimeRangeFactory,
  HealthMetrics: HealthMetricsFactory,
  SchemaValidation: SchemaValidationFactory,
}
