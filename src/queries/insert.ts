/**
 * Insert operations for TimescaleDB client
 *
 * Provides optimized SQL builders for inserting time series records
 * with batch processing, upsert operations, and performance monitoring.
 */

import type { SqlInstance } from '../types/internal.ts'
import type { BatchResult, TimeSeriesRecord } from '../types/interfaces.ts'
import { BatchError, QueryError, ValidationError } from '../types/errors.ts'

/**
 * Insert configuration options
 */
export interface InsertOptions {
  /** Whether to use upsert (ON CONFLICT DO UPDATE) */
  readonly upsert?: boolean
  /** Batch size for chunking large operations */
  readonly batchSize?: number
  /** Whether to use a transaction for the entire batch */
  readonly useTransaction?: boolean
  /** Timeout in milliseconds */
  readonly timeoutMs?: number
  /** Whether to validate data before insertion */
  readonly validate?: boolean
}

/**
 * Default insert options
 */
const DEFAULT_INSERT_OPTIONS: Required<InsertOptions> = {
  upsert: true,
  batchSize: 5000,
  useTransaction: true,
  timeoutMs: 30000,
  validate: true,
}

/**
 * Insert a single time series record
 */
export async function insertRecord(
  sql: SqlInstance,
  record: TimeSeriesRecord,
  options: InsertOptions = {},
): Promise<void> {
  const opts = { ...DEFAULT_INSERT_OPTIONS, ...options }

  if (opts.validate) {
    validateTimeSeriesRecord(record)
  }

  try {
    const metadataJson = record.metadata ? JSON.stringify(record.metadata) : null

    if (opts.upsert) {
      await sql`
        INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
        VALUES (${record.time}, ${record.entity_id}, ${record.value}, ${record.value2 || null}, ${
        record.value3 || null
      }, ${record.value4 || null}, ${metadataJson})
        ON CONFLICT (entity_id, time)
        DO UPDATE SET
          value = EXCLUDED.value,
          value2 = EXCLUDED.value2,
          value3 = EXCLUDED.value3,
          value4 = EXCLUDED.value4,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `
    } else {
      await sql`
        INSERT INTO time_series_data (time, entity_id, value, value2, value3, value4, metadata)
        VALUES (${record.time}, ${record.entity_id}, ${record.value}, ${record.value2 || null}, ${
        record.value3 || null
      }, ${record.value4 || null}, ${metadataJson})
      `
    }
  } catch (error) {
    throw new QueryError(
      'Failed to insert time series record',
      error instanceof Error ? error : new Error(String(error)),
      'INSERT INTO time_series_data',
      [record.entity_id, record.value],
    )
  }
}

/**
 * Insert multiple time series records efficiently in batches
 */
