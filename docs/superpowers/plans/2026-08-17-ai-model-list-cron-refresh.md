# AI Model List + Cron Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text Model field in the AI Provider settings dialog with a dropdown populated from each provider's real, live list of available models — fetched on demand via a button, and kept fresh automatically for already-connected sites via the existing daily cron.

**Architecture:** Each provider adapter (`anthropic.ts`/`openai.ts`/`gemini.ts`) gains a `list*Models(apiKey)` function calling that provider's real "list models" API; `providers/ai.ts` gets a `listAvailableModels(provider, apiKey)` dispatcher. `site_ai_keys` gains `available_models`/`models_fetched_at` cache columns. Two new Server Actions expose this: one probes a freshly-typed (not-yet-saved) key for the connect flow, the other refreshes an already-connected site's cache using its saved key. The existing daily cron gets one more pass that refreshes every connected site's cache automatically.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), `@anthropic-ai/sdk`, `openai`, `@google/genai` (all three already installed from the prior multi-provider-ai-keys plan).

## Global Constraints

- No test framework; verification is `npx tsc --noEmit` + `npm run lint` + `npm run build`, all three clean (zero warnings — the real baseline).
- Vietnamese comments, non-obvious *why* only.
- **API research below was verified live against official docs, decompiled SDK source, and this repo's actual installed package versions (`@anthropic-ai/sdk@0.117.1`, `openai@7.4.0`, `@google/genai@2.17.1`) on 2026-08-17.** If any field/method name causes a TypeScript error, the installed package's own `.d.ts` is the ground truth, not this plan's text.
- **OpenAI's list-models endpoint has no capability field** — it returns chat, embedding, image, audio, and moderation models all mixed together with the identical shape. This plan applies a documented, best-effort exclude-pattern heuristic (not a guarantee) to filter out non-chat models — flag this honestly in the code comment, matching this repo's "CHƯA ai chạy thử" convention for unverified assumptions.
- **Gemini's model identifier field is `.name`** (format `"models/{id}"`), not `.id` like the other two — strip the prefix before storing/displaying.
- The daily cron already has a `MAX_AGENTS_PER_CRON_RUN` cap and a documented reason the connection-sync loop is sequential (avoiding a shared Google rate limit). This plan's model-cache refresh has **no such shared-rate-limit constraint** (each site calls a different provider with a different key), so it runs concurrently via `Promise.allSettled`, not a sequential loop — say why in a comment so a future reader doesn't "fix" it into sequential by copying the connection-sync loop's pattern.
- This plan does **not** touch `sub-project B` (chat) or `sub-project C` (trending keywords) — unrelated.

---

### Task 1: Migrate `site_ai_keys` — add model-cache columns

**Files:**
- Create: `supabase/migrations/20260817000006_site_ai_keys_model_cache.sql`

**Interfaces:**
- Produces: `site_ai_keys.available_models jsonb not null default '[]'`, `site_ai_keys.models_fetched_at timestamptz` — consumed by Task 2 (types) and Task 7 (data layer).

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- site_ai_keys → cache danh sách model khả dụng của provider đang kết nối.
--
-- `available_models` là mảng string (tên model thật, lấy trực tiếp từ API
-- list-models của hãng — KHÔNG hardcode) — UI Cài đặt hiện dropdown từ đây
-- thay vì bắt gõ tay tên model chính xác. `models_fetched_at` null nghĩa là
-- chưa từng tải — UI vẫn cho gõ tay/tải trực tiếp trong trường hợp đó.
-- Refresh định kỳ qua cron (`refreshAllSiteAiModelCaches`,
-- `src/lib/data/site-ai-keys.ts`) — không cần tải lại mỗi lần mở dialog Cài
-- đặt.
-- ============================================================================

alter table public.site_ai_keys add column available_models jsonb not null default '[]';
alter table public.site_ai_keys add column models_fetched_at timestamptz;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
If CLI auth is unavailable (documented precedent in this repo), note that explicitly and proceed to Task 2 anyway — the migration file is still committed and applies on next deploy.

