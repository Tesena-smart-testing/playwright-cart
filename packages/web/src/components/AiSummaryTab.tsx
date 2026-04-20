import { useMutation } from '@tanstack/react-query'
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
  disabled,
}: {
  model: string
  generatedAt: string | null
  onRegenerate: () => void
  disabled?: boolean
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
        disabled={disabled}
        className={[
          'border border-tn-border px-3 py-1 font-mono text-xs text-tn-fg',
          'hover:bg-tn-highlight rounded-lg',
          'disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      >
        {disabled ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 animate-spin rounded-full border border-tn-fg border-t-transparent" />
            Regenerating…
          </span>
        ) : (
          '↺ Regenerate'
        )}
      </button>
    </div>
  )
}

function GeneratingState() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-tn-border bg-tn-panel p-4">
      <div
        className={[
          'h-4 w-4 animate-spin rounded-full border-2 border-tn-blue',
          'border-t-transparent shrink-0',
        ].join(' ')}
      />
      <p className="font-mono text-sm text-tn-fg">Generating summary…</p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
  disabled,
}: {
  message: string | null
  onRetry: () => void
  disabled?: boolean
}) {
  return (
    <div className="rounded-xl border border-tn-red bg-tn-panel p-4">
      <p className="font-mono text-sm font-semibold text-tn-red mb-1">
        ⚠ Summary generation failed
      </p>
      {message && <p className="font-mono text-xs text-tn-muted mb-3">{message}</p>}
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className={[
          'border border-tn-border px-3 py-1 font-mono text-xs text-tn-fg',
          'hover:bg-tn-highlight rounded-lg',
          'disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      >
        {disabled ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 animate-spin rounded-full border border-tn-fg border-t-transparent" />
            Retrying…
          </span>
        ) : (
          '↺ Retry'
        )}
      </button>
    </div>
  )
}

function EmptyState({ onGenerate, disabled }: { onGenerate: () => void; disabled?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-tn-border bg-tn-panel p-6 text-center">
      <p className="font-mono text-sm text-tn-muted mb-1">No summary available</p>
      <p className="font-mono text-xs text-tn-muted mb-4">
        AI summaries are only generated for failed runs
      </p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled}
        className={[
          'border border-tn-border px-3 py-1 font-mono text-xs text-tn-fg',
          'hover:bg-tn-highlight rounded-lg',
          'disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      >
        {disabled ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 animate-spin rounded-full border border-tn-fg border-t-transparent" />
            Generating…
          </span>
        ) : (
          'Generate now'
        )}
      </button>
    </div>
  )
}

// -- Run summary tab --

export function RunAiSummaryTab({ runId }: { runId: string }) {
  const { data: summary, isLoading } = useRunSummary(runId)
  const invalidate = useInvalidateRunSummary()

  const mutation = useMutation({
    mutationFn: () => regenerateRunSummary(runId),
    onSuccess: () => invalidate(runId),
  })

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
    es.addEventListener('error', () => {
      es.close()
    })
    return () => es.close()
  }, [runId, invalidate])

  if (isLoading) return <GeneratingState />

  if (!summary)
    return <EmptyState onGenerate={() => mutation.mutate()} disabled={mutation.isPending} />

  if (summary.status === 'generating' || summary.status === 'pending') return <GeneratingState />

  if (summary.status === 'error') {
    return (
      <ErrorState
        message={summary.errorMsg}
        onRetry={() => mutation.mutate()}
        disabled={mutation.isPending}
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
        onRegenerate={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
    </div>
  )
}

// -- Test summary tab --

export function TestAiSummaryTab({ runId, testId }: { runId: string; testId: string }) {
  const { data: summary, isLoading } = useTestSummary(runId, testId)
  const invalidate = useInvalidateTestSummary()

  const mutation = useMutation({
    mutationFn: () => regenerateTestSummary(runId, testId),
    onSuccess: () => invalidate(runId, testId),
  })

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
    es.addEventListener('error', () => {
      es.close()
    })
    return () => es.close()
  }, [runId, testId, invalidate])

  if (isLoading) return <GeneratingState />

  if (!summary)
    return <EmptyState onGenerate={() => mutation.mutate()} disabled={mutation.isPending} />

  if (summary.status === 'generating' || summary.status === 'pending') return <GeneratingState />

  if (summary.status === 'error') {
    return (
      <ErrorState
        message={summary.errorMsg}
        onRetry={() => mutation.mutate()}
        disabled={mutation.isPending}
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
        onRegenerate={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
    </div>
  )
}
