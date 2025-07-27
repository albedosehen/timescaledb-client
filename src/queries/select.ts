/**
 * Select operations for TimescaleDB client
 *
 * Provides optimized SQL queries for retrieving time-series data with generic
 * entity-based approach supporting any domain (financial, IoT, monitoring, etc.)
 */

import type { SqlInstance } from '../types/internal.ts'
import type {
  FilterCriteria,
  LatestRecord,
  MultiEntityLatest,
  QueryOptions,
  StreamingOptions,
  TimeRange,
  TimeSeriesRecord,
} from '../types/interfaces.ts'
import { QueryError, ValidationError } from '../types/errors.ts'

/**
 * Select configuration options
 */
export interface SelectOptions extends QueryOptions {
  /** Whether to include metadata fields */
  readonly includeMetadata?: boolean
  /** Custom ORDER BY clause */
  readonly customOrderBy?: string
  /** Whether to use streaming for large result sets */
  readonly useStreaming?: boolean
  /** Additional filter criteria */
  readonly filters?: FilterCriteria
}

/**
 * Default select options
 */
const DEFAULT_SELECT_OPTIONS: Required<Omit<SelectOptions, 'filters'>> = {
  limit: 1000,
  offset: 0,
  orderBy: { column: 'time', direction: 'desc' },
  where: {},
  includeStats: false,
  includeMetadata: false,
  customOrderBy: '',
  useStreaming: false,
  entityTypes: [],
  entityIds: [],
}

/**
 * Get time-series records for a specific entity and time range
 */
