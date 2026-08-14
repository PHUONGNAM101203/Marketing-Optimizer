# Agents + Prompt Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock-backed Prompt Studio and Agents pages with a real Supabase data layer, a real Claude API integration for prompt test-runs, and a real multi-step tool-calling agent loop whose write-tools stop the run and create an approval request instead of touching any ad platform.

**Architecture:** Follows this repo's existing three-layer split. `providers/anthropic.ts` wraps the raw Claude API call (no Supabase knowledge). `data/prompts.ts`, `data/agents.ts`, `data/entities.ts`, `data/profiles.ts` read/write Supabase and call into `providers/` for live campaign data. `lib/prompts/resolve-variables.ts` and `lib/agents/{tools,run-agent}.ts` hold the logic that ties the LLM call to real Site data. `actions/prompts.ts` / `actions/agents.ts` are the Server Action mutation surface the pages call.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), `@anthropic-ai/sdk`, existing `src/lib/providers/{google-ads,meta-metrics}.ts` for live campaign-level reads.

## Global Constraints

- **No test framework exists in this repo and none gets added as a side effect of this work** (per `CLAUDE.md`: "Verification for a change is `npx tsc --noEmit` + `npm run lint` + `npm run build`"). Every task below replaces the skill's default "write failing test" step with this project's actual verification: write the file, run `npx tsc --noEmit`, run `npm run lint`, then move on. Do not introduce `vitest`/`jest`/`*.test.ts` files.
- Comments in new code are Vietnamese, explain only non-obvious *why* (constraint, workaround, decision), never restate what the code does — matches every file already in this repo.
- `connection_secrets` has no RLS policy for any role — only `service_role` (`createAdminClient()`) can read it, ever. Any function that resolves a live access token (Task 6) must use `createAdminClient()`, exactly like `src/lib/sync/sync-connection.ts` does.
- New tables follow the exact RLS shape every existing table uses: `authenticated` gets a `select` policy gated by `is_site_member(site_id)` (directly or via a join to a table that has `site_id`); **no write policy** — all writes go through `service_role` from Server Actions or the cron route.
- Domain types (`src/lib/domain/prompt.ts`, `src/lib/domain/agent.ts`) already exist from the mock-data build-out and are **not modified** by this plan — every data-layer function maps DB rows onto these exact existing shapes. One correction from the original design brainstorm: `PromptVariable[]` lives on `PromptTemplate.variables` (the whole prompt), not per-version — confirmed by reading the actual domain type, which has no `variables` field on `PromptVersion`.
- `ANTHROPIC_API_KEY` must exist in `.env.local` (dev) before Task 4's verification step can make a real call, and in the Vercel project's env vars before deploy. This plan cannot create that key — flag it to the user if it's still missing when Task 4 is reached.
- Model default across every Claude call in this plan: `claude-opus-5`.
- No campaign-level entity data is persisted anywhere in this codebase today (confirmed: `metrics_daily` is connection-level only; `src/lib/providers/google-ads-metrics.ts` has a comment saying campaign detail "is the `entities` table's job, not yet built"). Task 6 adds a **live-fetch-only** campaign performance reader (no new table) reusing the campaign-level fetchers that already exist in `providers/google-ads.ts` and `providers/meta-metrics.ts` — same "query live, don't store" posture this repo already uses for YouTube video trending.

---

### Task 1: Prompt Studio tables (migration)

**Files:**
- Create: `supabase/migrations/20260814000006_prompts.sql`

**Interfaces:**
- Produces: tables `prompts`, `prompt_versions`, `prompt_runs` — columns as below, consumed by Task 7's `data/prompts.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Prompt Studio · prompts + versions + lịch sử chạy thử
--
-- `variables` nằm trên `prompts`, KHÔNG trên `prompt_versions` — một prompt
-- có nhiều version nhưng cùng một bộ biến khai báo (đổi biến là đổi hợp đồng
-- của prompt, không phải nội dung của một bản). Khớp domain type
-- `PromptTemplate.variables` đã có sẵn từ M-mock, không đổi type đó.
-- ============================================================================

create table public.prompts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  category      text not null check (
    category in ('ad-copy','seo-content','analysis','planning','reporting','email','social','geo')
  ),
  variables     jsonb not null default '[]',
  -- FK sang prompt_versions thêm ở dưới, sau khi bảng đó tồn tại — hai bảng
  -- tham chiếu vòng nhau.
  current_version_id uuid,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index prompts_site_idx on public.prompts (site_id);

create table public.prompt_versions (
  id             uuid primary key default gen_random_uuid(),
  prompt_id      uuid not null references public.prompts (id) on delete cascade,
  version        int not null,
  system_prompt  text not null,
  user_template  text not null,
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

create index prompt_runs_prompt_idx on public.prompt_runs (prompt_id, ran_at desc);

alter table public.prompts enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.prompt_runs enable row level security;

create policy "prompts_select_member"
  on public.prompts for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "prompt_versions_select_member"
  on public.prompt_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );

create policy "prompt_runs_select_member"
  on public.prompt_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration applies cleanly. If `supabase` CLI auth is unavailable in
