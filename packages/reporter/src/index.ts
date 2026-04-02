import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'

export interface PlaywrightCartReporterOptions {
  /** Base URL of the playwright-cart server, e.g. http://localhost:3001 */
  serverUrl: string
  /** Optional metadata attached to every uploaded report */
  project?: string
}

export class PlaywrightCartReporter implements Reporter {
  private options: PlaywrightCartReporterOptions

  constructor(options: PlaywrightCartReporterOptions) {
    this.options = options
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    // TODO: capture run metadata (start time, total test count, etc.)
  }

  onTestEnd(_test: TestCase, _result: TestResult): void {
    // TODO: accumulate per-test results for the final upload
  }

  async onEnd(_result: FullResult): Promise<void> {
    // TODO:
    // 1. Locate the playwright-report/ output directory
    // 2. Zip its contents
    // 3. POST multipart form to `${this.options.serverUrl}/api/reports`
    //    Fields: report (zip file), metadata (JSON: project, status, startedAt, etc.)
    console.log(`[playwright-cart] reporter onEnd — upload to ${this.options.serverUrl}`)
  }
}

export default PlaywrightCartReporter
