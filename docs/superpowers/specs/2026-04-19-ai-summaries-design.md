# AI Summaries Feature — Design Spec

**Date:** 2026-04-19
**Status:** Approved

---

## Context

Users need quick diagnosis of failed Playwright test runs and individual failed tests. Currently they must read raw error messages, stack traces, and screenshots manually. This feature adds AI-generated natural-language summaries that explain what failed and why, surfaced directly in the run and test detail pages.

The LLM integration is modular so additional providers (OpenAI, Gemini, etc.) can be added later without structural changes.

---

## Decisions Made

| Question | Decision |
|---|---|
| Trigger | Auto on run complete (server fire-and-forget) + manual regeneration |
| Artifacts sent to LLM | Errors, stack traces, test metadata, run metadata, screenshots (multimodal), error-context markdown attachments |
| Storage | Cached in DB with timestamp; overwritten on regeneration |
| Summary relationship | Bottom-up: test summaries generated first, run summary synthesised from them |
| Model selection | Admin picks from a curated list per provider |
| Progress visibility | SSE events on existing `/api/events` stream |
| UI placement | Dedicated "✦ AI Summary" tab alongside "Tests" tab on run detail and test detail pages |
| API key storage | AES-256-GCM encrypted using `JWT_SECRET` as key material; never returned via API (`isConfigured: bool` only) |
| Admin control | Enable/disable toggle + provider + model + API key in Admin settings tab |

---

## Database Schema

### New table: `ai_summaries`

```sql
id            bigserial PRIMARY KEY
entity_type   'run' | 'test'  (new pg enum: ai_entity_type)
entity_id     text NOT NULL           -- runId or testId string
run_id        text NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE
status        'pending' | 'generating' | 'done' | 'error'  (new pg enum: ai_summary_status)
content       text                    -- generated markdown, null until done
error_msg     text                    -- set on status = error
provider      text NOT NULL           -- e.g. 'anthropic'
model         text NOT NULL           -- e.g. 'claude-sonnet-4-6'
generated_at  timestamptz             -- set when status → done
```

**Unique index:** `(entity_type, run_id, entity_id)` — one summary per entity per run, upserted on regeneration. (For run summaries `entity_id = run_id`; for test summaries `entity_id = testId` scoped to `run_id`.)

### New `app_settings` keys

| Key | Value format | Notes |
|---|---|---|
| `llm_enabled` | `'true'` / `'false'` | Feature gate |
| `llm_provider` | `'anthropic'` | Provider identifier |
| `llm_model` | `'claude-sonnet-4-6'` | Model identifier |
| `llm_api_key` | AES-256-GCM ciphertext (hex) | Never returned via API |

---

## Server Architecture

### New directory: `packages/server/src/ai/`

```
src/ai/
  providers/
    types.ts          LLMProvider interface + SummaryPrompt type
    anthropic.ts      Anthropic implementation (@anthropic-ai/sdk, multimodal)
    index.ts          getProvider(name): LLMProvider factory
  prompts/
    test-summary.ts   builds prompt from TestRecord + artifact content
    run-summary.ts    builds prompt from test summaries + run metadata
  summarizer.ts       orchestrates pipeline, emits SSE, writes DB
  crypto.ts           encrypt/decrypt using JWT_SECRET (AES-256-GCM, node:crypto)
```

### `LLMProvider` interface (`types.ts`)

```typescript
interface LLMProvider {
  name: string
  availableModels: { id: string; label: string }[]
  generateSummary(opts: {
    prompt: string
    images: { data: string; mediaType: string }[]  // base64 screenshots
    model: string
    apiKey: string
  }): Promise<string>
}
```

Adding a new provider = create `openai.ts` implementing this interface + register in `index.ts`. No other changes.

### Curated models

**Anthropic:** `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`

### `summarizer.ts` pipeline

```
generateRunSummaries(runId)
  1. Load llm config from app_settings (decrypt API key)
  2. Fetch all failed tests for the run (with errors, annotations, attachments)
  3. For each failed test (bounded concurrency via a simple counter semaphore — server package implements its own, not shared with the reporter package):
       emit SSE summary_test_start
       build test prompt (errors + stack + annotations + error-context markdown + screenshots)
       provider.generateSummary(...)
       upsert ai_summaries (entity_type: 'test', status: 'done')
       emit SSE summary_test_done
       on error → upsert status: 'error', emit SSE summary_test_error
  4. Build run prompt from all successfully generated test summaries + run metadata
       (if no test summaries succeeded, fall back to raw error data from failed tests)
       emit SSE summary_run_start
       provider.generateSummary(...)
       upsert ai_summaries (entity_type: 'run', status: 'done')
       emit SSE summary_run_done
       on error → upsert status: 'error', emit SSE summary_run_error
```

