# TimescaleDB Client - Production Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Database Configuration](#database-configuration)
4. [Application Configuration](#application-configuration)
5. [Security Considerations](#security-considerations)
6. [Performance Optimization](#performance-optimization)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Backup and Recovery](#backup-and-recovery)
9. [Scaling Strategies](#scaling-strategies)
10. [Container Deployment](#container-deployment)
11. [Cloud Deployment](#cloud-deployment)
12. [Environment Management](#environment-management)
13. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers production deployment of applications using the TimescaleDB client. It includes best practices for security, performance, monitoring, and operational considerations for high-availability time-series data systems including IoT monitoring, system metrics, and application logging.

### Production Requirements

- **TimescaleDB**: 2.8+ (recommended: 2.11+)
- **PostgreSQL**: 13+ (recommended: 15+)
- **Node.js/Deno**: 18+ (recommended: 20+)
- **Memory**: Minimum 8GB (recommended: 32GB+)
- **Storage**: SSD storage with high IOPS
- **Network**: Low-latency network connection to database

---

## Pre-Deployment Checklist

### ✅ Database Preparation

- [ ] TimescaleDB extension installed and configured
- [ ] Database user with appropriate permissions created
- [ ] SSL/TLS certificates configured
- [ ] Connection limits configured
- [ ] Backup strategy implemented
- [ ] Monitoring tools installed

### ✅ Application Preparation

- [ ] Environment variables configured
- [ ] Connection pooling configured
- [ ] Error handling implemented
- [ ] Logging system configured
- [ ] Health checks implemented
- [ ] Graceful shutdown handling

### ✅ Security Validation

- [ ] Database credentials secured
- [ ] Network security rules configured
- [ ] SSL/TLS encryption enabled
- [ ] Access controls implemented
- [ ] Audit logging enabled
- [ ] Security scanning completed

### ✅ Performance Testing

- [ ] Load testing completed
- [ ] Query performance validated
- [ ] Connection pool limits tested
- [ ] Memory usage profiled
- [ ] Batch operation performance verified

---

## Database Configuration

### TimescaleDB Setup

```sql
-- Create database and enable TimescaleDB extension
CREATE DATABASE timescale_prod;
\c timescale_prod;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create application user with limited privileges
CREATE USER timeseries_app WITH PASSWORD 'secure_password_here';

-- Grant necessary permissions
GRANT CONNECT ON DATABASE timescale_prod TO timeseries_app;
GRANT USAGE ON SCHEMA public TO timeseries_app;
GRANT CREATE ON SCHEMA public TO timeseries_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO timeseries_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO timeseries_app;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO timeseries_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO timeseries_app;
```

### PostgreSQL Configuration

Essential `postgresql.conf` settings for production:

```ini
# Memory Configuration
shared_buffers = 8GB                    # 25% of total RAM
effective_cache_size = 24GB             # 75% of total RAM
work_mem = 256MB                        # Per connection
maintenance_work_mem = 2GB

# Connection Configuration
max_connections = 200                   # Adjust based on load
superuser_reserved_connections = 5

# Write-Ahead Logging
wal_level = replica
max_wal_size = 4GB
min_wal_size = 1GB
checkpoint_completion_target = 0.9
checkpoint_timeout = 10min

# Query Planner
random_page_cost = 1.1                  # For SSD storage
effective_io_concurrency = 200          # For SSD storage

# Logging
log_destination = 'stderr'
log_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_min_duration_statement = 1000       # Log slow queries
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on

# TimescaleDB Specific
timescaledb.max_background_workers = 8
```

### SSL/TLS Configuration

```ini
# SSL Configuration in postgresql.conf
ssl = on
ssl_cert_file = '/path/to/server.crt'
ssl_key_file = '/path/to/server.key'
ssl_ca_file = '/path/to/ca.crt'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
ssl_prefer_server_ciphers = on
ssl_protocols = 'TLSv1.2,TLSv1.3'
```

### Connection Pooling (PgBouncer)

```ini
# pgbouncer.ini
[databases]
timescale_prod = host=localhost port=5432 dbname=timescale_prod

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = session
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
server_idle_timeout = 3600
server_lifetime = 7200
server_reset_query = DISCARD ALL
```

---

## Application Configuration

### Production Client Configuration

```typescript
// config/production.ts
import { ClientFactory } from 'timescaledb-client'

export const createProductionClient = async () => {
  const client = await ClientFactory.fromConnectionString(
    process.env.DATABASE_URL!,
    {
      // Connection settings
      maxRetries: 5,
      retryBaseDelay: 1000,
      queryTimeout: 60000,
      
      // Performance settings
      defaultBatchSize: 10000,
      defaultLimit: 5000,
      useStreaming: true,
      streamingThreshold: 10000,
      
      // Production optimizations
      validateInputs: false,        // Disable for performance
      collectStats: false,          // Disable for performance
      autoCreateTables: false,      // Never auto-create in production
      autoCreateIndexes: false,     // Manually manage indexes
      
      // Monitoring
      logger: productionLogger,
      
      // Error handling
      errorHandlers: {
        onConnectionError: (error) => {
          logger.error('Database connection failed', { error: error.message })
          // Implement alerting
          alertingService.sendAlert('database_connection_error', error.message)
        },
        onQueryError: (error) => {
          logger.error('Query execution failed', { error: error.message })
          // Implement metrics collection
          metricsService.incrementCounter('query_errors')
        }
      }
    }
  )
  
  return client
}
```

### Environment Variables

```bash
# .env.production
DATABASE_URL=postgresql://timeseries_app:secure_password@db-host:5432/timescale_prod?sslmode=require
DATABASE_POOL_SIZE=50
DATABASE_MAX_CONNECTIONS=200
DATABASE_TIMEOUT=60000

# Application settings
NODE_ENV=production
PORT=3000
WORKERS=4

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Monitoring
METRICS_PORT=9090
HEALTH_CHECK_PORT=3001

# Security
SESSION_SECRET=your-secure-session-secret
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=https://yourdomain.com
```

### Graceful Shutdown

```typescript
// server.ts
import { createProductionClient } from './config/production'

let client: TimescaleClient
let server: Server

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`)
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed')
  })
  
  // Close database connections
  if (client) {
    await client.close()
    console.log('Database connections closed')
  }
  
  // Exit process
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Application startup
const startApplication = async () => {
  try {
    client = await createProductionClient()
    await client.initialize()
    
    const health = await client.healthCheck()
    if (!health.isHealthy) {
      throw new Error('Database health check failed')
    }
    
    server = app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`)
    })
    
  } catch (error) {
    console.error('Application startup failed:', error)
    process.exit(1)
  }
}

startApplication()
```

---

## Security Considerations

### Database Security

#### Connection Security

```typescript
// Secure connection configuration
const secureConnectionString = [
  'postgresql://trading_app:secure_password@db-host:5432/timescale_prod',
  '?sslmode=require',
  '&sslcert=/path/to/client.crt',
  '&sslkey=/path/to/client.key',
  '&sslrootcert=/path/to/ca.crt'
].join('')

const client = await ClientFactory.fromConnectionString(secureConnectionString, {
  // Additional security options
  validateInputs: true,  // Enable in security-critical applications
  queryTimeout: 30000,   // Prevent long-running queries
  maxRetries: 3          // Limit retry attempts
})
```

#### Row Level Security (RLS)

```sql
-- Enable RLS on sensitive tables
ALTER TABLE price_ticks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ohlc_data ENABLE ROW LEVEL SECURITY;

-- Create policies for data access
CREATE POLICY price_ticks_policy ON price_ticks
  FOR ALL TO trading_app
  USING (symbol IN (SELECT allowed_symbol FROM user_permissions WHERE user_id = current_user));

CREATE POLICY ohlc_data_policy ON ohlc_data
  FOR ALL TO trading_app
  USING (symbol IN (SELECT allowed_symbol FROM user_permissions WHERE user_id = current_user));
```

### Application Security

#### Input Validation

```typescript
// Implement comprehensive input validation
import { Validators } from 'timescaledb-client'

const validateTimeSeriesData = (data: any) => {
  // Validate time-series record data
  if (!Validators.isValidTimeSeriesRecord(data)) {
    throw new ValidationError('Invalid time-series record data')
  }
  
  // Additional business logic validation
  if (data.value < -1000000 || data.value > 1000000) {
    throw new ValidationError('Value out of acceptable range')
  }
  
  // Entity whitelist validation
  const allowedEntities = ['sensor_001', 'server_web01', 'app_metrics'] // Example
  if (!allowedEntities.includes(data.entity_id)) {
    throw new ValidationError('Entity not allowed')
  }
  
  return true
}
```

#### Rate Limiting

```typescript
// Implement rate limiting for API endpoints
import rateLimit from 'express-rate-limit'

const dataIngestionLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 1000,                  // 1000 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later',
  keyGenerator: (req) => {
    // Use API key or client IP
    return req.headers['x-api-key'] || req.ip
  }
})

app.use('/api/data', dataIngestionLimiter)
```

### Secrets Management

```typescript
// Use proper secrets management
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

const getSecret = async (secretName: string): Promise<string> => {
  const client = new SecretManagerServiceClient()
  const [version] = await client.accessSecretVersion({
    name: `projects/your-project/secrets/${secretName}/versions/latest`
  })
  
  return version.payload?.data?.toString() || ''
}

// Usage
const databasePassword = await getSecret('database-password')
const connectionString = `postgresql://timeseries_app:${databasePassword}@db-host:5432/timescale_prod`
```

---

## Performance Optimization

### Database Optimization

#### Hypertable Configuration

```sql
-- Optimize chunk time intervals based on data patterns
SELECT set_chunk_time_interval('price_ticks', INTERVAL '1 hour');
SELECT set_chunk_time_interval('ohlc_data', INTERVAL '1 day');

-- Enable compression for older data
ALTER TABLE price_ticks SET (
  timescaledb.compress = true,
  timescaledb.compress_segmentby = 'symbol',
  timescaledb.compress_orderby = 'time DESC'
);

-- Create compression policy
SELECT add_compression_policy('price_ticks', INTERVAL '7 days');
```

#### Indexing Strategy

```sql
-- Create optimized indexes for common query patterns
CREATE INDEX CONCURRENTLY idx_price_ticks_symbol_time_vol 
ON price_ticks (symbol, time DESC, volume) 
WHERE volume > 0;

-- Partial index for recent data
CREATE INDEX CONCURRENTLY idx_price_ticks_recent 
ON price_ticks (symbol, time DESC) 
WHERE time >= NOW() - INTERVAL '24 hours';

-- Index for analytics queries
CREATE INDEX CONCURRENTLY idx_price_ticks_analytics 
ON price_ticks (symbol, time DESC) 
INCLUDE (price, volume);
```

#### Continuous Aggregates

```sql
-- Create continuous aggregates for common analytics
CREATE MATERIALIZED VIEW hourly_ohlc
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', time) as hour,
  symbol,
  first(price, time) as open,
  max(price) as high,
  min(price) as low,
  last(price, time) as close,
  sum(volume) as volume
FROM price_ticks
GROUP BY hour, symbol;

-- Create refresh policy
SELECT add_continuous_aggregate_policy('hourly_ohlc',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');
```

### Application Performance

#### Connection Pool Optimization

```typescript
// Optimize connection pool settings
const client = await ClientFactory.fromConnectionString(connectionString, {
  // Batch operations for better throughput
  defaultBatchSize: 10000,
  
  // Streaming for large queries
  useStreaming: true,
  streamingThreshold: 5000,
  
  // Query optimization
  queryTimeout: 60000,
  defaultLimit: 10000,
  
  // Disable expensive features in production
  validateInputs: false,
  collectStats: false
})
```

#### Batch Processing

```typescript
// Implement efficient batch processing
class DataProcessor {
  private batchQueue: TimeSeriesRecord[] = []
  private batchSize = 10000
  private flushInterval = 1000 // ms
  
  constructor(private client: TimescaleClient) {
    // Flush batches periodically
    setInterval(() => this.flushBatch(), this.flushInterval)
  }
  
  async addRecord(record: TimeSeriesRecord) {
    this.batchQueue.push(record)
    
    if (this.batchQueue.length >= this.batchSize) {
      await this.flushBatch()
    }
  }
  
  private async flushBatch() {
    if (this.batchQueue.length === 0) return
    
    const batch = this.batchQueue.splice(0, this.batchSize)
    
    try {
      const result = await this.client.insertManyRecords(batch)
      console.log(`Processed ${result.processed} records`)
    } catch (error) {
      console.error('Batch processing failed:', error)
      // Implement retry logic
    }
  }
}
```

---

## Monitoring and Alerting

### Application Monitoring

#### Health Checks

```typescript
// Implement comprehensive health checks
import express from 'express'

const healthRouter = express.Router()

healthRouter.get('/health', async (req, res) => {
  try {
    const health = await client.healthCheck()
    
    const response = {
      status: health.isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: health.isHealthy,
        responseTime: health.responseTimeMs,
        version: health.version
      },
      application: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      }
    }
    
    res.status(health.isHealthy ? 200 : 503).json(response)
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    })
  }
})

healthRouter.get('/ready', async (req, res) => {
  try {
    // Check if application is ready to serve requests
    const health = await client.healthCheck()
    
    if (health.isHealthy) {
      res.status(200).json({ status: 'ready' })
    } else {
      res.status(503).json({ status: 'not ready' })
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message })
  }
})
```

#### Metrics Collection

```typescript
// Implement Prometheus metrics
import client from 'prom-client'

const register = new client.Registry()

// Database metrics
const dbConnectionsGauge = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  registers: [register]
})