export async function insertManyRecords(
  sql: SqlInstance,
  records: TimeSeriesRecord[],
  options: InsertOptions = {},
): Promise<BatchResult> {
  const opts = { ...DEFAULT_INSERT_OPTIONS, ...options }
  const startTime = performance.now()

  if (records.length === 0) {
    return {
      processed: 0,
      failed: 0,
      durationMs: 0,
      errors: [],
    }
  }

  if (opts.validate) {
    for (const record of records) {
      validateTimeSeriesRecord(record)
    }
  }

  let processed = 0
  let failed = 0
  const errors: Error[] = []

  try {
    // Process in chunks
    const chunks = chunkArray(records, opts.batchSize)

    for (const chunk of chunks) {
      try {
        if (opts.useTransaction) {
          await sql.begin(async (sql: SqlInstance) => {
            await insertRecordBatch(sql, chunk, opts.upsert)
          })
        } else {
          await insertRecordBatch(sql, chunk, opts.upsert)
        }
        processed += chunk.length
      } catch (error) {
        failed += chunk.length
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const durationMs = Math.round(performance.now() - startTime)

    if (failed > 0) {
      throw new BatchError(
        `Batch operation partially failed: ${processed} succeeded, ${failed} failed`,
        processed,
        failed,
        errors,
      )
    }

    return {
      processed,
      failed,
      durationMs,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error) {
    if (error instanceof BatchError) {
      throw error
    }

    throw new BatchError(
      'Batch record insertion failed',
      processed,
      failed || records.length,
      [error instanceof Error ? error : new Error(String(error))],
    )
  }
}

/**
 * Insert a batch of time series records using optimized bulk insert
 */
async function insertRecordBatch(
  sql: SqlInstance,
  records: TimeSeriesRecord[],
  upsert: boolean,
): Promise<void> {
  const recordData = records.map((record) => ({
    time: record.time,
    entity_id: record.entity_id,
    value: record.value,
    value2: record.value2 || null,
    value3: record.value3 || null,
    value4: record.value4 || null,
    metadata: record.metadata ? JSON.stringify(record.metadata) : null,
  }))

  if (upsert) {
    await sql`
      INSERT INTO time_series_data ${
      sql(recordData, 'time', 'entity_id', 'value', 'value2', 'value3', 'value4', 'metadata')
    }
      ON CONFLICT (entity_id, time)
      DO UPDATE SET
        value = EXCLUDED.value,
        value2 = EXCLUDED.value2,
        value3 = EXCLUDED.value3,
        value4 = EXCLUDED.value4,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `
  } else {
    await sql`
      INSERT INTO time_series_data ${
      sql(recordData, 'time', 'entity_id', 'value', 'value2', 'value3', 'value4', 'metadata')
    }
    `
  }
}

/**
 * Validate time series record data
 */
function validateTimeSeriesRecord(record: TimeSeriesRecord): void {
  if (!record.entity_id || typeof record.entity_id !== 'string' || record.entity_id.trim().length === 0) {
    throw new ValidationError('Entity ID is required and must be a non-empty string', 'entity_id', record.entity_id)
  }

  if (record.entity_id.length > 100) {
    throw new ValidationError('Entity ID must be 100 characters or less', 'entity_id', record.entity_id)
  }

  if (!/^[A-Za-z0-9_.-]+$/.test(record.entity_id)) {
    throw new ValidationError(
      'Entity ID must contain only letters, numbers, underscores, dots, and dashes',
      'entity_id',
      record.entity_id,
    )
  }

  if (typeof record.value !== 'number' || !isFinite(record.value)) {
    throw new ValidationError('Value must be a finite number', 'value', record.value)
  }

  // Validate optional value fields
  if (record.value2 !== undefined && (typeof record.value2 !== 'number' || !isFinite(record.value2))) {
    throw new ValidationError('Value2 must be a finite number', 'value2', record.value2)
  }

  if (record.value3 !== undefined && (typeof record.value3 !== 'number' || !isFinite(record.value3))) {
    throw new ValidationError('Value3 must be a finite number', 'value3', record.value3)
  }

  if (record.value4 !== undefined && (typeof record.value4 !== 'number' || !isFinite(record.value4))) {
    throw new ValidationError('Value4 must be a finite number', 'value4', record.value4)
  }

  if (!record.time || typeof record.time !== 'string') {
    throw new ValidationError('Time is required and must be a string', 'time', record.time)
  }

  // Validate ISO 8601 format
  try {
    const date = new Date(record.time)
    if (isNaN(date.getTime())) {
      throw new ValidationError('Time must be a valid ISO 8601 date string', 'time', record.time)
    }
  } catch {
    throw new ValidationError('Time must be a valid ISO 8601 date string', 'time', record.time)
  }

  // Validate metadata if provided
  if (record.metadata !== undefined && record.metadata !== null) {
    if (typeof record.metadata !== 'object') {
      throw new ValidationError('Metadata must be an object', 'metadata', record.metadata)
    }
  }
}

/**
 * Chunk an array into smaller arrays
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
