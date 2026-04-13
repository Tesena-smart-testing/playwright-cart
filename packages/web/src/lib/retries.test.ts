import { describe, expect, it } from 'vitest'
import type { TestRecord } from './api.js'
import { annotateRetriedTests } from './retries.js'

const createTest = (overrides: Partial<TestRecord> = {}): TestRecord => ({
  testId: overrides.testId ?? 'test-0',
  title: overrides.title ?? 'test title',
  tags: overrides.tags ?? [],
  titlePath: overrides.titlePath ?? ['project', 'file.spec.ts', 'suite', 'test title'],
  location: overrides.location ?? { file: 'file.spec.ts', line: 1, column: 1 },
  status: overrides.status ?? 'failed',
  duration: overrides.duration ?? 1000,
  errors: overrides.errors ?? [],
  retry: overrides.retry ?? 0,
  annotations: overrides.annotations ?? [],
  attachments: overrides.attachments ?? [],
})

describe('annotateRetriedTests', () => {
  it('leaves single attempt unchanged', () => {
    const tests = [createTest()]

    expect(annotateRetriedTests(tests)).toEqual(tests)
  })

  it('marks all non-final failed attempts as retried', () => {
    const tests = [
      createTest({ testId: 'attempt-0', retry: 0, status: 'failed' }),
      createTest({ testId: 'attempt-1', retry: 1, status: 'failed' }),
      createTest({ testId: 'attempt-2', retry: 2, status: 'failed' }),
    ]

    expect(annotateRetriedTests(tests)).toEqual([
      { ...tests[0], retried: true },
      { ...tests[1], retried: true },
      tests[2],
    ])
  })

  it('marks all non-final attempts as retried when final attempt passes', () => {
    const tests = [
      createTest({ testId: 'attempt-0', retry: 0, status: 'failed' }),
      createTest({ testId: 'attempt-1', retry: 1, status: 'timedOut' }),
      createTest({ testId: 'attempt-2', retry: 2, status: 'passed' }),
    ]

    expect(annotateRetriedTests(tests)).toEqual([
      { ...tests[0], retried: true },
      { ...tests[1], retried: true },
      tests[2],
    ])
  })

  it('groups retries by title path only', () => {
    const tests = [
      createTest({
        testId: 'group-a-0',
        retry: 0,
        titlePath: ['project', 'a.spec.ts', 'suite', 'same title'],
      }),
      createTest({
        testId: 'group-a-1',
        retry: 1,
        status: 'passed',
        titlePath: ['project', 'a.spec.ts', 'suite', 'same title'],
      }),
      createTest({
        testId: 'group-b-0',
        retry: 0,
        status: 'failed',
        titlePath: ['project', 'b.spec.ts', 'suite', 'other title'],
      }),
    ]

    expect(annotateRetriedTests(tests)).toEqual([
      { ...tests[0], retried: true },
      tests[1],
      tests[2],
    ])
  })
})
