# Attachment Modal — Design Spec

**Date:** 2026-04-11  
**Status:** Approved

---

## Context

The test detail page (`TestDetailPage.tsx`) shows a list of attachments (screenshots, error-context text, traces, etc.) in a right-side panel. Currently all non-trace attachments are rendered as download links — clicking them triggers a browser file download. Users have no way to view a screenshot or read error-context text without leaving the page.

This change makes image and text attachments viewable inline, in a centered modal dialog, without leaving the test detail view. A copy button and download button are provided in the modal footer.

---

## Scope

**In scope:**
- `image/*` attachments → open in image modal (view full-size, copy to clipboard as image, download)
- `text/*` attachments → open in text modal (read content, copy text to clipboard, download)
- Trace attachments (name=`trace` or `.zip` extension) → **unchanged** (existing trace viewer button)
- All other content types (video, application/zip, etc.) → **unchanged** (download link)

**Out of scope:**
- Video playback in modal
- Multi-attachment navigation (prev/next arrows)
- Zoom / pan on images

---

## Design

### Modal shell (shared)

Centered dialog overlaid on a semi-transparent backdrop (`rgba(10,10,18,0.82)`). Styled to match the existing Tokyo Night / Forge Dark theme using `--tn-*` CSS variables.

Structure:
```
┌─ header ──────────────────────────── [✕] ─┐
│  filename.ext                               │
├─ content area ──────────────────────────── ┤
│  <img> or <pre> (scrollable)                │
├─ footer ──────────────────────────────────  ┤
│  content-type · size        [⎘ Copy] [↓ DL] │
└─────────────────────────────────────────────┘
```

**Close behaviour:** backdrop click, ESC keypress, X button — all close the modal.

### Image variant

- `<img src={url} />` — browser sends session cookie, no additional token needed
- Displayed with `max-width: 100%` and `max-height: 70vh`, centered
- **Copy:** `fetch(url, { credentials: 'include' })` → `Blob` → `ClipboardItem({ [blob.type]: blob })` → `navigator.clipboard.write()`
- **Download:** programmatic `<a href download>` click using the existing URL

### Text variant

- On modal open: `fetch(url, { credentials: 'include' })` → `.text()` → stored in local state
- Displayed in a scrollable `<pre>` with monospace font, matching existing `ErrorBlock` styling
- Shows loading state while fetching, error state if fetch fails
- **Copy:** `navigator.clipboard.writeText(content)`
- **Download:** programmatic `<a href download>` click using the existing URL

### Copy button states

Both variants share the same copy feedback pattern:
- `idle` → label "⎘ Copy"
- `success` → label "Copied!" for 2 seconds, then back to idle
- `error` → label "Failed" for 2 seconds, then back to idle

---

## Files Changed

| File | Change |
|------|--------|
| `packages/web/src/components/AttachmentModal.tsx` | **New** — modal component (image + text variants) |
| `packages/web/src/components/AttachmentList.tsx` | Modified — image/* and text/* trigger modal instead of download |

### `AttachmentModal.tsx` interface

```ts
interface Props {
  url: string
  filename: string
  contentType: string
  onClose: () => void
}
```

### `AttachmentList.tsx` state addition

```ts
const [active, setActive] = useState<{
  url: string
  filename: string
  contentType: string
} | null>(null)
```

Image and text attachment items become `<button>` elements that call `setActive(...)` on click. The modal renders at the bottom of the component when `active !== null`.

---

## Error Handling

- Image load failure: show an inline error message within the modal content area
- Text fetch failure: show "Failed to load content" with a retry option is not needed — user can just download instead
- Clipboard API unavailable (non-HTTPS non-localhost): Copy button shows "Failed" error state — no need to hide it, same feedback path as other errors

---

## Verification

1. Start dev stack (`pnpm dev`)
2. Navigate to a test detail page that has image attachments
3. Click a screenshot → modal opens, image visible
4. Click "⎘ Copy" → image copied to clipboard (paste into an image editor to verify)
5. Click "↓ Download" → file downloads
6. Press ESC or click backdrop → modal closes
7. Navigate to a test with text attachments
8. Click text attachment → modal opens, text content visible
9. Click "⎘ Copy" → text on clipboard
10. Confirm trace attachments still open Playwright trace viewer (unchanged)
11. Confirm video/zip attachments still render as download links (unchanged)
12. Run `pnpm lint` and `pnpm typecheck` — both pass