this environment, note that explicitly and proceed to Task 3 anyway (types
get hand-written there per the project's documented fallback) — the
migration file itself is still committed and will apply on next deploy.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000006_prompts.sql
git commit -m "feat: add prompts/prompt_versions/prompt_runs tables"
```

---

### Task 2: Agents tables (migration)

**Files:**
- Create: `supabase/migrations/20260814000007_agents.sql`

**Interfaces:**
- Consumes: `public.prompts` (Task 1) via `prompt_id` FK.
- Produces: tables `agents`, `agent_runs`, `pending_actions` — consumed by Task 11's `data/agents.ts`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Agents · cấu hình, lịch sử chạy, hành động chờ duyệt
--
-- BẤT BIẾN AN TOÀN (xem src/lib/domain/agent.ts): agent chỉ tự chạy tool ĐỌC.
-- Tool GHI luôn dừng ở một hàng `pending_actions` — không có đường nào trong
-- schema này cho phép một run tự đổi trạng thái pending_actions.decision
-- ngoài qua service_role (tức là qua Server Action có xác thực người duyệt).
-- ============================================================================

create table public.agents (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  role         text not null check (
    role in ('ads-optimizer','seo-analyst','content-planner','report-writer','ai-visibility-tracker','anomaly-watcher')
  ),
  name         text not null,
  description  text not null default '',
  prompt_id    uuid not null references public.prompts (id) on delete restrict,
  tools        jsonb not null default '[]',
  schedule     jsonb,
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index agents_site_idx on public.agents (site_id);

create table public.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.agents (id) on delete cascade,
  site_id      uuid not null references public.sites (id) on delete cascade,
  status       text not null check (
    status in ('queued','running','pending-approval','succeeded','failed','cancelled','rejected')
  ),
  trigger      text not null check (trigger in ('schedule','manual','event')),
  steps        jsonb not null default '[]',
  -- Dùng CHUNG cột này cho cả bản tóm tắt lúc thành công LẪN thông báo lỗi
  -- lúc thất bại — domain type `AgentRun` chỉ có `summary`, không có cột lỗi
  -- riêng, cố tình không đổi type đó ở đây.
  summary      text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  tokens_used  int
);

create index agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);
create index agent_runs_site_idx on public.agent_runs (site_id, started_at desc);

create table public.pending_actions (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.agent_runs (id) on delete cascade,
  tool               text not null check (
    tool in ('apply-budget-change','pause-campaign','resume-campaign','update-ad-copy','add-negative-keyword','publish-report')
  ),
  action_kind        text not null,
  provider           text not null check (
    provider in ('google-ads','ga4','gsc','gtm','youtube','meta-ads','instagram','tiktok')
  ),
  target_entity_id   text not null,
  target_entity_name text not null,
  summary            text not null,
  diff               jsonb not null default '[]',
  rationale          text not null,
  decided_by         uuid references auth.users (id) on delete set null,
  decided_at         timestamptz,
  decision           text check (decision in ('approved','rejected')),
  created_at         timestamptz not null default now()
);

create index pending_actions_run_idx on public.pending_actions (run_id);

alter table public.agents enable row level security;
alter table public.agent_runs enable row level security;
alter table public.pending_actions enable row level security;

create policy "agents_select_member"
  on public.agents for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "agent_runs_select_member"
  on public.agent_runs for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "pending_actions_select_member"
  on public.pending_actions for select
  to authenticated
  using (
    exists (
      select 1 from public.agent_runs r
      where r.id = run_id and public.is_site_member(r.site_id)
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000007_agents.sql
git commit -m "feat: add agents/agent_runs/pending_actions tables"
```

---

### Task 3: Hand-add generated types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: exact column names from Tasks 1–2.
- Produces: `Database['public']['Tables']['prompts'|'prompt_versions'|'prompt_runs'|'agents'|'agent_runs'|'pending_actions']` — consumed by every `data/*.ts` task below via `createClient()`'s generic.

- [ ] **Step 1: Try real generation first**

Run: `supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`

If this succeeds (no auth error), skip to Step 3. If it fails with an auth
error (documented precedent in this repo — CLI auth has failed before),
proceed to Step 2.

- [ ] **Step 2: Hand-add the six new table entries**

Open `src/lib/supabase/database.types.ts`, find the `Tables` object inside
`public: { Tables: { ... } }`, and add six entries following the exact
`Row`/`Insert`/`Update`/`Relationships` shape every existing entry uses
(copy the shape of the `connections` or `metrics_daily` entry as a
template — same four keys, `Insert`/`Update` making most fields optional
via `?`, `Relationships: []` unless you're adding a typed FK relationship,
which existing entries mostly skip). Column types map 1:1 from the SQL
migrations in Tasks 1–2: `uuid`/`text` → `string`, `jsonb` → the specific
TS shape (e.g. `Json` from the file's existing `Json` type alias, or a more
specific array-of-object type if the file already imports domain types —
check how `extra: Json` is typed on the `metrics_daily` entry and match
that convention exactly), `timestamptz` → `string`, `boolean` → `boolean`,
`int`/`smallint` → `number`, nullable columns → `| null` in `Row`.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors (existing pre-existing errors, if any, are
unrelated — compare against a clean `git stash` run if unsure).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat: add generated types for prompts/agents tables"
```

---

### Task 4: Claude API provider wrapper

**Files:**
- Create: `src/lib/providers/anthropic.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Produces:
  ```ts
  export interface ClaudeCallResult {
    readonly output: string
    readonly tokensIn: number
    readonly tokensOut: number
    readonly latencyMs: number
    readonly model: string
    readonly stopReason: string
  }

  export interface ClaudeToolDefinition {
    readonly name: string
    readonly description: string
    readonly inputSchema: Record<string, unknown>
  }

  export interface ClaudeMessage {
    readonly role: 'user' | 'assistant'
    readonly content: unknown // Anthropic.MessageParam['content'] — full tool_use/tool_result blocks for the agent loop
  }

  export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'

  export const callClaude: (params: {
    readonly systemPrompt: string
    readonly messages: readonly ClaudeMessage[]
    readonly model?: string
    readonly tools?: readonly ClaudeToolDefinition[]
    readonly maxTokens?: number
  }) => Promise<{
    readonly message: Anthropic.Message // raw SDK message — callers need content blocks for tool_use parsing
    readonly latencyMs: number
  }>
  ```
  Consumed by Task 9 (`actions/prompts.ts`, single-turn call) and Task 13
  (`lib/agents/run-agent.ts`, multi-turn loop with `tools`).

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write the provider**

```ts
import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

/**
 * Gọi Claude qua stream rồi gom lại thành message hoàn chỉnh — không gọi
 * `.create()` trực tiếp. `.create()` không-stream có nguy cơ chạm timeout
 * HTTP của SDK với output dài; ở đây chưa cần render từng token ra UI (Chạy
 * thử trả nguyên khối, agent loop xử lý nội bộ), nên stream chỉ để tránh
 * timeout, không để hiện tiến trình.
 */

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'

let cachedClient: Anthropic | null = null

const getClient = (): Anthropic => {
  if (cachedClient) return cachedClient
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Thiếu biến môi trường ANTHROPIC_API_KEY')
  cachedClient = new Anthropic({ apiKey })
  return cachedClient
}

export interface ClaudeToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export interface ClaudeMessage {
  readonly role: 'user' | 'assistant'
  readonly content: Anthropic.MessageParam['content']
}

export const callClaude = async (params: {
  readonly systemPrompt: string
  readonly messages: readonly ClaudeMessage[]
  readonly model?: string
  readonly tools?: readonly ClaudeToolDefinition[]
  readonly maxTokens?: number
}): Promise<{ readonly message: Anthropic.Message; readonly latencyMs: number }> => {
  const client = getClient()
  const startedAt = Date.now()

  const stream = client.messages.stream({
    model: params.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: params.maxTokens ?? 8000,
    system: params.systemPrompt,
    messages: params.messages as Anthropic.MessageParam[],
    tools: params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    })),
  })

  const message = await stream.finalMessage()
  return { message, latencyMs: Date.now() - startedAt }
}

/** Rút text thuần từ content blocks — dùng cho lượt gọi một-chiều (Chạy thử),
 * nơi không cần phân biệt block loại gì, chỉ cần câu trả lời cuối. */
export const extractText = (message: Anthropic.Message): string =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. If `ANTHROPIC_API_KEY` is missing from `.env.local`,
this step still passes (it's a runtime check, not a type error) — but flag
to the user now that the key needs to be added before any real call works.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/providers/anthropic.ts
git commit -m "feat: add Claude API provider wrapper"
```

---

### Task 5: Display-name resolution helper

**Files:**
- Create: `src/lib/data/profiles.ts`

**Interfaces:**
- Produces: `resolveDisplayNames(supabase: SupabaseClient<Database>, userIds: readonly string[]): Promise<ReadonlyMap<string, string>>`
- Consumed by Task 7 (`data/prompts.ts`, for `createdBy`/`ranBy`) and Task 11 (`data/agents.ts`, for `decidedBy`).

- [ ] **Step 1: Write the helper**

```ts
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * `created_by`/`ran_by`/`decided_by` lưu uuid (FK `auth.users`), nhưng domain
 * type (`PromptVersion.createdBy`, `PromptRun.ranBy`, `PendingAction.decidedBy`)
 * là chuỗi tên hiển thị — UI hiện tên, không hiện uuid. Một lượt truy vấn
 * `profiles` cho MỌI id cần tới trong một lần gọi, không N+1 theo từng hàng.
 */
export const resolveDisplayNames = async (
  supabase: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, string>> => {
  const uniqueIds = [...new Set(userIds)]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', uniqueIds)

  return new Map((data ?? []).map((row) => [row.id, row.full_name ?? 'Chưa đặt tên']))
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/profiles.ts
git commit -m "feat: add batched display-name resolution helper"
```

---

### Task 6: Live campaign performance reader

**Files:**
- Create: `src/lib/data/entities.ts`

**Interfaces:**
- Consumes: `resolveAccessToken` (`src/lib/sync/access-token.ts`), `getGoogleAdsDeveloperToken` (`src/lib/data/site-oauth-apps.ts`), `fetchGoogleAdsCampaignMetrics` (`src/lib/providers/google-ads.ts`), `fetchMetaAdsCampaignMetrics` (`src/lib/providers/meta-metrics.ts`), `deriveMetrics` (`src/lib/metrics/derive.ts`), `createAdminClient` (`src/lib/supabase/admin`).
- Produces:
  ```ts
  export interface CampaignPerformance {
    readonly provider: 'google-ads' | 'meta-ads'
    readonly campaignName: string
    readonly costMicros: number
    readonly conversions: number
    readonly cpaMicros: number | null
    readonly roas: number | null   // null for meta-ads — no conversion value in that fetch
  }

  export const getCampaignPerformance: (
    siteId: string,
    range: { readonly start: string; readonly end: string },
  ) => Promise<readonly CampaignPerformance[]>
  ```
  Consumed by Task 8 (`lib/prompts/resolve-variables.ts`, `campaignTable` variable)
  and Task 12 (`lib/agents/tools.ts`, `list-entities` read-tool).

- [ ] **Step 1: Write the reader**

```ts
import 'server-only'

import { deriveMetrics } from '@/lib/metrics/derive'
import { fetchGoogleAdsCampaignMetrics } from '@/lib/providers/google-ads'
import { fetchMetaAdsCampaignMetrics } from '@/lib/providers/meta-metrics'
import { getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Đọc SỐNG, không lưu — chưa có bảng `entities` (xem ghi chú trong
 * `google-ads-metrics.ts`). Cùng cách YouTube trending đang làm: gọi API
 * thật mỗi lần cần, không đặt thêm hạ tầng lưu trữ cho một nhu cầu (biến
 * prompt + tool đọc của agent) chưa cần lịch sử theo ngày, chỉ cần tổng
 * trong khoảng đang chọn.
 *
 * Dùng ADMIN client — `connection_secrets` không có policy nào cho vai trò
 * thường, chỉ service_role đọc được (giống hệt `sync-connection.ts`).
 */

export interface CampaignPerformance {
  readonly provider: 'google-ads' | 'meta-ads'
  readonly campaignName: string
  readonly costMicros: number
  readonly conversions: number
  readonly cpaMicros: number | null
  readonly roas: number | null
}

const aggregateByCampaign = (
  provider: 'google-ads' | 'meta-ads',
  rows: readonly { readonly campaignName: string; readonly costMicros: number; readonly conversions: number; readonly conversionValueMicros?: number }[],
): CampaignPerformance[] => {
  const byCampaign = new Map<string, { costMicros: number; conversions: number; conversionValueMicros: number }>()

  for (const row of rows) {
    const current = byCampaign.get(row.campaignName) ?? { costMicros: 0, conversions: 0, conversionValueMicros: 0 }
    byCampaign.set(row.campaignName, {
      costMicros: current.costMicros + row.costMicros,
      conversions: current.conversions + row.conversions,
      conversionValueMicros: current.conversionValueMicros + (row.conversionValueMicros ?? 0),
    })
  }

  return [...byCampaign.entries()].map(([campaignName, totals]) => {
    const derived = deriveMetrics({
      sessions: null,
      users: null,
      conversions: totals.conversions,
      clicks: null,
      impressions: null,
      costMicros: totals.costMicros,
      conversionValueMicros: totals.conversionValueMicros || null,
    })
    return {
      provider,
      campaignName,
      costMicros: totals.costMicros,
      conversions: totals.conversions,
      cpaMicros: derived.cpaMicros,
      // Meta campaign fetch không có conversion value — roas luôn null cho meta-ads,
      // không suy diễn từ đâu khác (không bịa số).
      roas: provider === 'meta-ads' ? null : derived.roas,
    }
  })
}

export const getCampaignPerformance = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<readonly CampaignPerformance[]> => {
  const admin = createAdminClient()

  const { data: connections } = await admin
    .from('connections')
    .select('id, provider, external_account_id, status')
    .eq('site_id', siteId)
    .in('provider', ['google-ads', 'meta-ads'])

  const results: CampaignPerformance[] = []

  for (const connection of connections ?? []) {
    if (connection.status === 'revoked' || connection.status === 'error') continue

    const tokenResult = await resolveAccessToken(
      admin,
      connection.id,
      siteId,
      connection.provider as 'google-ads' | 'meta-ads',
    )
    if (!tokenResult.ok) continue

    try {
      if (connection.provider === 'google-ads') {
        const developerToken = await getGoogleAdsDeveloperToken(siteId)
        if (!developerToken) continue
        const rows = await fetchGoogleAdsCampaignMetrics(
          tokenResult.accessToken,
          developerToken,
          connection.external_account_id,
          { startDate: range.start, endDate: range.end },
        )
        results.push(...aggregateByCampaign('google-ads', rows))
      } else {
        const rows = await fetchMetaAdsCampaignMetrics(
          tokenResult.accessToken,
          connection.external_account_id,
          { startDate: range.start, endDate: range.end },
        )
        results.push(...aggregateByCampaign('meta-ads', rows))
      }
    } catch (error) {
      // Một nền tảng lỗi không được chặn nền tảng còn lại — log rồi bỏ qua,
      // giống cách các adapter đồng bộ khác xử lý lỗi từng phần.
      console.error(`getCampaignPerformance: ${connection.provider} thất bại`, error)
    }
  }

  return results.sort((a, b) => b.costMicros - a.costMicros)
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. Pay attention to `deriveMetrics`'s exact parameter
shape (`MetricTotals` from `src/lib/metrics/types.ts`) — if the field names
above don't match exactly, fix them to match that type, not the other way
around.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/entities.ts
git commit -m "feat: add live campaign-performance reader (Google Ads + Meta)"
```

---

### Task 7: Prompt Studio data layer

**Files:**
- Create: `src/lib/data/prompts.ts`

**Interfaces:**
- Consumes: `resolveDisplayNames` (Task 5), domain types from `src/lib/domain/prompt.ts` (unchanged).
- Produces:
  ```ts
  export const listPrompts: (siteId: string) => Promise<readonly PromptTemplate[]>
  export const getPrompt: (promptId: string) => Promise<PromptTemplate | null>
  export const createPrompt: (input: {
    readonly siteId: string
    readonly name: string
    readonly description: string
    readonly category: PromptCategory
    readonly tags: readonly string[]
    readonly variables: readonly PromptVariable[]
    readonly systemPrompt: string
    readonly userTemplate: string
    readonly createdBy: string // auth user id
  }) => Promise<PromptTemplate>
  export const createPromptVersion: (input: {
    readonly promptId: string
    readonly systemPrompt: string
    readonly userTemplate: string
    readonly notes: string | null
    readonly createdBy: string
  }) => Promise<PromptTemplate>
  export const recordPromptRun: (input: {
    readonly promptId: string
    readonly versionId: string
    readonly inputs: Readonly<Record<string, string>>
    readonly output: string
    readonly model: string
    readonly tokensIn: number
    readonly tokensOut: number
    readonly latencyMs: number
    readonly ranBy: string
  }) => Promise<PromptRun>
  export const ratePromptRun: (runId: string, rating: 1 | 2 | 3 | 4 | 5) => Promise<void>
  ```
  Consumed by Task 9 (`actions/prompts.ts`).

- [ ] **Step 1: Write the data layer**

```ts
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { resolveDisplayNames } from './profiles'
import type {
  PromptCategory,
  PromptRun,
  PromptTemplate,
  PromptVariable,
  PromptVersion,
} from '@/lib/domain/prompt'

interface PromptRow {
  readonly id: string
  readonly site_id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly variables: unknown
  readonly current_version_id: string | null
  readonly tags: readonly string[]
  readonly updated_at: string
}

interface VersionRow {
  readonly id: string
  readonly prompt_id: string
  readonly version: number
  readonly system_prompt: string
  readonly user_template: string
  readonly notes: string | null
  readonly created_by: string | null
  readonly created_at: string
}

const toVersion = (row: VersionRow, names: ReadonlyMap<string, string>): PromptVersion => ({
  id: row.id,
  promptId: row.prompt_id,
  version: row.version,
  systemPrompt: row.system_prompt,
  userTemplate: row.user_template,
  notes: row.notes,
  createdBy: row.created_by ? (names.get(row.created_by) ?? 'Không rõ') : 'Không rõ',
  createdAt: row.created_at,
})

/** Gộp một prompt + toàn bộ version của nó thành `PromptTemplate` — dùng ở
 * cả `listPrompts` (nhiều prompt) lẫn `getPrompt` (một prompt) để không lặp
 * logic gộp hai lần. */
const assemblePromptTemplate = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  promptRow: PromptRow,
): Promise<PromptTemplate> => {
  const { data: versionRows } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('prompt_id', promptRow.id)
    .order('version', { ascending: false })

  const names = await resolveDisplayNames(
    supabase,
    (versionRows ?? []).map((row) => row.created_by).filter((id): id is string => id !== null),
  )

  return {
    id: promptRow.id,
    siteId: promptRow.site_id,
    name: promptRow.name,
    description: promptRow.description,
    category: promptRow.category as PromptCategory,
    currentVersionId: promptRow.current_version_id as string,
    versions: (versionRows ?? []).map((row) => toVersion(row, names)),
    variables: promptRow.variables as readonly PromptVariable[],
    tags: promptRow.tags,
    updatedAt: promptRow.updated_at,
  }
}

export const listPrompts = async (siteId: string): Promise<readonly PromptTemplate[]> => {
  const supabase = await createClient()
  const { data: promptRows, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('site_id', siteId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Không đọc được prompt: ${error.message}`)
  return Promise.all((promptRows ?? []).map((row) => assemblePromptTemplate(supabase, row as PromptRow)))
}