Before running this, check the current highest migration number sequentially via `ls supabase/migrations/ | sort | tail -5` — another concurrent session may have added migrations since this plan was written; if `20260817000006` is already taken, use the next free number instead and adjust this task's filename accordingly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add available_models cache columns to site_ai_keys"
```

---

### Task 2: Update generated types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: exact column names from Task 1.
- Produces: `Database['public']['Tables']['site_ai_keys']` including `available_models`/`models_fetched_at` — consumed by Task 7.

- [ ] **Step 1: Try real generation first**

Run: `supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`
If it fails with an auth error, proceed to Step 2.

- [ ] **Step 2: Hand-add the two columns**

Find the `site_ai_keys` entry. Add `available_models: Json` and `models_fetched_at: string | null` to `Row`; `available_models?: Json` and `models_fetched_at?: string | null` to `Insert`/`Update` (both have defaults/nullability, so optional on write). Use this file's existing `Json` type alias (check how `extra: Json` is typed on another table's entry — e.g. `metrics_daily` — and match that convention exactly).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat: add available_models/models_fetched_at to generated types"
```

---

### Task 3: Anthropic — list available models

**Files:**
- Modify: `src/lib/providers/anthropic.ts`

**Interfaces:**
- Produces: `export const listAnthropicModels: (apiKey: string) => Promise<readonly string[]>` — consumed by Task 6.

- [ ] **Step 1: Add the function**

Append to the file (do not modify anything else in it):

```ts
/**
 * Danh sách model THẬT mà API Key này gọi được — dùng cho dropdown chọn
 * model ở UI Cài đặt, KHÔNG hardcode danh sách. Anthropic trả về model MỚI
 * NHẤT trước (`client.models.list()` tự phân trang qua async iteration,
 * không cần vòng lặp cursor thủ công) — giữ nguyên thứ tự đó cho dropdown
 * (model mới nhất lên đầu), không sắp lại theo alphabet.
 */
export const listAnthropicModels = async (apiKey: string): Promise<readonly string[]> => {
  const client = getClient(apiKey)
  const ids: string[] = []
  for await (const model of client.models.list()) {
    ids.push(model.id)
  }
  return ids
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
If `client.models.list()`'s iteration shape doesn't match (e.g. a different method name), check `node_modules/@anthropic-ai/sdk/src/resources/models.ts` for the real shape and fix this code to match it.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/providers/anthropic.ts
git commit -m "feat: add listAnthropicModels for the model-picker dropdown"
```

---

### Task 4: OpenAI — list available models

**Files:**
- Modify: `src/lib/providers/openai.ts`

**Interfaces:**
- Produces: `export const listOpenAiModels: (apiKey: string) => Promise<readonly string[]>` — consumed by Task 6.

- [ ] **Step 1: Add the function**

Append to the file:

```ts
/**
 * `client.models.list()` trả về MỌI model API Key gọi được — trộn chung
 * model chat/agentic với embedding, dall-e (ảnh), whisper/tts (âm thanh),
 * moderation, và các model cũ (davinci/babbage/curie/ada). OpenAI KHÔNG có
 * field phân loại "chat-capable" trên response — lọc bằng pattern loại trừ
 * tên model là cách khả thi duy nhất hiện tại (xem nghiên cứu 8/2026), CHƯA
 * verify với key thật, cần đối chiếu nếu danh sách hiện ra sai/thiếu.
 */
const NON_CHAT_MODEL_PATTERN = /embedding|dall-e|whisper|tts|moderation|davinci|babbage|curie|^ada-|search-|similarity/i

export const listOpenAiModels = async (apiKey: string): Promise<readonly string[]> => {
  const client = getClient(apiKey)
  const ids: string[] = []
  for await (const model of client.models.list()) {
    if (!NON_CHAT_MODEL_PATTERN.test(model.id)) ids.push(model.id)
  }
  // OpenAI không công bố thứ tự trả về (khác Anthropic) — sắp alphabet cho
  // dropdown ổn định, dễ tìm.
  return ids.sort()
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
If `client.models.list()`'s shape doesn't match, check `node_modules/openai/src/resources/models.ts`.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/providers/openai.ts
git commit -m "feat: add listOpenAiModels for the model-picker dropdown"
```

