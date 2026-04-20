# AI Summary Running Guard — Design Spec

**Date:** 2026-04-20  
**Status:** Approved

---

## Context

When a Playwright test run is in progress (`run.status === 'running'`), the AI Summary tab currently shows Generate / Regenerate / Retry buttons. These are misleading — the run hasn't finished, so there's nothing useful to summarise yet, and the server will auto-generate a summary when the run completes (if it fails). Allowing manual generation at this point creates confusion and unnecessary LLM calls.

The fix: when `run.status === 'running'`, replace the entire AI Summary tab content with an informational state that explains what will happen automatically.

---

## Scope

- Applies to both **Run AI Summary** (`RunAiSummaryTab`) and **Test AI Summary** (`TestAiSummaryTab`)
- Frontend-only change — no backend modifications required
- Guard lifts automatically when the run completes (SSE `run:updated` already invalidates the run query)

---

## UI Design

### `RunningState` component

Blue-bordered informational box. Pulsing dot signals active state without implying the AI is working.

```
┌─────────────────────────────────────────────────────┐  ← blue border
│  ● Tests are currently running                       │  ← pulsing blue dot
│    Summary will be generated automatically once the  │
│    run finishes, if it is considered failed.         │
└─────────────────────────────────────────────────────┘
```

**Styling:** matches existing `GeneratingState` visual weight — `border-tn-blue`, `bg-tn-panel`, `rounded-xl`, `p-4`. Pulsing dot via CSS animation (same pulse keyframe as TokyoNight theme uses elsewhere).

### Behaviour

- Shown **before any other state check** — overrides loading, generating, error, empty, done
- No buttons rendered at all
- When run completes: `run:updated` SSE event → React Query invalidates `['run', runId]` → component re-renders with normal states

---

## Architecture

### Prop changes

| Component | Before | After |
|-----------|--------|-------|
| `RunAiSummaryTab` | `{ runId: string }` | `{ runId: string; runStatus: RunStatus }` |
| `TestAiSummaryTab` | `{ runId: string; testId: string }` | `{ runId: string; testId: string; runStatus: RunStatus }` |

`RunStatus` type already exists in `packages/web/src/lib/api.ts`.

### Call sites

**`RunDetailPage.tsx` (line 119):**
```tsx
// before
<RunAiSummaryTab runId={run.runId} />
// after
<RunAiSummaryTab runId={run.runId} runStatus={run.status} />
```

**`TestDetailPage.tsx` (line 100):**
```tsx
// before
<TestAiSummaryTab runId={runId} testId={test.testId} />
// after
<TestAiSummaryTab runId={runId} testId={test.testId} runStatus={run.status} />
```

Both pages already have `run` in scope with no new fetches required.

---

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/components/AiSummaryTab.tsx` | Add `RunningState` component; add `runStatus` prop to both tab exports; add guard as first render check |
| `packages/web/src/pages/RunDetailPage.tsx` | Pass `run.status` to `RunAiSummaryTab` |
| `packages/web/src/pages/TestDetailPage.tsx` | Pass `run.status` to `TestAiSummaryTab` |

---

## Verification

1. Start a run (or mock `run.status = 'running'` in dev tools / React Query cache)
2. Open the AI Summary tab — `RunningState` renders, no buttons visible
3. Open a test detail within that run — same guard applies
4. When run completes (status changes) — tab automatically switches to normal states (empty/generating/done/error)
5. Run `pnpm lint` and `pnpm typecheck` — no errors
6. For a completed failed run — Generate/Regenerate buttons still appear normally