export const getPrompt = async (promptId: string): Promise<PromptTemplate | null> => {
  const supabase = await createClient()
  const { data: promptRow } = await supabase
    .from('prompts')
    .select('*')
    .eq('id', promptId)
    .maybeSingle()

  if (!promptRow) return null
  return assemblePromptTemplate(supabase, promptRow as PromptRow)
}

export const createPrompt = async (input: {
  readonly siteId: string
  readonly name: string
  readonly description: string
  readonly category: PromptCategory
  readonly tags: readonly string[]
  readonly variables: readonly PromptVariable[]
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly createdBy: string
}): Promise<PromptTemplate> => {
  const supabase = await createClient()

  // Ba bước: tạo prompt (chưa có version) → tạo version 1 → gán
  // current_version_id. Domain type `currentVersionId` không cho phép rỗng
  // nên hàm này chỉ trả về sau khi cả ba bước xong, không có trạng thái
  // trung gian lộ ra ngoài.
  const { data: promptRow, error: promptError } = await supabase
    .from('prompts')
    .insert({
      site_id: input.siteId,
      name: input.name,
      description: input.description,
      category: input.category,
      variables: input.variables,
      tags: input.tags,
    })
    .select('*')
    .single()

  if (promptError) throw new Error(`Không tạo được prompt: ${promptError.message}`)

  const { data: versionRow, error: versionError } = await supabase
    .from('prompt_versions')
    .insert({
      prompt_id: promptRow.id,
      version: 1,
      system_prompt: input.systemPrompt,
      user_template: input.userTemplate,
      notes: null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()

  if (versionError) throw new Error(`Không tạo được bản prompt: ${versionError.message}`)

  const { error: updateError } = await supabase
    .from('prompts')
    .update({ current_version_id: versionRow.id })
    .eq('id', promptRow.id)

  if (updateError) throw new Error(`Không gán được bản hiện tại: ${updateError.message}`)

  const created = await getPrompt(promptRow.id)
  if (!created) throw new Error('Prompt vừa tạo không đọc lại được')
  return created
}

export const createPromptVersion = async (input: {
  readonly promptId: string
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly notes: string | null
  readonly createdBy: string
}): Promise<PromptTemplate> => {
  const supabase = await createClient()

  const { data: latest } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('prompt_id', input.promptId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  const { data: versionRow, error: versionError } = await supabase
    .from('prompt_versions')
    .insert({
      prompt_id: input.promptId,
      version: nextVersion,
      system_prompt: input.systemPrompt,
      user_template: input.userTemplate,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .select('*')
    .single()

  if (versionError) throw new Error(`Không tạo được bản prompt: ${versionError.message}`)

  const { error: updateError } = await supabase
    .from('prompts')
    .update({ current_version_id: versionRow.id, updated_at: new Date().toISOString() })
    .eq('id', input.promptId)

  if (updateError) throw new Error(`Không cập nhật được bản hiện tại: ${updateError.message}`)

  const updated = await getPrompt(input.promptId)
  if (!updated) throw new Error('Không đọc lại được prompt sau khi thêm bản mới')
  return updated
}

export const recordPromptRun = async (input: {
  readonly promptId: string
  readonly versionId: string
  readonly inputs: Readonly<Record<string, string>>
  readonly output: string
  readonly model: string
  readonly tokensIn: number
  readonly tokensOut: number
  readonly latencyMs: number
  readonly ranBy: string
}): Promise<PromptRun> => {
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('prompt_runs')
    .insert({
      prompt_id: input.promptId,
      version_id: input.versionId,
      inputs: input.inputs,
      output: input.output,
      model: input.model,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
      latency_ms: input.latencyMs,
      ran_by: input.ranBy,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Không ghi được lượt chạy thử: ${error.message}`)

  const names = await resolveDisplayNames(supabase, [input.ranBy])

  return {
    id: row.id,
    promptId: row.prompt_id,
    versionId: row.version_id,
    inputs: row.inputs as Readonly<Record<string, string>>,
    output: row.output,
    model: row.model,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    latencyMs: row.latency_ms,
    rating: row.rating as 1 | 2 | 3 | 4 | 5 | null,
    ranBy: names.get(input.ranBy) ?? 'Không rõ',
    ranAt: row.ran_at,
  }
}

export const ratePromptRun = async (runId: string, rating: 1 | 2 | 3 | 4 | 5): Promise<void> => {
  const supabase = await createClient()
  const { error } = await supabase.from('prompt_runs').update({ rating }).eq('id', runId)
  if (error) throw new Error(`Không lưu được đánh giá: ${error.message}`)
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/prompts.ts
git commit -m "feat: add real Prompt Studio data layer"
```

---

### Task 8: Variable resolution engine

**Files:**
- Create: `src/lib/prompts/resolve-variables.ts`

**Interfaces:**
- Consumes: `getChannelSummaries` (`src/lib/data/site-channels.ts`), `getCampaignPerformance` (Task 6), `hasCapability`/`PROVIDER_META` (`src/lib/domain/providers.ts`), `deriveMetrics` (`src/lib/metrics/derive.ts`), `formatCurrencyCompact`/`formatDateRange` (`src/lib/format.ts`).
- Produces:
  ```ts
  export class VariableResolutionError extends Error {
    constructor(readonly variableName: string, message: string)
  }

  export const resolveVariables: (params: {
    readonly variables: readonly PromptVariable[]
    readonly site: Site
    readonly range: { readonly start: string; readonly end: string }
    readonly manualInputs: Readonly<Record<string, string>>
  }) => Promise<Readonly<Record<string, string>>>
  ```
  Throws `VariableResolutionError` for any `required` variable with no
  resolver and no manual input — never returns a placeholder value.
  Consumed by Task 9 (`actions/prompts.ts`) and Task 13
  (`lib/agents/run-agent.ts`).

- [ ] **Step 1: Write the resolver**

```ts
import 'server-only'

import { getChannelSummaries } from '@/lib/data/site-channels'
import { getCampaignPerformance } from '@/lib/data/entities'
import { deriveMetrics } from '@/lib/metrics/derive'
import { hasCapability, PROVIDER_META, PROVIDERS } from '@/lib/domain/providers'
import { formatCurrencyCompact, formatDateRange } from '@/lib/format'
import type { PromptVariable } from '@/lib/domain/prompt'
import type { Site } from '@/lib/domain/site'

/**
 * Registry biến metric/entity — CỐ TÌNH là danh sách hữu hạn, không phải bộ
 * ánh xạ tên-biến-tuỳ-ý-sang-số-liệu. Một registry mở sẽ là đúng cách một
 * prompt tự bịa số cho biến chưa ai nối dữ liệu thật — thà báo lỗi rõ ràng.
 * Thêm biến mới = thêm một entry ở đây.
 */

export class VariableResolutionError extends Error {
  constructor(
    readonly variableName: string,
    message: string,
  ) {
    super(message)
    this.name = 'VariableResolutionError'
  }
}

type Resolver = (site: Site, range: { readonly start: string; readonly end: string }) => Promise<string>

const SPEND_PROVIDERS = PROVIDERS.filter((provider) => hasCapability(provider, 'spend'))

const METRIC_RESOLVERS: Readonly<Record<string, Resolver>> = {
  accountCpa: async (site, range) => {
    const summaries = await getChannelSummaries(site.id, range)
    let costMicros = 0
    let conversions = 0
    for (const provider of SPEND_PROVIDERS) {
      const summary = summaries.get(provider)
      if (!summary?.connected) continue
      costMicros += summary.totals.costMicros
      conversions += summary.totals.conversions
    }
    const { cpaMicros } = deriveMetrics({
      sessions: null,
      users: null,
      conversions,
      clicks: null,
      impressions: null,
      costMicros,
      conversionValueMicros: null,
    })
    return formatCurrencyCompact(cpaMicros, site.currency)
  },
}

const ENTITY_RESOLVERS: Readonly<Record<string, Resolver>> = {
  campaignTable: async (site, range) => {
    const campaigns = await getCampaignPerformance(site.id, range)
    if (campaigns.length === 0) return '(Chưa có dữ liệu chiến dịch trong khoảng ngày này)'

    const header = '| Chiến dịch | Nền tảng | Chi phí | Chuyển đổi | CPA | ROAS |\n|---|---|---|---|---|---|'
    const rows = campaigns
      .slice(0, 20)
      .map((c) => {
        const cpa = c.cpaMicros === null ? '—' : formatCurrencyCompact(c.cpaMicros, site.currency)
        const roas = c.roas === null ? '—' : `${c.roas.toFixed(2)}x`
        return `| ${c.campaignName} | ${PROVIDER_META[c.provider].label} | ${formatCurrencyCompact(c.costMicros, site.currency)} | ${c.conversions} | ${cpa} | ${roas} |`
      })
      .join('\n')
    return `${header}\n${rows}`
  },
}

const SITE_RESOLVERS: Readonly<Record<string, Resolver>> = {
  domain: async (site) => site.domain,
  dateRange: async (_site, range) => formatDateRange(range.start, range.end),
}

export const resolveVariables = async (params: {
  readonly variables: readonly PromptVariable[]
  readonly site: Site
  readonly range: { readonly start: string; readonly end: string }
  readonly manualInputs: Readonly<Record<string, string>>
}): Promise<Readonly<Record<string, string>>> => {
  const resolved: Record<string, string> = {}

  for (const variable of params.variables) {
    if (variable.source === 'manual') {
      const value = params.manualInputs[variable.name] ?? variable.defaultValue
      if (value === null || value === undefined) {
        if (variable.required) {
          throw new VariableResolutionError(variable.name, `Thiếu giá trị nhập tay cho "${variable.label}"`)
        }
        continue
      }
      resolved[variable.name] = value
      continue
    }

    const registry = variable.source === 'site' ? SITE_RESOLVERS : variable.source === 'metric' ? METRIC_RESOLVERS : ENTITY_RESOLVERS
    const resolver = registry[variable.name]

    if (!resolver) {
      if (variable.required) {
        throw new VariableResolutionError(
          variable.name,
          `Chưa có cách lấy biến "${variable.label}" (nguồn: ${variable.source}) — chưa nối dữ liệu thật cho biến này`,
        )
      }
      continue
    }

    resolved[variable.name] = await resolver(params.site, params.range)
  }

  return resolved
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompts/resolve-variables.ts
git commit -m "feat: add prompt variable resolution engine (real cross-channel data)"
```

---

### Task 9: Prompt Studio server actions

**Files:**
- Create: `src/lib/actions/prompts.ts`

**Interfaces:**
- Consumes: `createPrompt`/`createPromptVersion`/`recordPromptRun`/`ratePromptRun` (Task 7), `resolveVariables` (Task 8), `callClaude`/`extractText`/`DEFAULT_CLAUDE_MODEL` (Task 4), `getSite` (`src/lib/data/sites.ts`), `getCurrentUser` (`src/lib/supabase/server.ts`), `extractVariableNames`/`findUndeclaredVariables` (`src/lib/domain/prompt.ts`, already exist).
- Produces: `'use server'` actions `createPromptAction`, `savePromptVersionAction`,
  `testRunPromptAction`, `ratePromptRunAction` — consumed by Task 10's page wiring.

- [ ] **Step 1: Write the actions**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { callClaude, extractText, DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import { createPrompt, createPromptVersion, recordPromptRun, ratePromptRun } from '@/lib/data/prompts'
import { resolveVariables, VariableResolutionError } from '@/lib/prompts/resolve-variables'
import { getSite } from '@/lib/data/sites'
import { getCurrentUser } from '@/lib/supabase/server'
import { extractVariableNames, findUndeclaredVariables } from '@/lib/domain/prompt'
import type { PromptCategory, PromptRun, PromptVariable } from '@/lib/domain/prompt'

const requireUserId = async (): Promise<string> => {
  const user = await getCurrentUser()
  if (!user) throw new Error('Chưa đăng nhập')
  return user.id
}

export const createPromptAction = async (input: {
  readonly siteId: string
  readonly name: string
  readonly description: string
  readonly category: PromptCategory
  readonly tags: readonly string[]
  readonly variables: readonly PromptVariable[]
  readonly systemPrompt: string
  readonly userTemplate: string
}) => {
  const userId = await requireUserId()
  const undeclared = findUndeclaredVariables(input.userTemplate, input.variables)
  if (undeclared.length > 0) {
    throw new Error(`Template dùng biến chưa khai báo: ${undeclared.join(', ')}`)
  }

  const prompt = await createPrompt({ ...input, createdBy: userId })
  revalidatePath(`/${input.siteId}/prompts`)
  return prompt
}

export const savePromptVersionAction = async (input: {
  readonly siteId: string
  readonly promptId: string
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly notes: string | null
}) => {
  const userId = await requireUserId()
  const prompt = await createPromptVersion({
    promptId: input.promptId,
    systemPrompt: input.systemPrompt,
    userTemplate: input.userTemplate,
    notes: input.notes,
    createdBy: userId,
  })
  revalidatePath(`/${input.siteId}/prompts`)
  return prompt
}

export interface TestRunState {
  readonly run: PromptRun | null
  readonly error: string | null
}

/**
 * Dùng biến template người dùng gõ tay (`manualInputs`) — không đợi phải
 * lưu prompt trước mới chạy thử được, khớp UI "Chạy thử" bấm ngay tại chỗ.
 */
export const testRunPromptAction = async (input: {
  readonly siteId: string
  readonly promptId: string
  readonly versionId: string
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly variables: readonly PromptVariable[]
  readonly range: { readonly start: string; readonly end: string }
  readonly manualInputs: Readonly<Record<string, string>>
}): Promise<TestRunState> => {
  const userId = await requireUserId()
  const site = await getSite(input.siteId)
  if (!site) return { run: null, error: 'Không tìm thấy website' }

  let resolvedVars: Readonly<Record<string, string>>
  try {
    resolvedVars = await resolveVariables({
      variables: input.variables,
      site,
      range: input.range,
      manualInputs: input.manualInputs,
    })
  } catch (error) {
    if (error instanceof VariableResolutionError) return { run: null, error: error.message }
    throw error
  }

  let filledTemplate = input.userTemplate
  for (const name of extractVariableNames(input.userTemplate)) {
    filledTemplate = filledTemplate.replaceAll(`{{${name}}}`, resolvedVars[name] ?? '')
  }

  const { message, latencyMs } = await callClaude({
    systemPrompt: input.systemPrompt,
    messages: [{ role: 'user', content: filledTemplate }],
    model: DEFAULT_CLAUDE_MODEL,
  })

  const run = await recordPromptRun({
    promptId: input.promptId,
    versionId: input.versionId,
    inputs: resolvedVars,
    output: extractText(message),
    model: message.model,
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
    latencyMs,
    ranBy: userId,
  })

  return { run, error: null }
}

export const ratePromptRunAction = async (runId: string, rating: 1 | 2 | 3 | 4 | 5) => {
  await ratePromptRun(runId, rating)
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/prompts.ts
git commit -m "feat: add Prompt Studio server actions (real Claude test-run)"
```

---

### Task 10: Wire Prompt Studio page to real data

**Files:**
- Modify: `src/app/(app)/[siteId]/prompts/page.tsx`
- Modify: any client component in `src/components/prompts/` this page renders that currently calls a mock function directly (read the current file first — it was built against `mock/prompts.ts`'s exact shape, which now matches `data/prompts.ts`'s output exactly, so most of this task is import swaps, not logic changes)

**Interfaces:**
- Consumes: `listPrompts` (Task 7), `createPromptAction`/`savePromptVersionAction`/`testRunPromptAction`/`ratePromptRunAction` (Task 9).

- [ ] **Step 1: Read the current page and its child components**

Read `src/app/(app)/[siteId]/prompts/page.tsx` in full, and every component
under `src/components/prompts/` it imports. Note every place it imports
from `@/mock/prompts` — those are the exact swap points.

- [ ] **Step 2: Swap the data source**

Replace `import { MOCK_PROMPTS, ... } from '@/mock/prompts'` with
`import { listPrompts } from '@/lib/data/prompts'`, and replace the
in-memory filtering the mock functions did (`promptsOfSite(site.id)` or
similar) with `await listPrompts(site.id)`. The domain shape returned is
identical (`PromptTemplate[]`), so no JSX changes should be needed purely
for this swap.

- [ ] **Step 3: Wire "Chạy thử" to the real action**

Find the "Chạy thử" button — currently either a no-op or referencing mock
data. Wrap it in a form or `onClick` handler calling
`testRunPromptAction` with the prompt's current version's `systemPrompt`/
`userTemplate`/`variables`, the site's active date range (read from
`searchParams` per this app's existing date-range convention — see
`src/lib/domain/date-range-param.ts` and how `overview/page.tsx` reads
`range`/`from`/`to`), and an empty `manualInputs` object unless the prompt
declares `manual`-source variables (in which case render input fields for
those, matching whatever the current mock-based UI already scaffolds for
this — check for existing but disconnected form elements first). Render
`TestRunState.error` inline if present; otherwise render the returned
`PromptRun.output` in the run history area the page already has a slot for.

- [ ] **Step 4: Wire "Prompt mới" / edit to `createPromptAction`/`savePromptVersionAction`**

Same pattern — these buttons currently either do nothing or reference mock
functions; point their form submissions at the new server actions.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/\[siteId\]/prompts/page.tsx src/components/prompts/
git commit -m "feat: wire Prompt Studio page to real data and Claude test-run"
```

---

### Task 11: Agents data layer

**Files:**
- Create: `src/lib/data/agents.ts`

**Interfaces:**
- Consumes: `resolveDisplayNames` (Task 5), domain types from `src/lib/domain/agent.ts` (unchanged).
- Produces:
  ```ts
  export const listAgents: (siteId: string) => Promise<readonly Agent[]>
  export const getAgent: (agentId: string) => Promise<Agent | null>
  export const createAgent: (input: {
    readonly siteId: string
    readonly role: AgentRole
    readonly name: string
    readonly description: string
    readonly promptId: string
    readonly tools: readonly AgentTool[]
    readonly schedule: AgentSchedule | null
  }) => Promise<Agent>
  export const setAgentEnabled: (agentId: string, enabled: boolean) => Promise<void>
  export const listRunsForSite: (siteId: string) => Promise<readonly AgentRun[]>  // pendingActions: [] on every item — list view doesn't need it
  export const listRunsForAgent: (agentId: string) => Promise<readonly AgentRun[]>  // pendingActions populated — detail view does
  export const getRun: (runId: string) => Promise<AgentRun | null>  // pendingActions populated
  export const listPendingActionsForSite: (siteId: string) => Promise<readonly PendingAction[]>
  export const createRun: (input: {
    readonly agentId: string
    readonly siteId: string
    readonly trigger: 'schedule' | 'manual' | 'event'
  }) => Promise<AgentRun>  // status='running'
  export const appendRunStep: (runId: string, step: Omit<AgentStep, 'index'>) => Promise<void>
  export const finishRun: (runId: string, result: {
    readonly status: 'succeeded' | 'failed' | 'pending-approval'
    readonly summary: string | null
    readonly tokensUsed: number
  }) => Promise<void>
  export const createPendingAction: (input: {
    readonly runId: string
    readonly tool: WriteToolName
    readonly actionKind: ActionKind
    readonly provider: ProviderId
    readonly targetEntityId: string
    readonly targetEntityName: string
    readonly summary: string
    readonly diff: readonly ActionDiffRow[]
    readonly rationale: string
  }) => Promise<PendingAction>
  export const decidePendingAction: (
    pendingActionId: string,
    decision: 'approved' | 'rejected',
    decidedBy: string, // auth user id
  ) => Promise<void>
  export const setAgentLastRunAt: (agentId: string, at: string) => Promise<void>
  ```
  Consumed by Task 12 (`lib/agents/tools.ts`), Task 13 (`lib/agents/run-agent.ts`),
  Task 14 (`actions/agents.ts`), Task 16 (cron route).

- [ ] **Step 1: Write the data layer**

```ts
import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDisplayNames } from './profiles'
import type {
  ActionDiffRow,
  Agent,
  AgentRole,
  AgentRun,
  AgentRunStatus,
  AgentSchedule,
  AgentStep,
  AgentTool,
  PendingAction,
} from '@/lib/domain/agent'
import type { ActionKind } from '@/lib/domain/insight'
import type { ProviderId } from '@/lib/domain/providers'
import type { WriteToolName } from '@/lib/domain/agent'

interface AgentRow {
  readonly id: string
  readonly site_id: string
  readonly role: string
  readonly name: string
  readonly description: string
  readonly prompt_id: string
  readonly tools: unknown
  readonly schedule: unknown
  readonly enabled: boolean
  readonly last_run_at: string | null
}

const toAgent = (row: AgentRow): Agent => ({
  id: row.id,
  siteId: row.site_id,
  role: row.role as AgentRole,
  name: row.name,
  description: row.description,
  promptId: row.prompt_id,
  tools: row.tools as readonly AgentTool[],
  schedule: row.schedule as AgentSchedule | null,
  enabled: row.enabled,
  lastRunAt: row.last_run_at,
})

interface RunRow {
  readonly id: string
  readonly agent_id: string
  readonly site_id: string
  readonly status: string
  readonly trigger: string
  readonly steps: unknown
  readonly summary: string | null
  readonly started_at: string
  readonly finished_at: string | null
  readonly tokens_used: number | null
}

interface PendingActionRow {
  readonly id: string
  readonly run_id: string
  readonly tool: string
  readonly action_kind: string
  readonly provider: string
  readonly target_entity_id: string
  readonly target_entity_name: string
  readonly summary: string
  readonly diff: unknown
  readonly rationale: string
  readonly decided_by: string | null
  readonly decided_at: string | null
  readonly decision: string | null
}

const toPendingAction = (row: PendingActionRow, names: ReadonlyMap<string, string>): PendingAction => ({
  id: row.id,
  runId: row.run_id,
  tool: row.tool as WriteToolName,
  actionKind: row.action_kind as ActionKind,
  provider: row.provider as ProviderId,
  targetEntityId: row.target_entity_id,
  targetEntityName: row.target_entity_name,
  summary: row.summary,
  diff: row.diff as readonly ActionDiffRow[],
  rationale: row.rationale,
  decidedBy: row.decided_by ? (names.get(row.decided_by) ?? 'Không rõ') : null,
  decidedAt: row.decided_at,
  decision: row.decision as 'approved' | 'rejected' | null,
})

const toRun = (row: RunRow, pendingActions: readonly PendingAction[]): AgentRun => ({
  id: row.id,
  agentId: row.agent_id,
  siteId: row.site_id,
  status: row.status as AgentRunStatus,
  trigger: row.trigger as AgentRun['trigger'],
  steps: row.steps as readonly AgentStep[],
  pendingActions,
  summary: row.summary,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  tokensUsed: row.tokens_used,
})

export const listAgents = async (siteId: string): Promise<readonly Agent[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('agents').select('*').eq('site_id', siteId).order('created_at', { ascending: true })
  if (error) throw new Error(`Không đọc được agent: ${error.message}`)
  return (data ?? []).map((row) => toAgent(row as AgentRow))
}

export const getAgent = async (agentId: string): Promise<Agent | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('agents').select('*').eq('id', agentId).maybeSingle()
  return data ? toAgent(data as AgentRow) : null
}

export const createAgent = async (input: {
  readonly siteId: string
  readonly role: AgentRole
  readonly name: string
  readonly description: string
  readonly promptId: string
  readonly tools: readonly AgentTool[]
  readonly schedule: AgentSchedule | null
}): Promise<Agent> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agents')
    .insert({
      site_id: input.siteId,
      role: input.role,
      name: input.name,
      description: input.description,
      prompt_id: input.promptId,
      tools: input.tools,
      schedule: input.schedule,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Không tạo được agent: ${error.message}`)
  return toAgent(data as AgentRow)
}

export const setAgentEnabled = async (agentId: string, enabled: boolean): Promise<void> => {
  const supabase = await createClient()
  const { error } = await supabase.from('agents').update({ enabled }).eq('id', agentId)
  if (error) throw new Error(`Không đổi được trạng thái agent: ${error.message}`)
}

export const listRunsForSite = async (siteId: string): Promise<readonly AgentRun[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('site_id', siteId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Không đọc được lịch sử chạy: ${error.message}`)
  return (data ?? []).map((row) => toRun(row as RunRow, []))
}

const attachPendingActions = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  runRows: readonly RunRow[],
): Promise<readonly AgentRun[]> => {
  if (runRows.length === 0) return []

  const { data: pendingRows } = await supabase
    .from('pending_actions')
    .select('*')
    .in('run_id', runRows.map((r) => r.id))

  const names = await resolveDisplayNames(
    supabase,
    (pendingRows ?? []).map((row) => row.decided_by).filter((id): id is string => id !== null),
  )

  const byRun = new Map<string, PendingAction[]>()
  for (const row of (pendingRows ?? []) as PendingActionRow[]) {
    const list = byRun.get(row.run_id) ?? []
    list.push(toPendingAction(row, names))
    byRun.set(row.run_id, list)
  }

  return runRows.map((row) => toRun(row, byRun.get(row.id) ?? []))
}

export const listRunsForAgent = async (agentId: string): Promise<readonly AgentRun[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('agent_id', agentId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Không đọc được lịch sử chạy: ${error.message}`)
  return attachPendingActions(supabase, (data ?? []) as RunRow[])
}

export const getRun = async (runId: string): Promise<AgentRun | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('agent_runs').select('*').eq('id', runId).maybeSingle()
  if (!data) return null
  const [run] = await attachPendingActions(supabase, [data as RunRow])
  return run ?? null
}

export const listPendingActionsForSite = async (siteId: string): Promise<readonly PendingAction[]> => {
  const supabase = await createClient()
  const { data: runRows } = await supabase.from('agent_runs').select('id').eq('site_id', siteId)
  const runIds = (runRows ?? []).map((r) => r.id)
  if (runIds.length === 0) return []

  const { data: pendingRows, error } = await supabase
    .from('pending_actions')
    .select('*')
    .in('run_id', runIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Không đọc được hành động chờ duyệt: ${error.message}`)

  const names = await resolveDisplayNames(
    supabase,
    (pendingRows ?? []).map((row) => row.decided_by).filter((id): id is string => id !== null),
  )

  return ((pendingRows ?? []) as PendingActionRow[]).map((row) => toPendingAction(row, names))
}

/** Dùng ADMIN client — được gọi từ cron (không có phiên người dùng) VÀ từ
 * Server Action chạy trong `after()` (phiên request gốc đã trả response,
 * cookie không còn đáng tin để tạo client thường — cùng lý do
 * `sync-connection.ts` luôn dùng admin). */
export const createRun = async (input: {
  readonly agentId: string
  readonly siteId: string
  readonly trigger: 'schedule' | 'manual' | 'event'
}): Promise<AgentRun> => {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_runs')
    .insert({ agent_id: input.agentId, site_id: input.siteId, trigger: input.trigger, status: 'running' })
    .select('*')
    .single()

  if (error) throw new Error(`Không tạo được lượt chạy: ${error.message}`)
  return toRun(data as RunRow, [])
}

export const appendRunStep = async (runId: string, step: Omit<AgentStep, 'index'>): Promise<void> => {
  const admin = createAdminClient()
  const { data: current } = await admin.from('agent_runs').select('steps').eq('id', runId).maybeSingle()
  const existingSteps = (current?.steps as readonly AgentStep[] | undefined) ?? []
  const nextStep: AgentStep = { ...step, index: existingSteps.length }

  const { error } = await admin
    .from('agent_runs')
    .update({ steps: [...existingSteps, nextStep] })
    .eq('id', runId)

  if (error) throw new Error(`Không ghi được bước chạy: ${error.message}`)
}

export const finishRun = async (
  runId: string,
  result: { readonly status: 'succeeded' | 'failed' | 'pending-approval'; readonly summary: string | null; readonly tokensUsed: number },
): Promise<void> => {
  const admin = createAdminClient()
  const { error } = await admin
    .from('agent_runs')
    .update({
      status: result.status,
      summary: result.summary,
      tokens_used: result.tokensUsed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (error) throw new Error(`Không đóng được lượt chạy: ${error.message}`)
}

export const createPendingAction = async (input: {
  readonly runId: string
  readonly tool: WriteToolName
  readonly actionKind: ActionKind
  readonly provider: ProviderId
  readonly targetEntityId: string
  readonly targetEntityName: string
  readonly summary: string
  readonly diff: readonly { readonly field: string; readonly before: string; readonly after: string }[]
  readonly rationale: string
}): Promise<PendingAction> => {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pending_actions')
    .insert({
      run_id: input.runId,
      tool: input.tool,
      action_kind: input.actionKind,
      provider: input.provider,
      target_entity_id: input.targetEntityId,
      target_entity_name: input.targetEntityName,
      summary: input.summary,
      diff: input.diff,
      rationale: input.rationale,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Không tạo được đề xuất: ${error.message}`)
  return toPendingAction(data as PendingActionRow, new Map())
}

export const decidePendingAction = async (
  pendingActionId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
): Promise<void> => {
  const supabase = await createClient()
  const { error } = await supabase
    .from('pending_actions')
    .update({ decision, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq('id', pendingActionId)

  if (error) throw new Error(`Không lưu được quyết định: ${error.message}`)
}

export const setAgentLastRunAt = async (agentId: string, at: string): Promise<void> => {
  const admin = createAdminClient()
  const { error } = await admin.from('agents').update({ last_run_at: at }).eq('id', agentId)
  if (error) throw new Error(`Không cập nhật được lần chạy gần nhất: ${error.message}`)
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/agents.ts
git commit -m "feat: add real Agents data layer"
```

---

### Task 12: Agent tool registry

**Files:**
- Create: `src/lib/agents/tools.ts`

**Interfaces:**
- Consumes: `createPendingAction` (Task 11), `getChannelSummaries` (`src/lib/data/site-channels.ts`), `getCampaignPerformance` (Task 6). Three of the six read-tools (`fetch-page-content`, `check-ai-citation`, `read-search-queries`) have **no verified real data source** in this codebase yet — they are deliberately implemented as honest "chưa sẵn sàng" stubs below rather than force-fit onto a loosely-related function, matching this app's "no bịa số" convention. Do not wire them to `getRealInsights`/`getRealExploreRows` or similar without first confirming those actually return the specific shape a read-tool needs (page content, AI-citation checks, Search Console query rows) — if you find a real match while implementing, upgrading the stub is a welcome improvement but is not required by this task.
- Produces:
  ```ts
  export interface ToolContext {
    readonly siteId: string
    readonly runId: string
    readonly range: { readonly start: string; readonly end: string }
  }

  export interface ToolDefinition {
    readonly description: string
    readonly inputSchema: Record<string, unknown>
    readonly run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  }

  export const TOOL_REGISTRY: Readonly<Record<AgentToolName, ToolDefinition>>
  ```
  Consumed by Task 13 (`lib/agents/run-agent.ts`).

- [ ] **Step 1: Write the registry**

```ts
import 'server-only'

import { getChannelSummaries } from '@/lib/data/site-channels'
import { getCampaignPerformance } from '@/lib/data/entities'
import { createPendingAction } from '@/lib/data/agents'
import { hasCapability, PROVIDERS, isProviderId } from '@/lib/domain/providers'
import { formatCurrencyCompact } from '@/lib/format'
import type { AgentToolName } from '@/lib/domain/agent'
import type { ActionKind } from '@/lib/domain/insight'

export interface ToolContext {
  readonly siteId: string
  readonly runId: string
  readonly range: { readonly start: string; readonly end: string }
  readonly currency: string
}

export interface ToolDefinition {
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

/**
 * Mọi write-tool CHIA SẺ một hành vi: không ghi gì ra nền tảng ngoài, chỉ
 * tạo một hàng `pending_actions` rồi trả lời model bằng một câu xác nhận cố
 * định. Vòng lặp ở `run-agent.ts` là nơi THẬT SỰ dừng hẳn sau khi thấy write
 * tool — hàm `run` ở đây không tự dừng vòng lặp, chỉ ghi đề xuất.
 */
const proposeAction = async (
  tool: Extract<AgentToolName, 'apply-budget-change' | 'pause-campaign' | 'resume-campaign' | 'update-ad-copy' | 'add-negative-keyword' | 'publish-report'>,
  actionKind: ActionKind,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> => {
  const provider = typeof input.provider === 'string' && isProviderId(input.provider) ? input.provider : 'google-ads'
  const targetEntityId = String(input.entityId ?? input.campaignId ?? 'unknown')
  const targetEntityName = String(input.entityName ?? input.campaignName ?? 'Không rõ')
  const summary = String(input.summary ?? '')
  const rationale = String(input.rationale ?? '')
  const diff = Array.isArray(input.diff)
    ? (input.diff as readonly { field: string; before: string; after: string }[])
    : []

  await createPendingAction({
    runId: ctx.runId,
    tool,
    actionKind,
    provider,
    targetEntityId,
    targetEntityName,
    summary,
    diff,
    rationale,
  })

  return 'Đề xuất đã được ghi lại, chờ người dùng duyệt. Không có gì được ghi ra nền tảng quảng cáo — dừng phân tích ở đây.'
}

export const TOOL_REGISTRY: Readonly<Record<AgentToolName, ToolDefinition>> = {
  'query-metrics': {
    description: 'Đọc tổng số liệu thật (chi phí, chuyển đổi, CPA, ROAS) của mọi kênh quảng cáo đã kết nối trong khoảng ngày đang xét.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const summaries = await getChannelSummaries(ctx.siteId, ctx.range)
      const lines = PROVIDERS.filter((p) => hasCapability(p, 'spend'))
        .map((provider) => {
          const s = summaries.get(provider)
          if (!s?.connected) return null
          return `${provider}: chi phí ${formatCurrencyCompact(s.totals.costMicros, ctx.currency)}, chuyển đổi ${s.totals.conversions}`
        })
        .filter((line): line is string => line !== null)
      return lines.length > 0 ? lines.join('\n') : 'Chưa có kênh quảng cáo nào kết nối.'
    },
  },
  'list-entities': {
    description: 'Liệt kê chiến dịch thật (Google Ads, Meta Ads) kèm chi phí/chuyển đổi/CPA/ROAS trong khoảng ngày đang xét.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const campaigns = await getCampaignPerformance(ctx.siteId, ctx.range)
      if (campaigns.length === 0) return 'Chưa có dữ liệu chiến dịch.'
      return campaigns
        .slice(0, 30)
        .map((c) => `${c.campaignName} (${c.provider}): chi phí ${formatCurrencyCompact(c.costMicros, ctx.currency)}, chuyển đổi ${c.conversions}, CPA ${c.cpaMicros === null ? '—' : formatCurrencyCompact(c.cpaMicros, ctx.currency)}`)
        .join('\n')
    },
  },
  'compare-periods': {
    description: 'So tổng chi phí/chuyển đổi kỳ hiện tại với kỳ liền trước, cùng độ dài.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const length = Math.round((new Date(ctx.range.end).getTime() - new Date(ctx.range.start).getTime()) / 86_400_000) + 1
      const previousEnd = new Date(new Date(ctx.range.start).getTime() - 86_400_000)
      const previousStart = new Date(previousEnd.getTime() - (length - 1) * 86_400_000)
      const toIso = (d: Date) => d.toISOString().slice(0, 10)

      const [current, previous] = await Promise.all([
        getChannelSummaries(ctx.siteId, ctx.range),
        getChannelSummaries(ctx.siteId, { start: toIso(previousStart), end: toIso(previousEnd) }),
      ])

      const lines = PROVIDERS.filter((p) => hasCapability(p, 'spend')).map((provider) => {
        const c = current.get(provider)
        const p = previous.get(provider)
        if (!c?.connected) return null
        return `${provider}: chi phí ${formatCurrencyCompact(c.totals.costMicros, ctx.currency)} (kỳ trước ${formatCurrencyCompact(p?.totals.costMicros ?? 0, ctx.currency)})`
      }).filter((line): line is string => line !== null)

      return lines.length > 0 ? lines.join('\n') : 'Chưa có kênh quảng cáo nào kết nối.'
    },
  },
  'fetch-page-content': {
    description: 'Tool này CHƯA nối dữ liệu thật trong bản này — trả về thông báo rõ ràng thay vì bịa nội dung trang.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    run: async () => 'Tool đọc nội dung trang chưa sẵn sàng trong bản này.',
  },
  'check-ai-citation': {
    description: 'Tool này CHƯA nối dữ liệu thật trong bản này — trả về thông báo rõ ràng thay vì bịa kết quả.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => 'Tool kiểm tra trích dẫn AI chưa sẵn sàng trong bản này.',
  },
  'read-search-queries': {
    description: 'Tool này CHƯA nối dữ liệu thật trong bản này — trả về thông báo rõ ràng thay vì bịa truy vấn.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => 'Tool đọc truy vấn Search Console chưa sẵn sàng trong bản này.',
  },
  'apply-budget-change': {
    description: 'ĐỀ XUẤT đổi ngân sách một chiến dịch (không tự thực thi). Gọi khi thấy CPA chênh lệch rõ giữa các chiến dịch.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        campaignId: { type: 'string' },
        campaignName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
        diff: { type: 'array', items: { type: 'object' } },
      },
      required: ['campaignId', 'campaignName', 'summary', 'rationale', 'diff'],
    },
    run: (input, ctx) => proposeAction('apply-budget-change', 'adjust-budget', input, ctx),
  },
  'pause-campaign': {
    description: 'ĐỀ XUẤT tạm dừng một chiến dịch (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        campaignId: { type: 'string' },
        campaignName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['campaignId', 'campaignName', 'summary', 'rationale'],
    },
    run: (input, ctx) => proposeAction('pause-campaign', 'pause-entity', { ...input, diff: [] }, ctx),
  },
  'resume-campaign': {
    description: 'ĐỀ XUẤT chạy lại một chiến dịch đang tạm dừng (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        campaignId: { type: 'string' },
        campaignName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['campaignId', 'campaignName', 'summary', 'rationale'],
    },
    run: (input, ctx) => proposeAction('resume-campaign', 'resume-entity', { ...input, diff: [] }, ctx),
  },
  'update-ad-copy': {
    description: 'ĐỀ XUẤT đổi nội dung quảng cáo (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        entityId: { type: 'string' },
        entityName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
        diff: { type: 'array', items: { type: 'object' } },
      },
      required: ['entityId', 'entityName', 'summary', 'rationale', 'diff'],
    },
    run: (input, ctx) => proposeAction('update-ad-copy', 'replace-creative', input, ctx),
  },
  'add-negative-keyword': {
    description: 'ĐỀ XUẤT thêm từ khoá phủ định (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        entityId: { type: 'string' },
        entityName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['entityId', 'entityName', 'summary', 'rationale'],
    },
    run: (input, ctx) => proposeAction('add-negative-keyword', 'add-negative-keyword', { ...input, diff: [] }, ctx),
  },
  'publish-report': {
    description: 'ĐỀ XUẤT đăng một báo cáo tổng hợp (không tự thực thi — chỉ tạo đề xuất chờ duyệt, giống mọi write-tool khác trong bản này).',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['summary', 'rationale'],
    },
    run: (input, ctx) =>
      proposeAction(
        'publish-report',
        'adjust-budget', // không có ActionKind riêng cho "publish" — xem ghi chú trong migration Task 2, cột không ràng buộc CHECK nên giá trị này chỉ để hiển thị nhãn, chọn tạm giá trị gần nghĩa nhất
        { ...input, provider: 'ga4', entityId: 'report', entityName: 'Báo cáo tuần', diff: [] },
        ctx,
      ),
  },
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: check `getChannelSummaries`'s exact range parameter shape
(`{start, end}` vs `{startDate, endDate}`) against what's actually imported
— fix the call site to match the real signature, not this plan, if they
differ.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/tools.ts
git commit -m "feat: add agent tool registry (read tools real, write tools propose-only)"
```

---

### Task 13: Agent execution loop

**Files:**
- Create: `src/lib/agents/run-agent.ts`

**Interfaces:**
- Consumes: `getAgent`/`createRun`/`appendRunStep`/`finishRun`/`setAgentLastRunAt` (Task 11), `TOOL_REGISTRY` (Task 12), `callClaude` (Task 4), `resolveVariables` (Task 8), `getPrompt` (Task 7), `getSite` (`src/lib/data/sites.ts`), `isWriteTool` (`src/lib/domain/agent.ts`, already exists).
- Produces: `export const runAgent: (agentId: string, trigger: 'schedule' | 'manual') => Promise<void>` — consumed by Task 14 (manual trigger via `after()`) and Task 16 (cron).

- [ ] **Step 1: Write the loop**

```ts
import 'server-only'

import { getAgent, createRun, appendRunStep, finishRun, setAgentLastRunAt } from '@/lib/data/agents'
import { getPrompt } from '@/lib/data/prompts'
import { getSite } from '@/lib/data/sites'
import { resolveVariables, VariableResolutionError } from '@/lib/prompts/resolve-variables'
import { callClaude, extractText, DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import { TOOL_REGISTRY } from './tools'
import { isWriteTool } from '@/lib/domain/agent'
import type { AgentToolName } from '@/lib/domain/agent'
import type Anthropic from '@anthropic-ai/sdk'

const MAX_ROUNDS = 8

/** Không có "range hiện tại từ URL" khi chạy theo lịch/thủ công — 28 ngày
 * gần nhất là mặc định hợp lý nhất, khớp preset mặc định của topbar. */
const defaultRange = (): { readonly start: string; readonly end: string } => {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 27)
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toIso(start), end: toIso(end) }
}

export const runAgent = async (agentId: string, trigger: 'schedule' | 'manual'): Promise<void> => {
  const agent = await getAgent(agentId)
  if (!agent) return

  const [prompt, site] = await Promise.all([getPrompt(agent.promptId), getSite(agent.siteId)])
  if (!prompt || !site) return

  const run = await createRun({ agentId, siteId: agent.siteId, trigger })
  const range = defaultRange()

  let resolvedVars: Readonly<Record<string, string>>
  try {
    resolvedVars = await resolveVariables({
      variables: prompt.variables,
      site,
      range,
      manualInputs: {},
    })
  } catch (error) {
    const message = error instanceof VariableResolutionError ? error.message : 'Lỗi không xác định khi điền biến prompt'
    await appendRunStep(run.id, { kind: 'output', tool: null, content: message, at: new Date().toISOString() })
    await finishRun(run.id, { status: 'failed', summary: message, tokensUsed: 0 })
    return
  }

  const currentVersion = prompt.versions.find((v) => v.id === prompt.currentVersionId)
  if (!currentVersion) {
    await finishRun(run.id, { status: 'failed', summary: 'Prompt không có bản hiện tại', tokensUsed: 0 })
    return
  }

  let filledTemplate = currentVersion.userTemplate
  for (const [name, value] of Object.entries(resolvedVars)) {
    filledTemplate = filledTemplate.replaceAll(`{{${name}}}`, value)
  }

  const enabledTools = agent.tools.filter((t) => t.enabled).map((t) => t.name)
  const toolDefs = enabledTools.map((name) => ({
    name,
    description: TOOL_REGISTRY[name].description,
    inputSchema: TOOL_REGISTRY[name].inputSchema,
  }))

  const messages: { role: 'user' | 'assistant'; content: Anthropic.MessageParam['content'] }[] = [
    { role: 'user', content: filledTemplate },
  ]

  let totalTokens = 0

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { message } = await callClaude({
      systemPrompt: currentVersion.systemPrompt,
      messages,
      model: DEFAULT_CLAUDE_MODEL,
      tools: toolDefs,
    })

    totalTokens += message.usage.input_tokens + message.usage.output_tokens

    const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    for (const block of textBlocks) {
      await appendRunStep(run.id, { kind: 'thought', tool: null, content: block.text, at: new Date().toISOString() })
    }

    if (message.stop_reason !== 'tool_use') {
      const finalText = extractText(message)
      await appendRunStep(run.id, { kind: 'output', tool: null, content: finalText, at: new Date().toISOString() })
      await finishRun(run.id, { status: 'succeeded', summary: finalText, tokensUsed: totalTokens })
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    messages.push({ role: 'assistant', content: message.content })

    const hasWriteTool = toolUseBlocks.some((block) => isWriteTool(block.name as AgentToolName))

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      const toolName = block.name as AgentToolName
      await appendRunStep(run.id, {
        kind: 'tool-call',
        tool: toolName,
        content: JSON.stringify(block.input),
        at: new Date().toISOString(),
      })

      const definition = TOOL_REGISTRY[toolName]
      const resultText = definition
        ? await definition.run(block.input as Record<string, unknown>, {
            siteId: agent.siteId,
            runId: run.id,
            range,
            currency: site.currency,
          })
        : `Tool "${toolName}" không tồn tại.`

      await appendRunStep(run.id, { kind: 'tool-result', tool: toolName, content: resultText, at: new Date().toISOString() })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText })
    }

    if (hasWriteTool) {
      // Bất biến an toàn: dừng HẲN ngay khi có write-tool, không cho vòng
      // lặp tiếp tục dù model muốn làm gì thêm — xem domain/agent.ts.
      await finishRun(run.id, {
        status: 'pending-approval',
        summary: 'Agent đã đề xuất một hành động, đang chờ duyệt.',
        tokensUsed: totalTokens,
      })
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    messages.push({ role: 'user', content: toolResults })
  }

  await finishRun(run.id, {
    status: 'failed',
    summary: `Vượt số vòng lặp tối đa (${MAX_ROUNDS}) mà chưa có kết luận.`,
    tokensUsed: totalTokens,
  })
  await setAgentLastRunAt(agentId, new Date().toISOString())
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: `Anthropic.ToolUseBlock`/`Anthropic.ToolResultBlockParam`/
`Anthropic.TextBlock` type names must match what the installed SDK version
actually exports — if `tsc` reports a different name, grep
`node_modules/@anthropic-ai/sdk/resources/messages.d.ts` for the correct
export name and fix the import, don't guess a second time.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/run-agent.ts
git commit -m "feat: add agent tool-calling loop with hard-stop on write-tool"
```

---

### Task 14: Agent server actions

**Files:**
- Create: `src/lib/actions/agents.ts`

**Interfaces:**
- Consumes: `createAgent`/`setAgentEnabled`/`createRun`/`decidePendingAction` (Task 11), `runAgent` (Task 13), `getCurrentUser` (`src/lib/supabase/server.ts`).
- Produces: `'use server'` actions `createAgentAction`, `toggleAgentEnabledAction`,
  `runAgentNowAction`, `approvePendingActionAction`, `rejectPendingActionAction`
  — consumed by Task 15's page wiring.

- [ ] **Step 1: Write the actions**

```ts
'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAgent, setAgentEnabled, createRun, decidePendingAction } from '@/lib/data/agents'
import { runAgent } from '@/lib/agents/run-agent'
import { getCurrentUser } from '@/lib/supabase/server'
import type { AgentRole, AgentSchedule, AgentTool } from '@/lib/domain/agent'

