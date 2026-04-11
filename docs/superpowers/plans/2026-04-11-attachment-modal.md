# Attachment Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace download-only links for image and text attachments on the test detail page with an inline modal viewer that also provides copy-to-clipboard and download buttons.

**Architecture:** A new `AttachmentModal` component handles rendering (image or text variant based on `contentType`), ESC/backdrop close, and copy/download actions. `AttachmentList` gains a single piece of active-attachment state; image/* and text/* items become buttons that open the modal instead of triggering a download.

**Tech Stack:** React 19, Tailwind CSS v4 (existing `--tn-*` theme tokens), Clipboard API (`navigator.clipboard.write` for images, `navigator.clipboard.writeText` for text).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `packages/web/src/components/AttachmentModal.tsx` | Full modal shell + image variant + text variant + shared footer |
| **Modify** | `packages/web/src/components/AttachmentList.tsx` | Add active-attachment state; wire image/text items to open modal |

No other files change. No new dependencies.

---

## Task 1: Create `AttachmentModal.tsx`

**Files:**
- Create: `packages/web/src/components/AttachmentModal.tsx`

> Note: `packages/web` has no component test harness. Functional verification is manual (see Task 3).

- [ ] **Step 1: Create the file with the full implementation**

Write `packages/web/src/components/AttachmentModal.tsx` with this exact content:

```tsx
import { useEffect, useState } from 'react'

interface Props {
  url: string
  filename: string
  contentType: string
  onClose: () => void
}

type CopyState = 'idle' | 'success' | 'error'

export default function AttachmentModal({ url, filename, contentType, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-tn-border bg-tn-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-tn-border px-4 py-3">
          <span className="truncate font-mono text-sm text-tn-fg">{filename}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-tn-border text-xs text-tn-muted transition-colors hover:border-tn-fg hover:text-tn-fg"
          >
            ✕
          </button>
        </header>

        {contentType.startsWith('image/') ? (
          <ImageBody url={url} filename={filename} contentType={contentType} />
        ) : (
          <TextBody url={url} filename={filename} contentType={contentType} />
        )}
      </div>
    </div>
  )
}

function ModalFooter({
  contentType,
  copyState,
  onCopy,
  onDownload,
}: {
  contentType: string
  copyState: CopyState
  onCopy: () => void
  onDownload: () => void
}) {
  return (
    <footer className="flex items-center justify-between border-t border-tn-border px-4 py-2">
      <span className="font-mono text-xs text-tn-muted">{contentType}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center rounded-full border border-tn-blue px-3 py-1 font-display text-xs font-semibold text-tn-blue transition-colors hover:bg-tn-blue/10"
        >
          {copyState === 'idle' ? '⎘ Copy' : copyState === 'success' ? 'Copied!' : 'Failed'}
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center rounded-full border border-tn-border px-3 py-1 font-display text-xs text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          ↓ Download
        </button>
      </div>
    </footer>
  )
}

function ImageBody({
  url,
  filename,
  contentType,
}: {
  url: string
  filename: string
  contentType: string
}) {
  const [imgError, setImgError] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  async function handleCopy() {
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopyState('success')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 2000)
  }

  function handleDownload() {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  return (
    <>
      <div className="flex min-h-48 items-center justify-center bg-tn-bg p-4">
        {imgError ? (
          <p className="text-sm text-tn-red">Failed to load image</p>
        ) : (
          <img
            src={url}
            alt={filename}
            className="max-h-[60vh] max-w-full rounded object-contain"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <ModalFooter
        contentType={contentType}
        copyState={copyState}
        onCopy={handleCopy}
        onDownload={handleDownload}
      />
    </>
  )
}

function TextBody({
  url,
  filename,
  contentType,
}: {
  url: string
  filename: string
  contentType: string
}) {
  const [text, setText] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.text()
      })
      .then(setText)
      .catch(() => setFetchError(true))
  }, [url])

  async function handleCopy() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('success')
    } catch {
      setCopyState('error')
    }
    setTimeout(() => setCopyState('idle'), 2000)
  }

  function handleDownload() {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  return (
    <>
      <div className="max-h-[60vh] overflow-auto bg-tn-bg p-4">
        {fetchError ? (
          <p className="text-sm text-tn-red">Failed to load content</p>
        ) : text === null ? (
          <p className="text-sm text-tn-muted">Loading…</p>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-tn-fg">
            {text}
          </pre>
        )}
      </div>
      <ModalFooter
        contentType={contentType}
        copyState={copyState}
        onCopy={handleCopy}
        onDownload={handleDownload}
      />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/AttachmentModal.tsx
git commit -m "feat(web): add AttachmentModal for inline image and text viewing"
```

---

## Task 2: Wire `AttachmentList.tsx` to open the modal

**Files:**
- Modify: `packages/web/src/components/AttachmentList.tsx`

- [ ] **Step 1: Replace the file contents**

Replace `packages/web/src/components/AttachmentList.tsx` with:

```tsx
import { useState } from 'react'
import AttachmentModal from './AttachmentModal.js'
import type { TestRecord } from '../lib/api.js'

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
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/AttachmentList.tsx
git commit -m "feat(web): open image and text attachments in inline modal"
```

---

## Task 3: Verify and final commit

**Files:** none changed

- [ ] **Step 1: Run lint**

```bash
cd /home/radek/repos/personal/playwright-cart
pnpm lint
```

Expected: no errors. If Biome reports style issues (single quotes, line width), fix them in the flagged file and re-run.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors. Common issue to watch for: `ClipboardItem` may need `lib: ["DOM"]` in tsconfig — check `packages/web/tsconfig.json` if you see a "ClipboardItem is not defined" error. It should already be present since the project targets modern browsers.

- [ ] **Step 3: Start dev server and verify manually**

```bash
pnpm dev
```

Open the browser and navigate to a test detail page that has attachments. Verify:

1. Clicking a screenshot attachment opens the centered modal — image is visible
2. Pressing ESC closes the modal
3. Clicking the backdrop (outside dialog) closes the modal
4. Clicking ✕ button closes the modal
5. Clicking "⎘ Copy" — button briefly shows "Copied!", image is on clipboard (paste into an image editor or Slack to confirm)
6. Clicking "↓ Download" — browser downloads the file
7. Clicking a text attachment opens the modal — text content is visible and scrollable
8. Clicking "⎘ Copy" — button shows "Copied!", text is on clipboard
9. Trace attachments still open the Playwright trace viewer (unchanged)
10. Video or zip attachments (if any) still show as download links (unchanged)
