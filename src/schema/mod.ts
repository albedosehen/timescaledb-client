// TimescaleDB Client - Schema Management Module
// This module provides TypeScript functions to manage database schema operations

import { readTextFile } from "https://deno.land/std@0.208.0/fs/read_text_file.ts";
import { exists } from "https://deno.land/std@0.208.0/fs/exists.ts";
import { join } from "https://deno.land/std@0.208.0/path/join.ts";
import type { Sql } from "https://esm.sh/postgres@3.4.3";

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Schema file configuration interface
 */
export interface SchemaFile {
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly dependencies: string[];
}

/**
 * Schema execution result interface
 */
export interface SchemaResult {
  readonly success: boolean;
  readonly fileName: string;
  readonly duration: number;
  readonly rowsAffected?: number;
  readonly error?: string;
}

/**
 * Schema validation result interface
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly missingTables: string[];
  readonly missingIndexes: string[];
}

/**
 * Migration information interface
 */
export interface MigrationInfo {
  readonly version: string;
  readonly description: string;
  readonly appliedAt?: Date;
  readonly appliedBy?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Schema files in execution order
 */
export const SCHEMA_FILES: readonly SchemaFile[] = [
  {
    name: "create_tables.sql",
    path: "src/schema/create_tables.sql",
    description: "Core hypertables and supporting tables creation",
    dependencies: [],
  },
  {
    name: "indexes.sql",
    path: "src/schema/indexes.sql", 
    description: "Optimized indexes for time-series queries",
    dependencies: ["create_tables.sql"],
  },
  {
    name: "functions.sql",
    path: "src/schema/functions.sql",
    description: "Custom PostgreSQL and TimescaleDB functions",
    dependencies: ["create_tables.sql"],
  },
  {
    name: "continuous_aggregates.sql",
    path: "src/schema/continuous_aggregates.sql",
    description: "Continuous aggregates for pre-computed analytics",
    dependencies: ["create_tables.sql", "functions.sql"],
  },
  {
    name: "compression.sql", 
    path: "src/schema/compression.sql",
    description: "Compression policies for storage optimization",
    dependencies: ["create_tables.sql"],
  },
  {
    name: "retention.sql",
    path: "src/schema/retention.sql",
    description: "Data retention policies for lifecycle management", 
    dependencies: ["create_tables.sql"],
  },
] as const;

/**
 * Required tables that must exist after schema creation
 */
export const REQUIRED_TABLES = [
  "schema_versions",
  "symbols", 
  "data_sources",
  "price_ticks",
  "ohlc_data",
] as const;

/**
 * Required hypertables
 */
export const REQUIRED_HYPERTABLES = [
  "price_ticks",
  "ohlc_data", 
] as const;

// =============================================================================
// SCHEMA MANAGEMENT CLASS
// =============================================================================

/**
 * Main schema management class for TimescaleDB operations
 */
export class SchemaManager {
  private readonly sql: Sql;
  constructor(sql: Sql, _schemaDir = "src/schema") {
    this.sql = sql;
  }

