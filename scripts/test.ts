#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run

/**
 * Comprehensive test runner for TimescaleDB client
 * 
 * Provides advanced testing capabilities including coverage validation,
 * performance benchmarks, and detailed reporting.
 */

import { parseArgs } from 'https://deno.land/std@0.208.0/cli/parse_args.ts'
import { ensureDir } from 'https://deno.land/std@0.208.0/fs/ensure_dir.ts'
import { exists } from 'https://deno.land/std@0.208.0/fs/exists.ts'

interface TestOptions {
  unit: boolean
  integration: boolean
  validation: boolean
  coverage: boolean
  watch: boolean
  bail: boolean
  parallel: boolean
  verbose: boolean
  filter?: string
  threshold?: number
  clean: boolean
  report: boolean
}

interface TestResult {
  passed: number
  failed: number
  skipped: number
  duration: number
  coverage?: number
}

interface CoverageResult {
  overall: number
  validation: number
  client: number
  files: Array<{
    name: string
    coverage: number
    lines: { covered: number; total: number }
  }>
}

class TestRunner {
  private options: TestOptions

  constructor(options: TestOptions) {
    this.options = options
  }

  async run(): Promise<void> {
    console.log('🧪 TimescaleDB Client Test Runner')
    console.log('=====================================\n')

    if (this.options.clean) {
      await this.cleanCoverage()
    }

    await this.ensureDirectories()

    const startTime = performance.now()
    let overallResult: TestResult = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    }