export async function getRecords(
  sql: SqlInstance,
  entityId: string,
  range: TimeRange,
  options: SelectOptions = {},
): Promise<TimeSeriesRecord[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  validateEntityId(entityId)
  validateTimeRange(range)

  if (opts.limit > 10000) {
    throw new ValidationError('Limit cannot exceed 10,000 records', 'limit', opts.limit)
  }

  try {
    let results: Array<{
      time: string
      entity_id: string
      value: number
      value2: number | null
      value3: number | null
      value4: number | null
      metadata?: Record<string, unknown> | null
    }>

    if (opts.includeMetadata) {
      results = await sql`
        SELECT time, entity_id, value, value2, value3, value4, metadata
        FROM time_series_data
        WHERE entity_id = ${entityId}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    } else {
      results = await sql`
        SELECT time, entity_id, value, value2, value3, value4
        FROM time_series_data
        WHERE entity_id = ${entityId}
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    }

    return results.map((row) => ({
      time: row.time,
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2 ?? undefined,
      value3: row.value3 ?? undefined,
      value4: row.value4 ?? undefined,
      metadata: opts.includeMetadata ? (row.metadata ?? undefined) : undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve time-series records',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM time_series_data',
      [entityId, range.from, range.to],
    )
  }
}

/**
 * Get time-series records for multiple entities
 */
export async function getMultiEntityRecords(
  sql: SqlInstance,
  entityIds: string[],
  range: TimeRange,
  options: SelectOptions = {},
): Promise<TimeSeriesRecord[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  if (entityIds.length === 0) {
    return []
  }

  for (const entityId of entityIds) {
    validateEntityId(entityId)
  }
  validateTimeRange(range)

  if (opts.limit > 10000) {
    throw new ValidationError('Limit cannot exceed 10,000 records', 'limit', opts.limit)
  }

  try {
    let results: Array<{
      time: string
      entity_id: string
      value: number
      value2: number | null
      value3: number | null
      value4: number | null
      metadata?: Record<string, unknown> | null
    }>

    if (opts.includeMetadata) {
      results = await sql`
        SELECT time, entity_id, value, value2, value3, value4, metadata
        FROM time_series_data
        WHERE entity_id = ANY(${entityIds})
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    } else {
      results = await sql`
        SELECT time, entity_id, value, value2, value3, value4
        FROM time_series_data
        WHERE entity_id = ANY(${entityIds})
          AND time >= ${range.from.toISOString()}
          AND time < ${range.to.toISOString()}
        ORDER BY time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    }

    return results.map((row) => ({
      time: row.time,
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2 ?? undefined,
      value3: row.value3 ?? undefined,
      value4: row.value4 ?? undefined,
      metadata: opts.includeMetadata ? (row.metadata ?? undefined) : undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve multi-entity time-series records',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM time_series_data',
      [entityIds, range.from, range.to],
    )
  }
}

/**
 * Get the most recent record for an entity
 */
export async function getLatestRecord(
  sql: SqlInstance,
  entityId: string,
): Promise<LatestRecord | null> {
  validateEntityId(entityId)

  try {
    const results = await sql`
      SELECT time, entity_id, value, value2, value3, value4, metadata
      FROM time_series_data
      WHERE entity_id = ${entityId}
      ORDER BY time DESC
      LIMIT 1
    ` as Array<{
      time: string
      entity_id: string
      value: number
      value2: number | null
      value3: number | null
      value4: number | null
      metadata: Record<string, unknown> | null
    }>

    if (results.length === 0) {
      return null
    }

    const row = results[0]!
    return {
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2 ?? undefined,
      value3: row.value3 ?? undefined,
      value4: row.value4 ?? undefined,
      metadata: row.metadata ?? undefined,
      time: new Date(row.time),
    }
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve latest record',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM time_series_data',
      [entityId],
    )
  }
}

/**
 * Get latest records for multiple entities efficiently
 */
export async function getMultiEntityLatest(
  sql: SqlInstance,
  entityIds: string[],
): Promise<MultiEntityLatest> {
  if (entityIds.length === 0) {
    return {
      records: [],
      retrievedAt: new Date(),
      requested: 0,
      found: 0,
    }
  }

  for (const entityId of entityIds) {
    validateEntityId(entityId)
  }

  try {
    const results = await sql`
      SELECT DISTINCT ON (entity_id)
        entity_id,
        value,
        value2,
        value3,
        value4,
        metadata,
        time
      FROM time_series_data
      WHERE entity_id = ANY(${entityIds})
      ORDER BY entity_id, time DESC
    ` as Array<{
      entity_id: string
      value: number
      value2: number | null
      value3: number | null
      value4: number | null
      metadata: Record<string, unknown> | null
      time: string
    }>

    const records: LatestRecord[] = results.map((row) => ({
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2 ?? undefined,
      value3: row.value3 ?? undefined,
      value4: row.value4 ?? undefined,
      metadata: row.metadata ?? undefined,
      time: new Date(row.time),
    }))

    return {
      records,
      retrievedAt: new Date(),
      requested: entityIds.length,
      found: records.length,
    }
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve multi-entity latest records',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT DISTINCT ON (entity_id) FROM time_series_data',
      entityIds,
    )
  }
}

/**
 * Get records by entity type and time range
 */
export async function getRecordsByEntityType(
  sql: SqlInstance,
  entityType: string,
  range: TimeRange,
  options: SelectOptions = {},
): Promise<TimeSeriesRecord[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  validateEntityType(entityType)
  validateTimeRange(range)

  if (opts.limit > 10000) {
    throw new ValidationError('Limit cannot exceed 10,000 records', 'limit', opts.limit)
  }

  try {
    let results: Array<{
      time: string
      entity_id: string
      value: number
      value2: number | null
      value3: number | null
      value4: number | null
      metadata?: Record<string, unknown> | null
    }>

    if (opts.includeMetadata) {
      results = await sql`
        SELECT tsd.time, tsd.entity_id, tsd.value, tsd.value2, tsd.value3, tsd.value4, tsd.metadata
        FROM time_series_data tsd
        JOIN entities e ON tsd.entity_id = e.entity_id
        WHERE e.entity_type = ${entityType}
          AND tsd.time >= ${range.from.toISOString()}
          AND tsd.time < ${range.to.toISOString()}
          AND e.is_active = TRUE
        ORDER BY tsd.time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    } else {
      results = await sql`
        SELECT tsd.time, tsd.entity_id, tsd.value, tsd.value2, tsd.value3, tsd.value4
        FROM time_series_data tsd
        JOIN entities e ON tsd.entity_id = e.entity_id
        WHERE e.entity_type = ${entityType}
          AND tsd.time >= ${range.from.toISOString()}
          AND tsd.time < ${range.to.toISOString()}
          AND e.is_active = TRUE
        ORDER BY tsd.time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
        LIMIT ${opts.limit} OFFSET ${opts.offset}
      `
    }

    return results.map((row) => ({
      time: row.time,
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2 ?? undefined,
      value3: row.value3 ?? undefined,
      value4: row.value4 ?? undefined,
      metadata: opts.includeMetadata ? (row.metadata ?? undefined) : undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve records by entity type',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM time_series_data JOIN entities',
      [entityType, range.from, range.to],
    )
  }
}

/**
 * Stream large time-series datasets to avoid memory issues
 */
export async function* getRecordsStream(
  sql: SqlInstance,
  entityId: string,
  range: TimeRange,
  options: StreamingOptions = {},
): AsyncIterable<TimeSeriesRecord[]> {
  validateEntityId(entityId)
  validateTimeRange(range)

  const batchSize = options.batchSize || 1000

  try {
    const cursor = sql`
      SELECT 
        time,
        entity_id,
        value,
        value2,
        value3,
        value4,
        metadata
      FROM time_series_data
      WHERE entity_id = ${entityId}
        AND time >= ${range.from.toISOString()}
        AND time < ${range.to.toISOString()}
      ORDER BY time DESC
    `.cursor(batchSize)

    for await (const rows of cursor) {
      const records: TimeSeriesRecord[] = (rows as Array<{
        time: string
        entity_id: string
        value: number
        value2: number | null
        value3: number | null
        value4: number | null
        metadata: Record<string, unknown> | null
      }>).map((row) => ({
        time: row.time,
        entity_id: row.entity_id,
        value: row.value,
        value2: row.value2 ?? undefined,
        value3: row.value3 ?? undefined,
        value4: row.value4 ?? undefined,
        metadata: row.metadata ?? undefined,
      }))

      yield records
    }
  } catch (error) {
    throw new QueryError(
      'Failed to stream time-series records',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM time_series_data (streaming)',
      [entityId, range.from, range.to],
    )
  }
}

/**
 * Get available entities with their metadata
 */
export async function getAvailableEntities(
  sql: SqlInstance,
  options: SelectOptions = {},
): Promise<
  Array<
    { entity_id: string; entity_type: string; name?: string; is_active: boolean; metadata?: Record<string, unknown> }
  >
> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }

  try {
    const results = await sql`
      SELECT 
        entity_id,
        entity_type,
        name,
        is_active,
        metadata
      FROM entities
      WHERE is_active = true
      ORDER BY entity_type, entity_id
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      entity_id: string
      entity_type: string
      name: string | null
      is_active: boolean
      metadata: Record<string, unknown> | null
    }>

    return results.map((row) => ({
      entity_id: row.entity_id,
      entity_type: row.entity_type,
      ...(row.name !== null && { name: row.name }),
      is_active: row.is_active,
      ...(row.metadata !== null && { metadata: row.metadata }),
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve available entities',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM entities',
    )
  }
}

/**
 * Get entities by type
 */
export async function getEntitiesByType(
  sql: SqlInstance,
  entityType: string,
  options: SelectOptions = {},
): Promise<Array<{ entity_id: string; name?: string; metadata?: Record<string, unknown> }>> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }
  validateEntityType(entityType)

  try {
    const results = await sql`
      SELECT
        entity_id,
        name,
        metadata
      FROM entities
      WHERE entity_type = ${entityType} AND is_active = true
      ORDER BY entity_id
      LIMIT ${opts.limit}
      OFFSET ${opts.offset}
    ` as Array<{
      entity_id: string
      name: string | null
      metadata: Record<string, unknown> | null
    }>

    return results.map((row) => ({
      entity_id: row.entity_id,
      ...(row.name !== null && { name: row.name }),
      ...(row.metadata !== null && { metadata: row.metadata }),
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to retrieve entities by type',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM entities',
      [entityType],
    )
  }
}

/**
 * Search records with advanced filtering
 */
export async function searchRecords(
  sql: SqlInstance,
  filters: FilterCriteria,
  range: TimeRange,
  options: SelectOptions = {},
): Promise<TimeSeriesRecord[]> {
  const opts = { ...DEFAULT_SELECT_OPTIONS, ...options }
  validateTimeRange(range)

  try {
    // Build dynamic WHERE clause based on filters
    let whereClause = sql`tsd.time >= ${range.from.toISOString()} AND tsd.time < ${range.to.toISOString()}`

    if (filters.entityIdPattern) {
      whereClause = sql`${whereClause} AND tsd.entity_id LIKE ${filters.entityIdPattern}`
    }

    if (filters.entityTypes && filters.entityTypes.length > 0) {
      whereClause = sql`${whereClause} AND e.entity_type = ANY(${filters.entityTypes})`
    }

    if (filters.valueRange) {
      if (filters.valueRange.min !== undefined) {
        whereClause = sql`${whereClause} AND tsd.value >= ${filters.valueRange.min}`
      }
      if (filters.valueRange.max !== undefined) {
        whereClause = sql`${whereClause} AND tsd.value <= ${filters.valueRange.max}`
      }
    }

    if (filters.value2Range) {
      if (filters.value2Range.min !== undefined) {
        whereClause = sql`${whereClause} AND tsd.value2 >= ${filters.value2Range.min}`
      }
      if (filters.value2Range.max !== undefined) {
        whereClause = sql`${whereClause} AND tsd.value2 <= ${filters.value2Range.max}`
      }
    }

    const results = await sql`
      SELECT tsd.time, tsd.entity_id, tsd.value, tsd.value2, tsd.value3, tsd.value4, tsd.metadata
      FROM time_series_data tsd
      JOIN entities e ON tsd.entity_id = e.entity_id
      WHERE ${whereClause} AND e.is_active = TRUE
      ORDER BY tsd.time ${opts.orderBy.direction.toUpperCase() === 'DESC' ? sql`DESC` : sql`ASC`}
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    ` as Array<{
      time: string
      entity_id: string
      value: number
      value2: number | null
      value3: number | null
      value4: number | null
      metadata: Record<string, unknown> | null
    }>

    return results.map((row) => ({
      time: row.time,
      entity_id: row.entity_id,
      value: row.value,
      value2: row.value2 ?? undefined,
      value3: row.value3 ?? undefined,
      value4: row.value4 ?? undefined,
      metadata: row.metadata ?? undefined,
    }))
  } catch (error) {
    throw new QueryError(
      'Failed to search records with filters',
      error instanceof Error ? error : new Error(String(error)),
      'SELECT FROM time_series_data with filters',
      [filters, range.from, range.to],
    )
  }
}

/**
 * Validate entity ID format
 */
function validateEntityId(entityId: string): void {
  if (!entityId || typeof entityId !== 'string' || entityId.trim().length === 0) {
    throw new ValidationError('Entity ID is required and must be a non-empty string', 'entityId', entityId)
  }

  if (entityId.length > 100) {
    throw new ValidationError('Entity ID must be 100 characters or less', 'entityId', entityId)
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(entityId)) {
    throw new ValidationError(
      'Entity ID must contain only letters, numbers, underscores, dots, and dashes',
      'entityId',
      entityId,
    )
  }
}

/**
 * Validate entity type format
 */
function validateEntityType(entityType: string): void {
  if (!entityType || typeof entityType !== 'string' || entityType.trim().length === 0) {
    throw new ValidationError('Entity type is required and must be a non-empty string', 'entityType', entityType)
  }

  if (entityType.length > 50) {
    throw new ValidationError('Entity type must be 50 characters or less', 'entityType', entityType)
  }

  if (!/^[a-z_]+$/.test(entityType)) {
    throw new ValidationError(
      'Entity type must contain only lowercase letters and underscores',
      'entityType',
      entityType,
    )
  }
}

/**
 * Validate time range
 */
function validateTimeRange(range: TimeRange): void {
  if (!range.from || !range.to) {
    throw new ValidationError('Time range must include both from and to dates', 'range')
  }

  if (!(range.from instanceof Date) || !(range.to instanceof Date)) {
    throw new ValidationError('Time range from and to must be Date objects', 'range')
  }

  if (range.from >= range.to) {
    throw new ValidationError('Time range from must be before to', 'range')
  }

  // Limit range to prevent excessive queries
  const maxRangeDays = 365 // 1 year
  const rangeDays = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)

  if (rangeDays > maxRangeDays) {
    throw new ValidationError(
      `Time range cannot exceed ${maxRangeDays} days`,
      'range',
      `${rangeDays} days`,
    )
  }
}
