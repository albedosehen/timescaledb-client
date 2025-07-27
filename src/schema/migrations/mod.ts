/**
 * TimescaleDB Client - Migration Management Module
 * This module handles database migrations for schema evolution
 * @module schema/migrations
 */

import { exists } from '@std/fs/exists'
import { join } from '@std/path/join'
import { walkSync } from '@std/fs/walk'
import type { Sql } from 'https://esm.sh/postgres@3.4.3'

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Migration file information
 */
export interface Migration {
  readonly version: string
  readonly filename: string
  readonly description: string
  readonly filePath: string
  readonly appliedAt?: Date
  readonly appliedBy?: string
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  readonly success: boolean
  readonly version: string
  readonly duration: number
  readonly error?: string
}

/**
 * Migration status information
 */
export interface MigrationStatus {
  readonly pendingMigrations: Migration[]
  readonly appliedMigrations: Migration[]
  readonly currentVersion: string | null
  readonly canMigrate: boolean
}

// =============================================================================
// MIGRATION MANAGER CLASS
// =============================================================================

/**
 * Manages database migrations for TimescaleDB schema evolution
 */
export class MigrationManager {
  private readonly sql: Sql
  private readonly migrationsDir: string

  constructor(sql: Sql, migrationsDir = 'src/schema/migrations') {
    this.sql = sql
    this.migrationsDir = migrationsDir
  }

  /**
   * Get all available migration files
   */
  async getAvailableMigrations(): Promise<Migration[]> {
    const migrations: Migration[] = []
    const migrationsPath = join(Deno.cwd(), this.migrationsDir)

    if (!await exists(migrationsPath)) {
      throw new Error(`Migrations directory not found: ${migrationsPath}`)
    }

    // Walk through migration files
    for (
      const entry of walkSync(migrationsPath, {
        exts: ['.sql'],
        includeDirs: false,
      })
    ) {
      const filename = entry.path.split('/').pop() || entry.path
      const version = this.extractVersionFromFilename(filename)

      if (version) {
        const description = await this.extractDescriptionFromFile(entry.path)

        migrations.push({
          version,
          filename,
          description,
          filePath: entry.path,
        })
      }
    }

    // Sort by version
    return migrations.sort((a, b) => a.version.localeCompare(b.version))
  }

  /**
   * Get applied migrations from database
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    try {
      const result = await this.sql`
        SELECT version, description, applied_at, applied_by
        FROM schema_versions
        WHERE version LIKE '%_migration'
        ORDER BY applied_at ASC
      `

      return result.map((row): Migration => ({
        version: String(row.version),
        filename: `${String(row.version)}.sql`,
        description: String(row.description),
        filePath: '',
        ...(row.applied_at ? { appliedAt: new Date(String(row.applied_at)) } : {}),
        ...(row.applied_by ? { appliedBy: String(row.applied_by) } : {}),
      }))
    } catch (error) {
      // Schema versions table might not exist yet
      if (error instanceof Error && error.message?.includes('relation "schema_versions" does not exist')) {
        return []
      }
      throw error
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    const [availableMigrations, appliedMigrations] = await Promise.all([
      this.getAvailableMigrations(),
      this.getAppliedMigrations(),
    ])

    const appliedVersions = new Set(appliedMigrations.map((m) => m.version))
    const pendingMigrations = availableMigrations.filter((m) => !appliedVersions.has(m.version))

    const lastMigration = appliedMigrations.at(-1)
    const currentVersion = lastMigration ? lastMigration.version : null

    return {
      pendingMigrations,
      appliedMigrations,
      currentVersion,
      canMigrate: pendingMigrations.length > 0,
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<MigrationResult[]> {
    const status = await this.getMigrationStatus()

    if (!status.canMigrate) {
      console.log('✅ No pending migrations to apply')
      return []
    }

    console.log(`🚀 Applying ${status.pendingMigrations.length} pending migrations...`)

    const results: MigrationResult[] = []

    for (const migration of status.pendingMigrations) {
      try {
        const result = await this.runMigration(migration)
        results.push(result)

        if (!result.success) {
          console.error(`❌ Migration ${migration.version} failed: ${result.error}`)
          break
        } else {
          console.log(`✅ Applied migration ${migration.version} (${result.duration}ms)`)
        }
      } catch (error) {
        const errorResult: MigrationResult = {
          success: false,
          version: migration.version,
          duration: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
        results.push(errorResult)
        console.error(`❌ Unexpected error in migration ${migration.version}: ${error}`)
        break
      }
    }

    const successCount = results.filter((r) => r.success).length
    console.log(`📊 Migration completed: ${successCount}/${results.length} migrations successful`)

    return results
  }

  /**
   * Run a single migration
   */
  async runMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = performance.now()

