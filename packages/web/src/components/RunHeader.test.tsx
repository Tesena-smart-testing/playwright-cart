import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RunWithTests, TestRecord } from '../lib/api.js'
import { annotateRetriedTests } from '../lib/retries.js'
import RunHeader from './RunHeader.js'

const createTest = (overrides: Partial<TestRecord> = {}): TestRecord => ({
  testId: overrides.testId ?? 'test-0',
  title: overrides.title ?? 'test title',
  tags: overrides.tags ?? [],
  titlePath: overrides.titlePath ?? ['project', 'file.spec.ts', 'suite', 'test title'],
  location: overrides.location ?? { file: 'file.spec.ts', line: 1, column: 1 },
  status: overrides.status ?? 'passed',
  duration: overrides.duration ?? 1000,
  errors: overrides.errors ?? [],
  retry: overrides.retry ?? 0,
  annotations: overrides.annotations ?? [],
  attachments: overrides.attachments ?? [],
})

const createRun = (tests: TestRecord[]): RunWithTests => ({
  runId: 'run-1',
  project: 'demo',
  branch: 'main',
  commitSha: 'abcdef123456',
  tags: [],
  startedAt: '2026-04-13T12:00:00.000Z',
  status: 'running',
  tests,
})

describe('RunHeader', () => {
  it('counts distinct final tests in top stats', () => {
    const tests = [
      createTest({
        testId: 'retry-0',
        retry: 0,
        status: 'failed',
        title: 'flaky test',
        titlePath: ['project', 'spec-a.ts', 'suite', 'flaky test'],
      }),
      createTest({
        testId: 'retry-1',
        retry: 1,
        status: 'failed',
        title: 'flaky test',
        titlePath: ['project', 'spec-a.ts', 'suite', 'flaky test'],
      }),
      createTest({
        testId: 'retry-2',
        retry: 2,
        status: 'passed',
        title: 'flaky test',
        titlePath: ['project', 'spec-a.ts', 'suite', 'flaky test'],
      }),
      ...Array.from({ length: 7 }, (_, index) =>
        createTest({
          testId: `pass-${index}`,
          title: `passing test ${index}`,
          titlePath: ['project', `pass-${index}.spec.ts`, 'suite', `passing test ${index}`],
        }),
      ),
      createTest({
        testId: 'fail-0',
        status: 'failed',
        title: 'final failed test',
        titlePath: ['project', 'final-fail.spec.ts', 'suite', 'final failed test'],
      }),
      createTest({
        testId: 'skip-0',
        status: 'skipped',
        title: 'skipped test',
        titlePath: ['project', 'skip.spec.ts', 'suite', 'skipped test'],
      }),
    ]

    const html = renderToStaticMarkup(
      <RunHeader run={{ ...createRun(tests), tests: annotateRetriedTests(tests) }} />,
    )

    expect(html).toContain('7 passed')
    expect(html).toContain('1 flaky')
    expect(html).toContain('1 failed')
    expect(html).toContain('1 skipped')
    expect(html).toContain('/ 10 total')
    expect(html).not.toContain('/ 12 total')
  })

  it('keeps final failed retried tests in failed bucket', () => {
    const tests = [
      createTest({
        testId: 'retry-fail-0',
        retry: 0,
        status: 'failed',
        title: 'still failing test',
        titlePath: ['project', 'spec-b.ts', 'suite', 'still failing test'],
      }),
      createTest({
        testId: 'retry-fail-1',
        retry: 1,
        status: 'failed',
        title: 'still failing test',
        titlePath: ['project', 'spec-b.ts', 'suite', 'still failing test'],
      }),
    ]

    const html = renderToStaticMarkup(
      <RunHeader run={{ ...createRun(tests), tests: annotateRetriedTests(tests) }} />,
    )

    expect(html).toContain('1 failed')
    expect(html).toContain('/ 1 total')
    expect(html).not.toContain('1 flaky')
  })
})
