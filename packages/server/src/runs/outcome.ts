interface WithStatusAndAnnotations {
  status: string
  annotations: Array<{ type: string; description?: string }>
}

export function applyOutcomeInversion<T extends WithStatusAndAnnotations>(test: T): T {
  const hasFailAnnotation = test.annotations.some((a) => a.type === 'fail')
  if (!hasFailAnnotation) return test
  if (test.status === 'failed') return { ...test, status: 'passed' }
  if (test.status === 'passed') return { ...test, status: 'failed' }
  return test
}
