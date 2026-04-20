# AI Summary Running Guard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide all AI Summary action buttons (Generate, Regenerate, Retry) and show an informational state when `run.status === 'running'`, preventing premature manual generation while the run is still in progress.

**Architecture:** Add a `RunningState` component to `AiSummaryTab.tsx`, add `runStatus: RunStatus` prop to both tab exports, and place a guard as the very first render check in each tab component. Parent pages (`RunDetailPage`, `TestDetailPage`) already have `run.status` in scope and simply pass it through. No backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS (TokyoNight tokens), Vitest (node environment), `renderToStaticMarkup` for component tests.

---

## File Map

| File | Change |
|------|--------|
| `packages/web/src/components/AiSummaryTab.tsx` | Add `RunningState`, update prop signatures, add guard at top of each tab |
| `packages/web/src/pages/RunDetailPage.tsx` | Pass `run.status` to `RunAiSummaryTab` |
| `packages/web/src/pages/TestDetailPage.tsx` | Pass `run.status` to `TestAiSummaryTab` |

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/ai-summary-running-guard
```

Expected: branch created, working tree clean.

- [ ] **Step 2: Verify branch**

```bash
git status
```

Expected: `On branch feature/ai-summary-running-guard`, nothing to commit.

---

## Task 2: Add `RunningState` component, update props, add guard

**Files:**
- Modify: `packages/web/src/components/AiSummaryTab.tsx`
- Test: `packages/web/src/components/AiSummaryTab.test.tsx` (create)

### Step-by-step

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/components/AiSummaryTab.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RunningState } from './AiSummaryTab.js'

describe('RunningState', () => {
  it('renders the running info message', () => {
    const html = renderToStaticMarkup(<RunningState />)
    expect(html).toContain('Tests are currently running')
    expect(html).toContain('Summary will be generated automatically')
    expect(html).toContain('if it is considered failed')
  })

  it('renders no buttons', () => {
    const html = renderToStaticMarkup(<RunningState />)
    expect(html).not.toContain('<button')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: FAIL — `RunningState` is not exported from `AiSummaryTab.js`.

- [ ] **Step 3: Add `RunningState` component and export it from `AiSummaryTab.tsx`**

Add this component after the existing `GeneratingState` function (around line 71), before `ErrorState`:

```tsx
export function RunningState() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-tn-blue bg-tn-panel p-4">
      <div className="flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full bg-tn-blue shrink-0 animate-pulse" />
        <p className="font-mono text-sm text-tn-blue">Tests are currently running</p>
      </div>
      <p className="font-mono text-xs text-tn-muted">
        Summary will be generated automatically once the run finishes, if it is considered failed.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Update `RunAiSummaryTab` prop signature and add guard**

Change the function signature from:

```tsx
export function RunAiSummaryTab({ runId }: { runId: string }) {
```

to:

```tsx
export function RunAiSummaryTab({ runId, runStatus }: { runId: string; runStatus: RunStatus }) {
```

Then add the guard as the very first line of the function body, before the hooks destructuring:

```tsx
export function RunAiSummaryTab({ runId, runStatus }: { runId: string; runStatus: RunStatus }) {
  if (runStatus === 'running') return <RunningState />

  const { data: summary, isLoading } = useRunSummary(runId)
  // ... rest unchanged
```

**Important:** The guard `if (runStatus === 'running') return <RunningState />` must come before any hook calls. React rules-of-hooks require that hooks are not called conditionally. Since `runStatus` is a prop (not state or an effect), placing the early return before the hooks is allowed — but only if you move it to before the `const { data: summary, isLoading } = ...` line. The `useState` and `useRef` calls must stay below this guard. Re-order the function body so the early return is first, followed by all hook calls.

The correct body structure:

```tsx
export function RunAiSummaryTab({ runId, runStatus }: { runId: string; runStatus: RunStatus }) {
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

  const mutation = useMutation({ /* unchanged */ })

  // SSE effect unchanged

  if (runStatus === 'running') return <RunningState />

  if (isLoading) return <GeneratingState />
  // ... rest of render logic unchanged
```

Note: the guard is placed *after* all hooks but *before* all render branches. This is the correct React pattern — hooks run unconditionally, the early return only affects what is rendered.

