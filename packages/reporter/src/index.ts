import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import stripAnsi from 'strip-ansi'
import { buildTestId, Semaphore, uploadWithRetry, zipDirectory } from './upload.js'

export interface PlaywrightCartReporterOptions {
  /** Base URL of the playwright-cart server, e.g. http://localhost:3001 */
  serverUrl: string
  /** Identifies this project in the dashboard */
  project: string
  /** Git branch name */
  branch?: string
  /** Git commit SHA */
  commitSha?: string
  /** Max parallel test uploads (default: 3) */
  uploadConcurrency?: number
  /** Upload retry attempts (default: 3) */
  retries?: number
  /** Initial retry backoff in ms, doubles each attempt (default: 500) */
  retryDelay?: number
  /** API key for server authentication */
  apiKey?: string
}

export class PlaywrightCartReporter implements Reporter {
  private readonly serverUrl: string
  private readonly project: string
  private readonly branch: string | undefined
  private readonly commitSha: string | undefined
  private readonly retries: number
  private readonly retryDelay: number
  private readonly apiKey: string | undefined
  private readonly semaphore: Semaphore

  private runIdPromise: Promise<string | null> = Promise.resolve(null)
  private pendingUploads: Promise<void>[] = []
  private htmlReporterEnabled = false
  private reportOutputDir = 'playwright-report'

  constructor(options: PlaywrightCartReporterOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, '')
    this.project = options.project
    this.branch = options.branch
    this.commitSha = options.commitSha
    this.retries = options.retries ?? 3
    this.retryDelay = options.retryDelay ?? 500
    this.apiKey = options.apiKey
    this.semaphore = new Semaphore(options.uploadConcurrency ?? 3)
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    // Detect HTML reporter and its configured output directory
    const htmlEntry = config.reporter.find((r) => r[0] === 'html')
    if (htmlEntry) {
      this.htmlReporterEnabled = true
      const outputFolder = (htmlEntry[1] as { outputFolder?: string } | undefined)?.outputFolder
      if (outputFolder) this.reportOutputDir = outputFolder
    }

    // Fire-and-forget run creation (onBegin is synchronous)
    this.runIdPromise = fetch(`${this.serverUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({
        project: this.project,
        branch: this.branch,
        commitSha: this.commitSha,
        startedAt: new Date().toISOString(),
      }),
    })
      .then((r) => r.json() as Promise<{ runId: string }>)
      .then((data) => data.runId)
      .catch((err) => {
        console.warn(`[playwright-cart] failed to create run: ${err}`)
        return null
      })
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const upload = (async () => {
      const runId = await this.runIdPromise
      if (!runId) return

      const testId = buildTestId(test.titlePath(), result.retry)
      const attachmentMeta = result.attachments.map((a) => ({
        name: a.name,
        contentType: a.contentType,
        filename: a.path ? basename(a.path) : undefined,
      }))

      const metadata = {
        testId,
        title: test.title,
        titlePath: test.titlePath(),
        location: test.location,
        status: result.status,
        duration: result.duration,
        errors: result.errors.map((e) => ({
          message: stripAnsi(e.message ?? ''),
          stack: e.stack ? stripAnsi(e.stack) : undefined,
        })),
        retry: result.retry,
        annotations: test.annotations,
        attachments: attachmentMeta,
      }

      const form = new FormData()
      form.append('metadata', JSON.stringify(metadata))

      for (const [i, att] of result.attachments.entries()) {
        if (att.path && existsSync(att.path)) {
          const buf = readFileSync(att.path)
          form.append(
            `attachment_${i}`,
            new Blob([new Uint8Array(buf)], { type: att.contentType }),
            basename(att.path),
          )
        } else if (att.body) {
          form.append(
            `attachment_${i}`,
            new Blob([new Uint8Array(att.body)], { type: att.contentType }),
            att.name,
          )
        }
      }

      await this.semaphore.acquire()
      try {
        await uploadWithRetry(
          () =>
            fetch(`${this.serverUrl}/api/runs/${runId}/tests`, {
              method: 'POST',
              headers: { ...this.authHeaders() },
              body: form,
            }),
          this.retries,
          this.retryDelay,
        )
      } finally {
        this.semaphore.release()
      }
    })()

    this.pendingUploads.push(upload)
  }

  async onEnd(result: FullResult): Promise<void> {
    // Drain all in-flight test uploads
    await Promise.allSettled(this.pendingUploads)

    const runId = await this.runIdPromise
    if (!runId) return

    const completedAt = new Date().toISOString()
    const status = result.status

    if (this.htmlReporterEnabled) {
      const reportDir = resolve(process.cwd(), this.reportOutputDir)
      if (existsSync(reportDir)) {
        try {
          const zipBuf = await zipDirectory(reportDir)
          const form = new FormData()
          form.append(
            'report',
            new Blob([new Uint8Array(zipBuf)], { type: 'application/zip' }),
            'report.zip',
          )
          form.append('completedAt', completedAt)
          form.append('status', status)
          await uploadWithRetry(
            () =>
              fetch(`${this.serverUrl}/api/runs/${runId}/report`, {
                method: 'POST',
                headers: { ...this.authHeaders() },
                body: form,
              }),
            this.retries,
            this.retryDelay,
          )
          return // /report already updated status — done
        } catch (err) {
          console.warn(`[playwright-cart] failed to upload report: ${err}`)
          // fall through to /complete to at least update the run status
        }
      } else {
        console.warn(`[playwright-cart] HTML report dir not found: ${reportDir}`)
        // fall through to /complete
      }
    }

    // Reached when: no HTML reporter, report dir missing, or report upload failed
    await uploadWithRetry(
      () =>
        fetch(`${this.serverUrl}/api/runs/${runId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
          body: JSON.stringify({ completedAt, status }),
        }),
      this.retries,
      this.retryDelay,
    )
  }
}

export default PlaywrightCartReporter
