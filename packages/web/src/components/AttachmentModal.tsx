import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  url: string
  filename: string
  contentType: string
  onClose: () => void
}

type CopyState = 'idle' | 'success' | 'error'

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export default function AttachmentModal({ url, filename, contentType, onClose }: Props) {
  const titleId = useId()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; Escape key handled via useEffect
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled via useEffect above
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only; keyboard navigation handled by backdrop useEffect */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-[75vw] h-[75vh] flex-col overflow-hidden rounded-xl border border-tn-border bg-tn-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader filename={filename} titleId={titleId} onClose={onClose} />

        {contentType.startsWith('image/') ? (
          <ImageBody url={url} filename={filename} contentType={contentType} />
        ) : (
          <TextBody url={url} filename={filename} contentType={contentType} />
        )}
      </div>
    </div>,
    document.body,
  )
}

function ModalHeader({
  filename,
  titleId,
  onClose,
}: {
  filename: string
  titleId: string
  onClose: () => void
}) {
  return (
    <header className="flex items-center justify-between border-b border-tn-border px-4 py-3">
      <span id={titleId} className="truncate font-mono text-sm text-tn-fg">
        {filename}
      </span>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="ml-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-tn-border text-xs text-tn-muted transition-colors hover:border-tn-fg hover:text-tn-fg"
      >
        ✕
      </button>
    </header>
  )
}

function ModalFooter({
  contentType,
  copyState,
  onCopy,
  onDownload,
  copyDisabled,
}: {
  contentType: string
  copyState: CopyState
  onCopy: () => void
  onDownload: () => void
  copyDisabled?: boolean
}) {
  return (
    <footer className="flex items-center justify-between border-t border-tn-border px-4 py-2">
      <span className="font-mono text-xs text-tn-muted">{contentType}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCopy}
          disabled={copyDisabled}
          className="inline-flex items-center rounded-full border border-tn-blue px-3 py-1 font-display text-xs font-semibold text-tn-blue transition-colors hover:bg-tn-blue/10 disabled:opacity-40 disabled:cursor-not-allowed"
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  async function handleCopy() {
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      if (mountedRef.current) setCopyState('success')
    } catch {
      if (mountedRef.current) setCopyState('error')
    }
    if (!mountedRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopyState('idle'), 2000)
  }

  function handleDownload() {
    triggerDownload(url, filename)
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 items-center justify-center bg-tn-bg p-4">
        {imgError ? (
          <p className="text-sm text-tn-red">Failed to load image</p>
        ) : (
          <img
            src={url}
            alt={filename}
            className="max-h-full max-w-full rounded object-contain"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <ModalFooter
        contentType={contentType}
        copyState={copyState}
        onCopy={handleCopy}
        onDownload={handleDownload}
        copyDisabled={imgError}
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { credentials: 'include', signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed')
        return r.text()
      })
      .then(setText)
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') setFetchError(true)
      })
    return () => controller.abort()
  }, [url])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  async function handleCopy() {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('success')
    } catch {
      setCopyState('error')
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopyState('idle'), 2000)
  }

  function handleDownload() {
    triggerDownload(url, filename)
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-auto bg-tn-bg p-4">
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
        copyDisabled={text === null}
      />
    </>
  )
}
