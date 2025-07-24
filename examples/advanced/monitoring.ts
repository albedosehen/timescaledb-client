/**
 * Advanced Monitoring and Observability for TimescaleDB Client
 * 
 * This example demonstrates comprehensive monitoring, logging, alerting, and observability
 * patterns for production financial systems using TimescaleDB, including health checks,
 * performance metrics, distributed tracing, and real-time dashboards.
 */

import { ClientFactory, TimescaleClient } from '../../src/mod.ts'
import type { HealthCheckResult } from '../../src/mod.ts'

// Configuration for monitoring
interface MonitoringConfig {
  connectionString: string
  enableHealthChecks: boolean
  enablePerformanceMetrics: boolean
  enableDistributedTracing: boolean
  enableAlerting: boolean
  metricsInterval: number
  alertThresholds: AlertThresholds
}

interface AlertThresholds {
  responseTime: number
  errorRate: number
  connectionUsage: number
  queryDuration: number
  memoryUsage: number
}

// Type definitions for monitoring components
interface MonitoringReport {
  timestamp: Date
  health: HealthStatus
  performance: PerformanceMetrics
  metrics: Record<string, MetricValue[]>
  alerts: Alert[]
  traces: Trace[]
  uptime: number
}

interface HealthStatus {
  timestamp: Date
  isHealthy: boolean
  responseTime: number
  database: string
  version: string
  connection: { host: string; port: number; ssl: boolean }
  errors?: string[]
}

interface PerformanceMetrics {
  timestamp: Date
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  networkLatency: number
  queryPerformance: QueryPerformanceMetrics
  connectionPool: ConnectionPoolStats
  throughput: ThroughputMetrics
  errorRate: number
}

interface QueryPerformanceMetrics {
  averageQueryTime: number
  slowestQuery: number
  queryCount: number
  successRate: number
}

interface ConnectionPoolStats {
  activeConnections: number
  totalConnections: number
  queuedRequests: number
  averageWaitTime: number
}

interface ThroughputMetrics {
  requestsPerSecond: number
  insertsPerSecond: number
  queriesPerSecond: number
  bytesPerSecond: number
}

interface MetricValue {
  timestamp: Date
  value: number
  tags: Record<string, string>
}

interface MetricSummary {
  name: string
  count: number
  sum: number
  average: number
  min: number
  max: number
  latest: MetricValue
}

interface Alert {
  id: string
  type: string
  message: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  timestamp: Date
  resolved: boolean
  resolvedAt?: Date
}

interface Trace {
  traceId: string
  rootSpan: TraceSpan
  totalDuration: number
  timestamp: Date
}

interface TraceSpan {
  traceId: string
  spanId: string
  operation: string
  startTime: number
  endTime?: number
  duration?: number
  metadata: Record<string, any>
  children: TraceSpan[]
}

interface LogEntry {
  timestamp: Date
  level: string
  message: string
  metadata: Record<string, any>
}

const config: MonitoringConfig = {
  connectionString: 'postgresql://user:password@localhost:5432/trading_db',
  enableHealthChecks: true,
  enablePerformanceMetrics: true,
  enableDistributedTracing: true,
  enableAlerting: true,
  metricsInterval: 5000,
  alertThresholds: {
    responseTime: 1000,
    errorRate: 0.05,
    connectionUsage: 0.8,
    queryDuration: 5000,
    memoryUsage: 0.9
  }
}

/**
 * Comprehensive monitoring system
 */
class MonitoringSystem {
  private client: TimescaleClient
  private metrics: MetricsCollector
  private healthMonitor: HealthMonitor
  private performanceMonitor: PerformanceMonitor
  private alertManager: AlertManager
  private logger: Logger
  private traceCollector: TraceCollector
  private dashboard: Dashboard
  
