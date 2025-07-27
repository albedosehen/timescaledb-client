/**
 * Sample test data for generic TimescaleDB client testing
 *
 * Provides test data for various time-series domains including IoT sensors,
 * server monitoring, and generic measurements.
 */

import type { EntityMetadata, TimeSeriesRecord } from '../../src/types/interfaces.ts'

/**
 * Sample IoT sensor data
 */
export const SAMPLE_IOT_RECORDS: TimeSeriesRecord[] = [
  {
    time: '2024-01-15T10:00:00.000Z',
    entity_id: 'sensor_001',
    value: 23.5, // temperature in Celsius
    value2: 65.2, // humidity percentage
    value3: 1013.25, // pressure in hPa
    metadata: { location: 'warehouse_a', device_type: 'environmental' },
  },
  {
    time: '2024-01-15T10:01:00.000Z',
    entity_id: 'sensor_001',
    value: 23.7,
    value2: 64.8,
    value3: 1013.30,
    metadata: { location: 'warehouse_a', device_type: 'environmental' },
  },
  {
    time: '2024-01-15T10:02:00.000Z',
    entity_id: 'sensor_001',
    value: 23.4,
    value2: 65.5,
    value3: 1013.15,
    metadata: { location: 'warehouse_a', device_type: 'environmental' },
  },
]

/**
 * Sample server monitoring data
 */
export const SAMPLE_MONITORING_RECORDS: TimeSeriesRecord[] = [
  {
    time: '2024-01-15T10:00:00.000Z',
    entity_id: 'server_web_01',
    value: 45.2, // CPU usage percentage
    value2: 78.3, // Memory usage percentage
    value3: 125.4, // Network bytes/sec (KB)
    value4: 23.1, // Disk usage percentage
    metadata: { datacenter: 'us-east-1', role: 'web_server' },
  },
  {
    time: '2024-01-15T10:01:00.000Z',
    entity_id: 'server_web_01',
    value: 48.7,
    value2: 79.1,
    value3: 132.8,
    value4: 23.1,
    metadata: { datacenter: 'us-east-1', role: 'web_server' },
  },
  {
    time: '2024-01-15T10:02:00.000Z',
    entity_id: 'server_web_01',
    value: 43.1,
    value2: 77.9,
    value3: 118.6,
    value4: 23.1,
    metadata: { datacenter: 'us-east-1', role: 'web_server' },
  },
]

/**
 * Sample application metrics data
 */
export const SAMPLE_METRICS_RECORDS: TimeSeriesRecord[] = [
  {
    time: '2024-01-15T10:00:00.000Z',
    entity_id: 'api_service_auth',
    value: 150, // requests per minute
    value2: 95.5, // success rate percentage
    value3: 245.7, // average response time in ms
    metadata: { service: 'authentication', version: '1.2.3' },
  },
  {
    time: '2024-01-15T10:01:00.000Z',
    entity_id: 'api_service_auth',
    value: 142,
    value2: 96.2,
    value3: 238.4,
    metadata: { service: 'authentication', version: '1.2.3' },
  },
  {
    time: '2024-01-15T10:02:00.000Z',
    entity_id: 'api_service_auth',
    value: 158,
    value2: 94.8,
    value3: 251.2,
    metadata: { service: 'authentication', version: '1.2.3' },
  },
]

/**
 * Sample entity metadata
 */
export const SAMPLE_ENTITIES: EntityMetadata[] = [
  {
    entity_id: 'sensor_001',
    entity_type: 'sensor',
    name: 'Environmental Sensor #1',
    description: 'Temperature, humidity, and pressure sensor in warehouse A',
    metadata: {
      location: 'warehouse_a',
      installation_date: '2024-01-01',
      calibrated: true,
    },
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T00:00:00Z'),
    is_active: true,
  },
  {
    entity_id: 'server_web_01',
    entity_type: 'server',
    name: 'Web Server 01',
    description: 'Primary web server in US East datacenter',
    metadata: {
      datacenter: 'us-east-1',
      instance_type: 't3.medium',
      operating_system: 'ubuntu-22.04',
    },
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T00:00:00Z'),
    is_active: true,
  },
  {
    entity_id: 'api_service_auth',
    entity_type: 'service',
    name: 'Authentication Service',
    description: 'Microservice handling user authentication',
    metadata: {
      version: '1.2.3',
      replicas: 3,
      namespace: 'production',
    },
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T00:00:00Z'),
    is_active: true,
  },
]

/**
 * Common time ranges for testing
 */
export const TIME_RANGES = {
  hour: {
    from: new Date('2024-01-15T10:00:00.000Z'),
    to: new Date('2024-01-15T11:00:00.000Z'),
    limit: 1000,
  },
  day: {
    from: new Date('2024-01-15T00:00:00.000Z'),
    to: new Date('2024-01-16T00:00:00.000Z'),
    limit: 1000,
  },
  week: {
    from: new Date('2024-01-15T00:00:00.000Z'),
    to: new Date('2024-01-22T00:00:00.000Z'),
    limit: 1000,
  },
} as const

/**
 * All sample records combined for bulk testing
 */
export const ALL_SAMPLE_RECORDS = [
  ...SAMPLE_IOT_RECORDS,
  ...SAMPLE_MONITORING_RECORDS,
  ...SAMPLE_METRICS_RECORDS,
]

/**
 * Invalid records for validation testing
 */
export const INVALID_RECORDS = [
  // Missing required fields
  {
    time: '2024-01-15T10:00:00.000Z',
    entity_id: '',
    value: 23.5,
  },
  // Invalid time format
  {
    time: 'invalid-date',
    entity_id: 'sensor_001',
    value: 23.5,
  },
  // Invalid numeric value
  {
    time: '2024-01-15T10:00:00.000Z',
    entity_id: 'sensor_001',
    value: NaN,
  },
  // Invalid entity_id format
  {
    time: '2024-01-15T10:00:00.000Z',
    entity_id: 'invalid entity id with spaces!',
    value: 23.5,
  },
] as const
