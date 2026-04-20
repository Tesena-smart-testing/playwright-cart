import { useEffect } from 'react'
import {
  useInvalidateRunSummary,
  useInvalidateTestSummary,
  useRunSummary,
  useTestSummary,
} from '../hooks/useAiSummary.js'
import { regenerateRunSummary, regenerateTestSummary } from '../lib/api.js'

// -- Shared sub-components --

function SummaryFooter({
  model,
  generatedAt,
  onRegenerate,
}: {
  model: string
  generatedAt: string | null
  onRegenerate: () => void
}) {
  const age = generatedAt ? new Date(generatedAt).toLocaleString() : null

  return (
    <div className="flex items-center justify-between border-t border-tn-border pt-3 mt-3">
      <p className="font-mono text-xs text-tn-muted">
        ✦ {model}
        {age ? ` · Generated ${age}` : ''}
      </p>
      <button
        type="button"
        onClick={onRegenerate}
        className="border border-tn-border px-3 py-1 font-mono text-xs text-tn-fg hover:bg-tn-highlight rounded-lg"
      >
        ↺ Regenerate
      </button>
    </div>
  )
}

function GeneratingState() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-tn-border bg-tn-panel p-4">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-tn-blue border-t-transparent shrink-0" />
      <p className="font-mono text-sm text-tn-fg">Generating summary…</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-tn-red bg-tn-panel p-4">
      <p className="font-mono text-sm font-semibold text-tn-red mb-1">
        ⚠ Summary generation failed
      </p>
      {message && <p className="font-mono text-xs text-tn-muted mb-3">{message}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="border border-tn-border px-3 py-1 font-mono text-xs text-tn-fg hover:bg-tn-highlight rounded-lg"
      >
        ↺ Retry
      </button>
    </div>
  )
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-tn-border bg-tn-panel p-6 text-center">
      <p className="font-mono text-sm text-tn-muted mb-1">No summary available</p>
      <p className="font-mono text-xs text-tn-muted mb-4">
        AI summaries are only generated for failed runs
      </p>
      <button
        type="button"
        onClick={onGenerate}
        className="border border-tn-border px-3 py-1 font-mono text-xs text-tn-fg hover:bg-tn-highlight rounded-lg"
      >
        Generate now
      </button>
    </div>
  )
}

// -- Run summary tab --

export function RunAiSummaryTab({ runId }: { runId: string }) {
  const { data: summary, isLoading } = useRunSummary(runId)
  const invalidate = useInvalidateRunSummary()

  // SSE: invalidate on summary_run_done / summary_run_error
  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true })
    es.addEventListener('summary_run_done', (e) => {
      const data = JSON.parse(e.data) as { runId: string }
      if (data.runId === runId) invalidate(runId)
    })
    es.addEventListener('summary_run_error', (e) => {
      const data = JSON.parse(e.data) as { runId: string }
      if (data.runId === runId) invalidate(runId)
    })
    return () => es.close()
  }, [runId, invalidate])

  if (isLoading) return <GeneratingState />

  if (!summary)
    return (
      <EmptyState onGenerate={() => regenerateRunSummary(runId).then(() => invalidate(runId))} />
    )

  if (summary.status === 'generating' || summary.status === 'pending') return <GeneratingState />

  if (summary.status === 'error') {
    return (
      <ErrorState
        message={summary.errorMsg}
        onRetry={() => regenerateRunSummary(runId).then(() => invalidate(runId))}
      />
    )
  }

  return (
    <div className="rounded-xl border border-tn-border bg-tn-panel p-4">
      <pre className="whitespace-pre-wrap font-mono text-sm text-tn-fg leading-relaxed">
        {summary.content}
      </pre>
      <SummaryFooter
        model={summary.model}
        generatedAt={summary.generatedAt}
        onRegenerate={() => regenerateRunSummary(runId).then(() => invalidate(runId))}
      />
    </div>
  )
}

// -- Test summary tab --

export function TestAiSummaryTab({ runId, testId }: { runId: string; testId: string }) {
  const { data: summary, isLoading } = useTestSummary(runId, testId)
  const invalidate = useInvalidateTestSummary()

  // SSE: invalidate on summary_test_done / summary_test_error matching this test
  useEffect(() => {
    const es = new EventSource('/api/events', { withCredentials: true })
    es.addEventListener('summary_test_done', (e) => {
      const data = JSON.parse(e.data) as { runId: string; testId: string }
      if (data.runId === runId && data.testId === testId) invalidate(runId, testId)
    })
    es.addEventListener('summary_test_error', (e) => {
      const data = JSON.parse(e.data) as { runId: string; testId: string }
      if (data.runId === runId && data.testId === testId) invalidate(runId, testId)
    })
    return () => es.close()
  }, [runId, testId, invalidate])

  if (isLoading) return <GeneratingState />

  if (!summary)
    return (
      <EmptyState
        onGenerate={() =>
          regenerateTestSummary(runId, testId).then(() => invalidate(runId, testId))
        }
      />
    )

  if (summary.status === 'generating' || summary.status === 'pending') return <GeneratingState />

  if (summary.status === 'error') {
    return (
      <ErrorState
        message={summary.errorMsg}
        onRetry={() => regenerateTestSummary(runId, testId).then(() => invalidate(runId, testId))}
      />
    )
  }

  return (
    <div className="rounded-xl border border-tn-border bg-tn-panel p-4">
      <pre className="whitespace-pre-wrap font-mono text-sm text-tn-fg leading-relaxed">
        {summary.content}
      </pre>
      <SummaryFooter
        model={summary.model}
        generatedAt={summary.generatedAt}
        onRegenerate={() =>
          regenerateTestSummary(runId, testId).then(() => invalidate(runId, testId))
        }
      />
    </div>
  )
}