  constructor(client: TimescaleClient) {
    this.client = client
    this.metrics = new MetricsCollector()
    this.healthMonitor = new HealthMonitor(client)
    this.performanceMonitor = new PerformanceMonitor(client)
    this.alertManager = new AlertManager(config.alertThresholds)
    this.logger = new Logger()
    this.traceCollector = new TraceCollector()
    this.dashboard = new Dashboard()
  }
  
  /**
   * Start comprehensive monitoring
   */
  async startMonitoring(): Promise<void> {
    console.log('🚀 Starting comprehensive monitoring system...')
    
    // Start health monitoring
    if (config.enableHealthChecks) {
      await this.healthMonitor.start()
    }
    
    // Start performance monitoring
    if (config.enablePerformanceMetrics) {
      await this.performanceMonitor.start()
    }
    
    // Start distributed tracing
    if (config.enableDistributedTracing) {
      await this.traceCollector.start()
    }
    
    // Start alerting
    if (config.enableAlerting) {
      await this.alertManager.start()
    }
    
    // Start metrics collection
    await this.metrics.start()
    
    // Start dashboard
    await this.dashboard.start()
    
    console.log('✅ Monitoring system started successfully')
  }
  
  /**
   * Stop monitoring system
   */
  async stopMonitoring(): Promise<void> {
    console.log('🛑 Stopping monitoring system...')
    
    await this.healthMonitor.stop()
    await this.performanceMonitor.stop()
    await this.traceCollector.stop()
    await this.alertManager.stop()
    await this.metrics.stop()
    await this.dashboard.stop()
    
    console.log('✅ Monitoring system stopped')
  }
  
  /**
   * Get comprehensive monitoring report
   */
  async getMonitoringReport(): Promise<MonitoringReport> {
    const report: MonitoringReport = {
      timestamp: new Date(),
      health: await this.healthMonitor.getHealthStatus(),
      performance: await this.performanceMonitor.getPerformanceMetrics(),
      metrics: await this.metrics.getMetrics(),
      alerts: await this.alertManager.getActiveAlerts(),
      traces: await this.traceCollector.getTraces(),
      uptime: this.getUptime()
    }
    
    return report
  }
  
  private getUptime(): number {
    // Return uptime in seconds
    return Math.floor(performance.now() / 1000)
  }
}

/**
 * Health monitoring component
 */
class HealthMonitor {
  private client: TimescaleClient
  private isRunning: boolean = false
  private healthTimer?: number
  private healthHistory: HealthStatus[] = []
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  async start(): Promise<void> {
    console.log('💚 Starting health monitoring...')
    this.isRunning = true
    
    // Start periodic health checks
    this.healthTimer = setInterval(async () => {
      await this.performHealthCheck()
    }, config.metricsInterval)
    
    // Initial health check
    await this.performHealthCheck()
  }
  
  async stop(): Promise<void> {
    this.isRunning = false
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
    }
  }
  
  private async performHealthCheck(): Promise<void> {
    try {
      const start = performance.now()
      const healthResult = await this.client.healthCheck()
      const duration = performance.now() - start
      
      const status: HealthStatus = {
        timestamp: new Date(),
        isHealthy: healthResult.isHealthy,
        responseTime: duration,
        database: healthResult.database || 'unknown',
        version: healthResult.version || 'unknown',
        connection: healthResult.connection || { host: 'unknown', port: 0, ssl: false },
        errors: healthResult.errors ? [...healthResult.errors] : undefined
      }
      
      this.healthHistory.push(status)
      
      // Keep only last 100 health checks
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift()
      }
      
      // Log health status
      if (status.isHealthy) {
        console.log(`💚 Health check passed (${duration.toFixed(2)}ms)`)
      } else {
        console.log(`❤️  Health check failed: ${status.errors?.join(', ')}`)
      }
      
    } catch (error) {
      console.error('❌ Health check error:', error)
    }
  }
  
  async getHealthStatus(): Promise<HealthStatus> {
    const latest = this.healthHistory[this.healthHistory.length - 1]
    return latest || {
      timestamp: new Date(),
      isHealthy: false,
      responseTime: 0,
      database: 'unknown',
      version: 'unknown',
      connection: { host: 'unknown', port: 0, ssl: false },
      errors: ['No health data available']
    }
  }
  
  getHealthHistory(): HealthStatus[] {
    return [...this.healthHistory]
  }
}

