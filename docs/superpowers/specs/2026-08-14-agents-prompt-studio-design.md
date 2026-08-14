# Prompt Studio + Agents — real data layer, LLM integration, tool-calling loop

## Problem

Both `/prompts` (Prompt Studio) and `/agents` (Agents) currently render from
`src/mock/prompts.ts` / `src/mock/agents.ts` — fixed sample data, no LLM call
ever happens, no persistence, "Duyệt và thực thi" / "Chạy thử" buttons do
nothing real. This spec makes both fully real:

- **Prompt Studio**: prompts + versions stored in Supabase, variables resolved
  from real Site/metric/entity data pulled across every connected channel,
  "Chạy thử" makes a real Claude API call and records the run.
- **Agents**: agent configs stored in Supabase, runnable on a schedule
  (piggybacked on the existing daily cron) or manually, executing a real
  multi-step tool-calling loop against Claude — read-tools query real data
  across channels, write-tools stop the loop and create a real approval
  request. **Confirmed scope boundary**: v1 stops at creating the
  `pending_actions` row. It does not write to Google Ads / Meta / TikTok —
  that's a separate, larger effort (real money at stake, Google Ads API
  write-scope app review) that deserves its own spec. This matches the
  safety invariant already encoded in `src/lib/domain/agent.ts`
  (`requiresApproval`/`isWriteTool`) — the mock data was already built around
  "agent proposes, never executes," this spec just makes the proposing real.

## Decisions locked in during brainstorming

- Both features ship together, not decomposed into separate specs — Agents
  reuses Prompt Studio's LLM-call layer and variable-resolution engine, so
  building them separately would mean building the shared plumbing twice.
- Agent write-tools never touch an external platform in this pass (see
  above). "Duyệt" records a real decision (`decided_by`, `decided_at`,
  audit trail) but the UI must not claim the change was applied — that
  would be dishonest given nothing was actually written to the ad platform.
- LLM integration: **Anthropic Claude API** (`@anthropic-ai/sdk`), not
  Managed Agents. Managed Agents' hosted sandbox/container model doesn't fit
  — this app is serverless (Vercel), tools are lightweight Supabase reads,
  there's no filesystem/bash need, and Managed Agents' custom-tool flow would
  require a long-lived process listening on an SSE stream, which this app
  doesn't have anywhere else. Default model `claude-opus-5`.
- Agent execution: a **hand-written loop**, not the SDK's Tool Runner helper.
  The one hard requirement — stop the entire loop immediately after any
  write-tool call, never let the model keep going — is more naturally
  expressed as an explicit `while` with a break than fought into the Tool
  Runner's per-turn-hook shape.
- Scheduling: **no new cron job** (Vercel Hobby plan allows exactly one,
  already used by `/api/cron/sync-all`). Agent scheduling is a pass appended
  to the end of that route, after the existing per-connection sync loop.
  Consequence: `hourly` cadence isn't achievable with a once-daily cron —
  it stays in the `AgentSchedule` type for later but the agent-creation UI
  only offers `daily` / `weekly` / `monthly` in this pass.

## Data model (new Supabase tables)

