import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  useInvalidateRunSummary,
  useInvalidateTestSummary,
  useRunSummary,
  useTestSummary,
} from '../hooks/useAiSummary.js'
import { type AiSummary, regenerateRunSummary, regenerateTestSummary } from '../lib/api.js'

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
    <div className="flex flex-col gap-2 rounded-xl border border-tn-border bg-tn-panel p-4">
      <div className="flex items-center gap-3">
        <div
          className={[
            'h-4 w-4 animate-spin rounded-full border-2 border-tn-blue',
            'border-t-transparent shrink-0',
          ].join(' ')}
        />
        <p className="font-mono text-sm text-tn-fg">Generating summary…</p>
      </div>
      <p className="font-mono text-xs text-tn-muted">This may take up to 30 seconds</p>
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

function SummaryContent({ content }: { content: string | null }) {
  if (!content) return null
  return (
    <div className="text-sm text-tn-fg leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold text-tn-fg mt-4 mb-2 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-tn-fg mt-4 mb-2 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-tn-fg mt-3 mb-1 first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.startsWith('language-')
            return isBlock ? (
              <code className="block font-mono text-xs bg-tn-highlight text-tn-fg rounded p-3 mb-3 overflow-x-auto whitespace-pre">
                {children}
              </code>
            ) : (
              <code className="font-mono text-xs bg-tn-highlight text-tn-fg rounded px-1 py-0.5">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="mb-3">{children}</pre>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-tn-blue underline hover:opacity-80"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-tn-border pl-3 text-tn-muted mb-3">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-tn-border my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// -- Run summary tab --

export function RunAiSummaryTab({ runId }: { runId: string }) {
  const { data: summary, isLoading } = useRunSummary(runId)
  const invalidate = useInvalidateRunSummary()
  const qc = useQueryClient()
  const queryKey = ['run-summary', runId]
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    },
    [],
  )

  const mutation = useMutation({
    mutationFn: () => regenerateRunSummary(runId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey })
      const snapshot = qc.getQueryData<AiSummary | null>(queryKey)
      qc.setQueryData<AiSummary>(queryKey, {
        status: 'generating',
        content: null,
        errorMsg: null,
        generatedAt: null,
        model: snapshot?.model ?? '',
        provider: snapshot?.provider ?? '',
      })
      return snapshot
    },
    onError: (err, _vars, snapshot) => {
      if (err instanceof Error && err.message === 'HTTP 409') {
        invalidate(runId)
        setNotice('Generation already in progress')
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = setTimeout(() => setNotice(null), 4000)
        return
      }
      qc.setQueryData(queryKey, snapshot)
      invalidate(runId)
    },
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

  if (summary.status === 'generating' || summary.status === 'pending')
    return (
      <div>
        <GeneratingState />
        {notice && <p className="font-mono text-xs text-tn-muted mt-2">{notice}</p>}
      </div>
    )

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
      <SummaryContent content={summary.content} />
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
  const qc = useQueryClient()
  const queryKey = ['test-summary', runId, testId]
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    },
    [],
  )

  const mutation = useMutation({
    mutationFn: () => regenerateTestSummary(runId, testId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey })
      const snapshot = qc.getQueryData<AiSummary | null>(queryKey)
      qc.setQueryData<AiSummary>(queryKey, {
        status: 'generating',
        content: null,
        errorMsg: null,
        generatedAt: null,
        model: snapshot?.model ?? '',
        provider: snapshot?.provider ?? '',
      })
      return snapshot
    },
    onError: (err, _vars, snapshot) => {
      if (err instanceof Error && err.message === 'HTTP 409') {
        invalidate(runId, testId)
        setNotice('Generation already in progress')
        if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = setTimeout(() => setNotice(null), 4000)
        return
      }
      qc.setQueryData(queryKey, snapshot)
      invalidate(runId, testId)
    },
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

  if (summary.status === 'generating' || summary.status === 'pending')
    return (
      <div>
        <GeneratingState />
        {notice && <p className="font-mono text-xs text-tn-muted mt-2">{notice}</p>}
      </div>
    )

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
      <SummaryContent content={summary.content} />
      <SummaryFooter
        model={summary.model}
        generatedAt={summary.generatedAt}
        onRegenerate={() => mutation.mutate()}
        disabled={mutation.isPending}
      />
    </div>
  )
}
