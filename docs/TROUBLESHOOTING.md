# TimescaleDB Client - Troubleshooting Guide

## Table of Contents

1. [Common Issues](#common-issues)
2. [Connection Problems](#connection-problems)
3. [Performance Issues](#performance-issues)
4. [Data Issues](#data-issues)
5. [Error Reference](#error-reference)
6. [Debugging Techniques](#debugging-techniques)
7. [Memory Issues](#memory-issues)
8. [Schema Problems](#schema-problems)
9. [Query Issues](#query-issues)
10. [Deployment Issues](#deployment-issues)
11. [Monitoring and Diagnostics](#monitoring-and-diagnostics)
12. [FAQ](#faq)

---

## Common Issues

### Quick Diagnostic Checklist

Before diving into specific issues, run this quick diagnostic:

```typescript
// Quick diagnostic script
import { ClientFactory } from 'timescaledb-client'

const runDiagnostics = async () => {
  try {
    console.log('🔍 Running TimescaleDB Client Diagnostics...\n')
    
    // 1. Test basic connection
    console.log('1. Testing database connection...')
    const client = await ClientFactory.fromConnectionString(
      process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/timescale_test'
    )
    console.log('✅ Client created successfully')
    
    // 2. Initialize client
    console.log('2. Initializing client...')
    await client.initialize()
    console.log('✅ Client initialized successfully')
    
    // 3. Health check
    console.log('3. Performing health check...')
    const health = await client.healthCheck()
    console.log(`✅ Health check: ${health.isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`)
    console.log(`   Response time: ${health.responseTimeMs}ms`)
    console.log(`   TimescaleDB version: ${health.version}`)
    
    // 4. Schema info
    console.log('4. Checking schema info...')
    const schema = await client.getSchemaInfo()
    console.log(`✅ Schema version: ${schema.version}`)
    console.log(`   Hypertables: ${schema.hypertables.length}`)
    console.log(`   Compression enabled: ${schema.compressionEnabled}`)
    
    // 5. Test basic operations
    console.log('5. Testing basic operations...')
    const testTick = {
      symbol: 'DIAGNOSTIC_TEST',
      price: 100.50,
      timestamp: new Date().toISOString()
    }
    
    await client.insertTick(testTick)
    console.log('✅ Insert operation successful')
    
    const latestPrice = await client.getLatestPrice('DIAGNOSTIC_TEST')
    console.log(`✅ Query operation successful: ${latestPrice}`)
    
    // 6. Cleanup
    await client.close()
    console.log('✅ Client closed successfully')
    
    console.log('\n🎉 All diagnostics passed!')
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message)
    
    // Provide specific guidance based on error type
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Suggestion: Database server is not running or unreachable')
      console.log('   - Check if PostgreSQL/TimescaleDB is running')
      console.log('   - Verify connection string host and port')
      console.log('   - Check firewall settings')
    } else if (error.message.includes('authentication failed')) {
      console.log('\n💡 Suggestion: Authentication problem')
      console.log('   - Verify username and password')
      console.log('   - Check database user permissions')
      console.log('   - Ensure user has access to the database')
    } else if (error.message.includes('timescaledb')) {
      console.log('\n💡 Suggestion: TimescaleDB extension issue')
      console.log('   - Ensure TimescaleDB extension is installed')
      console.log('   - Run: CREATE EXTENSION IF NOT EXISTS timescaledb;')
    }
  }
}

// Run diagnostics
runDiagnostics()
```

---

## Connection Problems

### Issue: "Connection Refused" Error

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Causes & Solutions:**

1. **Database server not running**
   ```bash
   # Check if PostgreSQL is running
   sudo systemctl status postgresql
   
   # Start PostgreSQL if needed
   sudo systemctl start postgresql
   ```

2. **Wrong connection parameters**
   ```typescript
   // Verify connection string format
   const connectionString = 'postgresql://username:password@host:port/database'
   
   // Debug connection parameters
   const url = new URL(process.env.DATABASE_URL)
   console.log('Host:', url.hostname)
   console.log('Port:', url.port)
   console.log('Database:', url.pathname.slice(1))
   console.log('Username:', url.username)
   ```

3. **Firewall blocking connection**
   ```bash
   # Check if port is open
   telnet localhost 5432
   
   # Check firewall rules
   sudo ufw status
   ```

### Issue: "Authentication Failed" Error

**Symptoms:**
```
Error: password authentication failed for user "username"
```

**Solutions:**

1. **Verify credentials**
   ```typescript
   // Test with psql command line
   // psql -h localhost -p 5432 -U username -d database
   
   // Check if user exists
   const checkUser = `
     SELECT usename, usecreatedb, usesuper 
     FROM pg_user 
     WHERE usename = 'your_username';
   `
   ```

2. **Fix pg_hba.conf configuration**
   ```bash
   # Edit pg_hba.conf (usually in /etc/postgresql/*/main/)
   # Add or modify line:
   host    all             all             0.0.0.0/0               md5
   
   # Restart PostgreSQL
   sudo systemctl restart postgresql
   ```

3. **Reset user password**
   ```sql
   -- Connect as superuser and reset password
   ALTER USER username WITH PASSWORD 'new_password';
   ```

### Issue: "SSL Connection Required" Error

**Symptoms:**
```
Error: connection requires SSL
```

**Solutions:**

1. **Configure SSL in connection string**
   ```typescript
   // Add SSL parameters to connection string
   const connectionString = 'postgresql://user:pass@host:5432/db?sslmode=require'
   
   // Or disable SSL for development
   const devConnectionString = 'postgresql://user:pass@host:5432/db?sslmode=disable'
   ```

2. **Provide SSL certificates**
   ```typescript
   const client = await ClientFactory.fromConfig({
     host: 'localhost',
     port: 5432,
     database: 'timescale_db',
     username: 'user',
     password: 'password',
     ssl: {
       rejectUnauthorized: false,
       ca: fs.readFileSync('ca.crt').toString(),
       cert: fs.readFileSync('client.crt').toString(),
       key: fs.readFileSync('client.key').toString()
     }
   })
   ```

### Issue: "Too Many Connections" Error

**Symptoms:**
```
Error: too many connections for role "username"
```

**Solutions:**

1. **Increase connection limit**
   ```sql
   -- Check current limits
   SELECT usename, usecreatedb, usesuper FROM pg_user;
   SHOW max_connections;
   
   -- Increase user connection limit
   ALTER USER username CONNECTION LIMIT 100;
   
   -- Increase global connection limit in postgresql.conf
   max_connections = 200
   ```

2. **Implement connection pooling**
   ```typescript
   // Use PgBouncer or configure client pooling
   const client = await ClientFactory.fromConnectionString(connectionString, {
     // Limit concurrent connections
     maxRetries: 3,
     queryTimeout: 30000
   })
   ```

3. **Close connections properly**
   ```typescript
   // Always close client when done
   process.on('SIGINT', async () => {
     await client.close()
     process.exit(0)
   })
   ```

---

## Performance Issues

### Issue: Slow Query Performance

**Symptoms:**
- Queries taking longer than expected
- High CPU usage on database server
- Timeouts on large queries

**Diagnostic Steps:**

1. **Check query execution plans**
   ```sql
   -- Analyze query performance
   EXPLAIN (ANALYZE, BUFFERS) 
   SELECT * FROM price_ticks 
   WHERE symbol = 'BTCUSD' 
   AND time >= NOW() - INTERVAL '1 day';
   ```

2. **Monitor slow queries**
   ```sql
   -- Enable query logging
   SET log_min_duration_statement = 1000;
   
   -- Check slow queries
   SELECT 
     query,
     calls,
     total_time,
     mean_time,
     max_time
   FROM pg_stat_statements 
   ORDER BY total_time DESC 
   LIMIT 10;
   ```

**Solutions:**

1. **Optimize indexes**
   ```sql
   -- Create covering indexes
   CREATE INDEX CONCURRENTLY idx_price_ticks_symbol_time_price 
   ON price_ticks (symbol, time DESC) 
   INCLUDE (price, volume);
   
   -- Create partial indexes for common queries
   CREATE INDEX CONCURRENTLY idx_price_ticks_recent 
   ON price_ticks (symbol, time DESC) 
   WHERE time >= NOW() - INTERVAL '7 days';
   ```

2. **Use appropriate query limits**
   ```typescript
   // Limit result sets
   const ticks = await client.getTicks('BTCUSD', {
     from: new Date('2024-01-01'),
     to: new Date('2024-01-02'),
     limit: 10000  // Don't fetch unlimited results
   })
   
   // Use streaming for large datasets
   const tickStream = await client.getTicksStream('BTCUSD', timeRange)
   for await (const batch of tickStream) {
     // Process in batches
   }
   ```

3. **Optimize time range queries**
   ```typescript
   // Use efficient time ranges
   const optimizedRange = {
     from: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
     to: new Date(),
     limit: 10000
   }
   ```

### Issue: High Memory Usage

**Symptoms:**
- Application consuming excessive memory
- Out of memory errors
- Garbage collection pauses

**Solutions:**

1. **Use streaming for large datasets**
   ```typescript
   // Instead of loading all data into memory
   const allTicks = await client.getTicks('BTCUSD', largeTimeRange) // ❌ Bad
   
   // Use streaming
   const tickStream = await client.getTicksStream('BTCUSD', largeTimeRange) // ✅ Good
   for await (const batch of tickStream) {
     // Process batch and free memory
     processBatch(batch)
   }
   ```

2. **Implement proper batch processing**
   ```typescript
   // Process data in manageable chunks
   const processBatchedData = async (symbols: string[]) => {
     const BATCH_SIZE = 1000
     
     for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
       const batch = symbols.slice(i, i + BATCH_SIZE)
       const results = await client.getMultiSymbolLatest(batch)
       
       // Process results
       await processResults(results)
       
       // Allow garbage collection
       if (global.gc) {
         global.gc()
       }
     }
   }
   ```

3. **Configure appropriate limits**
   ```typescript
   const client = await ClientFactory.fromConnectionString(connectionString, {
     defaultBatchSize: 5000,        // Reasonable batch size
     defaultLimit: 10000,           // Limit query results
     useStreaming: true,            // Enable streaming
     streamingThreshold: 5000       // Stream when > 5000 results
   })
   ```

### Issue: Slow Batch Inserts

**Symptoms:**
- Batch operations taking too long
- Low throughput for data ingestion
- Database locks during inserts

**Solutions:**

1. **Optimize batch size**
   ```typescript
   // Test different batch sizes
   const testBatchSizes = [1000, 5000, 10000, 25000]
   
   const testBatchPerformance = async () => {
     for (const batchSize of testBatchSizes) {
       const testData = generateTestData(batchSize)
       
       const start = performance.now()
       await client.insertManyTicks(testData, { batchSize })
       const duration = performance.now() - start
       
       console.log(`Batch size ${batchSize}: ${duration}ms (${batchSize/duration*1000} ticks/sec)`)
     }
   }
   ```

2. **Use transactions efficiently**
   ```typescript
   // Group operations in transactions
   const efficientBatchInsert = async (ticks: PriceTick[]) => {
     const BATCH_SIZE = 10000
     
     for (let i = 0; i < ticks.length; i += BATCH_SIZE) {
       const batch = ticks.slice(i, i + BATCH_SIZE)
       
       // Each batch uses its own transaction
       await client.insertManyTicks(batch, { 
         useTransaction: true,
         batchSize: BATCH_SIZE
       })
     }
   }
   ```

3. **Disable validation for bulk operations**
   ```typescript
   // For trusted data sources, disable validation
   const client = await ClientFactory.fromConnectionString(connectionString, {
     validateInputs: false,  // Disable for better performance
     collectStats: false     // Disable stats collection
   })
   ```

---

## Data Issues

### Issue: Data Validation Errors

**Symptoms:**
```
ValidationError: Invalid price value: -50.25
ValidationError: Symbol 'invalid_symbol!' contains invalid characters
```

**Solutions:**

1. **Implement proper validation**
   ```typescript
   import { Validators } from 'timescaledb-client'
   
   const validateBeforeInsert = (tick: PriceTick) => {
     // Use built-in validators
     if (!Validators.isValidPriceTick(tick)) {
       throw new Error('Invalid price tick data')
     }
     
     // Custom business logic validation
     if (tick.price <= 0) {
       throw new Error('Price must be positive')
     }
     
     if (tick.volume !== undefined && tick.volume < 0) {
       throw new Error('Volume cannot be negative')
     }
     
     // Symbol format validation
     if (!/^[A-Z0-9_]+$/.test(tick.symbol)) {
       throw new Error('Symbol contains invalid characters')
     }
     
     return true
   }
   ```

2. **Handle validation errors gracefully**
   ```typescript
   const insertWithValidation = async (tick: PriceTick) => {
     try {
       await client.insertTick(tick)
     } catch (error) {
       if (error instanceof ValidationError) {
         console.warn('Validation failed:', error.field, error.value)
         // Log invalid data for review
         logger.warn('Invalid data rejected', { tick, error: error.message })
       } else {
         throw error
       }
     }
   }
   ```

3. **Clean data before insertion**
   ```typescript
   const cleanPriceTick = (rawTick: any): PriceTick => {
     return {
       symbol: rawTick.symbol?.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
       price: Math.abs(Number(rawTick.price)) || 0,
       volume: rawTick.volume ? Math.abs(Number(rawTick.volume)) : undefined,
       timestamp: new Date(rawTick.timestamp).toISOString()
     }
   }
   ```

### Issue: Duplicate Data

**Symptoms:**
- Duplicate records in database
- Constraint violations
- Data inconsistency

**Solutions:**

1. **Use upsert operations**
   ```typescript
   // Enable upsert to handle duplicates
   await client.insertTick(tick, { upsert: true })
   
   // For batch operations
   await client.insertManyTicks(ticks, { upsert: true })
   ```

2. **Implement deduplication**
   ```typescript
   const deduplicateData = (ticks: PriceTick[]): PriceTick[] => {
     const seen = new Set<string>()
     const unique: PriceTick[] = []
     
     for (const tick of ticks) {
       const key = `${tick.symbol}:${tick.timestamp}`
       
       if (!seen.has(key)) {
         seen.add(key)
         unique.push(tick)
       }
     }
     
     return unique
   }
   ```

3. **Add database constraints**
   ```sql
   -- Add unique constraint to prevent duplicates
   ALTER TABLE price_ticks 
   ADD CONSTRAINT unique_symbol_time 
   UNIQUE (symbol, time);
   ```

### Issue: Missing Data

**Symptoms:**
- Gaps in time series data
- Expected records not found
- Incomplete data sets

**Solutions:**

1. **Implement data gap detection**
   ```typescript
   const findDataGaps = async (symbol: string, expectedInterval: number) => {
     const query = `
       SELECT 
         time,
         LEAD(time) OVER (ORDER BY time) as next_time,
         EXTRACT(EPOCH FROM (LEAD(time) OVER (ORDER BY time) - time)) as gap_seconds
       FROM price_ticks 
       WHERE symbol = $1 
       ORDER BY time
     `
     
     const result = await client.sql`${query}`.execute([symbol])
     
     const gaps = result.filter(row => 
       row.gap_seconds > expectedInterval * 60 // Convert minutes to seconds
     )
     
     return gaps
   }
   ```

2. **Implement data filling strategies**
   ```typescript
   const fillDataGaps = async (symbol: string, range: TimeRange) => {
     const ticks = await client.getTicks(symbol, range)
     
     // Fill gaps with interpolated values
     const filled: PriceTick[] = []
     for (let i = 0; i < ticks.length - 1; i++) {
       filled.push(ticks[i])
       
       const current = new Date(ticks[i].timestamp)
       const next = new Date(ticks[i + 1].timestamp)
       const gap = next.getTime() - current.getTime()
       
       // If gap > 5 minutes, interpolate
       if (gap > 5 * 60 * 1000) {
         const interpolated = interpolateData(ticks[i], ticks[i + 1])
         filled.push(...interpolated)
       }
     }
     
     return filled
   }
   ```

3. **Monitor data completeness**
   ```typescript
   const monitorDataCompleteness = async () => {
     const symbols = ['BTCUSD', 'ETHUSD', 'ADAUSD']
     
     for (const symbol of symbols) {
       const lastHour = {
         from: new Date(Date.now() - 60 * 60 * 1000),
         to: new Date()
       }
       
       const ticks = await client.getTicks(symbol, lastHour)
       const expectedCount = 60 // 1 tick per minute
       
       if (ticks.length < expectedCount * 0.9) { // 90% threshold
         console.warn(`Data completeness issue for ${symbol}: ${ticks.length}/${expectedCount} expected`)
       }
     }
   }
   ```

---

## Error Reference

### ConnectionError

**Description:** Database connection issues

**Common Causes:**
- Database server unavailable
- Network connectivity problems
- Authentication failures
- Connection pool exhaustion

**Error Codes:**
- `ECONNREFUSED`: Database server not responding
- `ENOTFOUND`: DNS resolution failure
- `ETIMEDOUT`: Connection timeout
- `ECONNRESET`: Connection reset by peer

**Solutions:**
```typescript
import { ConnectionError } from 'timescaledb-client'

try {
  await client.healthCheck()
} catch (error) {
  if (error instanceof ConnectionError) {
    console.log('Connection issue:', error.message)
    
    // Implement retry logic
    await retryWithBackoff(async () => {
      await client.healthCheck()
    })
  }
}

const retryWithBackoff = async (operation: () => Promise<void>, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await operation()
      return
    } catch (error) {
      if (i === maxRetries - 1) throw error
      
      const delay = Math.pow(2, i) * 1000 // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
```

### ValidationError

**Description:** Data validation failures

**Common Causes:**
- Invalid data types
- Out-of-range values
- Missing required fields
- Invalid format

**Solutions:**
```typescript
import { ValidationError } from 'timescaledb-client'

try {
  await client.insertTick(tick)
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.field, error.value)
    
    // Fix the data and retry
    const fixedTick = fixValidationError(tick, error)
    await client.insertTick(fixedTick)
  }
}

const fixValidationError = (tick: PriceTick, error: ValidationError): PriceTick => {
  switch (error.field) {
    case 'price':
      return { ...tick, price: Math.abs(Number(tick.price)) || 0 }
    case 'symbol':
      return { ...tick, symbol: tick.symbol.toUpperCase().replace(/[^A-Z0-9_]/g, '') }
    case 'timestamp':
      return { ...tick, timestamp: new Date().toISOString() }
    default:
      return tick
  }
}
```

### QueryError

**Description:** Database query execution failures

**Common Causes:**
- SQL syntax errors
- Missing tables or columns
- Insufficient permissions
- Query timeouts

**Solutions:**
```typescript
import { QueryError } from 'timescaledb-client'

try {
  await client.getTicks('BTCUSD', timeRange)
} catch (error) {
  if (error instanceof QueryError) {
    console.log('Query failed:', error.message)
    
    // Check if it's a timeout
    if (error.message.includes('timeout')) {
      // Reduce query scope
      const smallerRange = {
        ...timeRange,
        limit: Math.floor(timeRange.limit / 2)
      }
      return await client.getTicks('BTCUSD', smallerRange)
    }
    
    // Check if it's a missing table
    if (error.message.includes('does not exist')) {
      await client.ensureSchema()
      return await client.getTicks('BTCUSD', timeRange)
    }
  }
}
```

### BatchError

**Description:** Batch operation failures

**Common Causes:**
- Some records in batch invalid
- Partial operation failures
- Transaction conflicts
- Resource constraints

**Solutions:**
```typescript
import { BatchError } from 'timescaledb-client'

try {
  const result = await client.insertManyTicks(ticks)
  
  if (result.failed > 0) {
    console.warn(`Batch partially failed: ${result.failed}/${ticks.length} records`)
    
    // Process failures
    result.errors.forEach(error => {
      console.error('Batch error:', error.message)
    })
  }
} catch (error) {
  if (error instanceof BatchError) {
    console.log('Batch operation failed:', error.message)
    
    // Retry with smaller batches
    const smallerBatches = chunkArray(ticks, 1000)
    for (const batch of smallerBatches) {
      await client.insertManyTicks(batch)
    }
  }
}
```

---

## Debugging Techniques

### Enable Debug Logging

```typescript
// Enable comprehensive logging
const client = await ClientFactory.fromConnectionString(connectionString, {
  logger: {
    debug: (message, data) => console.log('DEBUG:', message, data),
    info: (message, data) => console.log('INFO:', message, data),
    warn: (message, data) => console.warn('WARN:', message, data),
    error: (message, error) => console.error('ERROR:', message, error)
  }
})
```

### SQL Query Debugging

```typescript
// Debug SQL queries
const debugClient = new Proxy(client, {
  get(target, prop) {
    const original = target[prop]
    
    if (typeof original === 'function') {
      return async (...args) => {
        console.log(`Calling ${prop} with:`, args)
        const start = performance.now()
        
        try {
          const result = await original.apply(target, args)
          const duration = performance.now() - start
          console.log(`${prop} completed in ${duration}ms`)
          return result
        } catch (error) {
          console.error(`${prop} failed:`, error.message)
          throw error
        }
      }
    }
    
    return original
  }
})
```

### Performance Profiling

```typescript
// Profile performance
const profileOperation = async (operation: () => Promise<any>, name: string) => {
  const start = performance.now()
  const startMemory = process.memoryUsage()
  
  try {
    const result = await operation()
    const duration = performance.now() - start
    const endMemory = process.memoryUsage()
    
    console.log(`${name} Performance:`)
    console.log(`  Duration: ${duration.toFixed(2)}ms`)
    console.log(`  Memory delta: ${((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`)
    
    return result
  } catch (error) {
    console.error(`${name} failed:`, error.message)
    throw error
  }
}

// Usage
await profileOperation(
  () => client.insertManyTicks(largeBatch),
  'Large batch insert'
)
```

### Network Debugging

```typescript
// Debug network issues
const debugConnection = async () => {
  const url = new URL(process.env.DATABASE_URL)
  
  console.log('Connection details:')
  console.log('  Host:', url.hostname)
  console.log('  Port:', url.port)
  console.log('  Database:', url.pathname.slice(1))
  console.log('  SSL:', url.searchParams.get('sslmode'))
  
  // Test basic connectivity
  const net = require('net')
  const socket = new net.Socket()
  
  socket.setTimeout(5000)
  
  socket.on('connect', () => {
    console.log('✅ TCP connection successful')
    socket.destroy()
  })
  
  socket.on('timeout', () => {
    console.log('❌ TCP connection timeout')
    socket.destroy()
  })
  
  socket.on('error', (error) => {
    console.log('❌ TCP connection error:', error.message)
  })
  
  socket.connect(parseInt(url.port), url.hostname)
}
```

---

## Memory Issues

### Issue: Memory Leaks

**Symptoms:**
- Steadily increasing memory usage
- Application crashes with out-of-memory errors
- Garbage collection taking too long

**Solutions:**

1. **Proper connection management**
   ```typescript
   // Always close connections
   const processData = async () => {
     const client = await ClientFactory.fromConnectionString(connectionString)
     
     try {
       // Process data
       await client.insertManyTicks(data)
     } finally {
       // Always close, even on error
       await client.close()
     }
   }
   ```

2. **Use connection pooling**
   ```typescript
   // Reuse client instances
   class DataProcessor {
     private static client: TimescaleClient
     
     static async getClient() {
       if (!this.client) {
         this.client = await ClientFactory.fromConnectionString(connectionString)
       }
       return this.client
     }
     
     static async close() {
       if (this.client) {
         await this.client.close()
         this.client = null
       }
     }
   }
   ```

3. **Monitor memory usage**
   ```typescript
   // Memory monitoring
   const monitorMemory = () => {
     const usage = process.memoryUsage()
     console.log(`Memory usage:`)
     console.log(`  RSS: ${(usage.rss / 1024 / 1024).toFixed(2)}MB`)
     console.log(`  Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`)
     console.log(`  Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`)
     console.log(`  External: ${(usage.external / 1024 / 1024).toFixed(2)}MB`)
   }
   
   setInterval(monitorMemory, 30000) // Monitor every 30 seconds
   ```

### Issue: Large Result Sets

**Symptoms:**
- Out-of-memory errors when fetching large datasets
- Slow query performance
- Application becomes unresponsive

**Solutions:**

1. **Use streaming**
   ```typescript
   // Instead of loading all data at once
   const processLargeDataset = async () => {
     const stream = await client.getTicksStream('BTCUSD', {
       from: new Date('2024-01-01'),
       to: new Date('2024-12-31')
     })
     
     for await (const batch of stream) {
       // Process batch and release memory
       await processBatch(batch)
     }
   }
   ```

2. **Implement pagination**
   ```typescript
   const processDataWithPagination = async (symbol: string, range: TimeRange) => {
     const PAGE_SIZE = 10000
     let offset = 0
     
     while (true) {
       const ticks = await client.getTicks(symbol, {
         ...range,
         limit: PAGE_SIZE,
         offset
       })
       
       if (ticks.length === 0) break
       
       await processBatch(ticks)
       offset += PAGE_SIZE
     }
   }
   ```

---

## Schema Problems

### Issue: Missing Tables

**Symptoms:**
```
QueryError: relation "price_ticks" does not exist
```

**Solutions:**

1. **Ensure schema exists**
   ```typescript
   // Always ensure schema on startup
   await client.ensureSchema()
   
   // Or check and create manually
   const schemaExists = await checkSchemaExists()
   if (!schemaExists) {
     await client.ensureSchema()
   }
   ```

2. **Manual schema creation**
   ```sql
   -- Create tables manually
   CREATE TABLE IF NOT EXISTS price_ticks (
     time TIMESTAMPTZ NOT NULL,
     symbol TEXT NOT NULL,
     price NUMERIC NOT NULL,
     volume NUMERIC,
     PRIMARY KEY (symbol, time)
   );
   
   SELECT create_hypertable('price_ticks', 'time', if_not_exists => true);
   ```

### Issue: Schema Version Mismatch

**Symptoms:**
- Unexpected column names
- Missing indexes
- Performance degradation

**Solutions:**

1. **Check schema version**
   ```typescript
   const checkSchemaVersion = async () => {
     const info = await client.getSchemaInfo()
     console.log('Current schema version:', info.version)
     
     if (info.version !== expectedVersion) {
       console.warn('Schema version mismatch!')
       // Implement migration logic
     }
   }
   ```

2. **Implement migrations**
   ```typescript
   const migrateSchema = async (fromVersion: string, toVersion: string) => {
     console.log(`Migrating schema from ${fromVersion} to ${toVersion}`)
     
     // Example migration
     if (fromVersion === '1.0.0' && toVersion === '1.1.0') {
       await client.sql`
         ALTER TABLE price_ticks 
         ADD COLUMN IF NOT EXISTS data_source TEXT;
       `
     }
   }
   ```

---

## Query Issues

### Issue: Slow Aggregation Queries

**Symptoms:**
- Long-running analytics queries
- High CPU usage during aggregations
- Query timeouts

**Solutions:**

1. **Use continuous aggregates**
   ```sql
   -- Create continuous aggregate for common queries
   CREATE MATERIALIZED VIEW hourly_stats
   WITH (timescaledb.continuous) AS
   SELECT 
     time_bucket('1 hour', time) as bucket,
     symbol,
     avg(price) as avg_price,
     max(price) as max_price,
     min(price) as min_price,
     sum(volume) as total_volume
   FROM price_ticks
   GROUP BY bucket, symbol;
   ```

2. **Optimize time-based queries**
   ```typescript
   // Use appropriate time buckets
   const getHourlyStats = async (symbol: string) => {
     return await client.sql`
       SELECT 
         time_bucket('1 hour', time) as hour,
         avg(price) as avg_price
       FROM price_ticks 
       WHERE symbol = ${symbol}
       AND time >= NOW() - INTERVAL '1 day'
       GROUP BY hour
       ORDER BY hour DESC
     `
   }
   ```

### Issue: Index Not Being Used

**Symptoms:**
- Sequential scans in query plans
- Slow performance despite having indexes
- High I/O usage

**Solutions:**

1. **Analyze query plans**
   ```sql
   -- Check if indexes are being used
   EXPLAIN (ANALYZE, BUFFERS) 
   SELECT * FROM price_ticks 
   WHERE symbol = 'BTCUSD' 
   AND time >= NOW() - INTERVAL '1 day';
   ```

2. **Create appropriate indexes**
   ```sql
   -- Multi-column index for common queries
   CREATE INDEX CONCURRENTLY idx_price_ticks_symbol_time 
   ON price_ticks (symbol, time DESC);
   
   -- Partial index for active data
   CREATE INDEX CONCURRENTLY idx_price_ticks_active 
   ON price_ticks (symbol, time DESC) 
   WHERE time >= NOW() - INTERVAL '30 days';
   ```

---

## Deployment Issues

### Issue: Environment Configuration

**Symptoms:**
- Different behavior between environments
- Configuration not loading properly
- Missing environment variables

**Solutions:**

1. **Validate environment configuration**
   ```typescript
   const validateEnvironment = () => {
     const requiredEnvVars = [
       'DATABASE_URL',
       'NODE_ENV',
       'PORT'
     ]
     
     const missing = requiredEnvVars.filter(key => !process.env[key])
     
     if (missing.length > 0) {
       throw new Error(`Missing environment variables: ${missing.join(', ')}`)
     }
     
     console.log('Environment configuration valid')
   }
   ```

2. **Use environment-specific configurations**
   ```typescript
   const getConfig = () => {
     const env = process.env.NODE_ENV || 'development'
     
     const configs = {
       development: {
         validateInputs: true,
         collectStats: true,
         autoCreateTables: true
       },
       production: {
         validateInputs: false,
         collectStats: false,
         autoCreateTables: false
       }
     }
     
     return configs[env] || configs.development
   }
   ```

### Issue: Container Deployment Problems

**Symptoms:**
- Connection issues in containers
- Database not accessible
- Health checks failing

**Solutions:**

1. **Fix container networking**
   ```yaml
   # docker-compose.yml
   version: '3.8'
   services:
     app:
       build: .
       environment:
         - DATABASE_URL=postgresql://user:pass@db:5432/timescale_prod
       depends_on:
         - db
       networks:
         - app-network
     
     db:
       image: timescale/timescaledb:latest-pg15
       networks:
         - app-network
   
   networks:
     app-network:
       driver: bridge
   ```

2. **Implement proper health checks**
   ```typescript
   // Health check endpoint
   app.get('/health', async (req, res) => {
     try {
       const health = await client.healthCheck()
       res.status(health.isHealthy ? 200 : 503).json(health)
     } catch (error) {
       res.status(503).json({ 
         isHealthy: false, 
         error: error.message 
       })
     }
   })
   ```

---

## Monitoring and Diagnostics

### Performance Monitoring

```typescript
// Comprehensive performance monitoring
class PerformanceMonitor {
  private metrics = new Map<string, number[]>()
  
  async measureOperation<T>(
    operation: () => Promise<T>,
    name: string
  ): Promise<T> {
    const start = performance.now()
    
    try {
      const result = await operation()
      const duration = performance.now() - start
      
      this.recordMetric(name, duration)
      return result
    } catch (error) {
      this.recordMetric(`${name}_error`, 1)
      throw error
    }
  }
  
  private recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    this.metrics.get(name)!.push(value)
  }
  
  getStats(name: string) {
    const values = this.metrics.get(name) || []
    return {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values)
    }
  }
}
```

### Database Monitoring

```sql
-- Monitor database performance
SELECT 
  schemaname,
  tablename,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  seq_scan as sequential_scans,
  idx_scan as index_scans,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples
FROM pg_stat_user_tables
WHERE schemaname = 'public';

-- Monitor query performance
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time,
  stddev_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY total_time DESC 
LIMIT 20;
```

---

## FAQ

### Q: How do I handle connection timeouts?

**A:** Configure appropriate timeouts and implement retry logic:

```typescript
const client = await ClientFactory.fromConnectionString(connectionString, {
  queryTimeout: 60000,  // 60 seconds
  maxRetries: 3,
  retryBaseDelay: 1000
})

// For long-running operations
const result = await client.insertManyTicks(largeBatch, {
  timeoutMs: 300000  // 5 minutes for large batches
})
```

### Q: Why are my queries slow?

**A:** Common causes and solutions:

1. **Missing indexes** - Create appropriate indexes
2. **Large result sets** - Use limits and pagination
3. **Inefficient queries** - Analyze query plans
4. **Old statistics** - Run `ANALYZE` on tables

### Q: How do I handle partial batch failures?

**A:** Use the batch result information:

```typescript
const result = await client.insertManyTicks(ticks)

if (result.failed > 0) {
  console.log(`${result.failed} records failed out of ${ticks.length}`)
  
  // Log errors for investigation
  result.errors.forEach(error => {
    console.error('Batch error:', error)
  })
  
  // Implement retry logic for failed records
  // Note: You'll need to track which records failed
}
```

### Q: Can I use multiple databases?

**A:** Yes, create separate client instances:

```typescript
const mainClient = await ClientFactory.fromConnectionString(mainDbUrl)
const archiveClient = await ClientFactory.fromConnectionString(archiveDbUrl)

// Use different clients for different purposes
await mainClient.insertTick(recentTick)
await archiveClient.insertTick(historicalTick)
```

### Q: How do I migrate from another database?

**A:** Implement a migration strategy:

```typescript
const migrateData = async (sourceClient: any, targetClient: TimescaleClient) => {
  const BATCH_SIZE = 10000
  let offset = 0
  
  while (true) {
    // Fetch from source
    const records = await sourceClient.query(
      `SELECT * FROM source_table LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    )
    
    if (records.length === 0) break
    
    // Transform to TimescaleDB format
    const ticks = records.map(transformToTick)
    
    // Insert to target
    await targetClient.insertManyTicks(ticks)
    
    offset += BATCH_SIZE
    console.log(`Migrated ${offset} records`)
  }
}
```

### Q: How do I backup and restore data?

**A:** Use PostgreSQL backup tools:

```bash
# Backup
pg_dump -h localhost -U user -d timescale_db > backup.sql

# Restore
psql -h localhost -U user -d timescale_db < backup.sql

# For large databases, use custom format
pg_dump -h localhost -U user -d timescale_db -Fc > backup.dump
pg_restore -h localhost -U user -d timescale_db backup.dump
```

---

This troubleshooting guide covers the most common issues you might encounter when working with the TimescaleDB client. For additional support, check the [API Reference](API_REFERENCE.md) and [Deployment Guide](DEPLOYMENT.md).

If you encounter an issue not covered here, please check the project's GitHub issues or create a new issue with detailed information about your problem.