---

### Task 5: Gemini — list available models

**Files:**
- Modify: `src/lib/providers/gemini.ts`

**Interfaces:**
- Produces: `export const listGeminiModels: (apiKey: string) => Promise<readonly string[]>` — consumed by Task 6.

- [ ] **Step 1: Add the function**

Append to the file:

```ts
/**
 * `ai.models.list()` trả về `Promise<Pager<Model>>` — PHẢI await một lần lấy
 * Pager rồi mới `for await` lặp qua Pager đó (khác Anthropic/OpenAI, list()
 * của hai hãng kia tự async-iterable, không cần await trước). Field định
 * danh model là `.name` dạng `"models/{id}"`, KHÔNG phải `.id` — bỏ tiền tố
 * trước khi lưu/hiện. Lọc `supportedActions.includes('generateContent')` để
 * loại model chỉ hỗ trợ embedContent (embedding) — field JS SDK đổi tên từ
 * `supportedGenerationMethods` bên REST, xác nhận qua source SDK đã decompile,
 * không phải suy đoán từ doc REST.
 */
export const listGeminiModels = async (apiKey: string): Promise<readonly string[]> => {
  const client = getClient(apiKey)
  const pager = await client.models.list()
  const ids: string[] = []
  for await (const model of pager) {
    if (model.name && model.supportedActions?.includes('generateContent')) {
      ids.push(model.name.replace(/^models\//, ''))
    }
  }
  // Gemini không công bố thứ tự trả về — sắp alphabet cho dropdown ổn định.
  return ids.sort()
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
If `client.models.list()`/`Pager`/`model.supportedActions` don't match, check `node_modules/@google/genai/dist/genai.d.ts`.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/providers/gemini.ts
git commit -m "feat: add listGeminiModels for the model-picker dropdown"
```

---

### Task 6: Dispatcher — `listAvailableModels`

**Files:**
- Modify: `src/lib/providers/ai.ts`

**Interfaces:**
- Consumes: `listAnthropicModels` (Task 3), `listOpenAiModels` (Task 4), `listGeminiModels` (Task 5).
- Produces: `export const listAvailableModels: (provider: AiProvider, apiKey: string) => Promise<readonly string[]>` — consumed by Task 7 (cron helper) and Task 8 (actions).

- [ ] **Step 1: Add the dispatcher**

Update the imports at the top of the file to also import the three new functions, and append the new export:

```ts
import { callAnthropic, listAnthropicModels } from './anthropic'
import { callOpenAi, listOpenAiModels } from './openai'
import { callGemini, listGeminiModels } from './gemini'
```

(Replace the existing three single-symbol imports with these two-symbol versions — everything else in the file stays as-is.)

```ts
/** Dùng bởi UI Cài đặt (nút "Tải danh sách model") và cron (làm mới cache) —
 * không phải đường Prompt Studio/Agents dùng để CHẠY, chỉ để LIỆT KÊ model
 * khả dụng. */
export const listAvailableModels = async (provider: AiProvider, apiKey: string): Promise<readonly string[]> => {
  if (provider === 'anthropic') return listAnthropicModels(apiKey)
  if (provider === 'openai') return listOpenAiModels(apiKey)
  return listGeminiModels(apiKey)
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/ai.ts
git commit -m "feat: add listAvailableModels dispatcher"
```

---

### Task 7: Data layer — model cache read/write

**Files:**
- Modify: `src/lib/data/site-ai-keys.ts`

**Interfaces:**
- Consumes: `listAvailableModels` (Task 6).
- Produces:
  ```ts
  export interface SiteAiConnection {
    readonly provider: AiProvider
    readonly model: string
    readonly availableModels: readonly string[]
    readonly modelsFetchedAt: string | null
  }
  export const refreshAllSiteAiModelCaches: () => Promise<{ readonly refreshed: number; readonly failed: number }>
  ```
  `SiteAiConnection`'s two new fields are consumed by Task 10 (UI). `refreshAllSiteAiModelCaches` is consumed by Task 9 (cron).