/**
 * Performance monitoring component
 */
class PerformanceMonitor {
  private client: TimescaleClient
  private isRunning: boolean = false
  private performanceTimer?: number
  private performanceHistory: PerformanceMetrics[] = []
  
  constructor(client: TimescaleClient) {
    this.client = client
  }
  
  async start(): Promise<void> {
    console.log('📊 Starting performance monitoring...')
    this.isRunning = true
    
    // Start periodic performance monitoring
    this.performanceTimer = setInterval(async () => {
      await this.collectPerformanceMetrics()
    }, config.metricsInterval)
    
    // Initial collection
    await this.collectPerformanceMetrics()
  }
  
  async stop(): Promise<void> {
    this.isRunning = false
    if (this.performanceTimer) {
      clearInterval(this.performanceTimer)
    }
  }
  
  private async collectPerformanceMetrics(): Promise<void> {
    try {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        cpuUsage: await this.getCpuUsage(),
        memoryUsage: await this.getMemoryUsage(),
        diskUsage: await this.getDiskUsage(),
        networkLatency: await this.getNetworkLatency(),
        queryPerformance: await this.getQueryPerformance(),
        connectionPool: await this.getConnectionPoolStats(),
        throughput: await this.getThroughputMetrics(),
        errorRate: await this.getErrorRate()
      }
      
      this.performanceHistory.push(metrics)
      
      // Keep only last 100 metrics
      if (this.performanceHistory.length > 100) {
        this.performanceHistory.shift()
      }
      
      console.log(`📊 Performance metrics collected (CPU: ${metrics.cpuUsage.toFixed(1)}%, Memory: ${metrics.memoryUsage.toFixed(1)}%)`)
      
    } catch (error) {
      console.error('❌ Performance monitoring error:', error)
    }
  }
  
  private async getCpuUsage(): Promise<number> {
    // Simplified CPU usage calculation
    return Math.random() * 100
  }
  
  private async getMemoryUsage(): Promise<number> {
    // Simplified memory usage calculation
    return Math.random() * 100
  }
  
  private async getDiskUsage(): Promise<number> {
    // Simplified disk usage calculation
    return Math.random() * 100
  }
  
  private async getNetworkLatency(): Promise<number> {
    const start = performance.now()
    try {
      await this.client.healthCheck()
      return performance.now() - start
    } catch (error) {
      return -1
    }
  }
  
  private async getQueryPerformance(): Promise<QueryPerformanceMetrics> {
    return {
      averageQueryTime: Math.random() * 100,
      slowestQuery: Math.random() * 1000,
      queryCount: Math.floor(Math.random() * 1000),
      successRate: 0.95 + Math.random() * 0.05
    }
  }
  
  private async getConnectionPoolStats(): Promise<ConnectionPoolStats> {
    return {
      activeConnections: Math.floor(Math.random() * 10),
      totalConnections: 10,
      queuedRequests: Math.floor(Math.random() * 5),
      averageWaitTime: Math.random() * 100
    }
  }
  
  private async getThroughputMetrics(): Promise<ThroughputMetrics> {
    return {
      requestsPerSecond: Math.random() * 1000,
      insertsPerSecond: Math.random() * 500,
      queriesPerSecond: Math.random() * 200,
      bytesPerSecond: Math.random() * 1000000
    }
  }
  
  private async getErrorRate(): Promise<number> {
    return Math.random() * 0.1 // 0-10% error rate
  }
  
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const latest = this.performanceHistory[this.performanceHistory.length - 1]
    return latest || {
      timestamp: new Date(),
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkLatency: 0,
      queryPerformance: {
        averageQueryTime: 0,
        slowestQuery: 0,
        queryCount: 0,
        successRate: 0
      },
      connectionPool: {
        activeConnections: 0,
        totalConnections: 0,
        queuedRequests: 0,
        averageWaitTime: 0
      },
      throughput: {
        requestsPerSecond: 0,
        insertsPerSecond: 0,
        queriesPerSecond: 0,
        bytesPerSecond: 0
      },
      errorRate: 0
    }
  }
}

