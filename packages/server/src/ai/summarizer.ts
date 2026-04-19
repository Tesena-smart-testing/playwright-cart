import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inArray } from 'drizzle-orm'
import { decrypt } from './crypto.js'
import { getProvider } from './providers/index.js'
import { buildRunSummaryPrompt } from './prompts/run-summary.js'
import { buildTestSummaryPrompt } from './prompts/test-summary.js'
import { Semaphore } from './semaphore.js'
import { db } from '../db/client.js'
import { appSettings, aiSummaries } from '../db/schema.js'
import { type AppEvent, runEmitter } from '../events.js'
import type { RunRecord, TestRecord } from '../runs/storage.js'
import * as storage from '../runs/storage.js'

const DATA_DIR = process.env.DATA_DIR ?? './data'
const CONCURRENCY = 3

interface LlmConfig {
  provider: string
  model: string
  apiKey: string
}

async function getLlmConfig(): Promise<LlmConfig | null> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ['llm_enabled', 'llm_provider', 'llm_model', 'llm_api_key']))
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  if (map.llm_enabled !== 'true') return null
  if (!map.llm_api_key || !map.llm_provider || !map.llm_model) return null
  const jwtSecret = process.env.JWT_SECRET ?? ''
  const apiKey = decrypt(map.llm_api_key, jwtSecret)
  return { provider: map.llm_provider, model: map.llm_model, apiKey }
}

function loadErrorContextMarkdown(
  runId: string,
  testId: string,
  attachments: TestRecord['attachments'],
): string | null {
  for (const att of attachments) {
    if (att.contentType === 'text/markdown' && att.filename) {
      try {
        const path = join(DATA_DIR, runId, 'attachments', testId, att.filename)
        return readFileSync(path, 'utf8')
      } catch {
        // file missing — skip
      }
    }
  }
  return null
}

function loadScreenshots(
  runId: string,
  testId: string,
  attachments: TestRecord['attachments'],
): { data: string; mediaType: string }[] {
  const images: { data: string; mediaType: string }[] = []
  for (const att of attachments) {
    if (att.contentType.startsWith('image/') && att.filename) {
      try {
        const path = join(DATA_DIR, runId, 'attachments', testId, att.filename)
        const data = readFileSync(path).toString('base64')
        images.push({ data, mediaType: att.contentType })
      } catch {
        // file missing — skip
      }
    }
  }
  return images
}

async function upsertSummary(
  entityType: 'run' | 'test',
  entityId: string,
  runId: string,
  status: 'generating' | 'done' | 'error',
  opts: { content?: string; errorMsg?: string; provider: string; model: string },
): Promise<void> {
  await db
    .insert(aiSummaries)
    .values({
      entityType,
      entityId,
      runId,
      status,
      content: opts.content ?? null,
      errorMsg: opts.errorMsg ?? null,
      provider: opts.provider,
      model: opts.model,
      generatedAt: status === 'done' ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [aiSummaries.entityType, aiSummaries.runId, aiSummaries.entityId],
      set: {
        status,
        content: opts.content ?? null,
        errorMsg: opts.errorMsg ?? null,
        provider: opts.provider,
        model: opts.model,
        generatedAt: status === 'done' ? new Date() : null,
      },
    })
}

export async function generateRunSummaries(runId: string): Promise<void> {
  const config = await getLlmConfig()
  if (!config) return

  const run = await storage.getRun(runId)
  if (!run) return

  const allTests = await storage.getTestResults(runId)
  const failedTests = allTests.filter(
    (t) => t.status === 'failed' || t.status === 'timedOut' || t.status === 'interrupted',
  )
  if (failedTests.length === 0) return

  const provider = getProvider(config.provider)
  const sem = new Semaphore(CONCURRENCY)

  const testSummaryResults: { title: string; summary: string }[] = []
  const failedTestErrors: { title: string; errors: { message: string }[] }[] = []

  await Promise.all(
    failedTests.map((test) =>
      sem.run(async () => {
        runEmitter.emit('event', {
          type: 'summary_test_start',
          runId,
          testId: test.testId,
        } satisfies AppEvent)

        failedTestErrors.push({ title: test.title, errors: test.errors })

        try {
          await upsertSummary('test', test.testId, runId, 'generating', config)
          const errorContext = loadErrorContextMarkdown(runId, test.testId, test.attachments)
          const images = loadScreenshots(runId, test.testId, test.attachments)
          const prompt = buildTestSummaryPrompt(test, { errorContextMarkdown: errorContext })
          const content = await provider.generateSummary({
            prompt,
            images,
            model: config.model,
            apiKey: config.apiKey,
          })
          await upsertSummary('test', test.testId, runId, 'done', { ...config, content })
          testSummaryResults.push({ title: test.title, summary: content })
          runEmitter.emit('event', {
            type: 'summary_test_done',
            runId,
            testId: test.testId,
          } satisfies AppEvent)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          await upsertSummary('test', test.testId, runId, 'error', { ...config, errorMsg })
          runEmitter.emit('event', {
            type: 'summary_test_error',
            runId,
            testId: test.testId,
            error: errorMsg,
          } satisfies AppEvent)
        }
      }),
    ),
  )

  runEmitter.emit('event', { type: 'summary_run_start', runId } satisfies AppEvent)
  try {
    await upsertSummary('run', runId, runId, 'generating', config)
    const prompt = buildRunSummaryPrompt(run, testSummaryResults, failedTestErrors)
    const content = await provider.generateSummary({
      prompt,
      images: [],
      model: config.model,
      apiKey: config.apiKey,
    })
    await upsertSummary('run', runId, runId, 'done', { ...config, content })
    runEmitter.emit('event', { type: 'summary_run_done', runId } satisfies AppEvent)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await upsertSummary('run', runId, runId, 'error', { ...config, errorMsg })
    runEmitter.emit('event', {
      type: 'summary_run_error',
      runId,
      error: errorMsg,
    } satisfies AppEvent)
  }
}