    try {
      if (this.options.validation) {
        console.log('📋 Running validation tests (100% coverage required)...')
        const result = await this.runValidationTests()
        this.mergeResults(overallResult, result)
        await this.checkValidationCoverage()
      }

      if (this.options.unit) {
        console.log('🔧 Running unit tests...')
        const result = await this.runUnitTests()
        this.mergeResults(overallResult, result)
      }

      if (this.options.integration) {
        console.log('🔗 Running integration tests...')
        const result = await this.runIntegrationTests()
        this.mergeResults(overallResult, result)
      }

      if (this.options.coverage) {
        console.log('📊 Generating coverage reports...')
        await this.generateCoverageReports()
        const coverage = await this.checkCoverageThresholds()
        overallResult.coverage = coverage.overall
      }

      overallResult.duration = performance.now() - startTime

      if (this.options.report) {
        await this.generateTestReport(overallResult)
      }

      this.printSummary(overallResult)

      if (overallResult.failed > 0) {
        console.error('\n❌ Tests failed!')
        Deno.exit(1)
      } else {
        console.log('\n✅ All tests passed!')
      }

    } catch (error) {
      console.error('\n💥 Test runner failed:', error.message)
      Deno.exit(1)
    }
  }

  private async runValidationTests(): Promise<TestResult> {
    const cmd = [
      'deno', 'test',
      'tests/unit/types/validation_test.ts',
      '--allow-read', '--allow-write', '--allow-env',
      '--coverage=coverage/validation/',
      '--reporter=pretty'
    ]

    if (this.options.filter) {
      cmd.push('--filter', this.options.filter)
    }

    if (this.options.bail) {
      cmd.push('--fail-fast')
    }

    if (this.options.parallel) {
      cmd.push('--parallel')
    }

    return await this.executeTests(cmd, 'validation')
  }

  private async runUnitTests(): Promise<TestResult> {
    const cmd = [
      'deno', 'test',
      'tests/unit/',
      '--allow-read', '--allow-write', '--allow-env',
      '--coverage=coverage/unit/',
      '--reporter=pretty'
    ]

    if (this.options.filter) {
      cmd.push('--filter', this.options.filter)
    }

    if (this.options.bail) {
      cmd.push('--fail-fast')
    }

    if (this.options.parallel) {
      cmd.push('--parallel')
    }

    return await this.executeTests(cmd, 'unit')
  }

  private async runIntegrationTests(): Promise<TestResult> {
    const cmd = [
      'deno', 'test',
      'tests/integration/',
      '--allow-read', '--allow-write', '--allow-env', '--allow-net',
      '--coverage=coverage/integration/',
      '--reporter=pretty'
    ]

    if (this.options.filter) {
      cmd.push('--filter', this.options.filter)
    }

    if (this.options.bail) {
      cmd.push('--fail-fast')
    }

    return await this.executeTests(cmd, 'integration')
  }

  private async executeTests(cmd: string[], type: string): Promise<TestResult> {
    const startTime = performance.now()
    
    if (this.options.verbose) {
      console.log(`Executing: ${cmd.join(' ')}`)
    }

    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout, stderr } = await process.output()
    const output = new TextDecoder().decode(stdout)
    const errorOutput = new TextDecoder().decode(stderr)

    const duration = performance.now() - startTime

    if (this.options.verbose || code !== 0) {
      console.log(output)
      if (errorOutput) {
        console.error(errorOutput)
      }
    }

    // Parse test results from output
    const result = this.parseTestOutput(output, duration)
    
    console.log(`${type} tests: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${Math.round(duration)}ms)`)

    if (code !== 0 && this.options.bail) {
      throw new Error(`${type} tests failed`)
    }

    return result
  }

  private parseTestOutput(output: string, duration: number): TestResult {
    // Simple parsing - in real implementation would be more sophisticated
    const lines = output.split('\n')
    let passed = 0
    let failed = 0
    let skipped = 0

    for (const line of lines) {
      if (line.includes('ok') && line.includes('...')) {
        passed++
      } else if (line.includes('FAILED') || line.includes('error')) {
        failed++
      } else if (line.includes('ignored') || line.includes('skipped')) {
        skipped++
      }
    }

    return { passed, failed, skipped, duration }
  }

  private async checkValidationCoverage(): Promise<void> {
    console.log('🎯 Checking validation test coverage (requires 100%)...')
    
    const cmd = [
      'deno', 'coverage',
      'coverage/validation/',
      '--include=src/types/',
      '--threshold=100'
    ]

    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout, stderr } = await process.output()
    
    if (code !== 0) {
      const errorOutput = new TextDecoder().decode(stderr)
      throw new Error(`Validation coverage below 100%: ${errorOutput}`)
    }

    console.log('✅ Validation tests meet 100% coverage requirement')
  }

  private async generateCoverageReports(): Promise<void> {
    // Generate HTML coverage report
    const htmlCmd = [
      'deno', 'coverage',
      'coverage/',
      '--html',
      '--output=coverage/html/'
    ]

    await this.executeCommand(htmlCmd)

    // Generate detailed text report
    const textCmd = [
      'deno', 'coverage',
      'coverage/',
      '--detailed',
      '--output=coverage/detailed.txt'
    ]

    await this.executeCommand(textCmd)

    console.log('📊 Coverage reports generated:')
    console.log('  - HTML: coverage/html/index.html')
    console.log('  - Detailed: coverage/detailed.txt')
  }

  private async checkCoverageThresholds(): Promise<CoverageResult> {
    // Check overall coverage (80% minimum)
    const overallCmd = [
      'deno', 'coverage',
      'coverage/',
      '--threshold=' + (this.options.threshold || 80)
    ]

    const overallResult = await this.executeCommand(overallCmd)
    const overallCoverage = this.parseCoverageOutput(overallResult.stdout)

    // Check client coverage (95% minimum)
    const clientCmd = [
      'deno', 'coverage',
      'coverage/',
      '--include=src/client/',
      '--threshold=95'
    ]

    const clientResult = await this.executeCommand(clientCmd)
    const clientCoverage = this.parseCoverageOutput(clientResult.stdout)

    // Check validation coverage (100% required)
    const validationCmd = [
      'deno', 'coverage',
      'coverage/validation/',
      '--include=src/types/',
      '--threshold=100'
    ]

    const validationResult = await this.executeCommand(validationCmd)
    const validationCoverage = this.parseCoverageOutput(validationResult.stdout)

    console.log(`📈 Coverage Summary:`)
    console.log(`  Overall: ${overallCoverage}%`)
    console.log(`  Client: ${clientCoverage}%`)
    console.log(`  Validation: ${validationCoverage}%`)

    return {
      overall: overallCoverage,
      client: clientCoverage,
      validation: validationCoverage,
      files: [] // Would be populated with detailed file coverage
    }
  }

  private parseCoverageOutput(output: string): number {
    // Simple coverage parsing - would be more sophisticated in real implementation
    const match = output.match(/(\d+\.\d+)%/)
    return match ? parseFloat(match[1]) : 0
  }

  private async executeCommand(cmd: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    const process = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout, stderr } = await process.output()
    
    return {
      code,
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr)
    }
  }

  private async generateTestReport(result: TestResult): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      summary: result,
      environment: {
        deno: Deno.version.deno,
        os: Deno.build.os,
        arch: Deno.build.arch
      },
      configuration: this.options
    }

    await ensureDir('reports')
    const reportPath = `reports/test-report-${Date.now()}.json`
    await Deno.writeTextFile(reportPath, JSON.stringify(report, null, 2))
    
    console.log(`📋 Test report saved: ${reportPath}`)
  }

  private mergeResults(target: TestResult, source: TestResult): void {
    target.passed += source.passed
    target.failed += source.failed
    target.skipped += source.skipped
    target.duration += source.duration
  }

  private printSummary(result: TestResult): void {
    console.log('\n📊 Test Summary')
    console.log('================')
    console.log(`Total tests: ${result.passed + result.failed + result.skipped}`)
    console.log(`✅ Passed: ${result.passed}`)
    console.log(`❌ Failed: ${result.failed}`)
    console.log(`⏭️  Skipped: ${result.skipped}`)
    console.log(`⏱️  Duration: ${Math.round(result.duration)}ms`)
    
    if (result.coverage !== undefined) {
      console.log(`📈 Coverage: ${result.coverage.toFixed(1)}%`)
    }
  }

  private async ensureDirectories(): Promise<void> {
    await ensureDir('coverage')
    await ensureDir('coverage/unit')
    await ensureDir('coverage/integration')
    await ensureDir('coverage/validation')
    await ensureDir('coverage/html')
    await ensureDir('reports')
  }

  private async cleanCoverage(): Promise<void> {
    console.log('🧹 Cleaning coverage data...')
    
    try {
      if (await exists('coverage')) {
        await Deno.remove('coverage', { recursive: true })
      }
    } catch (error) {
      console.warn('Warning: Could not clean coverage directory:', error.message)
    }
  }
}