  /**
   * Execute all schema files in the correct order
   */
  async initializeSchema(): Promise<SchemaResult[]> {
    const results: SchemaResult[] = [];

    console.log("🚀 Starting TimescaleDB schema initialization...");

    for (const schemaFile of SCHEMA_FILES) {
      try {
        const result = await this.executeSchemaFile(schemaFile);
        results.push(result);

        if (!result.success) {
          console.error(`❌ Failed to execute ${schemaFile.name}: ${result.error}`);
          break;
        } else {
          console.log(`✅ Successfully executed ${schemaFile.name} (${result.duration}ms)`);
        }
      } catch (error) {
        const errorResult: SchemaResult = {
          success: false,
          fileName: schemaFile.name,
          duration: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        results.push(errorResult);
        console.error(`❌ Unexpected error in ${schemaFile.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        break;
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`📊 Schema initialization completed: ${successCount}/${results.length} files successful`);

    return results;
  }

  /**
   * Execute a single schema file
   */
  async executeSchemaFile(schemaFile: SchemaFile): Promise<SchemaResult> {
    const startTime = performance.now();
    
    try {
      // Check if file exists
      const filePath = join(Deno.cwd(), schemaFile.path);
      if (!await exists(filePath)) {
        throw new Error(`Schema file not found: ${filePath}`);
      }

      // Read SQL content
      const sqlContent = await readTextFile(filePath);
      if (!sqlContent.trim()) {
        throw new Error(`Schema file is empty: ${schemaFile.path}`);
      }

      // Execute SQL
      console.log(`📝 Executing ${schemaFile.name}...`);
      const result = await this.sql.unsafe(sqlContent);

      const duration = Math.round(performance.now() - startTime);

      const baseResult: SchemaResult = {
        success: true,
        fileName: schemaFile.name,
        duration,
      };

      if (Array.isArray(result)) {
        return {
          ...baseResult,
          rowsAffected: result.length,
        };
      }

      return baseResult;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      return {
        success: false,
        fileName: schemaFile.name,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate that the schema is properly created
   */
  async validateSchema(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingTables: string[] = [];
    const missingIndexes: string[] = [];

    try {
      // Check if TimescaleDB extension is enabled
      const extensionResult = await this.sql`
        SELECT EXISTS(
          SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
        ) as timescaledb_enabled
      `;

      if (!extensionResult[0]?.timescaledb_enabled) {
        errors.push("TimescaleDB extension is not enabled");
      }

      // Check required tables exist
      for (const tableName of REQUIRED_TABLES) {
        const tableExists = await this.sql`
          SELECT EXISTS(
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = ${tableName}
          ) as exists
        `;

        if (!tableExists[0]?.exists) {
          missingTables.push(tableName);
          errors.push(`Required table missing: ${tableName}`);
        }
      }

      // Check hypertables are properly configured
      for (const hypertableName of REQUIRED_HYPERTABLES) {
        const hypertableInfo = await this.sql`
          SELECT * FROM timescaledb_information.hypertables 
          WHERE hypertable_name = ${hypertableName}
        `;

        if (hypertableInfo.length === 0) {
          errors.push(`Table ${hypertableName} is not configured as a hypertable`);
        } else {
          // Check if compression is enabled
          if (!hypertableInfo[0]?.compression_enabled) {
            warnings.push(`Compression not enabled for hypertable: ${hypertableName}`);
          }
        }
      }

      // Check for essential indexes
      const indexCount = await this.sql`
        SELECT COUNT(*) as count
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND tablename IN ('price_ticks', 'ohlc_data')
      `;

      if (Number(indexCount[0]?.count) < 5) {
        warnings.push("Fewer indexes than expected found on hypertables");
      }

      // Check for continuous aggregates
      const caggCount = await this.sql`
        SELECT COUNT(*) as count
        FROM timescaledb_information.continuous_aggregates
      `;

      if (Number(caggCount[0]?.count) === 0) {
        warnings.push("No continuous aggregates found");
      }

      // Check for retention policies
      const retentionCount = await this.sql`
        SELECT COUNT(*) as count
        FROM timescaledb_information.jobs
        WHERE application_name LIKE '%retention%'
      `;

      if (Number(retentionCount[0]?.count) === 0) {
        warnings.push("No retention policies configured");
      }

      // Check for compression policies
      const compressionCount = await this.sql`
        SELECT COUNT(*) as count
        FROM timescaledb_information.jobs
        WHERE application_name LIKE '%compression%'
      `;

      if (Number(compressionCount[0]?.count) === 0) {
        warnings.push("No compression policies configured");
      }

    } catch (error) {
      errors.push(`Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingTables,
      missingIndexes,
    };
  }

  /**
   * Get current schema version
   */
  async getCurrentSchemaVersion(): Promise<string | null> {
    try {
      const result = await this.sql`
        SELECT version 
        FROM schema_versions 
        ORDER BY applied_at DESC 
        LIMIT 1
      `;
      
      return result[0]?.version || null;
    } catch (error) {
      console.warn(`Could not get schema version: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Get schema migration history
   */
  async getMigrationHistory(): Promise<MigrationInfo[]> {
    try {
      const result = await this.sql`
        SELECT version, description, applied_at, applied_by
        FROM schema_versions 
        ORDER BY applied_at DESC
      `;

      return result.map((row): MigrationInfo => ({
        version: String(row.version),
        description: String(row.description),
        ...(row.applied_at ? { appliedAt: new Date(String(row.applied_at)) } : {}),
        ...(row.applied_by ? { appliedBy: String(row.applied_by) } : {}),
      }));
    } catch (error) {
      console.warn(`Could not get migration history: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Drop all schema objects (for development/testing)
   */
  async dropSchema(): Promise<SchemaResult> {
    const startTime = performance.now();

    try {
      console.log("⚠️  Dropping all schema objects...");

      // Drop continuous aggregates first
      await this.sql`
        DO $$
        DECLARE
          cagg_name TEXT;
        BEGIN
          FOR cagg_name IN 
            SELECT view_name 
            FROM timescaledb_information.continuous_aggregates
          LOOP
            EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I CASCADE', cagg_name);
          END LOOP;
        END $$;
      `;

      // Drop hypertables
      for (const tableName of REQUIRED_HYPERTABLES) {
        await this.sql.unsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      }

      // Drop regular tables
      for (const tableName of REQUIRED_TABLES) {
        if (!REQUIRED_HYPERTABLES.includes(tableName as typeof REQUIRED_HYPERTABLES[number])) {
          await this.sql.unsafe(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
        }
      }

      // Drop custom functions
      await this.sql`
        DROP FUNCTION IF EXISTS calculate_sma CASCADE;
        DROP FUNCTION IF EXISTS calculate_ema CASCADE;
        DROP FUNCTION IF EXISTS calculate_rsi CASCADE;
        DROP FUNCTION IF EXISTS calculate_bollinger_bands CASCADE;
        DROP FUNCTION IF EXISTS calculate_volatility CASCADE;
        DROP FUNCTION IF EXISTS calculate_var CASCADE;
        DROP FUNCTION IF EXISTS calculate_vwap CASCADE;
        DROP FUNCTION IF EXISTS calculate_obv CASCADE;
        DROP FUNCTION IF EXISTS find_support_resistance CASCADE;
        DROP FUNCTION IF EXISTS calculate_correlation CASCADE;
        DROP FUNCTION IF EXISTS validate_price_data CASCADE;
        DROP FUNCTION IF EXISTS clean_price_data CASCADE;
        DROP FUNCTION IF EXISTS get_table_statistics CASCADE;
      `;

      const duration = Math.round(performance.now() - startTime);
      console.log(`✅ Schema dropped successfully (${duration}ms)`);

      return {
        success: true,
        fileName: "drop_schema",
        duration,
      };
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      return {
        success: false,
        fileName: "drop_schema",
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get schema statistics and health information
   */
  async getSchemaInfo(): Promise<Record<string, unknown>> {
    try {
      const [
        tables,
        hypertables,
        indexes,
        continuousAggregates,
        jobs,
        chunks,
      ] = await Promise.all([
        this.sql`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `,
        this.sql`
          SELECT COUNT(*) as count 
          FROM timescaledb_information.hypertables
        `,
        this.sql`
          SELECT COUNT(*) as count 
          FROM pg_indexes 
          WHERE schemaname = 'public'
        `,
        this.sql`
          SELECT COUNT(*) as count 
          FROM timescaledb_information.continuous_aggregates
        `,
        this.sql`
          SELECT COUNT(*) as count 
          FROM timescaledb_information.jobs
        `,
        this.sql`
          SELECT COUNT(*) as count 
          FROM timescaledb_information.chunks
        `,
      ]);

      return {
        tables: Number(tables[0]?.count || 0),
        hypertables: Number(hypertables[0]?.count || 0),
        indexes: Number(indexes[0]?.count || 0),
        continuousAggregates: Number(continuousAggregates[0]?.count || 0),
        jobs: Number(jobs[0]?.count || 0),
        chunks: Number(chunks[0]?.count || 0),
        schemaVersion: await this.getCurrentSchemaVersion(),
      };
    } catch (error) {
      console.error(`Error getting schema info: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {};
    }
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a new SchemaManager instance
 */
export function createSchemaManager(sql: Sql): SchemaManager {
  return new SchemaManager(sql);
}

/**
 * Quick schema initialization function
 */
export async function initializeSchema(sql: Sql): Promise<boolean> {
  const manager = createSchemaManager(sql);
  const results = await manager.initializeSchema();
  return results.every(result => result.success);
}

/**
 * Quick schema validation function
 */
export async function validateSchema(sql: Sql): Promise<ValidationResult> {
  const manager = createSchemaManager(sql);
  return await manager.validateSchema();
}

/**
 * Get current schema version
 */
export async function getSchemaVersion(sql: Sql): Promise<string | null> {
  const manager = createSchemaManager(sql);
  return await manager.getCurrentSchemaVersion();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default SchemaManager;