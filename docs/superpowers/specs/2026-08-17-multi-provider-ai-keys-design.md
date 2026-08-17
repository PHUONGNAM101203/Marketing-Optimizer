# Multi-provider AI keys — design

## Context

The app currently lets each Site connect exactly one AI provider — Anthropic Claude
only — via a `site_ai_keys` vault table, used by Prompt Studio's "Chạy thử" test-run
and by the Agents feature's multi-step tool-calling loop. This is sub-project A of a
three-part request; B (in-app AI chat scoped to a site's marketing context) and C
(trending search/keyword discovery) are separate, later sub-projects with their own
spec → plan → build cycles. This spec covers A only.

**Goal:** let a Site connect an API key it owns for Claude, OpenAI, **or** Gemini
(exactly one at a time — switching providers requires disconnecting first), and have
both Prompt Studio and Agents use whichever provider is connected, including the
Agents feature's tool-calling loop (not just single-turn text generation).

## Non-goals

- Per-prompt or per-agent provider selection. One connected provider serves the whole
  Site, matching how the OAuth-app family model already works in this codebase.
- A hardcoded model picker/dropdown. Model IDs shift too fast and my training data has
  a January 2026 cutoff — the `model` field is free text (see below).
- Supporting more than 3 providers in this pass, or multiple simultaneous connections
  per Site.
- Sub-projects B (chat) and C (trending keywords) — out of scope here.

## 1. Data model

Migrate `site_ai_keys` from its current composite key `(site_id, provider)` to
`site_id` alone as the sole primary key, and add a `model` column:

```sql
alter table public.site_ai_keys drop constraint site_ai_keys_pkey;
alter table public.site_ai_keys add primary key (site_id);
alter table public.site_ai_keys add column model text not null default '';
```

Making `site_id` the sole primary key makes "at most one connected provider per Site"
a database-level guarantee, not just an app convention. Safe to apply: only
`'anthropic'` rows have ever existed, so no Site can currently have more than one row,
and dropping the composite key can't collide with existing data.

`provider` stays a `text` column with its existing `check (provider in ('anthropic',
'openai', 'gemini'))`-style constraint (extend the check list to include the two new
values). `api_key_enc` stays encrypted via the existing `src/lib/crypto.ts`
(AES-256-GCM) — unchanged, no new encryption code needed.

## 2. Provider abstraction

Claude, OpenAI, and Gemini each shape tool-calling requests and responses
differently (different content-block/tool-call formats, different multi-turn message
shapes). To keep `run-agent.ts`'s loop — and critically, the safety invariant that
hard-stops the loop the instant any write-tool is called — provider-agnostic, a common
internal shape sits between the app and each provider's SDK:

```ts
// src/lib/providers/ai.ts — the only module run-agent.ts / testRunPromptAction call
export type AiProvider = 'anthropic' | 'openai' | 'gemini'

export type AiContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool-use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
  | { readonly type: 'tool-result'; readonly toolUseId: string; readonly content: string }

export interface AiMessage {
  readonly role: 'user' | 'assistant'
  readonly content: readonly AiContentPart[]
}

export interface AiToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export interface AiCallResult {
  readonly content: readonly AiContentPart[]
  readonly stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other'
  readonly tokensIn: number
  readonly tokensOut: number
  readonly model: string
}

export const callAi: (params: {
  readonly provider: AiProvider
  readonly apiKey: string
  readonly model: string
  readonly systemPrompt: string
  readonly messages: readonly AiMessage[]
  readonly tools?: readonly AiToolDefinition[]
  readonly maxTokens?: number
}) => Promise<AiCallResult>
```

`callAi` dispatches to one of three provider-specific files, each translating
`AiMessage[]`/`AiToolDefinition[]` into that provider's SDK request shape, and that
provider's response back into `AiCallResult`:

- `src/lib/providers/anthropic.ts` — refactor the existing `callClaude` to implement
  this translation (it currently returns a raw `Anthropic.Message` directly to
  callers; that stops being exposed outside this file).
- `src/lib/providers/openai.ts` — new file, wraps the official `openai` npm package.
- `src/lib/providers/gemini.ts` — new file, wraps Google's current Node SDK.

`run-agent.ts` and `tools.ts` only ever construct/consume `AiMessage`/`AiContentPart`
— never a provider SDK type. The safety invariant (hard-stop on any write-tool call)
lives entirely in `run-agent.ts`'s loop over `AiContentPart`'s `'tool-use'` variant,
so it does not need to be re-verified per provider — one code path, one place that
enforces it, regardless of which provider produced the tool-use part.

**Verification caveat:** my knowledge of OpenAI's and Gemini's current tool-calling
API shape may be stale (training cutoff January 2026, current date August 2026 —
OpenAI in particular has changed its primary API surface before). Before writing
`openai.ts`/`gemini.ts`, the implementation step will pull current docs (WebFetch/
WebSearch) rather than work from memorized SDK shapes.

**Model IDs are free text**, not a hardcoded list — for the same reason (can't
reliably know today's current model names). The Settings UI's model field is a plain
text input with a hint linking to each provider's model-list page.

## 3. Settings UI

Replaces the current "Claude API Key" card at `/[siteId]/settings` with a generalized
"AI Provider" card:

- **Not connected:** a provider picker (Claude / OpenAI / Gemini), API key field,
  model field (free text), "Kết nối" button.
- **Connected:** "Đã kết nối: {Provider} · model: {model}" + "Ngắt kết nối" button.
  Updating the *same* provider's key or model (key rotation, model change) is allowed
  without disconnecting. Submitting a *different* provider while one is connected is
  rejected server-side with a clear "ngắt kết nối trước" error — enforced in the
  Server Action (same `has_site_role(['owner','admin'])` session-client check this
  repo already uses for `site_oauth_apps`/`site_ai_keys`), not just hidden in the UI.
- "Ngắt kết nối" deletes the `site_ai_keys` row entirely. A disconnected Site reverts
  to "not configured."
- **Connecting/disconnecting/switching providers never touches existing history.**
  `agents`, `agent_runs`, `prompt_runs`, and `prompt_versions` are untouched by any
  action in this spec — only the single `site_ai_keys` row is created/updated/deleted.
  An Agent isn't "bound" to a provider; it simply uses whichever provider is connected
  at the moment it runs. Switching from Claude to OpenAI mid-project keeps every past
  run's history, ratings, and approval-queue records exactly as they were — the next
  run just talks to a different model.

## 4. Wiring into Prompt Studio + Agents

`testRunPromptAction` (`src/lib/actions/prompts.ts`) and `runAgent`
(`src/lib/agents/run-agent.ts`) both switch from `resolveClaudeApiKey(siteId)` to a
new `resolveAiConfig(siteId): Promise<{ provider: AiProvider; apiKey: string; model:
string } | null>`, then call `callAi({ provider, apiKey, model, ... })` instead of
`callClaude({ apiKey, ... })`.

Fallback for un-configured Sites is preserved exactly as today: if no `site_ai_keys`
row exists, fall back to `{ provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY,
model: DEFAULT_CLAUDE_MODEL }` (the existing `'claude-opus-5'` constant). If neither
the Site nor the env var has a key, both call sites already have a "Chưa cấu hình AI
Key cho website này. Vào Cài đặt để thêm." error path wired (built earlier this
session) — message text updated from "Claude API Key" to "AI Key" since it's no
longer Claude-specific, behavior unchanged.

## Testing / verification

No test framework in this repo (per `CLAUDE.md`) — verification is `npx tsc --noEmit`
+ `npm run lint` + `npm run build`, plus a manual smoke check per provider once at
least one real key is available (the implementer/user will need at least one real
OpenAI or Gemini key to smoke-test that provider path — Claude's path already has
live verification pending from earlier work this session).

## Open follow-ups (explicitly out of scope for this spec)

- Sub-project B (in-app AI chat) will reuse `callAi`/`resolveAiConfig` directly once
  built — this spec's abstraction is designed with that reuse in mind, but B gets its
  own spec.
- Sub-project C (trending keywords) is unrelated to this abstraction.