const requireUserId = async (): Promise<string> => {
  const user = await getCurrentUser()
  if (!user) throw new Error('Chưa đăng nhập')
  return user.id
}

export const createAgentAction = async (input: {
  readonly siteId: string
  readonly role: AgentRole
  readonly name: string
  readonly description: string
  readonly promptId: string
  readonly tools: readonly AgentTool[]
  readonly schedule: AgentSchedule | null
}) => {
  await requireUserId()
  const agent = await createAgent(input)
  revalidatePath(`/${input.siteId}/agents`)
  return agent
}

export const toggleAgentEnabledAction = async (siteId: string, agentId: string, enabled: boolean) => {
  await requireUserId()
  await setAgentEnabled(agentId, enabled)
  revalidatePath(`/${siteId}/agents`)
}

/**
 * Ghi run=running rồi giao việc chạy thật cho `after()` — request trả về
 * ngay, không đợi hết vòng lặp Claude (có thể mất nhiều lượt gọi). Cùng
 * pattern với đồng bộ snapshot video TikTok trong `sync-connection.ts`.
 */
export const runAgentNowAction = async (siteId: string, agentId: string) => {
  await requireUserId()
  const run = await createRun({ agentId, siteId, trigger: 'manual' })
  after(() => runAgent(agentId, 'manual'))
  revalidatePath(`/${siteId}/agents`)
  return run
}