    try {
      console.log(`📝 Running migration: ${migration.version}`)

      // Read migration file
      const sqlContent = await Deno.readTextFile(migration.filePath)
      if (!sqlContent.trim()) {
        throw new Error(`Migration file is empty: ${migration.filePath}`)
      }

      // Execute migration in a transaction
      await this.sql.begin(async (sql) => {
        await sql.unsafe(sqlContent)
      })

      const duration = Math.round(performance.now() - startTime)

      return {
        success: true,
        version: migration.version,
        duration,
      }
    } catch (error) {
      const duration = Math.round(performance.now() - startTime)
      return {
        success: false,
        version: migration.version,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Create a new migration file
   */
  async createMigration(description: string): Promise<string> {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const version = `${timestamp}_${this.slugify(description)}`
    const filename = `${version}.sql`
    const filePath = join(Deno.cwd(), this.migrationsDir, filename)

    const migrationTemplate = this.createMigrationTemplate(version, description)

    await Deno.writeTextFile(filePath, migrationTemplate)

    console.log(`📄 Created migration file: ${filename}`)
    return filePath
  }

  /**
   * Rollback to a specific migration version
   */
  async rollback(targetVersion: string): Promise<MigrationResult[]> {
    const appliedMigrations = await this.getAppliedMigrations()
    const targetIndex = appliedMigrations.findIndex((m) => m.version === targetVersion)

    if (targetIndex === -1) {
      throw new Error(`Target migration version not found: ${targetVersion}`)
    }

    const migrationsToRollback = appliedMigrations.slice(targetIndex + 1).reverse()

    if (migrationsToRollback.length === 0) {
      console.log('✅ Already at target migration version')
      return []
    }

    console.log(`⏪ Rolling back ${migrationsToRollback.length} migrations...`)
    console.warn('⚠️  Rollback functionality requires manual rollback scripts')
    console.warn('⚠️  This will only remove migration records from schema_versions table')

    const results: MigrationResult[] = []

    for (const migration of migrationsToRollback) {
      try {
        const startTime = performance.now()

        await this.sql`
          DELETE FROM schema_versions 
          WHERE version = ${migration.version}
        `

        const duration = Math.round(performance.now() - startTime)

        results.push({
          success: true,
          version: migration.version,
          duration,
        })

        console.log(`✅ Rolled back migration record: ${migration.version}`)
      } catch (error) {
        results.push({
          success: false,
          version: migration.version,
          duration: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        })

        console.error(`❌ Failed to rollback ${migration.version}: ${error}`)
        break
      }
    }

    return results
  }

  /**
   * Extract version from migration filename
   */
  private extractVersionFromFilename(filename: string): string | null {
    // Match patterns like: 001_initial_schema.sql, 20240101_add_indexes.sql
    const match = filename.match(/^(\d{3,}_\w+)\.sql$/)
    return match?.[1] ?? null
  }

  /**
   * Extract description from migration file
   *
   * Searches for description comments in the format: -- Description: <description>
   * Handles various edge cases including empty files, malformed content, and file system errors
   *
   * @param filePath - Path to the migration SQL file
   * @returns Promise resolving to the description string or a fallback message
   */
  private async extractDescriptionFromFile(filePath: string): Promise<string> {
    // Pre-compiled regex for better performance when called multiple times
    const DESCRIPTION_PATTERN = /^--\s*Description:\s*(.+?)(?:\r?\n|$)/im
    const DEFAULT_DESCRIPTION = 'No description available'
    const FILE_READ_ERROR = 'Unable to read migration file'

    try {
      // Validate file path
      if (!filePath || typeof filePath !== 'string') {
        return DEFAULT_DESCRIPTION
      }

      // Read file content (UTF-8 by default in Deno)
      const content = await Deno.readTextFile(filePath)

      // Handle empty or whitespace-only files
      if (!content || !content.trim()) {
        return DEFAULT_DESCRIPTION
      }

      // Search for description pattern
      const descriptionMatch = content.match(DESCRIPTION_PATTERN)

      // Check if we have a valid match with captured group
      if (descriptionMatch && descriptionMatch[1]) {
        const description = descriptionMatch[1].trim()

        // Ensure description is not empty after trimming
        if (description.length > 0) {
          // Sanitize description - remove extra whitespace and limit length
          return description
            .replace(/\s+/g, ' ')
            .slice(0, 200)
            .trim()
        }
      }

      return DEFAULT_DESCRIPTION
    } catch (error) {
      // Provide more specific error handling for different error types
      if (error instanceof Deno.errors.NotFound) {
        console.warn(`Migration file not found: ${filePath}`)
        return 'Migration file not found'
      }

      if (error instanceof Deno.errors.PermissionDenied) {
        console.warn(`Permission denied reading migration file: ${filePath}`)
        return 'Permission denied reading file'
      }

      if (error instanceof TypeError) {
        console.warn(`Invalid file path provided: ${filePath}`)
        return 'Invalid file path'
      }

      // Log unexpected errors for debugging
      console.warn(`Unexpected error reading migration file ${filePath}:`, error)
      return FILE_READ_ERROR
    }
  }

  /**
   * Create a migration template
   */
  private createMigrationTemplate(version: string, description: string): string {
    return `-- Migration: ${version}.sql
-- Description: ${description}
-- Author: TimescaleDB Client
-- Created: ${new Date().toISOString().slice(0, 10)}

-- =============================================================================
-- MIGRATION METADATA
-- =============================================================================

DO $$
BEGIN
    -- Check if this migration has already been applied
    IF EXISTS (
        SELECT 1 FROM schema_versions WHERE version = '${version}'
    ) THEN
        RAISE NOTICE 'Migration ${version} already applied, skipping...';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Applying migration: ${version}';
END $$;

-- =============================================================================
-- MIGRATION SCRIPT
-- =============================================================================

-- TODO: Add your migration SQL here


-- =============================================================================
-- RECORD MIGRATION
-- =============================================================================

INSERT INTO schema_versions (version, description) 
VALUES ('${version}', '${description}')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration ${version} completed successfully';
END $$;
`
  }

  /**
   * Convert string to slug format
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50)
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a new migration manager instance
 */
export function createMigrationManager(sql: Sql): MigrationManager {
  return new MigrationManager(sql)
}

/**
 * Quick migration function
 */
export async function runMigrations(sql: Sql): Promise<boolean> {
  const manager = createMigrationManager(sql)
  const results = await manager.migrate()
  return results.every((result) => result.success)
}

/**
 * Get migration status
 */
export async function getMigrationStatus(sql: Sql): Promise<MigrationStatus> {
  const manager = createMigrationManager(sql)
  return await manager.getMigrationStatus()
}

// =============================================================================
// EXPORTS
// =============================================================================

export default MigrationManager