- [ ] **Step 1: Extend `SiteAiConnection` and `getSiteAiConnection`**

Read the current file first. Replace the `SiteAiConnection` interface and `getSiteAiConnection` function:

```ts
export interface SiteAiConnection {
  readonly provider: AiProvider
  readonly model: string
  readonly availableModels: readonly string[]
  readonly modelsFetchedAt: string | null
}

export interface SiteAiConfig extends SiteAiConnection {
  readonly apiKey: string
}

/** Chỉ đọc trạng thái hiển thị (provider + model đang kết nối + cache danh
 * sách model), KHÔNG giải mã key — dùng cho UI Cài đặt. `null` nếu Site chưa
 * kết nối provider nào. */
export const getSiteAiConnection = async (siteId: string): Promise<SiteAiConnection | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_ai_keys')
    .select('provider, model, available_models, models_fetched_at')
    .eq('site_id', siteId)
    .maybeSingle()
  if (!data) return null
  return {
    provider: data.provider as AiProvider,
    model: data.model,
    availableModels: data.available_models as readonly string[],
    modelsFetchedAt: data.models_fetched_at,
  }
}
```

(`SiteAiConfig`'s definition doesn't change — it still extends the now-larger `SiteAiConnection`, so `resolveAiConfig`'s return type gains the two new fields automatically. `resolveAiConfig`'s own function body does NOT need to change — leave it exactly as it is, since it doesn't select `available_models`/`models_fetched_at` and Prompt Studio/Agents never need those two fields to actually CALL the AI. Actually: since `SiteAiConfig extends SiteAiConnection`, and `resolveAiConfig`'s return object literals don't include the two new fields, this will now be a TypeScript error — fix `resolveAiConfig` to also select and include `available_models`/`models_fetched_at` in both of its return branches, even though callers never read them, purely to satisfy the type. Read the current `resolveAiConfig` implementation and add the two fields to its `.select(...)` call and both return object literals: the site-configured branch reads them from `data`, matching `getSiteAiConnection`'s pattern; the env-var-fallback branch (no `site_ai_keys` row exists) sets `availableModels: []` and `modelsFetchedAt: null` since there's nothing to report.)

- [ ] **Step 2: Add `refreshAllSiteAiModelCaches`**

Add the new import at the top of the file and the new function at the end:

```ts
import { listAvailableModels } from '@/lib/providers/ai'
```

```ts
/**
 * Cron gọi hàm NÀY một lần, KHÔNG tự lặp qua site_ai_keys — làm mới cache
 * `available_models` cho MỌI Site đang kết nối provider nào đó. Chạy SONG
 * SONG (`Promise.allSettled`), khác vòng lặp đồng bộ connection tuần tự
 * trong `sync-all/route.ts` — vòng đó cố tình tuần tự để tránh chạm rate
 * limit DÙNG CHUNG của Google, còn ở đây mỗi Site gọi một provider/key khác
 * nhau, không có rate limit dùng chung nào để tránh. Lỗi ở một Site không
 * chặn các Site khác.
 */
export const refreshAllSiteAiModelCaches = async (): Promise<{ readonly refreshed: number; readonly failed: number }> => {
  const admin = createAdminClient()
  const { data: rows } = await admin.from('site_ai_keys').select('site_id, provider, api_key_enc')

  const results = await Promise.allSettled(
    (rows ?? []).map(async (row) => {
      const apiKey = decrypt(row.api_key_enc)
      const models = await listAvailableModels(row.provider as AiProvider, apiKey)
      const { error } = await admin
        .from('site_ai_keys')
        .update({ available_models: models, models_fetched_at: new Date().toISOString() })
        .eq('site_id', row.site_id)
      if (error) throw new Error(error.message)
    }),
  )

  let refreshed = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'fulfilled') {
      refreshed += 1
    } else {
      failed += 1
      console.error(
        `Không làm mới được danh sách model: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      )
    }
  }

  return { refreshed, failed }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors, INCLUDING in `testRunPromptAction`/`runAgent` (Task 11/12 of the prior plan) — those destructure `resolveAiConfig`'s result but only read `provider`/`apiKey`/`model`, so gaining two new unused fields on the returned object is not a type error.

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/site-ai-keys.ts
git commit -m "feat: add model-cache read + refreshAllSiteAiModelCaches"
```

---

### Task 8: Server actions — probe and refresh

**Files:**
- Modify: `src/lib/actions/ai-keys.ts`

**Interfaces:**
- Consumes: `listAvailableModels` (Task 6), `AiProvider`/`isAiProvider` (already imported in this file from the prior plan).
- Produces:
  ```ts
  export interface ListModelsState { readonly models: readonly string[]; readonly error: string | null }
  export const listAvailableModelsAction: (provider: string, apiKey: string) => Promise<ListModelsState>
  export const refreshSiteAiModelsAction: (siteId: string) => Promise<ListModelsState>
  ```
  Both consumed by Task 10 (UI), called directly (not via `useActionState` — see Task 10 for why).

- [ ] **Step 1: Add the two actions**

Read the current file first. Add the new import and append the two functions:

```ts
import { listAvailableModels } from '@/lib/providers/ai'
```

```ts
export interface ListModelsState {
  readonly models: readonly string[]
  readonly error: string | null
}