**Trigger** (in `POST /api/runs/:runId/complete`):
```typescript
if (run.status === 'failed' && llmEnabled) {
  generateRunSummaries(runId).catch(err => console.error('[ai]', err))
}
```

### SSE event types (added to existing `/api/events` stream)

```typescript
| { type: 'summary_test_start'; runId: string; testId: string }
| { type: 'summary_test_done';  runId: string; testId: string }
| { type: 'summary_test_error'; runId: string; testId: string; error: string }
| { type: 'summary_run_start';  runId: string }
| { type: 'summary_run_done';   runId: string }
| { type: 'summary_run_error';  runId: string; error: string }
```

---

## API Routes

### Summary endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/runs/:runId/summary` | any authed | returns `{ status, content, generatedAt, model, provider }` |
| `GET` | `/api/runs/:runId/tests/:testId/summary` | any authed | same shape |
| `POST` | `/api/runs/:runId/summary/regenerate` | any authed | fire-and-forget, returns 202 |
| `POST` | `/api/runs/:runId/tests/:testId/summary/regenerate` | any authed | same |

### LLM settings endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/settings/llm` | any authed | returns `{ enabled, provider, model, isConfigured }` — never the key |
| `PATCH` | `/api/settings/llm` | admin | accepts `{ enabled?, provider?, model?, apiKey? }`; omitting `apiKey` preserves existing |

---

## Frontend

### New files

```
packages/web/src/
  components/
    AiSummaryTab.tsx        tab content component (used by both detail pages)
  hooks/
    useAiSummary.ts         react-query hook wrapping GET summary endpoints
    useLlmSettings.ts       react-query hook for GET /api/settings/llm
  lib/api.ts                add fetchRunSummary, fetchTestSummary, regenerateSummary,
                            fetchLlmSettings, updateLlmSettings
```

### Tab integration

`RunDetailPage.tsx` and `TestDetailPage.tsx`: add `"✦ AI Summary"` tab alongside existing `"Tests"` tab. Tab only rendered when `llmEnabled === true` (from settings). Active tab state managed via URL search param (`?tab=summary`).

### `AiSummaryTab` states

| Status | UI |
|---|---|
| `generating` | Spinner + "Generating summary… Analysing N failed tests" |
| `done` | Rendered markdown content + footer: model name · timestamp · "↺ Regenerate" button |
| `error` | Red border panel: "⚠ Summary generation failed" + error message + "↺ Retry" button |
| `null` (no row yet) | Dashed panel: "No summary available" + "Generate now" button |

SSE subscription in `AiSummaryTab`: listen on existing SSE connection for `summary_run_done / summary_run_error / summary_test_done / summary_test_error` matching the current entity. On match, invalidate the react-query cache to trigger a fresh fetch.

### Admin settings

New `AiSummariesSection` component in `SettingsPage.tsx` (admin tab), following the `DataRetentionSection` pattern:
- Enable/disable toggle
- Provider dropdown (starts: `Anthropic`)
- Model dropdown (populated from selected provider's `availableModels`)
- API key password input — placeholder `"••••••••"` when `isConfigured: true`; blank input on save = preserve existing key
- `idle | saving | ok | err` status states on Save button

---

## Error Handling

- **API key invalid / quota exceeded:** `provider.generateSummary` throws → caught in `summarizer.ts` → `ai_summaries.status = 'error'`, `error_msg` set → SSE `summary_*_error` emitted → frontend shows error panel with message + Retry button
- **Server restart mid-generation:** rows left in `status: 'generating'` — on next server boot a startup cleanup sets these back to `status: 'error'` so they are retriable
- **LLM disabled:** AI Summary tab hidden; no generation triggered
- **API key not configured (`isConfigured: false`):** `PATCH /api/settings/llm` with `enabled: true` rejected with 400 if no key stored

---

## Verification

1. Configure Anthropic API key and enable summaries in Admin → Settings → AI Summaries
2. Run a Playwright suite that has failures against the server
3. Observe SSE events in browser DevTools Network tab (`/api/events`)
4. Open the failed run — verify "✦ AI Summary" tab appears and shows the run summary
5. Open a failed test — verify test-level summary with error details and screenshot analysis
6. Click "↺ Regenerate" — verify new summary replaces old one with updated timestamp
7. Set an invalid API key — verify error state appears with message and Retry button
8. Disable the feature in settings — verify tab disappears from run/test detail pages
9. Run `pnpm lint && pnpm typecheck` — no errors
10. Run `pnpm --filter @playwright-cart/server test` — existing tests still pass