/**
 * Metrics collector
 */
class MetricsCollector {
  private metrics: Map<string, MetricValue[]> = new Map()
  private isRunning: boolean = false
  
  async start(): Promise<void> {
    console.log('📈 Starting metrics collection...')
    this.isRunning = true
  }
  
  async stop(): Promise<void> {
    this.isRunning = false
  }
  
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    
    const metricArray = this.metrics.get(name)!
    metricArray.push({
      timestamp: new Date(),
      value,
      tags: tags || {}
    })
    
    // Keep only last 1000 metrics per name
    if (metricArray.length > 1000) {
      metricArray.shift()
    }
  }
  
  async getMetrics(): Promise<Record<string, MetricValue[]>> {
    const result: Record<string, MetricValue[]> = {}
    
    for (const [name, values] of this.metrics) {
      result[name] = [...values]
    }
    
    return result
  }
  
  getMetricSummary(name: string): MetricSummary | null {
    const values = this.metrics.get(name)
    if (!values || values.length === 0) return null
    
    const numericValues = values.map(v => v.value)
    const sum = numericValues.reduce((a, b) => a + b, 0)
    const avg = sum / numericValues.length
    const min = Math.min(...numericValues)
    const max = Math.max(...numericValues)
    
    return {
      name,
      count: values.length,
      sum,
      average: avg,
      min,
      max,
      latest: values[values.length - 1]
    }
  }
}

/**
 * Alert manager
 */
class AlertManager {
  private thresholds: AlertThresholds
  private activeAlerts: Alert[] = []
  private alertHistory: Alert[] = []
  private isRunning: boolean = false
  
  constructor(thresholds: AlertThresholds) {
    this.thresholds = thresholds
  }
  
  async start(): Promise<void> {
    console.log('🚨 Starting alert manager...')
    this.isRunning = true
  }
  
  async stop(): Promise<void> {
    this.isRunning = false
  }
  
  checkThresholds(metrics: PerformanceMetrics): void {
    // Check response time
    if (metrics.networkLatency > this.thresholds.responseTime) {
      this.triggerAlert('HIGH_RESPONSE_TIME', `Response time ${metrics.networkLatency}ms exceeds threshold`, 'WARNING')
    }
    
    // Check error rate
    if (metrics.errorRate > this.thresholds.errorRate) {
      this.triggerAlert('HIGH_ERROR_RATE', `Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold`, 'CRITICAL')
    }
    
    // Check connection usage
    const connectionUsage = metrics.connectionPool.activeConnections / metrics.connectionPool.totalConnections
    if (connectionUsage > this.thresholds.connectionUsage) {
      this.triggerAlert('HIGH_CONNECTION_USAGE', `Connection usage ${(connectionUsage * 100).toFixed(1)}% exceeds threshold`, 'WARNING')
    }
    
    // Check memory usage
    if (metrics.memoryUsage > this.thresholds.memoryUsage * 100) {
      this.triggerAlert('HIGH_MEMORY_USAGE', `Memory usage ${metrics.memoryUsage.toFixed(1)}% exceeds threshold`, 'CRITICAL')
    }
  }
  
