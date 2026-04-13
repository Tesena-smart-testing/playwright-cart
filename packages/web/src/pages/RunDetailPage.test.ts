import { describe, expect, it } from 'vitest'
import type { AnnotatedTestRecord } from '../lib/api.js'
import { buildDefaultOpenPaths, buildSuiteTree, getSuitePathKey } from './RunDetailPage.js'

const createTest = (overrides: Partial<AnnotatedTestRecord> = {}): AnnotatedTestRecord => ({
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
  retried: overrides.retried,
})

describe('RunDetailPage tree defaults', () => {
  it('opens ancestors of ultimately failed tests and keeps passing branches closed', () => {
    const tests = [
      createTest({
        testId: 'failed-final',
        status: 'failed',
        titlePath: ['project', 'failed.spec.ts', 'checkout', 'shows error'],
      }),
      createTest({
        testId: 'passed-final',
        status: 'passed',
        titlePath: ['project', 'passed.spec.ts', 'checkout', 'renders summary'],
      }),
    ]

    const suites = buildSuiteTree(tests)
    const openPaths = buildDefaultOpenPaths(tests)

    expect([...suites.keys()]).toEqual(['project'])
    expect(openPaths.has(getSuitePathKey(['project']))).toBe(true)
    expect(openPaths.has(getSuitePathKey(['project', 'failed.spec.ts']))).toBe(true)
    expect(openPaths.has(getSuitePathKey(['project', 'failed.spec.ts', 'checkout']))).toBe(true)
    expect(openPaths.has(getSuitePathKey(['project', 'passed.spec.ts']))).toBe(false)
  })

  it('does not auto-open flaky tests that ultimately pass', () => {
    const tests = [
      createTest({
        testId: 'retry-0',
        status: 'failed',
        retry: 0,
        retried: true,
        titlePath: ['project', 'flaky.spec.ts', 'suite', 'flaky test'],
      }),
      createTest({
        testId: 'retry-1',
        status: 'passed',
        retry: 1,
        titlePath: ['project', 'flaky.spec.ts', 'suite', 'flaky test'],
      }),
    ]

    const openPaths = buildDefaultOpenPaths(tests)

    expect(openPaths.has(getSuitePathKey(['project']))).toBe(false)
    expect(openPaths.has(getSuitePathKey(['project', 'flaky.spec.ts']))).toBe(false)
  })

  it('opens timed out final failures', () => {
    const tests = [
      createTest({
        testId: 'timed-out-final',
        status: 'timedOut',
        titlePath: ['project', 'slow.spec.ts', 'suite', 'slow test'],
      }),
    ]

    const openPaths = buildDefaultOpenPaths(tests)

    expect(openPaths.has(getSuitePathKey(['project']))).toBe(true)
    expect(openPaths.has(getSuitePathKey(['project', 'slow.spec.ts']))).toBe(true)
    expect(openPaths.has(getSuitePathKey(['project', 'slow.spec.ts', 'suite']))).toBe(true)
  })
})