export const approvePendingActionAction = async (siteId: string, pendingActionId: string) => {
  const userId = await requireUserId()
  await decidePendingAction(pendingActionId, 'approved', userId)
  revalidatePath(`/${siteId}/agents`)
}

export const rejectPendingActionAction = async (siteId: string, pendingActionId: string) => {
  const userId = await requireUserId()
  await decidePendingAction(pendingActionId, 'rejected', userId)
  revalidatePath(`/${siteId}/agents`)
}
```

**Note on `runAgentNowAction`**: `createRun` already inserts a row with
`status='running'` (Task 11), so this action does not need to pre-insert
one itself — but `runAgent` (Task 13) ALSO calls `createRun` internally.
Fix this duplication before committing: remove the `createRun` call from
`runAgentNowAction` above, and instead have `runAgent` be the sole creator
of the run row (it already is, in Task 13). This action's job is only to
fire `after(() => runAgent(...))` and return — the UI's "run just started"
feedback comes from `revalidatePath` re-rendering the agents list, which
will pick up the new run once `runAgent`'s `createRun` call lands (a race
that's fine — the page just may not show the brand-new run for the first
render's revalidation, no worse than any other eventually-consistent async
action in this app).

- [ ] **Step 2: Apply the fix described above, then verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/agents.ts
git commit -m "feat: add Agents server actions (manual run via after(), approve/reject)"
```