  private triggerAlert(type: string, message: string, severity: 'INFO' | 'WARNING' | 'CRITICAL'): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random()}`,
      type,
      message,
      severity,
      timestamp: new Date(),
      resolved: false
    }
    
    this.activeAlerts.push(alert)
    this.alertHistory.push(alert)
    
    console.log(`🚨 ALERT [${severity}]: ${message}`)
    
    // Send alert to external systems
    this.sendAlert(alert)
    
    // Keep only last 1000 alerts in history
    if (this.alertHistory.length > 1000) {
      this.alertHistory.shift()
    }
  }
  
  private async sendAlert(alert: Alert): Promise<void> {
    // Simulate sending to external alert system
    console.log(`📤 Sending alert to external system: ${alert.id}`)
  }
  
  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.find(a => a.id === alertId)
    if (alert) {
      alert.resolved = true
      alert.resolvedAt = new Date()
      
      // Remove from active alerts
      this.activeAlerts = this.activeAlerts.filter(a => a.id !== alertId)
      
      console.log(`✅ Alert resolved: ${alertId}`)
    }
  }
  
  async getActiveAlerts(): Promise<Alert[]> {
    return [...this.activeAlerts]
  }
  
  async getAlertHistory(): Promise<Alert[]> {
    return [...this.alertHistory]
  }
}

/**
 * Trace collector for distributed tracing
 */
class TraceCollector {
  private traces: Trace[] = []
  private isRunning: boolean = false
  
  async start(): Promise<void> {
    console.log('🔍 Starting trace collection...')
    this.isRunning = true
  }
  
  async stop(): Promise<void> {
    this.isRunning = false
  }
  
  startTrace(operation: string, metadata?: Record<string, any>): TraceSpan {
    const span: TraceSpan = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      operation,
      startTime: Date.now(),
      metadata: metadata || {},
      children: []
    }
    
    return span
  }
  
  finishTrace(span: TraceSpan): void {
    span.endTime = Date.now()
    span.duration = span.endTime - span.startTime
    
    const trace: Trace = {
      traceId: span.traceId,
      rootSpan: span,
      totalDuration: span.duration,
      timestamp: new Date(span.startTime)
    }
    
    this.traces.push(trace)
    
    // Keep only last 1000 traces
    if (this.traces.length > 1000) {
      this.traces.shift()
    }
    
    console.log(`🔍 Trace completed: ${span.operation} (${span.duration}ms)`)
  }
  
  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  private generateSpanId(): string {
    return `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  async getTraces(): Promise<Trace[]> {
    return [...this.traces]
  }
}

/**
 * Logger component
 */
class Logger {
  private logs: LogEntry[] = []
  
  info(message: string, metadata?: Record<string, any>): void {
    this.log('INFO', message, metadata)
  }
  
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('WARN', message, metadata)
  }
  
  error(message: string, metadata?: Record<string, any>): void {
    this.log('ERROR', message, metadata)
  }
  
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', message, metadata)
  }
  
  private log(level: string, message: string, metadata?: Record<string, any>): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      metadata: metadata || {}
    }
    
    this.logs.push(entry)
    
    // Keep only last 10000 logs
    if (this.logs.length > 10000) {
      this.logs.shift()
    }
    
    console.log(`[${level}] ${message}`)
  }
  
  getLogs(level?: string): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level)
    }
    return [...this.logs]
  }
}

/**
 * Dashboard component
 */
class Dashboard {
  private isRunning: boolean = false
  
  async start(): Promise<void> {
    console.log('📊 Starting monitoring dashboard...')
    this.isRunning = true
  }
  
  async stop(): Promise<void> {
    this.isRunning = false
  }
  
