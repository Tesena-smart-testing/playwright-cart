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
  function handleClick() {
    // url is always a same-origin /reports/... path — never accept external URLs
    const traceUrl = `/trace-viewer/?trace=${encodeURIComponent(window.location.origin + url)}`
    window.open(traceUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-full border border-tn-blue px-4 py-1.5 font-display text-xs font-semibold text-tn-blue transition-colors hover:bg-tn-blue/10"
    >
      ⎘ Open Trace ↗
    </button>
  )
}

function attachmentGlyph(contentType: string): string {
  if (contentType.startsWith('image/')) return '▣'
  if (contentType.startsWith('text/')) return '≡'
  if (contentType.startsWith('video/')) return '▶'
  if (contentType === 'application/zip') return '↓'
  return '→'
}
