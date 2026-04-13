import type { AnnotatedTestRecord, TestRecord } from './api.js'

export function annotateRetriedTests(tests: TestRecord[]): AnnotatedTestRecord[] {
  const byIdentity = new Map<string, TestRecord[]>()
  for (const test of tests) {
    const key = test.titlePath.join('\0')
    const group = byIdentity.get(key) ?? []
    group.push(test)
    byIdentity.set(key, group)
  }

  const retriedIds = new Set<string>()
  for (const group of byIdentity.values()) {
    if (group.length <= 1) continue

    const maxRetry = Math.max(...group.map((t) => t.retry))
    for (const test of group) {
      if (test.retry < maxRetry) retriedIds.add(test.testId)
    }
  }

  return tests.map((test) => (retriedIds.has(test.testId) ? { ...test, retried: true } : test))
}