/**
 * Nút "Tải danh sách model" khi CHƯA kết nối (hoặc đang gõ key mới để đổi
 * key) gọi hàm NÀY — dùng thẳng key vừa gõ trên form, CHƯA lưu xuống DB. Chỉ
 * cần đăng nhập, không cần kiểm `has_site_role`: hàm không đọc/ghi dữ liệu
 * Site nào, chỉ gọi API bên ngoài bằng key client tự gửi lên rồi trả kết quả
 * về đúng client đó — không phải đường lộ dữ liệu riêng tư của ai.
 */
export async function listAvailableModelsAction(provider: string, apiKey: string): Promise<ListModelsState> {
  const user = await getCurrentUser()
  if (!user) return { models: [], error: 'Phiên đăng nhập đã hết hạn.' }

  if (!isAiProvider(provider)) return { models: [], error: 'Nhà cung cấp không hợp lệ.' }
  const trimmedKey = apiKey.trim()
  if (trimmedKey.length < 10) return { models: [], error: 'API Key trông không hợp lệ.' }

  try {
    const models = await listAvailableModels(provider, trimmedKey)
    if (models.length === 0) return { models: [], error: 'Không tìm thấy model nào — kiểm tra lại API Key.' }
    return { models, error: null }
  } catch (error) {
    return {
      models: [],
      error: `Không lấy được danh sách model: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Nút "Tải danh sách model" khi ĐÃ kết nối và không đổi key (field API Key
 * để trống) gọi hàm NÀY thay vì hàm trên — không có key mới trên form để
 * dùng, phải giải mã key ĐÃ LƯU. Vì đọc/ghi `site_ai_keys` của một Site cụ
 * thể nên PHẢI kiểm `has_site_role`, khác hàm trên.
 */
export async function refreshSiteAiModelsAction(siteId: string): Promise<ListModelsState> {
  const user = await getCurrentUser()
  if (!user) return { models: [], error: 'Phiên đăng nhập đã hết hạn.' }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { models: [], error: 'Chỉ chủ sở hữu hoặc quản trị viên mới được làm mới danh sách model.' }
  }

  const admin = createAdminClient()
  const { data } = await admin.from('site_ai_keys').select('provider, api_key_enc').eq('site_id', siteId).maybeSingle()
  if (!data) return { models: [], error: 'Website chưa kết nối provider nào.' }

  try {
    const apiKey = decrypt(data.api_key_enc)
    const models = await listAvailableModels(data.provider as AiProvider, apiKey)
    await admin
      .from('site_ai_keys')
      .update({ available_models: models, models_fetched_at: new Date().toISOString() })
      .eq('site_id', siteId)
    revalidatePath(`/${siteId}/settings`)
    return { models, error: null }
  } catch (error) {
    return { models: [], error: `Không làm mới được: ${error instanceof Error ? error.message : String(error)}` }
  }
}
```

Check whether `decrypt` is already imported in this file (it is, used by `saveSiteAiConfigAction`) — do not add a duplicate import.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/ai-keys.ts
git commit -m "feat: add listAvailableModelsAction/refreshSiteAiModelsAction"
```

---

### Task 9: Wire model-cache refresh into the daily cron

**Files:**
- Modify: `src/app/api/cron/sync-all/route.ts`

**Interfaces:**
- Consumes: `refreshAllSiteAiModelCaches` (Task 7).

- [ ] **Step 1: Add the import and the call**

Add the import near the top:

```ts
import { refreshAllSiteAiModelCaches } from '@/lib/data/site-ai-keys'
```

Add this right before the final `return NextResponse.json(...)` (after the agent-scheduling loop, so it doesn't interleave with either existing pass):

```ts
const { refreshed: modelsRefreshed, failed: modelsFailed } = await refreshAllSiteAiModelCaches()

return NextResponse.json({
  synced,
  failed,
  total: (connections ?? []).length,
  agentsScheduled,
  modelsRefreshed,
  modelsFailed,
})
```

(Replace the existing `return NextResponse.json({ synced, failed, total: (connections ?? []).length, agentsScheduled })` line with the two lines above — extends the response shape, doesn't restructure it.)

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/sync-all/route.ts
git commit -m "feat: refresh every connected site's AI model cache from the daily cron"
```

---

### Task 10: Build a searchable combobox and wire it into the Settings UI

**Files:**
- Create: `src/components/ui/combobox-field.tsx`
- Modify: `src/components/settings/ai-key-setup.tsx`

**Interfaces:**
- Consumes: `listAvailableModelsAction`, `refreshSiteAiModelsAction` (Task 8), `SiteAiConnection`'s new `availableModels` field (Task 7), Radix's `Popover` (`radix-ui` package, already a dependency — see `src/components/ui/date-picker-field.tsx` for the exact same trigger-button + `Popover.Content` pattern already used in this codebase).
- Produces: `export interface ComboboxFieldProps { readonly id?: string; readonly name: string; readonly options: readonly string[]; readonly value: string; readonly onValueChange: (value: string) => void; readonly placeholder?: string; readonly required?: boolean; readonly emptyLabel?: string }` and `export function ComboboxField(props: ComboboxFieldProps)` — a generic, reusable type-to-filter dropdown (not `<select>`), consumed by Task 10's own UI wiring below. Generic on purpose (`options: readonly string[]`, not AI-specific) so other features can reuse it later, matching this repo's other `ui/` primitives (`date-picker-field.tsx`, `time-picker-field.tsx`) being generic, feature-agnostic building blocks.

- [ ] **Step 1: Read the precedent**

Read `src/components/ui/date-picker-field.tsx` in full — this is the exact structural pattern to follow: a `<button>` trigger (styled with `inputClass`) inside `PopoverPrimitive.Trigger asChild`, wrapped in `PopoverPrimitive.Root`, with `PopoverPrimitive.Portal` → `PopoverPrimitive.Content` holding the actual picker UI, styled with this repo's design tokens (`--color-paper`, `--color-rule`, `--radius-lg`, `--shadow-lift`, etc. — copy the exact token names from that file, don't invent new ones). Also read `src/components/ui/form-field.tsx` for `inputClass`.

- [ ] **Step 2: Create the combobox primitive**

Create `src/components/ui/combobox-field.tsx`:

```tsx
'use client'

import { useId, useMemo, useState } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { inputClass } from './form-field'

/* Hallmark · component: combobox-field · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · empty
 *
 * `<select>` không lọc được khi danh sách dài (model AI có thể lên tới hàng
 * chục cái) — combobox này thay bằng ô tìm kèm danh sách lọc trực tiếp, cùng
 * khuôn Popover-trên-nút-trigger đã dùng ở `date-picker-field.tsx`. Vẫn có
 * một input ẩn mang giá trị thật để hoạt động đúng trong
 * `<form action={...}>` của Server Action, giống hệt cách DatePickerField
 * làm — Popover chỉ là giao diện chọn giá trị, input ẩn mới là thứ submit.
 */

export interface ComboboxFieldProps {
  readonly id?: string
  readonly name: string
  readonly options: readonly string[]
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly placeholder?: string
  readonly required?: boolean
  readonly emptyLabel?: string
}

export function ComboboxField({
  id,
  name,
  options,
  value,
  onValueChange,
  placeholder = 'Chọn…',
  required,
  emptyLabel = 'Không tìm thấy kết quả.',
}: ComboboxFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return options
    return options.filter((option) => option.toLowerCase().includes(trimmed))
  }, [options, query])

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) setQuery('')
  }

  const handleSelect = (option: string): void => {
    onValueChange(option)
    setOpen(false)
    setQuery('')
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <input type="hidden" id={inputId} name={name} value={value} required={required} readOnly />

      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            inputClass,
            'flex items-center justify-between gap-2 text-left',
            !value && 'text-[var(--color-ink-3)]',
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 flex w-72 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--color-rule)] px-3 py-2">
            <Search aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm model…"
              className="w-full bg-transparent text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">{emptyLabel}</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[length:var(--text-sm)] text-[var(--color-ink)]',
                    'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-paper-3)]',
                  )}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      'size-4 shrink-0 text-[var(--color-signal)]',
                      option === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{option}</span>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
```

- [ ] **Step 3: Verify the primitive compiles**

Run: `npx tsc --noEmit`
Run: `npm run lint`

- [ ] **Step 4: Commit the primitive**

```bash
git add src/components/ui/combobox-field.tsx
git commit -m "feat: add ComboboxField, a searchable type-to-filter dropdown"
```

- [ ] **Step 5: Read the current Settings component in full**

Read `src/components/settings/ai-key-setup.tsx` — you'll be modifying the imports, both `<ConnectForm>` call sites in `AiKeySetup`, and rewriting the `ConnectForm` function itself.

- [ ] **Step 6: Update imports**

Add to the existing `'react'` import: `useRef`, `useTransition`. Add two new imports:

```ts
import { listAvailableModelsAction, refreshSiteAiModelsAction } from '@/lib/actions/ai-keys'
import { ComboboxField } from '@/components/ui/combobox-field'
```

- [ ] **Step 7: Pass `initialModelOptions` at both `<ConnectForm>` call sites**

In the "connected" branch's `<ConnectForm ... />` (inside the update dialog), add the prop `initialModelOptions={connection.availableModels}`.

In the "not connected" branch's `<ConnectForm ... />`, add the prop `initialModelOptions={[]}`.

- [ ] **Step 8: Rewrite `ConnectForm`**

Replace the entire `ConnectForm` function with:

```tsx
function ConnectForm({
  siteId,
  provider,
  isUpdating,
  state,
  formAction,
  pending,
  defaultModel,
  initialModelOptions,
}: {
  readonly siteId: string
  readonly provider: AiProvider
  readonly isUpdating: boolean
  readonly state: SaveAiConfigState
  readonly formAction: (formData: FormData) => void
  readonly pending: boolean
  readonly defaultModel: string
  readonly initialModelOptions: readonly string[]
}) {
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const [modelOptions, setModelOptions] = useState<readonly string[]>(initialModelOptions)
  const [selectedModel, setSelectedModel] = useState(defaultModel)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsPending, startModelsTransition] = useTransition()

  // Ưu tiên key VỪA GÕ trên form (đổi key + muốn xem model của key mới) —
  // rơi về key ĐÃ LƯU (refreshSiteAiModelsAction) chỉ khi đang sửa một kết
  // nối có sẵn VÀ ô API Key để trống. Không có key nào khả dụng (kết nối mới
  // + chưa gõ gì) thì báo lỗi thay vì gọi hàm sai.
  const handleFetchModels = () => {
    setModelsError(null)
    const typedKey = apiKeyInputRef.current?.value.trim() ?? ''

    startModelsTransition(async () => {
      const result = typedKey
        ? await listAvailableModelsAction(provider, typedKey)
        : isUpdating
          ? await refreshSiteAiModelsAction(siteId)
          : { models: [] as readonly string[], error: 'Nhập API Key trước khi tải danh sách model.' }

      if (result.error) {
        setModelsError(result.error)
        return
      }
      setModelOptions(result.models)
      if (result.models.length > 0 && !result.models.includes(selectedModel)) {
        setSelectedModel(result.models[0])
      }
    })
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="provider" value={provider} />

      <FormField
        label="API Key"
        htmlFor="ai-key-api-key"
        hint={isUpdating ? 'Đã lưu trước đó — để trống nếu không đổi. Không hiện lại được vì lý do bảo mật.' : undefined}
      >
        <input
          ref={apiKeyInputRef}
          id="ai-key-api-key"
          name="apiKey"
          type="password"
          required={!isUpdating}
          autoComplete="off"
          placeholder={isUpdating ? '••••••••••••' : undefined}
          className={inputClass}
        />
      </FormField>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">Model</span>
          <button
            type="button"
            onClick={handleFetchModels}
            disabled={modelsPending}
            className="text-[length:var(--text-xs)] font-medium text-[var(--color-signal)] hover:underline disabled:opacity-50"
          >
            {modelsPending ? 'Đang tải…' : 'Tải danh sách model'}
          </button>
        </div>

        {modelOptions.length > 0 ? (
          <ComboboxField
            name="model"
            options={modelOptions}
            value={selectedModel}
            onValueChange={setSelectedModel}
            placeholder="Chọn model…"
            required
            emptyLabel="Không có model nào khớp."
          />
        ) : (
          <input
            name="model"
            type="text"
            required
            autoComplete="off"
            spellCheck={false}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            placeholder={MODEL_HINTS[provider]}
            className={inputClass}
          />
        )}

        {modelOptions.length === 0 ? (
          <p className="text-[length:var(--text-xs)] text-[var(--color-ink-2)]">{MODEL_HINTS[provider]}</p>
        ) : null}
        {modelsError ? (
          <p role="alert" className="text-[length:var(--text-xs)] text-[var(--color-negative)]">
            {modelsError}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
        >
          <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
          Đã lưu.
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="md"
        state={pending ? 'loading' : 'idle'}
        loadingLabel="Đang lưu…"
        className="w-full"
      >
        Lưu cấu hình
      </Button>
    </form>
  )
}
```

Note: `name="model"` appears on exactly one of `ComboboxField`'s hidden input or the fallback `<input>` at a time (conditional render), so the form always submits exactly one `model` field with `selectedModel`'s current value — this is intentional, not a duplicate-field bug.

- [ ] **Step 9: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 10: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 11: Commit**

```bash
git add src/components/settings/ai-key-setup.tsx
git commit -m "feat: replace free-text Model field with a searchable combobox dropdown"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: zero errors, zero warnings.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds cleanly, `/[siteId]/settings` and `/api/cron/sync-all` both compile.

- [ ] **Step 4: Manual smoke check (needs a real API key for at least one provider)**

Run `npm run dev`, sign in, go to `/[siteId]/settings`. Open "Kết nối AI provider" (or "Đổi API Key / model" if already connected), paste a real key, click "Tải danh sách model" — confirm the Model field switches from a text input to a populated dropdown showing real model names for that provider. Save, confirm the connection shows the selected model. If already connected, open the update dialog again with the API Key field left blank and click "Tải danh sách model" — confirm it still populates (using the saved key via `refreshSiteAiModelsAction`, not requiring you to retype the key).

If you don't have a real key for every provider, smoke-test whichever one(s) you do and note in your report which remain untested — do not claim full verification for untested providers.

- [ ] **Step 5: Commit if Step 4 required any fixes**

```bash
git add -A
git commit -m "fix: address issues found in manual smoke test"
```