---

### Task 15: Wire Agents pages to real data

**Files:**
- Modify: `src/app/(app)/[siteId]/agents/page.tsx`
- Modify: `src/app/(app)/[siteId]/agents/[agentId]/page.tsx`
- Modify: any client component under `src/components/agents/` these pages render

**Interfaces:**
- Consumes: `listAgents`/`listRunsForSite`/`listPendingActionsForSite`/`getAgent`/`listRunsForAgent` (Task 11), `createAgentAction`/`toggleAgentEnabledAction`/`runAgentNowAction`/`approvePendingActionAction`/`rejectPendingActionAction` (Task 14).

- [ ] **Step 1: Read both pages and their child components fully**

Note every `@/mock/agents` import and every place `MOCK_TODAY` is used for
relative-time formatting (Task's real data uses actual timestamps, so swap
`MOCK_TODAY` for `new Date()` at those call sites too — same fix already
applied elsewhere in this codebase for real-data pages, e.g. `overview`
page's `now={new Date()}`).

- [ ] **Step 2: Swap `agents/page.tsx`'s data source**

Replace `agentsOfSite`/`runsOfSite`/`pendingActionsOfSite` (from
`@/mock/agents`) with `listAgents(site.id)`/`listRunsForSite(site.id)`/
`listPendingActionsForSite(site.id)` (from `@/lib/data/agents`), fetched via
`Promise.all` alongside the existing `getSite`/`getLatestAuditRun` calls
already on the page (matches this app's established "one `Promise.all` per
page" convention — see `overview/page.tsx`).

- [ ] **Step 3: Wire the approval buttons**

"Duyệt và thực thi" → rename the button label to "Duyệt" (per the spec's
locked decision — approving does not perform any external write) and wrap
it in a form calling `approvePendingActionAction(site.id, pendingActionId)`;
after approval, render a badge "Đã duyệt · chờ triển khai ghi thật" instead
of any "áp dụng thành công" message. "Từ chối" → wrap in a form calling
`rejectPendingActionAction(site.id, pendingActionId)`, label unchanged.

- [ ] **Step 4: Wire "Tạo agent"/"Chạy ngay" buttons**

"Tạo agent" → form calling `createAgentAction`. Any "Chạy ngay" / manual-run
trigger on this page or the detail page → form calling
`runAgentNowAction(site.id, agentId)`.

- [ ] **Step 5: Swap `agents/[agentId]/page.tsx`'s data source**

Replace `findAgent`/`runsOfAgent` (mock) with `getAgent(agentId)`/
`listRunsForAgent(agentId)` (real) — this page's `AgentRun.pendingActions`
is now populated per-run (Task 11's `listRunsForAgent` joins them), so any
existing rendering of proposed actions inline within a run's transcript
should already have the data it expects without further prop changes.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/\[siteId\]/agents/ src/components/agents/
git commit -m "feat: wire Agents pages to real data, run loop, and approval actions"
```

---

### Task 16: Wire agent scheduling into the existing cron

**Files:**
- Modify: `src/app/api/cron/sync-all/route.ts`

**Interfaces:**
- Consumes: `runAgent` (Task 13), a new query for due agents (write inline in this task — no separate data-layer function needed for a single cron-only query).

- [ ] **Step 1: Read the current cron route in full**

Read `src/app/api/cron/sync-all/route.ts` to see exactly where the
per-connection sync loop ends, so the agent-scheduling pass is appended
after it, not interleaved.

- [ ] **Step 2: Add the agent-scheduling pass**

After the existing sync loop, add:

```ts
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAgent } from '@/lib/agents/run-agent'
import type { AgentSchedule } from '@/lib/domain/agent'

// ... inside the route handler, after the connection-sync loop:

const admin = createAdminClient()
const today = new Date()
const todayDayOfWeek = today.getUTCDay() // 0 = Chủ nhật, khớp AgentSchedule.dayOfWeek

const { data: dueAgents } = await admin
  .from('agents')
  .select('id, schedule')
  .eq('enabled', true)
  .not('schedule', 'is', null)

for (const agent of dueAgents ?? []) {
  const schedule = agent.schedule as AgentSchedule
  // v1 chỉ hỗ trợ daily/weekly/monthly qua cron 1 lần/ngày — 'hourly' không
  // khả thi với lịch này (xem Global Constraints), bỏ qua nếu gặp.
  const isDue =
    schedule.cadence === 'daily' ||
    (schedule.cadence === 'weekly' && schedule.dayOfWeek === todayDayOfWeek) ||
    (schedule.cadence === 'monthly' && today.getUTCDate() === 1)

  if (!isDue) continue

  // Không await tuần tự từng agent — mỗi agent có thể mất nhiều lượt gọi
  // Claude, giữ cron chờ hết tất cả sẽ dễ chạm timeout của chính cron route.
  after(() => runAgent(agent.id, 'schedule'))
}
```

Place this snippet at the point identified in Step 1 — match the existing
route's response-shape conventions (if it returns a JSON summary of synced
connections, extend that summary object with a `agentsScheduled: dueAgents?.length ?? 0`
field rather than leaving the agent pass silently unreported).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/sync-all/route.ts
git commit -m "feat: schedule due agents from the existing daily cron (no new cron job)"
```

---

### Task 17: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: zero new errors (pre-existing unused-var warnings in `mock/`
files are unrelated and may remain).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds cleanly. This also regenerates `.next/types`, which can
surface route-typing issues Steps 1–2 don't catch.

- [ ] **Step 4: Confirm `ANTHROPIC_API_KEY` is set**

Check `.env.local` for `ANTHROPIC_API_KEY`. If absent, stop here and tell
the user — every downstream manual check (Step 5) needs it, and it's not
something this plan can generate.

- [ ] **Step 5: Manual smoke check with the dev server**

Run: `npm run dev`, sign in, navigate to `/[siteId]/prompts`, click "Chạy
thử" on the seeded "Rà hiệu quả chiến dịch" prompt (once Task 1's migration
is applied, there is no seed data yet — first create a prompt via the new
"Prompt mới" flow, or manually insert one matching `mock/prompts.ts`'s
content via the Supabase SQL editor for a faster check), confirm a real
Claude response renders with token counts. Then navigate to `/[siteId]/agents`,
create an agent pointing at that prompt with `query-metrics` enabled, click
"Chạy ngay", confirm a run appears and reaches `succeeded` with real step
content. This is real UI verification, not something `tsc`/`lint`/`build`
substitute for — do not skip it.

- [ ] **Step 6: Commit if Step 5 required any fixes**

If manual testing surfaced bugs, fix them in the relevant task's file, then:

```bash
git add -A
git commit -m "fix: address issues found in manual smoke test"
```