Same RLS shape as every other table in this app: `authenticated` can
`select` when `is_site_member(site_id)` (via a join up to `sites` where the
table itself doesn't carry `site_id` directly), no write policy — all
writes go through `service_role` from server actions / the cron route.

```sql
-- Prompt Studio -------------------------------------------------------------

create table public.prompts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  category      text not null check (
    category in ('ad-copy','seo-content','analysis','planning','reporting','email','social','geo')
  ),
  -- FK vào prompt_versions thêm sau khi bảng đó tồn tại (xem ALTER bên dưới)
  -- — hai bảng tham chiếu vòng, phải tạo prompts trước rồi mới thêm cột này.
  current_version_id uuid,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.prompt_versions (
  id             uuid primary key default gen_random_uuid(),
  prompt_id      uuid not null references public.prompts (id) on delete cascade,
  version        int not null,
  system_prompt  text not null,
  user_template  text not null,
  -- Khai báo biến ngay trên version (không phải trên prompts) — mỗi version
  -- có thể đổi bộ biến, và một version cũ vẫn phải tự đủ để hiểu nó cần gì.
  variables      jsonb not null default '[]',
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (prompt_id, version)
);

alter table public.prompts
  add constraint prompts_current_version_fk
  foreign key (current_version_id) references public.prompt_versions (id) on delete set null;

create table public.prompt_runs (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid not null references public.prompts (id) on delete cascade,
  version_id  uuid not null references public.prompt_versions (id) on delete cascade,
  inputs      jsonb not null default '{}',
  output      text not null,
  model       text not null,
  tokens_in   int not null,
  tokens_out  int not null,
  latency_ms  int not null,
  rating      smallint check (rating between 1 and 5),
  ran_by      uuid references auth.users (id) on delete set null,
  ran_at      timestamptz not null default now()
);

-- Agents ----------------------------------------------------------------

create table public.agents (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  role         text not null check (
    role in ('ads-optimizer','seo-analyst','content-planner','report-writer','ai-visibility-tracker','anomaly-watcher')
  ),
  name         text not null,
  description  text not null default '',
  prompt_id    uuid not null references public.prompts (id) on delete restrict,
  tools        jsonb not null default '[]',   -- AgentTool[] — {name, provider, enabled}
  schedule     jsonb,                          -- AgentSchedule | null
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table public.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.agents (id) on delete cascade,
  site_id      uuid not null references public.sites (id) on delete cascade,
  status       text not null check (
    status in ('queued','running','pending-approval','succeeded','failed','cancelled','rejected')
  ),
  trigger      text not null check (trigger in ('schedule','manual','event')),
  steps        jsonb not null default '[]',   -- AgentStep[]
  summary      text,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  tokens_used  int
);

create table public.pending_actions (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.agent_runs (id) on delete cascade,
  tool               text not null,
  action_kind        text not null,
  provider           text not null,
  target_entity_id   text not null,
  target_entity_name text not null,
  summary            text not null,
  diff               jsonb not null default '[]',  -- ActionDiffRow[]
  rationale          text not null,
  decided_by         uuid references auth.users (id) on delete set null,
  decided_at         timestamptz,
  decision           text check (decision in ('approved','rejected'))
);
```

Indexes: `prompts(site_id)`, `agents(site_id)`, `agent_runs(agent_id, started_at desc)`,
`pending_actions(run_id)` — all small tables (tens to low-hundreds of rows
per site), no exotic indexing needed.

RLS `select` policies: `prompts`/`agents` gate directly on their own
`site_id` via `is_site_member`; `prompt_versions`/`prompt_runs` gate through
a join to `prompts`; `agent_runs` gates directly on its own `site_id`;
`pending_actions` gates through a join to `agent_runs` → `site_id`. Same
"no write policy, service_role only" pattern as every existing table.

## LLM call layer — `src/lib/providers/anthropic.ts`

Thin wrapper, no Supabase knowledge (matches the `providers/` layer
convention — raw platform calls only):

```ts
export interface ClaudeCallResult {
  readonly output: string
  readonly tokensIn: number
  readonly tokensOut: number
  readonly latencyMs: number
  readonly model: string
}

export const callClaude = async (params: {
  readonly systemPrompt: string
  readonly userMessage: string
  readonly model?: string          // default 'claude-opus-5'
  readonly tools?: readonly Anthropic.Tool[]
  readonly maxTokens?: number      // default 8000
}): Promise<Anthropic.Message>
```

Uses `client.messages.stream(...).finalMessage()` internally (not a plain
`.create()`) — per Anthropic's own guidance, non-streaming risks SDK HTTP
timeouts, and this call site (a Server Action or a cron-triggered agent
step) isn't rendering the stream incrementally to a UI in this pass anyway,
so streaming is purely an internal timeout-avoidance detail here.
`ANTHROPIC_API_KEY` read from env — **not present in `.env.local` today**,
needs to be added (real key, can't be generated by an agent).

## Prompt Studio

### Data layer — `src/lib/data/prompts.ts`

`listPrompts(siteId)`, `getPrompt(promptId)` (with versions), `createPrompt`,
`createPromptVersion` (bumps `version`, points `current_version_id` at the
new row — this is how "editing" a prompt works: never mutate an existing
version, always append), `recordPromptRun`, `ratePromptRun`.

### Variable resolution — `src/lib/prompts/resolve-variables.ts`

For each `PromptVariable` on the current version, resolve by `source`:

- `manual` — from a caller-supplied input map; error if required and missing.
- `site` — small fixed set (`domain`, `dateRange` formatted from the active
  range) read off the `Site` object already in scope.
- `metric` / `entity` — a small **named registry**, not a generic
  free-text-to-metric mapper (deliberately — an unbounded mapper is exactly
  how a prompt ends up bịa số for a variable nobody wired up). Each entry is
  `{ name: string, resolve: (site, range) => Promise<string> }`. v1 covers
  every variable used by the 5 prompts already in `mock/prompts.ts`
  (`accountCpa`, `campaignTable`, `query`/`positionBefore`/`positionAfter`/
  `impressions`/`pageContent`, etc.) — each resolver calls existing
  `lib/data/*` functions (`getChannelSummaries`, `getRealMetricsSummary`,
  Search Console query data) and aggregates **across every connected
  provider with the relevant capability** (e.g. `accountCpa` averages over
  every provider where `hasCapability(provider, 'spend')`), not a single
  hardcoded platform — this is the piece the user explicitly asked for.
  A variable with no registry entry resolves to an explicit error surfaced
  to the caller ("chưa có cách lấy biến X"), never a silent 0/empty string.

### Server actions — `src/lib/actions/prompts.ts`

`createPromptAction`, `savePromptVersionAction` (new version),
`testRunPromptAction` (resolve variables → `callClaude` → `recordPromptRun`
→ return the run to render), `ratePromptRunAction`.

### Page wiring

`app/(app)/[siteId]/prompts/page.tsx` swaps `MOCK_PROMPTS` for
`listPrompts(site.id)`; "Chạy thử" button becomes a form calling
`testRunPromptAction`, rendering the real output + token/latency numbers
inline (matches the existing card layout, no UI redesign needed for this
pass — it was already built around exactly this shape).

## Agents

### Data layer — `src/lib/data/agents.ts`

`listAgents(siteId)`, `getAgent(agentId)`, `createAgent`,
`setAgentEnabled`, `listRuns(agentId)`, `getRun(runId)` (with steps +
pending actions joined), `createRun`, `appendRunStep`, `finishRun`,
`createPendingAction`, `decidePendingAction` (approve/reject).

### Tool registry — `src/lib/agents/tools.ts`

Maps every `AgentToolName` to `{ description, inputSchema, run }`.
Read-tools (`query-metrics`, `list-entities`, `compare-periods`,
`fetch-page-content`, `check-ai-citation`, `read-search-queries`) each call
an existing `lib/data/*` function scoped to the run's site — no new
provider code, this is glue only. Write-tools (`apply-budget-change`,
`pause-campaign`, `resume-campaign`, `update-ad-copy`,
`add-negative-keyword`, `publish-report`) all share one `run` implementation:
validate the tool's input against `ActionDiffRow`-shaped output, call
`createPendingAction`, return a tool_result telling the model the proposal
was recorded and no further action is possible this turn.

### Execution loop — `src/lib/agents/run-agent.ts`

```
runAgent(agentId, trigger: 'schedule' | 'manual'):
  1. Load agent + its current prompt version + site.
  2. createRun(status='running')
  3. Resolve prompt variables for a default range (last-28) — scheduled/manual
     runs have no "current URL range" to inherit from.
  4. messages = [{ role: 'user', content: resolvedUserTemplate }]
  5. loop (max 8 rounds):
       response = callClaude({ systemPrompt: resolvedSystemPrompt, messages,
                                tools: enabledToolDefs })
       appendRunStep(...)  // for every thought/tool-call/tool-result
       if response.stop_reason !== 'tool_use': break with status='succeeded'
       execute each tool_use block via the registry
       if ANY tool_use this round was a write-tool:
         finishRun(status='pending-approval'); return  // hard stop, no more rounds
       else: append tool_results, continue loop
  6. On loop-cap exceeded: finishRun(status='failed', error='vượt số lượt tối đa')
  7. On thrown error at any point: finishRun(status='failed', error=...)
```

### Triggers

- **Manual "Chạy ngay"**: server action creates the run row synchronously,
  then hands the actual `runAgent` call to Next's `after()` (same pattern
  already used for the TikTok video-snapshot sync in `sync-connection.ts`)
  so the request returns immediately instead of blocking on however many
  Claude round-trips the loop takes. Page shows the run as `running` and
  the existing run-detail page polls/refetches.
- **Schedule**: appended to `api/cron/sync-all/route.ts`, after the
  per-connection sync loop — for each site, find `enabled=true` agents whose
  `schedule.cadence`/`dayOfWeek` matches today, and run them (also via
  `after()`, so the cron response isn't held up waiting on LLM calls).

### Approval queue

`approvePendingActionAction` / `rejectPendingActionAction` — both record a
real decision. Approving does **not** perform any external write (see scope
boundary above), so the button label changes from "Duyệt và thực thi" to
"Duyệt" — after approving, the card shows a badge "Đã duyệt · chờ triển khai
ghi thật" instead of implying the platform was actually changed. "Từ chối"
stays as-is; it's already a truthful label for what it does.

### Page wiring

`agents/page.tsx` and `agents/[agentId]/page.tsx` swap
`mock/agents.ts` functions for the new `data/agents.ts` ones; pending
actions list and Duyệt/Từ chối buttons wire to the new server actions.

## Out of scope (explicit, not deferred-and-forgotten)

- Real writes to Google Ads / Meta / TikTok from an approved action —
  separate future spec, needs its own OAuth write-scope work per platform.
- `hourly` agent cadence — needs its own trigger mechanism beyond a
  once-daily cron; not offered in the UI this pass.
- Streaming the "Chạy thử" output token-by-token to the browser — v1
  returns the complete result after the call finishes.
- Any UI redesign of either page — both already have the right shape for
  what this spec wires up; changes are data-wiring, not layout.

## Setup step required from the user

`ANTHROPIC_API_KEY` must be added to `.env.local` (dev) and the Vercel
project's environment variables (prod) before "Chạy thử" or any agent run
can work — no LLM call is possible without it, and it isn't something an
agent can generate on the user's behalf.