// Main execution
async function main() {
  const args = parseArgs(Deno.args, {
    boolean: [
      'unit', 'integration', 'validation', 'coverage', 
      'watch', 'bail', 'parallel', 'verbose', 'clean', 'report', 'help'
    ],
    string: ['filter', 'threshold'],
    default: {
      unit: false,
      integration: false,
      validation: false,
      coverage: false,
      watch: false,
      bail: false,
      parallel: false,
      verbose: false,
      clean: false,
      report: false,
      threshold: '80'
    },
    alias: {
      h: 'help',
      v: 'verbose',
      f: 'filter',
      t: 'threshold',
      c: 'coverage',
      w: 'watch'
    }
  })

  if (args.help) {
    console.log(`
TimescaleDB Client Test Runner

Usage: deno run --allow-all scripts/test.ts [options]

Options:
  --unit                Run unit tests
  --integration         Run integration tests  
  --validation          Run validation tests (100% coverage required)
  --coverage, -c        Generate coverage reports
  --watch, -w           Watch mode (re-run on file changes)
  --bail                Stop on first test failure
  --parallel            Run tests in parallel
  --verbose, -v         Verbose output
  --clean               Clean coverage data before running
  --report              Generate detailed test report
  --filter, -f <name>   Filter tests by name
  --threshold, -t <n>   Coverage threshold (default: 80)
  --help, -h            Show this help

Examples:
  deno run --allow-all scripts/test.ts --validation --coverage
  deno run --allow-all scripts/test.ts --unit --integration --coverage --report
  deno run --allow-all scripts/test.ts --filter "TimescaleClient" --verbose
    `)
    Deno.exit(0)
  }

  // If no specific test type specified, run all
  if (!args.unit && !args.integration && !args.validation) {
    args.unit = true
    args.integration = true
    args.validation = true
    args.coverage = true
  }

  const options: TestOptions = {
    unit: args.unit,
    integration: args.integration,
    validation: args.validation,
    coverage: args.coverage,
    watch: args.watch,
    bail: args.bail,
    parallel: args.parallel,
    verbose: args.verbose,
    clean: args.clean,
    report: args.report,
    filter: args.filter,
    threshold: args.threshold ? parseInt(args.threshold) : undefined
  }

  const runner = new TestRunner(options)
  await runner.run()
}

if (import.meta.main) {
  await main()
}