const queryDurationHistogram = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
})

const insertThroughputCounter = new client.Counter({
  name: 'data_inserts_total',
  help: 'Total number of data inserts',
  labelNames: ['symbol', 'type'],
  registers: [register]
})

// Custom TimescaleClient with metrics
class MetricsTimescaleClient extends TimescaleClient {
  async insertRecord(record: TimeSeriesRecord) {
    const timer = queryDurationHistogram.startTimer()
    
    try {
      await super.insertRecord(record)
      insertThroughputCounter.inc({ entity_id: record.entity_id, type: 'record' })
    } finally {
      timer()
    }
  }
  
  async insertManyRecords(records: TimeSeriesRecord[]) {
    const timer = queryDurationHistogram.startTimer()
    
    try {
      const result = await super.insertManyRecords(records)
      insertThroughputCounter.inc({ entity_id: 'batch', type: 'record' }, result.processed)
      return result
    } finally {
      timer()
    }
  }
}
```

### Database Monitoring

#### Key Metrics to Monitor

```sql
-- Database performance queries
-- 1. Connection usage
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_connections,
  count(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity;

-- 2. Query performance
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 20;

-- 3. Table statistics
SELECT 
  schemaname,
  tablename,
  n_tup_ins as inserts,
  n_tup_upd as updates,
  n_tup_del as deletes,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples
FROM pg_stat_user_tables
ORDER BY n_tup_ins DESC;

-- 4. Hypertable statistics
SELECT 
  hypertable_name,
  num_chunks,
  table_size,
  index_size,
  toast_size,
  total_size
FROM timescaledb_information.hypertable_detailed_size
ORDER BY total_size DESC;
```

### Alerting Configuration

```typescript
// Implement alerting system
class AlertManager {
  private thresholds = {
    databaseResponseTime: 1000,      // ms
    errorRate: 0.05,                 // 5%
    connectionUtilization: 0.8,      // 80%
    memoryUtilization: 0.9           // 90%
  }
  
  async checkDatabaseHealth() {
    const health = await client.healthCheck()
    
    if (!health.isHealthy) {
      await this.sendAlert('database_unhealthy', {
        message: 'Database health check failed',
        errors: health.errors
      })
    }
    
    if (health.responseTimeMs > this.thresholds.databaseResponseTime) {
      await this.sendAlert('database_slow_response', {
        message: 'Database response time exceeded threshold',
        responseTime: health.responseTimeMs,
        threshold: this.thresholds.databaseResponseTime
      })
    }
  }
  
  private async sendAlert(type: string, data: any) {
    // Implement your alerting mechanism
    console.error(`ALERT [${type}]:`, data)
    
    // Send to monitoring system (e.g., PagerDuty, Slack, etc.)
    // await notificationService.send(type, data)
  }
}
```

---

## Backup and Recovery

### Database Backup Strategy

#### Automated Backups

```bash
#!/bin/bash
# backup.sh - Automated backup script

DB_NAME="timescale_prod"
DB_USER="postgres"
DB_HOST="localhost"
BACKUP_DIR="/backups"
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Full database backup
BACKUP_FILE="$BACKUP_DIR/timescale_prod_$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME | gzip > $BACKUP_FILE

# Verify backup
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_FILE"
else
    echo "Backup failed!"
    exit 1
fi

# Clean up old backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Upload to cloud storage (optional)
aws s3 cp $BACKUP_FILE s3://your-backup-bucket/database/
```

#### Point-in-Time Recovery

```bash
#!/bin/bash
# Configure continuous archiving for PITR

# In postgresql.conf
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
archive_timeout = 300  # 5 minutes

# Restore from PITR
pg_basebackup -h localhost -D /restore -U postgres -v -P -W -R
```

### Application State Backup

```typescript
// Implement configuration backup
class ConfigurationBackup {
  async backupApplicationState() {
    const state = {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
      configuration: {
        database: {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT,
          database: process.env.DB_NAME
        },
        application: {
          port: process.env.PORT,
          workers: process.env.WORKERS,
          environment: process.env.NODE_ENV
        }
      },
      schema: await this.getSchemaInfo()
    }
    
    const backupPath = `./backups/app_state_${Date.now()}.json`
    await fs.writeFile(backupPath, JSON.stringify(state, null, 2))
    
    return backupPath
  }
  
  private async getSchemaInfo() {
    try {
      return await client.getSchemaInfo()
    } catch (error) {
      console.error('Failed to get schema info:', error)
      return null
    }
  }
}
```

---

## Scaling Strategies

### Horizontal Scaling

#### Read Replicas

```sql
-- Configure read replica
-- On primary database
CREATE USER replicator WITH REPLICATION LOGIN CONNECTION LIMIT 5 ENCRYPTED PASSWORD 'replica_password';

-- On replica
-- Edit postgresql.conf
hot_standby = on
hot_standby_feedback = on
max_standby_streaming_delay = 30s
```

```typescript
// Implement read/write splitting
class ScaledTimescaleClient {
  constructor(
    private writeClient: TimescaleClient,
    private readClients: TimescaleClient[]
  ) {}
  
  // Write operations go to primary
  async insertTick(tick: PriceTick) {
    return this.writeClient.insertTick(tick)
  }
  
  async insertManyTicks(ticks: PriceTick[]) {
    return this.writeClient.insertManyTicks(ticks)
  }
  
  // Read operations use round-robin on replicas
  async getTicks(symbol: string, range: TimeRange) {
    const client = this.getRandomReadClient()
    return client.getTicks(symbol, range)
  }
  
  private getRandomReadClient(): TimescaleClient {
    const index = Math.floor(Math.random() * this.readClients.length)
    return this.readClients[index]
  }
}
```

### Vertical Scaling

#### Resource Optimization

```typescript
// Configure for high-performance systems
const highPerformanceConfig = {
  // Aggressive batching
  defaultBatchSize: 50000,
  
  // Larger connection pool
  maxConnections: 500,
  
  // Longer timeouts for complex queries
  queryTimeout: 300000,
  
  // Use streaming for all large operations
  useStreaming: true,
  streamingThreshold: 1000,
  
  // Disable validation for maximum performance
  validateInputs: false,
  collectStats: false
}
```

### Data Partitioning

#### Time-based Partitioning

```sql
-- Advanced partitioning strategy
-- Create partitions for different time ranges
CREATE TABLE price_ticks_recent 
  PARTITION OF price_ticks
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE price_ticks_historical
  PARTITION OF price_ticks
  FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

-- Create indexes on partitions
CREATE INDEX idx_price_ticks_recent_symbol_time 
ON price_ticks_recent (symbol, time DESC);
```

#### Symbol-based Partitioning

```sql
-- Create symbol-based partitions for high-frequency symbols
CREATE TABLE price_ticks_btc
  PARTITION OF price_ticks
  FOR VALUES IN ('BTCUSD', 'BTCEUR');

CREATE TABLE price_ticks_eth
  PARTITION OF price_ticks
  FOR VALUES IN ('ETHUSD', 'ETHEUR');
```

---

## Container Deployment

### Docker Configuration

#### Application Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime

# Install security updates
RUN apk upgrade --no-cache

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S app -u 1001

# Set working directory
WORKDIR /app

# Copy application files
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=app:nodejs . .

# Switch to non-root user
USER app

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/server.js"]
```

#### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://trading_app:password@db:5432/timescale_prod
    depends_on:
      - db
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G

  db:
    image: timescale/timescaledb:latest-pg15
    environment:
      - POSTGRES_DB=timescale_prod
      - POSTGRES_USER=trading_app
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
        reservations:
          cpus: '2.0'
          memory: 4G

volumes:
  postgres_data:
```

### Kubernetes Deployment

#### Application Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: timescale-client-app
  labels:
    app: timescale-client
spec:
  replicas: 3
  selector:
    matchLabels:
      app: timescale-client
  template:
    metadata:
      labels:
        app: timescale-client
    spec:
      containers:
      - name: app
        image: your-registry/timescale-client:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            cpu: 500m
            memory: 1Gi
          limits:
            cpu: 2000m
            memory: 4Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Service Configuration

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: timescale-client-service
spec:
  selector:
    app: timescale-client
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

---

## Cloud Deployment

### AWS Deployment

#### RDS Configuration

```typescript
// AWS RDS TimescaleDB configuration
const rdsConfig = {
  engine: 'postgres',
  engineVersion: '15.2',
  instanceClass: 'db.r6g.2xlarge',
  storageType: 'gp3',
  allocatedStorage: 1000,
  maxAllocatedStorage: 10000,
  storageEncrypted: true,
  multiAZ: true,
  backupRetentionPeriod: 30,
  deletionProtection: true,
  enablePerformanceInsights: true,
  parameterGroupName: 'timescaledb-params'
}

// Parameter group settings
const parameterGroup = {
  shared_buffers: '8GB',
  effective_cache_size: '24GB',
  work_mem: '256MB',
  maintenance_work_mem: '2GB',
  max_connections: '200'
}
```

#### ECS Deployment

```json
{
  "family": "timescale-client-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "2048",
  "memory": "4096",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "timescale-client",
      "image": "your-account.dkr.ecr.region.amazonaws.com/timescale-client:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:database-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/timescale-client",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Google Cloud Platform

#### Cloud SQL Configuration

```yaml
# Cloud SQL instance
apiVersion: sql.cnrm.cloud.google.com/v1beta1
kind: SQLInstance
metadata:
  name: timescale-prod
spec:
  databaseVersion: POSTGRES_15
  region: us-central1
  settings:
    tier: db-custom-8-32768
    diskSize: 1000
    diskType: PD_SSD
    backupConfiguration:
      enabled: true
      pointInTimeRecoveryEnabled: true
      retainedBackups: 30
    ipConfiguration:
      requireSsl: true
      privateNetwork: projects/project-id/global/networks/vpc-network
    databaseFlags:
    - name: shared_buffers
      value: "8GB"
    - name: effective_cache_size
      value: "24GB"
```

#### GKE Deployment

```yaml
# GKE cluster configuration
apiVersion: container.cnrm.cloud.google.com/v1beta1
kind: ContainerCluster
metadata:
  name: timescale-client-cluster
spec:
  location: us-central1-a
  initialNodeCount: 3
  nodeConfig:
    machineType: n2-standard-4
    diskSizeGb: 100
    oauthScopes:
    - https://www.googleapis.com/auth/cloud-platform
  addonsConfig:
    httpLoadBalancing:
      disabled: false
    networkPolicyConfig:
      disabled: false
```

---

## Environment Management

### Environment Configuration

#### Development Environment

```typescript
// config/development.ts
export const developmentConfig = {
  database: {
    host: 'localhost',
    port: 5432,
    database: 'timescale_dev',
    user: 'dev_user',
    password: 'dev_password'
  },
  client: {
    validateInputs: true,
    collectStats: true,
    autoCreateTables: true,
    autoCreateIndexes: true,
    defaultBatchSize: 100,
    logger: consoleLogger
  }
}
```

#### Staging Environment

```typescript
// config/staging.ts
export const stagingConfig = {
  database: {
    host: 'staging-db.internal',
    port: 5432,
    database: 'timescale_staging',
    user: 'staging_user',
    password: process.env.STAGING_DB_PASSWORD
  },
  client: {
    validateInputs: true,
    collectStats: true,
    autoCreateTables: false,
    autoCreateIndexes: false,
    defaultBatchSize: 1000,
    logger: structuredLogger
  }
}
```

#### Production Environment

```typescript
// config/production.ts
export const productionConfig = {
  database: {
    url: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  },
  client: {
    validateInputs: false,
    collectStats: false,
    autoCreateTables: false,
    autoCreateIndexes: false,
    defaultBatchSize: 10000,
    maxRetries: 5,
    queryTimeout: 60000,
    logger: productionLogger
  }
}
```

### Configuration Management

```typescript
// config/index.ts
interface Config {
  database: DatabaseConfig
  client: ClientConfig
  monitoring: MonitoringConfig
}

const getConfig = (): Config => {
  const env = process.env.NODE_ENV || 'development'
  
  switch (env) {
    case 'production':
      return productionConfig
    case 'staging':
      return stagingConfig
    case 'development':
      return developmentConfig
    default:
      throw new Error(`Unknown environment: ${env}`)
  }
}

export const config = getConfig()
```

---

## Troubleshooting

### Common Issues

#### Connection Issues

```typescript
// Debug connection problems
const debugConnection = async () => {
  try {
    const client = await ClientFactory.fromConnectionString(connectionString)
    const health = await client.healthCheck()
    
    if (!health.isHealthy) {
      console.log('Database connection issues:')
      console.log('- Response time:', health.responseTimeMs, 'ms')
      console.log('- Errors:', health.errors)
      console.log('- Connection details:', health.connection)
    }
  } catch (error) {
    console.error('Connection failed:', error.message)
    
    // Check common issues
    if (error.message.includes('ECONNREFUSED')) {
      console.log('Database server is not running or unreachable')
    } else if (error.message.includes('authentication failed')) {
      console.log('Invalid credentials')
    } else if (error.message.includes('SSL')) {
      console.log('SSL configuration issue')
    }
  }
}
```

#### Performance Issues

```typescript
// Diagnose performance problems
const diagnosePerformance = async () => {
  const client = await ClientFactory.fromConnectionString(connectionString, {
    collectStats: true,
    logger: console
  })
  
  // Test batch insert performance
  const testData = Array.from({ length: 10000 }, (_, i) => ({
    symbol: 'TESTPERF',
    price: 100 + Math.random() * 10,
    timestamp: new Date(Date.now() - i * 1000).toISOString()
  }))
  
  const start = performance.now()
  const result = await client.insertManyTicks(testData)
  const duration = performance.now() - start
  
  console.log(`Performance test results:`)
  console.log(`- Processed: ${result.processed} ticks`)
  console.log(`- Duration: ${duration.toFixed(2)}ms`)
  console.log(`- Throughput: ${(result.processed / duration * 1000).toFixed(2)} ticks/sec`)
}
```

### Monitoring Commands

```bash
# Database monitoring commands
# Check active connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check slow queries
psql -c "SELECT query, calls, total_time, mean_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Check table sizes
psql -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

# Check TimescaleDB chunks
psql -c "SELECT hypertable_name, num_chunks, table_size FROM timescaledb_information.hypertable_detailed_size ORDER BY table_size DESC;"
```

---

This deployment guide covers all aspects of production deployment for the TimescaleDB client. For specific issues or advanced configurations, refer to the [API Reference](API_REFERENCE.md) and [Troubleshooting Guide](TROUBLESHOOTING.md).

Remember to always test thoroughly in a staging environment before deploying to production, and maintain proper monitoring and alerting to ensure system health.