- [ ] **Step 5: Update `TestAiSummaryTab` prop signature and add guard identically**

Change the function signature from:

```tsx
export function TestAiSummaryTab({ runId, testId }: { runId: string; testId: string }) {
```

to:

```tsx
export function TestAiSummaryTab({ runId, testId, runStatus }: { runId: string; testId: string; runStatus: RunStatus }) {
```

Add the guard in the same position (after all hooks, before render branches):

```tsx
  // SSE effect unchanged ...

  if (runStatus === 'running') return <RunningState />

  if (isLoading) return <GeneratingState />
  // ... rest of render logic unchanged
```

- [ ] **Step 6: Add `RunStatus` import to `AiSummaryTab.tsx`**

The `RunStatus` type is already imported from `'../lib/api.js'` for the `AiSummary` type. Add `RunStatus` to the same import:

```tsx
import { type AiSummary, type RunStatus, regenerateRunSummary, regenerateTestSummary } from '../lib/api.js'
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: all tests PASS including the two new `RunningState` tests.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/AiSummaryTab.tsx packages/web/src/components/AiSummaryTab.test.tsx
git commit -m "feat(web): add RunningState guard to AI Summary tabs when run is in progress"
```

---

## Task 3: Update `RunDetailPage` call site

**Files:**
- Modify: `packages/web/src/pages/RunDetailPage.tsx:119`

- [ ] **Step 1: Pass `run.status` to `RunAiSummaryTab`**

Find line 119:

```tsx
{activeTab === 'summary' && llmEnabled && run && <RunAiSummaryTab runId={run.runId} />}
```

Change to:

```tsx
{activeTab === 'summary' && llmEnabled && run && <RunAiSummaryTab runId={run.runId} runStatus={run.status} />}
```

- [ ] **Step 2: Run typecheck to verify**

```bash
pnpm --filter @playwright-cart/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/RunDetailPage.tsx
git commit -m "feat(web): pass runStatus to RunAiSummaryTab in RunDetailPage"
```

---

## Task 4: Update `TestDetailPage` call site

**Files:**
- Modify: `packages/web/src/pages/TestDetailPage.tsx:100`

- [ ] **Step 1: Pass `run.status` to `TestAiSummaryTab`**

Find line 100:

```tsx
<TestAiSummaryTab runId={runId ?? ''} testId={test.testId} />
```

Change to:

```tsx
<TestAiSummaryTab runId={runId ?? ''} testId={test.testId} runStatus={run?.status ?? 'running'} />
```

Note: `run` is typed as `RunWithTests | undefined` in `TestDetailPage` (from `useRun`). Use `run?.status ?? 'running'` as the fallback — if `run` hasn't loaded yet, defaulting to `'running'` is safe because it hides the buttons until we know the real status. The `run` query resolves quickly since it's already cached by the time the test page renders.

- [ ] **Step 2: Run typecheck to verify**

```bash
pnpm --filter @playwright-cart/web typecheck
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm --filter @playwright-cart/web lint
```

Expected: no lint errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/TestDetailPage.tsx
git commit -m "feat(web): pass runStatus to TestAiSummaryTab in TestDetailPage"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run all web tests**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint and typecheck across full monorepo**

```bash
pnpm lint && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Start dev stack and manual verify**

```bash
pnpm dev
```

Open browser at `http://localhost:5173`.

**Verification checklist:**

1. Start or find a run with `status = 'running'` (the reporter creates these; alternatively open a run in the DB and manually set `status = 'running'` via `psql`)
2. Open the run detail page → click **✦ AI Summary** tab
3. Confirm: blue box with pulsing dot + "Tests are currently running" message appears
4. Confirm: no Generate, Regenerate, or Retry buttons are visible
5. Open a test within that run → click **✦ AI Summary** tab
6. Confirm: same blue box, no buttons
7. When run completes (status changes to `failed`/`passed`/etc.) via SSE `run:updated`, confirm tab automatically shows normal states (empty state with Generate button for non-failed, or generating/done for failed)
8. For a completed failed run: confirm Generate and Regenerate buttons are present and functional as before

- [ ] **Step 4: Final commit if any fixups were made**

If any minor fixups were needed during manual verification, commit them:

```bash
git add -p
git commit -m "fix(web): <describe fixup>"
```