  generateDashboard(report: MonitoringReport): string {
    return `
╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                         TIMESCALEDB MONITORING DASHBOARD                                          ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║ Generated: ${report.timestamp.toISOString().padEnd(30)} │ Uptime: ${report.uptime}s                                   ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║ HEALTH STATUS                                                                                                      ║
║ Status: ${report.health.isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}                                                 ║
║ Response Time: ${report.health.responseTime.toFixed(2)}ms                                                        ║
║ Database: ${report.health.database}                                                                               ║
║ Version: ${report.health.version}                                                                                 ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║ PERFORMANCE METRICS                                                                                               ║
║ CPU Usage: ${report.performance.cpuUsage.toFixed(1)}%                                                           ║
║ Memory Usage: ${report.performance.memoryUsage.toFixed(1)}%                                                     ║
║ Network Latency: ${report.performance.networkLatency.toFixed(2)}ms                                              ║
║ Error Rate: ${(report.performance.errorRate * 100).toFixed(2)}%                                                 ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║ ACTIVE ALERTS                                                                                                     ║
║ Total: ${report.alerts.length}                                                                                   ║
${report.alerts.slice(0, 3).map(alert => `║ [${alert.severity}] ${alert.message.padEnd(80)} ║`).join('\n')}
╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║ RECENT TRACES                                                                                                     ║
║ Total: ${report.traces.length}                                                                                   ║
${report.traces.slice(0, 3).map(trace => `║ ${trace.rootSpan.operation} (${trace.totalDuration}ms)                     ║`).join('\n')}
╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
    `
  }
}

/**
 * Main monitoring demonstration
 */
async function demonstrateMonitoring() {
  console.log('🎯 Starting TimescaleDB Monitoring Demo...')

  try {
    // Initialize client
    const client = await ClientFactory.fromConnectionString(config.connectionString)

    // Create monitoring system
    const monitoringSystem = new MonitoringSystem(client)

    // Start monitoring
    await monitoringSystem.startMonitoring()

    // Simulate some activity
    console.log('\n📊 Simulating trading activity...')

    // Simulate market data insertions
    for (let i = 0; i < 10; i++) {
      const span = monitoringSystem['traceCollector'].startTrace('insert_market_data')

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100))

      monitoringSystem['traceCollector'].finishTrace(span)
      monitoringSystem['metrics'].recordMetric('trades_processed', 1, { symbol: 'BTCUSD' })
    }

    // Generate monitoring report
    const report = await monitoringSystem.getMonitoringReport()
    const dashboard = monitoringSystem['dashboard'].generateDashboard(report)

    console.log('\n📊 Current Dashboard:')
    console.log(dashboard)

    // Simulate alert conditions
    console.log('\n🚨 Simulating alert conditions...')
    const alertManager = monitoringSystem['alertManager']

    // Create mock performance metrics that trigger alerts
    const mockMetrics: PerformanceMetrics = {
      timestamp: new Date(),
      cpuUsage: 85,
      memoryUsage: 95, // This should trigger high memory alert
      diskUsage: 70,
      networkLatency: 1200, // This should trigger high response time alert
      queryPerformance: {
        averageQueryTime: 50,
        slowestQuery: 200,
        queryCount: 1000,
        successRate: 0.99
      },
      connectionPool: {
        activeConnections: 9,
        totalConnections: 10,
        queuedRequests: 2,
        averageWaitTime: 50
      },
      throughput: {
        requestsPerSecond: 500,
        insertsPerSecond: 200,
        queriesPerSecond: 100,
        bytesPerSecond: 500000
      },
      errorRate: 0.08 // This should trigger high error rate alert
    }

    alertManager.checkThresholds(mockMetrics)

    // Show updated alerts
    const alerts = await alertManager.getActiveAlerts()
    console.log(`\n🚨 Active Alerts: ${alerts.length}`)
    alerts.forEach(alert => {
      console.log(`  - [${alert.severity}] ${alert.message}`)
    })

    // Wait a bit to see metrics collection
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Stop monitoring
    await monitoringSystem.stopMonitoring()

    console.log('\n✅ Monitoring demonstration completed!')

  } catch (error) {
    console.error('❌ Error in monitoring demonstration:', error)
  }
}

// Run the demonstration
if (import.meta.main) {
  await demonstrateMonitoring()
}

export {
  MonitoringSystem,
  HealthMonitor,
  PerformanceMonitor,
  MetricsCollector,
  AlertManager,
  TraceCollector,
  Logger,
  Dashboard,
  type MonitoringConfig,
  type MonitoringReport,
  type HealthStatus,
  type PerformanceMetrics,
  type Alert,
  type Trace,
  type TraceSpan,
  type LogEntry
}