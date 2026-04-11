import { useState } from 'react'
import type { TestRecord } from '../lib/api.js'
import AttachmentModal from './AttachmentModal.js'

interface Props {
  runId: string
  testId: string
  attachments: TestRecord['attachments']
}

export default function AttachmentList({ runId, testId, attachments }: Props) {
  const [active, setActive] = useState<{
    url: string
    filename: string
    contentType: string
  } | null>(null)

  const items = attachments.filter((a) => a.filename)

  if (items.length === 0) return null

  return (
    <>
      <div>
        <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-tn-muted">
          Attachments
        </h3>
        <div className="flex flex-wrap gap-2">
          {items.map((att) => {
            const url = `/reports/${runId}/attachments/${testId}/${att.filename ?? ''}`
            const isTrace = att.name === 'trace' || att.filename?.endsWith('.zip')
            const isViewable =
              att.contentType.startsWith('image/') || att.contentType.startsWith('text/')

            if (isTrace) {
              return <TraceButton key={att.filename ?? att.name} url={url} />
            }

            if (isViewable) {
              return (
                <button
                  key={att.filename ?? att.name}
                  type="button"
                  onClick={() =>
                    setActive({
                      url,
                      filename: att.filename ?? att.name,
                      contentType: att.contentType,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-tn-border px-4 py-1.5 font-display text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
                >
                  {attachmentGlyph(att.contentType)} {att.name}
                </button>
              )
            }

            return (
              <a
                key={att.filename ?? att.name}
                href={url}
                download={att.filename}
                className="inline-flex items-center gap-2 rounded-full border border-tn-border px-4 py-1.5 font-display text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
              >
                {attachmentGlyph(att.contentType)} {att.name}
              </a>
            )
          })}
        </div>
      </div>

      {active && (
        <AttachmentModal
          url={active.url}
          filename={active.filename}
          contentType={active.contentType}
          onClose={() => setActive(null)}
        />
      )}
    </>
  )
}

function TraceButton({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  async function handleClick() {
    setState('loading')
    try {
      const res = await fetch('/api/report-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: url }),
      })
      if (!res.ok) throw new Error('Failed to get token')
      const { token } = (await res.json()) as { token: string }
      const traceUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(
        `${window.location.origin + url}?token=${token}`,
      )}`
      window.open(traceUrl, '_blank', 'noopener,noreferrer')
      setState('idle')
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-2 rounded-full border border-tn-blue px-4 py-1.5 font-display text-xs font-semibold text-tn-blue transition-colors hover:bg-tn-blue/10 disabled:opacity-50"
    >
      {state === 'loading' ? 'Opening…' : state === 'error' ? 'Failed — retry' : '⎘ Open Trace ↗'}
    </button>
  )
}

function attachmentGlyph(contentType: string): string {
  if (contentType.startsWith('image/')) return '▣'
  if (contentType.startsWith('video/')) return '▶'
  if (contentType === 'application/zip') return '↓'
  return '→'
}
