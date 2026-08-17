# Multi-provider AI Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each Site connect one AI provider — Claude, OpenAI, or Gemini — via its own API key entered in the UI, and have both Prompt Studio's "Chạy thử" and the Agents tool-calling loop use whichever provider is connected.

**Architecture:** A provider-agnostic abstraction (`src/lib/providers/ai.ts`, backed by three adapter files) sits between the app and each provider's SDK, translating a common `AiMessage`/`AiContentPart` shape to/from each provider's own request/response format. `site_ai_keys` becomes a single-row-per-site vault (schema-enforced "one connected provider at a time"). Existing callers (`testRunPromptAction`, `runAgent`) switch from the Anthropic-only `callClaude` to the new `callAi`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), `@anthropic-ai/sdk` (existing), `openai` (new), `@google/genai` (new).

## Global Constraints

- **No test framework exists in this repo and none gets added as a side effect of this work.** Verification for every task is `npx tsc --noEmit` + `npm run lint` + `npm run build` — the current baseline is genuinely zero warnings/errors on all three; any task that leaves so much as a new lint warning is not done.
- **`npx tsc --noEmit` must be clean after EVERY task, not just at the end.** Where a symbol has multiple callers across different tasks (e.g. `resolveClaudeApiKey`, `callClaude`), do NOT delete it until the task that switches its LAST remaining caller — tasks are ordered so the last-caller task also does the cleanup deletion. Never leave a task that half-migrates a shared symbol with dangling references.
- Comments in new/changed code are Vietnamese, explain only non-obvious *why* (constraint, workaround, decision), never restate what the code does — matches every file already in this repo.
- **Exactly one AI provider connected per Site at a time.** `site_ai_keys.site_id` is the sole primary key (Task 1) — this is a database-level guarantee, not just an app convention. Switching providers requires disconnecting first; the save action rejects a submission for a different provider than the one currently connected (Task 9).
- **The `model` field is free text everywhere it appears** (DB column, form input) — never a hardcoded dropdown of model IDs. Model names change too fast to hardcode reliably.
- **Package versions and API shapes below were confirmed via live research against official docs and the npm registry on 2026-08-17** (this plan's write date) — `openai@7.4.0`, `@google/genai@2.17.1`. Use these exact packages. If any field/method name in a code sample below causes a TypeScript compile error once the real package is installed, **the installed package's own `.d.ts` type definitions are the ground truth, not this plan's text** — fix the plan's code to match the actual shipped types, don't fight the compiler. This mirrors how Task 3 of the original Agents+Prompt Studio plan handled an analogous situation.
- **`connection_secrets`-style vault tables** (here, `site_ai_keys`) have RLS enabled with **zero policies** — reads/writes only ever happen via `createAdminClient()` (`service_role`), gated by an application-layer `has_site_role` RPC check via the session client *before* switching to the admin client. Never add a policy that opens this table to `authenticated`.
- **Connecting/disconnecting/switching AI providers never touches `agents`, `agent_runs`, `prompt_runs`, or `prompt_versions`.** Only the single `site_ai_keys` row is created/updated/deleted by any task in this plan.

---

### Task 1: Migrate `site_ai_keys` to single-row-per-site + add `model` column

**Files:**
- Create: `supabase/migrations/20260817000002_site_ai_keys_multi_provider.sql`

**Interfaces:**
- Consumes: existing `site_ai_keys` table (migration `20260817000001_site_ai_keys.sql` — `site_id uuid`, `provider text` with inline `check (provider = 'anthropic')` default-named `site_ai_keys_provider_check`, `api_key_enc text`, `created_at`/`updated_at timestamptz`, `created_by uuid`, `primary key (site_id, provider)` default-named `site_ai_keys_pkey`).
- Produces: `site_ai_keys` with `primary key (site_id)`, `provider` allowing `'anthropic' | 'openai' | 'gemini'`, new `model text not null default ''` column — consumed by Task 2 (types) and every task from Task 8 onward.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- site_ai_keys → hỗ trợ nhiều nhà cung cấp AI (Claude/OpenAI/Gemini), MỘT cái
-- kết nối tại một thời điểm cho mỗi Site.
--
-- Đổi khoá chính từ (site_id, provider) sang chỉ site_id — biến "tối đa một
-- provider đang kết nối" thành ràng buộc DATABASE, không chỉ quy ước ứng
-- dụng. An toàn để đổi: từ trước tới giờ chỉ 'anthropic' từng tồn tại, nên
-- không Site nào có quá một hàng, không có xung đột dữ liệu khi drop khoá cũ.
-- ============================================================================

alter table public.site_ai_keys drop constraint site_ai_keys_pkey;
alter table public.site_ai_keys add primary key (site_id);

alter table public.site_ai_keys drop constraint site_ai_keys_provider_check;
alter table public.site_ai_keys add constraint site_ai_keys_provider_check
  check (provider in ('anthropic', 'openai', 'gemini'));

-- Model là text tự do, KHÔNG danh sách cứng — tên model đổi liên tục theo
-- từng hãng, một danh sách cố định trong migration/UI sẽ lỗi thời rất nhanh.
alter table public.site_ai_keys add column model text not null default '';
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: migration applies cleanly. If `supabase` CLI auth is unavailable in this environment (documented precedent in this repo — see Task 3 of `docs/superpowers/plans/2026-08-14-agents-prompt-studio.md`), note that explicitly and proceed to Task 2 anyway — the migration file itself is still committed and will apply on next deploy.

If Step 2's `ALTER TABLE ... DROP CONSTRAINT` fails because the actual constraint name differs from `site_ai_keys_pkey`/`site_ai_keys_provider_check`, run `\d public.site_ai_keys` against the linked project (or check the Supabase dashboard's table editor) to find the real name and fix the migration file before re-running — Postgres auto-names inline constraints as `<table>_<column>_check` and `<table>_pkey` by default, which is what's assumed here, but don't guess a second time if the first attempt errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817000002_site_ai_keys_multi_provider.sql
git commit -m "feat: allow site_ai_keys to store Claude, OpenAI, or Gemini (one at a time)"
```

---

### Task 2: Update generated types for `site_ai_keys`

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: exact column names from Task 1.
- Produces: `Database['public']['Tables']['site_ai_keys']` including `model` — consumed by Task 8's data layer.

- [ ] **Step 1: Try real generation first**

Run: `supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`

If this succeeds (no auth error), skip to Step 3. If it fails with an auth error, proceed to Step 2.

- [ ] **Step 2: Hand-add the `model` column**

Find the `site_ai_keys` entry in the `Tables` object (search for `site_ai_keys: {`). Add `model: string` to `Row`, `model?: string` to `Insert` (has a DB default), `model?: string` to `Update`. The `provider` field's TypeScript type stays `string` (this file doesn't encode CHECK-constraint literal unions anywhere else in this codebase either — e.g. `connections.provider` is also plain `string` — don't introduce a new convention here).

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat: add model column to generated types for site_ai_keys"
```

---

### Task 3: AI provider-agnostic types

**Files:**
- Create: `src/lib/providers/ai-types.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AiProvider = 'anthropic' | 'openai' | 'gemini'

  export type AiContentPart =
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'tool-use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
    | { readonly type: 'tool-result'; readonly toolUseId: string; readonly name: string; readonly content: string }

  export interface AiMessage {
    readonly role: 'user' | 'assistant'
    readonly content: readonly AiContentPart[]
  }

  export interface AiToolDefinition {
    readonly name: string
    readonly description: string
    readonly inputSchema: Record<string, unknown>
  }

  export type AiStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other'

  export interface AiCallResult {
    readonly content: readonly AiContentPart[]
    readonly stopReason: AiStopReason
    readonly tokensIn: number
    readonly tokensOut: number
    readonly model: string
  }

  export interface AiCallParams {
    readonly apiKey: string
    readonly model: string
    readonly systemPrompt: string
    readonly messages: readonly AiMessage[]
    readonly tools?: readonly AiToolDefinition[]
    readonly maxTokens?: number
  }
  ```
  Consumed by Tasks 4, 5, 6 (each provider adapter) and Task 7 (`ai.ts` dispatcher).

- [ ] **Step 1: Write the types file**

```ts
import 'server-only'

/**
 * Hình dạng chung cho cả 3 nhà cung cấp AI (Claude/OpenAI/Gemini) — mỗi
 * adapter (`anthropic.ts`/`openai.ts`/`gemini.ts`) dịch hình dạng riêng của
 * SDK hãng đó SANG/TỪ những type này. `run-agent.ts`/`actions/prompts.ts`
 * chỉ bao giờ thấy `AiMessage`/`AiContentPart` — không bao giờ thấy type SDK
 * riêng của một hãng nào.
 */

export type AiProvider = 'anthropic' | 'openai' | 'gemini'

export type AiContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool-use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
  | {
      readonly type: 'tool-result'
      readonly toolUseId: string
      // Gemini khớp lượt gọi tool BẰNG TÊN (không có id riêng như OpenAI/
      // Anthropic's call_id/tool_use_id) — `name` tồn tại ở đây để
      // `gemini.ts` không phải tra ngược lại tool-use part gốc để tìm tên.
      readonly name: string
      readonly content: string
    }

export interface AiMessage {
  readonly role: 'user' | 'assistant'
  readonly content: readonly AiContentPart[]
}

export interface AiToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export type AiStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other'

export interface AiCallResult {
  readonly content: readonly AiContentPart[]
  readonly stopReason: AiStopReason
  readonly tokensIn: number
  readonly tokensOut: number
  readonly model: string
}

export interface AiCallParams {
  readonly apiKey: string
  readonly model: string
  readonly systemPrompt: string
  readonly messages: readonly AiMessage[]
  readonly tools?: readonly AiToolDefinition[]
  readonly maxTokens?: number
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/ai-types.ts
git commit -m "feat: add provider-agnostic AI types"
```

---

### Task 4: Anthropic adapter (`callAnthropic`)

**Files:**
- Modify: `src/lib/providers/anthropic.ts`

**Interfaces:**
- Consumes: `AiCallParams`, `AiCallResult`, `AiContentPart`, `AiStopReason` (Task 3).
- Produces: `export const callAnthropic: (params: AiCallParams) => Promise<AiCallResult>` — consumed by Task 7's `ai.ts` dispatcher.
- **Does NOT remove** the existing `callClaude`/`extractText`/`ClaudeMessage`/`ClaudeToolDefinition` exports yet — `actions/prompts.ts` and `agents/run-agent.ts` still call them until Tasks 11/12. This task is purely additive.

- [ ] **Step 1: Add `callAnthropic` alongside the existing exports**

Open `src/lib/providers/anthropic.ts`. Keep everything currently in the file (`DEFAULT_CLAUDE_MODEL`, `clientsByApiKey`, `getClient`, `ClaudeToolDefinition`, `ClaudeMessage`, `callClaude`, `extractText`) exactly as-is. Add the following new code to the same file, importing from the new types module:

```ts
import type { AiCallParams, AiCallResult, AiContentPart, AiStopReason } from './ai-types'

const toAnthropicContent = (parts: readonly AiContentPart[]): Anthropic.MessageParam['content'] =>
  parts.map((part) => {
    if (part.type === 'text') return { type: 'text' as const, text: part.text }
    if (part.type === 'tool-use') return { type: 'tool_use' as const, id: part.id, name: part.name, input: part.input }
    return { type: 'tool_result' as const, tool_use_id: part.toolUseId, content: part.content }
  })

const fromAnthropicContent = (content: Anthropic.Message['content']): readonly AiContentPart[] =>
  content
    .filter(
      (block): block is Anthropic.TextBlock | Anthropic.ToolUseBlock =>
        block.type === 'text' || block.type === 'tool_use',
    )
    .map((block): AiContentPart =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'tool-use', id: block.id, name: block.name, input: block.input as Record<string, unknown> },
    )

const STOP_REASON_MAP: Readonly<Record<string, AiStopReason>> = {
  end_turn: 'end_turn',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
}

/**
 * Adapter cho lớp trừu tượng đa nhà cung cấp (`providers/ai.ts`) — dịch
 * `AiMessage`/`AiToolDefinition` sang hình dạng SDK Anthropic thật, và
 * `Anthropic.Message` ngược lại thành `AiCallResult`. Dùng lại đúng
 * `getClient`/`clientsByApiKey` đã có sẵn ở trên, không dựng client riêng.
 */
export const callAnthropic = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  const stream = client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens ?? 8000,
    system: params.systemPrompt,
    messages: params.messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
    tools: params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    })),
  })

  const message = await stream.finalMessage()

  return {
    content: fromAnthropicContent(message.content),
    stopReason: STOP_REASON_MAP[message.stop_reason ?? ''] ?? 'other',
    tokensIn: message.usage.input_tokens,
    tokensOut: message.usage.output_tokens,
    model: message.model,
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/providers/anthropic.ts
git commit -m "feat: add callAnthropic adapter for the multi-provider AI abstraction"
```

---

### Task 5: OpenAI adapter (`callOpenAi`)

**Files:**
- Create: `src/lib/providers/openai.ts`
- Modify: `package.json` (add `openai`)

**Interfaces:**
- Consumes: `AiCallParams`, `AiCallResult`, `AiContentPart`, `AiMessage`, `AiStopReason` (Task 3).
- Produces: `export const callOpenAi: (params: AiCallParams) => Promise<AiCallResult>` — consumed by Task 7.

- [ ] **Step 1: Install the SDK**

Run: `npm install openai@^7.4.0`

- [ ] **Step 2: Write the adapter**

```ts
import 'server-only'

import OpenAI from 'openai'
import type { AiCallParams, AiCallResult, AiContentPart, AiMessage, AiStopReason } from './ai-types'

/**
 * Dùng Responses API (`client.responses.create`), KHÔNG dùng Chat Completions
 * cũ — OpenAI khuyến nghị Responses cho mọi tích hợp mới kể từ khi có
 * function-calling agentic tốt hơn và cache tốt hơn (xác nhận qua doc chính
 * thức, 8/2026: developers.openai.com/api/docs/guides/migrate-to-responses).
 * Chat Completions KHÔNG bị deprecated nhưng không còn nhận tính năng mới.
 */

const clientsByApiKey = new Map<string, OpenAI>()

const getClient = (apiKey: string): OpenAI => {
  const cached = clientsByApiKey.get(apiKey)
  if (cached) return cached
  const client = new OpenAI({ apiKey })
  clientsByApiKey.set(apiKey, client)
  return client
}

/**
 * OpenAI KHÔNG lồng tool-use/tool-result vào bên trong một "message" như
 * Anthropic/Gemini — mỗi phần là một item NGANG HÀNG trong mảng `input`
 * (`function_call`/`function_call_output`), nên một `AiMessage` có thể mở ra
 * NHIỀU input item, không phải 1-đổi-1.
 */
const toOpenAiInput = (messages: readonly AiMessage[]): OpenAI.Responses.ResponseInputItem[] => {
  const items: OpenAI.Responses.ResponseInputItem[] = []
  for (const message of messages) {
    for (const part of message.content) {
      if (part.type === 'text') {
        items.push({ role: message.role, content: part.text })
      } else if (part.type === 'tool-use') {
        items.push({ type: 'function_call', call_id: part.id, name: part.name, arguments: JSON.stringify(part.input) })
      } else {
        items.push({ type: 'function_call_output', call_id: part.toolUseId, output: part.content })
      }
    }
  }
  return items
}

const fromOpenAiOutput = (response: OpenAI.Responses.Response): readonly AiContentPart[] => {
  const parts: AiContentPart[] = []
  if (response.output_text) parts.push({ type: 'text', text: response.output_text })
  for (const item of response.output) {
    if (item.type === 'function_call') {
      parts.push({
        type: 'tool-use',
        id: item.call_id,
        name: item.name,
        input: JSON.parse(item.arguments) as Record<string, unknown>,
      })
    }
  }
  return parts
}

export const callOpenAi = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  const response = await client.responses.create({
    model: params.model,
    instructions: params.systemPrompt,
    input: toOpenAiInput(params.messages),
    tools: params.tools?.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
    max_output_tokens: params.maxTokens ?? 8000,
  })

  const content = fromOpenAiOutput(response)
  const hasToolUse = content.some((part) => part.type === 'tool-use')

  // Responses API không có field kiểu `finish_reason` — `response.status` là
  // thứ gần nhất. Không có trạng thái riêng cho "muốn gọi tool": model vẫn
  // báo `status: 'completed'` khi trả về function_call, nên phát hiện việc
  // gọi tool bằng chính nội dung trả về (`hasToolUse`), không phải status.
  const stopReason: AiStopReason = hasToolUse
    ? 'tool_use'
    : response.status === 'incomplete'
      ? 'max_tokens'
      : response.status === 'completed'
        ? 'end_turn'
        : 'other'

  return {
    content,
    stopReason,
    tokensIn: response.usage?.input_tokens ?? 0,
    tokensOut: response.usage?.output_tokens ?? 0,
    model: response.model,
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. If any field name here (`max_output_tokens`, `output_text`, `call_id`, etc.) doesn't match the installed `openai@7.4.0` package's types, open `node_modules/openai/resources/responses/responses.d.ts` and fix this file's field names to match what's actually shipped — that file is the ground truth, per Global Constraints.

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/providers/openai.ts
git commit -m "feat: add OpenAI adapter for the multi-provider AI abstraction"
```

---

### Task 6: Gemini adapter (`callGemini`)

**Files:**
- Create: `src/lib/providers/gemini.ts`
- Modify: `package.json` (add `@google/genai`)

**Interfaces:**
- Consumes: `AiCallParams`, `AiCallResult`, `AiContentPart`, `AiMessage`, `AiStopReason` (Task 3).
- Produces: `export const callGemini: (params: AiCallParams) => Promise<AiCallResult>` — consumed by Task 7.

- [ ] **Step 1: Install the SDK**

Run: `npm install @google/genai@^2.17.1`

`@google/generative-ai` is the OLD, superseded package — do not install that one. `@google/genai` is current as of this plan's research date.

- [ ] **Step 2: Write the adapter**

```ts
import 'server-only'

import { GoogleGenAI } from '@google/genai'
import type { AiCallParams, AiCallResult, AiContentPart, AiMessage, AiStopReason } from './ai-types'

/**
 * Dùng API `generateContent` (Google gọi là "Legacy" trong doc mới của họ —
 * KHÔNG phải nghĩa deprecated, chính Google xác nhận "generateContent remains
 * fully supported", chỉ không còn là bề mặt API được quảng bá cho code mới).
 * Chọn API này thay vì Interactions API (bề mặt mới hơn Google khuyến nghị)
 * vì Interactions API quản lý lịch sử hội thoại PHÍA SERVER Google
 * (`previous_interaction_id`) — khác mô hình vô trạng thái (tự dựng lại toàn
 * bộ mảng messages mỗi lượt gọi) mà `run-agent.ts` và hai adapter kia
 * (Anthropic/OpenAI) đều dùng. Theo `generateContent` giữ cả ba adapter nhất
 * quán một kiểu kiến trúc.
 */

const clientsByApiKey = new Map<string, GoogleGenAI>()

const getClient = (apiKey: string): GoogleGenAI => {
  const cached = clientsByApiKey.get(apiKey)
  if (cached) return cached
  const client = new GoogleGenAI({ apiKey })
  clientsByApiKey.set(apiKey, client)
  return client
}

// Gemini dùng role 'model' cho lượt AI trả lời, KHÔNG PHẢI 'assistant' như
// Anthropic/OpenAI — dịch role NGAY tại biên file này, không để rò rỉ ra
// ngoài.
const toGeminiRole = (role: AiMessage['role']): 'user' | 'model' => (role === 'assistant' ? 'model' : 'user')

const toGeminiContents = (messages: readonly AiMessage[]) =>
  messages.map((message) => ({
    role: toGeminiRole(message.role),
    parts: message.content.map((part) => {
      if (part.type === 'text') return { text: part.text }
      if (part.type === 'tool-use') return { functionCall: { name: part.name, args: part.input } }
      // Gemini không có id gọi tool riêng như OpenAI/Anthropic (call_id/
      // tool_use_id) — khớp functionResponse lại đúng lượt gọi bằng TÊN
      // tool. `name` trên AiContentPart tool-result tồn tại chính vì lý do
      // này (xem ai-types.ts).
      return { functionResponse: { name: part.name, response: { result: part.content } } }
    }),
  }))

export const callGemini = async (params: AiCallParams): Promise<AiCallResult> => {
  const client = getClient(params.apiKey)

  const response = await client.models.generateContent({
    model: params.model,
    contents: toGeminiContents(params.messages),
    config: {
      systemInstruction: params.systemPrompt,
      tools:
        params.tools && params.tools.length > 0
          ? [
              {
                functionDeclarations: params.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  // `parametersJsonSchema` chấp nhận JSON Schema thuần — tool
                  // registry (`agents/tools.ts`) đã viết theo JSON Schema sẵn,
                  // dùng trực tiếp thay vì dịch sang format OpenAPI-subset
                  // riêng của Gemini (`Type` enum).
                  parametersJsonSchema: tool.inputSchema,
                })),
              },
            ]
          : undefined,
      maxOutputTokens: params.maxTokens ?? 8000,
    },
  })

  const candidate = response.candidates?.[0]
  const rawParts = candidate?.content?.parts ?? []
  const content: AiContentPart[] = []
  for (const part of rawParts) {
    if (part.text) content.push({ type: 'text', text: part.text })
    if (part.functionCall?.name) {
      content.push({
        type: 'tool-use',
        // Gemini không trả id riêng cho lượt gọi tool — dùng tên tool làm id,
        // khớp đúng cách `toGeminiContents` map tool-result.name ở lượt sau.
        // Chỉ đúng nếu MỘT round không gọi CÙNG một tool hai lần — hợp lý với
        // thiết kế agent hiện tại (mỗi round thường gọi mỗi tool tối đa 1
        // lần).
        id: part.functionCall.name,
        name: part.functionCall.name,
        input: (part.functionCall.args ?? {}) as Record<string, unknown>,
      })
    }
  }

  const hasToolUse = content.some((part) => part.type === 'tool-use')
  const finishReason = candidate?.finishReason

  // Không có finishReason riêng cho "muốn gọi tool" trong Gemini — model vẫn
  // báo STOP khi trả về functionCall, nên phát hiện bằng nội dung trả về
  // (hasToolUse), không phải finishReason, giống hệt lý do ở openai.ts.
  const stopReason: AiStopReason = hasToolUse
    ? 'tool_use'
    : finishReason === 'MAX_TOKENS'
      ? 'max_tokens'
      : finishReason === 'STOP'
        ? 'end_turn'
        : 'other'

  return {
    content,
    stopReason,
    tokensIn: response.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: response.usageMetadata?.candidatesTokenCount ?? 0,
    // Gemini không đảm bảo trả lại tên model đã dùng trong response — echo
    // lại đúng model đã gửi lên thay vì đoán một field response có thể không
    // tồn tại.
    model: params.model,
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. Same rule as Task 5 — if a field name here doesn't match the installed `@google/genai@2.17.1` package's types, check `node_modules/@google/genai/dist/**/*.d.ts` (or your editor's go-to-definition on `GoogleGenAI`) and fix this file to match reality.

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/providers/gemini.ts
git commit -m "feat: add Gemini adapter for the multi-provider AI abstraction"
```

---

### Task 7: AI dispatcher (`callAi`, `extractText`)

**Files:**
- Create: `src/lib/providers/ai.ts`

**Interfaces:**
- Consumes: `callAnthropic` (Task 4), `callOpenAi` (Task 5), `callGemini` (Task 6), all types from Task 3.
- Produces:
  ```ts
  export const callAi: (
    params: AiCallParams & { readonly provider: AiProvider },
  ) => Promise<AiCallResult & { readonly latencyMs: number }>

  export const extractText: (result: AiCallResult) => string
  ```
  Plus re-exports of `AiProvider`, `AiContentPart`, `AiMessage`, `AiToolDefinition`, `AiCallResult` from `ai-types.ts` (so callers only ever need to import from `providers/ai`, never `providers/ai-types` directly). Consumed by Task 8 (types re-export), Task 11 (`actions/prompts.ts`), Task 12 (`agents/run-agent.ts`).

- [ ] **Step 1: Write the dispatcher**

```ts
import 'server-only'

import { callAnthropic } from './anthropic'
import { callOpenAi } from './openai'
import { callGemini } from './gemini'
import type { AiCallParams, AiCallResult, AiContentPart, AiProvider } from './ai-types'

export type { AiProvider, AiContentPart, AiMessage, AiToolDefinition, AiCallResult } from './ai-types'

/**
 * Điểm gọi DUY NHẤT `run-agent.ts`/`actions/prompts.ts` dùng — không bao giờ
 * gọi thẳng `callAnthropic`/`callOpenAi`/`callGemini`. `latencyMs` đo Ở ĐÂY
 * (không phải trong từng adapter) để một chỗ đo thời gian bao quanh bất kỳ
 * adapter nào chạy, không lặp lại logic đo ở cả 3 file.
 */
export const callAi = async (
  params: AiCallParams & { readonly provider: AiProvider },
): Promise<AiCallResult & { readonly latencyMs: number }> => {
  const startedAt = Date.now()
  const { provider, ...rest } = params

  const result =
    provider === 'anthropic' ? await callAnthropic(rest) : provider === 'openai' ? await callOpenAi(rest) : await callGemini(rest)

  return { ...result, latencyMs: Date.now() - startedAt }
}

/** Rút text thuần từ content parts — dùng cho lượt gọi một-chiều (Chạy thử),
 * nơi không cần phân biệt part loại gì, chỉ cần câu trả lời cuối. */
export const extractText = (result: AiCallResult): string =>
  result.content
    .filter((part): part is Extract<AiContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/ai.ts
git commit -m "feat: add callAi dispatcher unifying Claude/OpenAI/Gemini"
```

---

### Task 8: Multi-provider data layer

**Files:**
- Modify: `src/lib/data/site-ai-keys.ts`

**Interfaces:**
- Consumes: `AiProvider` (`@/lib/providers/ai`), `DEFAULT_CLAUDE_MODEL` (`@/lib/providers/anthropic`).
- Produces:
  ```ts
  export interface SiteAiConnection {
    readonly provider: AiProvider
    readonly model: string
  }
  export interface SiteAiConfig extends SiteAiConnection {
    readonly apiKey: string
  }
  export const getSiteAiConnection: (siteId: string) => Promise<SiteAiConnection | null>
  export const resolveAiConfig: (siteId: string) => Promise<SiteAiConfig | null>
  ```
  Consumed by Task 9 (`actions/ai-keys.ts`), Task 10 (settings UI), Task 11 (`actions/prompts.ts`), Task 12 (`agents/run-agent.ts`).
- **Does NOT remove** `getSiteAnthropicApiKey`, `siteAnthropicApiKeyConfigured`, or `resolveClaudeApiKey` yet — `settings/page.tsx`, `actions/ai-keys.ts`, `actions/prompts.ts`, and `agents/run-agent.ts` still call these until Tasks 10, 11, 12. This task is additive.

- [ ] **Step 1: Add the new functions**

Keep the existing file's content (`getSiteAnthropicApiKey`, `siteAnthropicApiKeyConfigured`, `resolveClaudeApiKey`) exactly as-is. Add:

```ts
import { DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import type { AiProvider } from '@/lib/providers/ai'

export interface SiteAiConnection {
  readonly provider: AiProvider
  readonly model: string
}

export interface SiteAiConfig extends SiteAiConnection {
  readonly apiKey: string
}

/** Chỉ đọc trạng thái hiển thị (provider + model đang kết nối), KHÔNG giải
 * mã key — dùng cho UI Cài đặt. `null` nếu Site chưa kết nối provider nào. */
export const getSiteAiConnection = async (siteId: string): Promise<SiteAiConnection | null> => {
  const admin = createAdminClient()
  const { data } = await admin.from('site_ai_keys').select('provider, model').eq('site_id', siteId).maybeSingle()
  if (!data) return null
  return { provider: data.provider as AiProvider, model: data.model }
}

/**
 * Hàm mà `testRunPromptAction`/`runAgent` thực sự gọi để lấy cấu hình AI
 * dùng cho một Site: ưu tiên provider Site tự kết nối, rơi về Claude + biến
 * môi trường ANTHROPIC_API_KEY dùng chung nếu Site chưa kết nối gì (giữ các
 * deploy/dev hiện tại dựa vào env var không bị hỏng). `null` khi cả hai đều
 * thiếu — nơi gọi tự biến thành lỗi hiển thị "chưa cấu hình", hàm này không
 * throw.
 */
export const resolveAiConfig = async (siteId: string): Promise<SiteAiConfig | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_ai_keys')
    .select('provider, model, api_key_enc')
    .eq('site_id', siteId)
    .maybeSingle()

  if (data) {
    return { provider: data.provider as AiProvider, model: data.model, apiKey: decrypt(data.api_key_enc) }
  }

  const envKey = process.env.ANTHROPIC_API_KEY
  if (!envKey) return null
  return { provider: 'anthropic', model: DEFAULT_CLAUDE_MODEL, apiKey: envKey }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/site-ai-keys.ts
git commit -m "feat: add multi-provider resolveAiConfig/getSiteAiConnection"
```

---

### Task 9: Multi-provider server actions

**Files:**
- Modify: `src/lib/actions/ai-keys.ts`

**Interfaces:**
- Consumes: `getSiteAiConnection` (Task 8), `AiProvider` (`@/lib/providers/ai`).
- Produces:
  ```ts
  export interface SaveAiConfigState { readonly error: string | null; readonly success: boolean }
  export const saveSiteAiConfigAction: (prev: SaveAiConfigState, formData: FormData) => Promise<SaveAiConfigState>

  export interface DisconnectAiConfigState { readonly error: string | null; readonly success: boolean }
  export const disconnectSiteAiConfigAction: (prev: DisconnectAiConfigState, formData: FormData) => Promise<DisconnectAiConfigState>
  ```
  Consumed by Task 10 (settings UI).
- **Does NOT remove** `saveSiteAiKeyAction`/`SaveAiKeyState` yet — the current `ai-key-setup.tsx` still calls it until Task 10 replaces that component. This task is additive.

- [ ] **Step 1: Add the new actions**

Keep the file's existing `saveSiteAiKeyAction`/`SaveAiKeyState` exactly as-is. Add:

```ts
import { getSiteAiConnection } from '@/lib/data/site-ai-keys'
import type { AiProvider } from '@/lib/providers/ai'

const AI_PROVIDERS: readonly AiProvider[] = ['anthropic', 'openai', 'gemini']

const isAiProvider = (value: string): value is AiProvider => (AI_PROVIDERS as readonly string[]).includes(value)

const configSchema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  provider: z.string().refine(isAiProvider, 'Nhà cung cấp không hợp lệ'),
  // Trống = giữ nguyên key cũ — CHỈ hợp lệ khi đang kết nối ĐÚNG provider này
  // rồi (kiểm ở thân hàm, cần biết trạng thái hiện tại). Cho phép đổi model
  // mà không phải dán lại API Key mỗi lần.
  apiKey: z.string().trim().refine((v) => v.length === 0 || v.length >= 10, 'API Key trông không hợp lệ'),
  model: z.string().trim().min(1, 'Vui lòng nhập tên model'),
})

export interface SaveAiConfigState {
  readonly error: string | null
  readonly success: boolean
}

/**
 * Kết nối/cập nhật provider AI của một Site. Chỉ MỘT provider kết nối tại
 * một thời điểm (khoá chính `site_ai_keys.site_id`, xem migration
 * 20260817000002) — submit thẳng một provider KHÁC provider đang kết nối bị
 * từ chối ở đây, không âm thầm ghi đè; phải `disconnectSiteAiConfigAction`
 * trước. Cùng khuôn quyền `has_site_role` với `saveSiteOAuthApp`
 * (`actions/oauth-apps.ts`).
 */
export async function saveSiteAiConfigAction(
  _previous: SaveAiConfigState,
  formData: FormData,
): Promise<SaveAiConfigState> {
  const parsed = configSchema.safeParse({
    siteId: formData.get('siteId'),
    provider: formData.get('provider'),
    apiKey: formData.get('apiKey'),
    model: formData.get('model'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false }

  const { siteId, provider, apiKey, model } = parsed.data

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })

  if (!isAdmin) {
    return { error: 'Chỉ chủ sở hữu hoặc quản trị viên của website mới được cấu hình AI provider.', success: false }
  }

  const existing = await getSiteAiConnection(siteId)

  if (existing && existing.provider !== provider) {
    return {
      error: `Website đang kết nối ${existing.provider}. Ngắt kết nối trước khi đổi sang provider khác.`,
      success: false,
    }
  }

  if (!apiKey && !existing) {
    return { error: 'API Key bắt buộc ở lần kết nối đầu tiên.', success: false }
  }

  const admin = createAdminClient()
  // Hai nhánh riêng (không upsert) — Insert cần api_key_enc bắt buộc (cột
  // NOT NULL), Update thì mọi cột đều tuỳ chọn (đúng ý "đổi model mà không
  // đổi key" khi apiKey để trống). Cùng lý do hai-nhánh đã dùng ở
  // `saveSiteOAuthApp`.
  const { error } = existing
    ? await admin
        .from('site_ai_keys')
        .update({
          provider,
          model,
          updated_at: new Date().toISOString(),
          ...(apiKey ? { api_key_enc: encrypt(apiKey) } : {}),
        })
        .eq('site_id', siteId)
    : await admin.from('site_ai_keys').insert({
        site_id: siteId,
        provider,
        model,
        api_key_enc: encrypt(apiKey),
        created_by: user.id,
      })

  if (error) {
    return { error: `Không lưu được cấu hình: ${error.message}`, success: false }
  }

  revalidatePath(`/${siteId}/settings`)
  return { error: null, success: true }
}

export interface DisconnectAiConfigState {
  readonly error: string | null
  readonly success: boolean
}

export async function disconnectSiteAiConfigAction(
  _previous: DisconnectAiConfigState,
  formData: FormData,
): Promise<DisconnectAiConfigState> {
  const siteId = String(formData.get('siteId') ?? '')
  if (!siteId) return { error: 'Site không hợp lệ', success: false }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })

  if (!isAdmin) {
    return { error: 'Chỉ chủ sở hữu hoặc quản trị viên của website mới được ngắt kết nối AI provider.', success: false }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('site_ai_keys').delete().eq('site_id', siteId)

  if (error) {
    return { error: `Không ngắt kết nối được: ${error.message}`, success: false }
  }

  revalidatePath(`/${siteId}/settings`)
  return { error: null, success: true }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/ai-keys.ts
git commit -m "feat: add multi-provider save/disconnect AI config actions"
```

---

### Task 10: Rewire the Settings UI to the multi-provider flow

**Files:**
- Modify: `src/components/settings/ai-key-setup.tsx` (full rewrite)
- Modify: `src/app/(app)/[siteId]/settings/page.tsx`
- Modify: `src/lib/actions/ai-keys.ts` (delete now-dead `saveSiteAiKeyAction`/`SaveAiKeyState`)
- Modify: `src/lib/data/site-ai-keys.ts` (delete now-dead `getSiteAnthropicApiKey`/`siteAnthropicApiKeyConfigured`)

**Interfaces:**
- Consumes: `saveSiteAiConfigAction`, `disconnectSiteAiConfigAction`, `SaveAiConfigState`, `DisconnectAiConfigState` (Task 9), `getSiteAiConnection` (Task 8), `AiProvider` (`@/lib/providers/ai`).
- This task's own component/page changes must land together — `AiKeySetup`'s prop shape changes from `isConfigured: boolean` to `connection: SiteAiConnection | null`, so the page that renders it must change in the same commit or `tsc` breaks.
- After this task, `saveSiteAiKeyAction`/`SaveAiKeyState` (old, single-field, Anthropic-only) and `getSiteAnthropicApiKey`/`siteAnthropicApiKeyConfigured` (old, Anthropic-only reads) have no remaining callers anywhere — delete them as part of this task, per Global Constraints' "delete in the task that kills the last caller" rule.

- [ ] **Step 1: Rewrite `ai-key-setup.tsx` as a guide dialog**

Read the current file first (`src/components/settings/ai-key-setup.tsx`) and `src/components/connections/oauth-app-setup.tsx` (the dialog + step-guide pattern to mirror — `DialogRoot`/`DialogTrigger`/`DialogContent` from `@/components/ui/dialog`, numbered `<ol>` guide steps, console link with `ExternalLink` icon). Replace the entire file with:

```tsx
'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, ExternalLink, Settings2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import {
  saveSiteAiConfigAction,
  disconnectSiteAiConfigAction,
  type SaveAiConfigState,
  type DisconnectAiConfigState,
} from '@/lib/actions/ai-keys'
import type { AiProvider } from '@/lib/providers/ai'
import type { SiteAiConnection } from '@/lib/data/site-ai-keys'

/* Hallmark · component: ai-key-setup · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Mỗi Site chỉ kết nối MỘT provider AI tại một thời điểm (khoá chính
 * site_ai_keys.site_id) — đổi provider bắt buộc Ngắt kết nối trước, không có
 * đường "sửa trực tiếp sang provider khác" trong dialog này. API Key không
 * bao giờ hiển thị lại sau khi lưu — input luôn trống, cùng quy ước với
 * oauth-app-setup.tsx's Client Secret.
 *
 * Hướng dẫn lấy API Key CHƯA được đối chiếu trực tiếp với console thật của
 * từng hãng — khớp quy ước "CHƯA ai chạy thử" của repo cho các bước UI chưa
 * xác minh; tên nút/vị trí có thể lệch nếu hãng đổi giao diện.
 */

const PROVIDER_LABELS: Readonly<Record<AiProvider, string>> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
}

const CONSOLE_LINKS: Readonly<Record<AiProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
}

const MODEL_HINTS: Readonly<Record<AiProvider, string>> = {
  anthropic: 'vd. claude-opus-5 — xem danh sách tại docs.anthropic.com/en/docs/about-claude/models',
  openai: 'vd. gpt-5.1 — xem danh sách tại platform.openai.com/docs/models',
  gemini: 'vd. gemini-3-pro — xem danh sách tại ai.google.dev/gemini-api/docs/models',
}

const GUIDE_STEPS: Readonly<Record<AiProvider, readonly string[]>> = {
  anthropic: [
    'Vào console.anthropic.com, đăng nhập hoặc tạo tài khoản Anthropic.',
    'Vào mục Settings → API Keys (hoặc console.anthropic.com/settings/keys).',
    'Bấm "Create Key", đặt tên gợi nhớ (vd. tên website này), bấm tạo.',
    'Anthropic chỉ hiện API Key MỘT LẦN DUY NHẤT lúc tạo — sao chép ngay và dán vào form bên dưới trước khi đóng màn hình đó.',
    'Vào mục Billing, đảm bảo tài khoản có phương thức thanh toán/hạn mức — API Key hợp lệ nhưng tài khoản chưa có billing sẽ báo lỗi khi gọi thật.',
  ],
  openai: [
    'Vào platform.openai.com, đăng nhập hoặc tạo tài khoản OpenAI (khác tài khoản ChatGPT thường dùng, dù có thể đăng nhập chung).',
    'Vào mục API keys (platform.openai.com/api-keys).',
    'Bấm "Create new secret key", đặt tên gợi nhớ, chọn project nếu tài khoản có nhiều project.',
    'OpenAI chỉ hiện API Key MỘT LẦN DUY NHẤT lúc tạo — sao chép ngay và dán vào form bên dưới.',
    'Vào mục Billing (platform.openai.com/settings/organization/billing), nạp hạn mức trả trước hoặc thêm phương thức thanh toán — tài khoản mới thường không có hạn mức mặc định, gọi API sẽ báo lỗi hạn mức nếu bỏ qua bước này.',
  ],
  gemini: [
    'Vào aistudio.google.com, đăng nhập bằng tài khoản Google.',
    'Bấm "Get API key" (góc trên bên trái hoặc aistudio.google.com/apikey).',
    'Bấm "Create API key", chọn một Google Cloud project có sẵn hoặc để Google tự tạo project mới.',
    'Sao chép API Key vừa tạo, dán vào form bên dưới — khác Claude/OpenAI, key này xem lại được sau trong cùng màn hình nếu cần, nhưng vẫn nên lưu lại ngay.',
    'Gemini có hạn mức miễn phí (free tier) khá rộng cho tài khoản mới — thường không cần bật billing ngay để bắt đầu thử, nhưng hạn mức/giá có thể đổi theo chính sách Google tại thời điểm bạn đọc hướng dẫn này.',
  ],
}

export interface AiKeySetupProps {
  readonly siteId: string
  readonly connection: SiteAiConnection | null
}

export function AiKeySetup({ siteId, connection }: AiKeySetupProps) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<AiProvider>(connection?.provider ?? 'anthropic')
  const [saveState, saveAction, savePending] = useActionState<SaveAiConfigState, FormData>(saveSiteAiConfigAction, {
    error: null,
    success: false,
  })
  const [disconnectState, disconnectAction, disconnectPending] = useActionState<DisconnectAiConfigState, FormData>(
    disconnectSiteAiConfigAction,
    { error: null, success: false },
  )

  useEffect(() => {
    if (saveState.success) {
      const timeout = setTimeout(() => setOpen(false), 1200)
      return () => clearTimeout(timeout)
    }
  }, [saveState.success])

  if (connection) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Đã kết nối:{' '}
          <span className="font-medium text-[var(--color-ink)]">{PROVIDER_LABELS[connection.provider]}</span>
          {' · model '}
          <span className="font-medium text-[var(--color-ink)]">{connection.model}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <DialogRoot open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="md">
                Đổi API Key / model
              </Button>
            </DialogTrigger>
            <DialogContent
              title={`Cập nhật ${PROVIDER_LABELS[connection.provider]}`}
              description="Đổi API Key hoặc model cho provider đang kết nối — để trống API Key nếu chỉ muốn đổi model."
            >
              <ConnectForm
                siteId={siteId}
                provider={connection.provider}
                isUpdating
                state={saveState}
                formAction={saveAction}
                pending={savePending}
                defaultModel={connection.model}
              />
            </DialogContent>
          </DialogRoot>
          <form action={disconnectAction}>
            <input type="hidden" name="siteId" value={siteId} />
            <Button
              type="submit"
              variant="ghost"
              size="md"
              state={disconnectPending ? 'loading' : 'idle'}
              loadingLabel="Đang ngắt…"
            >
              Ngắt kết nối
            </Button>
          </form>
        </div>
        {disconnectState.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
            {disconnectState.error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Settings2 aria-hidden className="size-4" />
          Kết nối AI provider
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Kết nối AI provider"
        description="Chọn một nhà cung cấp AI và dán API Key của bạn — website này chỉ dùng được MỘT provider tại một thời điểm."
      >
        <FormField label="Nhà cung cấp" htmlFor="ai-key-provider">
          <select
            id="ai-key-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className={`${inputClass} mb-5`}
          >
            {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </FormField>

        <ol className="mb-5 flex flex-col gap-2.5">
          {GUIDE_STEPS[provider].map((step, index) => (
            <li key={step} className="flex gap-2.5 text-[length:var(--text-sm)]">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-3)] text-[length:var(--text-2xs)] font-semibold text-[var(--color-ink-2)]"
              >
                {index + 1}
              </span>
              <span className="text-[var(--color-ink-2)]">{step}</span>
            </li>
          ))}
        </ol>

        <a
          href={CONSOLE_LINKS[provider]}
          target="_blank"
          rel="noreferrer noopener"
          className="mb-5 inline-flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Mở trang lấy API Key {PROVIDER_LABELS[provider]}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>

        <ConnectForm
          siteId={siteId}
          provider={provider}
          isUpdating={false}
          state={saveState}
          formAction={saveAction}
          pending={savePending}
          defaultModel=""
        />
      </DialogContent>
    </DialogRoot>
  )
}

function ConnectForm({
  siteId,
  provider,
  isUpdating,
  state,
  formAction,
  pending,
  defaultModel,
}: {
  readonly siteId: string
  readonly provider: AiProvider
  readonly isUpdating: boolean
  readonly state: SaveAiConfigState
  readonly formAction: (formData: FormData) => void
  readonly pending: boolean
  readonly defaultModel: string
}) {
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
          id="ai-key-api-key"
          name="apiKey"
          type="password"
          required={!isUpdating}
          autoComplete="off"
          placeholder={isUpdating ? '••••••••••••' : undefined}
          className={inputClass}
        />
      </FormField>

      <FormField label="Model" htmlFor="ai-key-model" hint={MODEL_HINTS[provider]}>
        <input
          id="ai-key-model"
          name="model"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          defaultValue={defaultModel}
          className={inputClass}
        />
      </FormField>

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

- [ ] **Step 2: Wire the new component into the Settings page**

Open `src/app/(app)/[siteId]/settings/page.tsx`. Replace the import `import { siteAnthropicApiKeyConfigured } from '@/lib/data/site-ai-keys'` with `import { getSiteAiConnection } from '@/lib/data/site-ai-keys'`. Replace the line `const aiKeyConfigured = await siteAnthropicApiKeyConfigured(site.id)` with `const aiConnection = await getSiteAiConnection(site.id)`. Update the Card's `description` (currently "Dùng cho nút &quot;Chạy thử&quot;... Để trống thì cả hai dùng chung khoá mặc định của hệ thống.") to reflect multi-provider — e.g. `"Dùng cho nút &quot;Chạy thử&quot; ở Prompt Studio và cho các agent tự động của website này. Hỗ trợ Claude, OpenAI, hoặc Gemini — một provider tại một thời điểm."` — and change the card's `title` from `"Claude API Key"` to `"AI Provider"`. Update the render call from `<AiKeySetup siteId={site.id} isConfigured={aiKeyConfigured} />` to `<AiKeySetup siteId={site.id} connection={aiConnection} />`.

- [ ] **Step 3: Delete the now-dead legacy code**

In `src/lib/actions/ai-keys.ts`, delete `saveSiteAiKeyAction` and `SaveAiKeyState` in their entirety (the old single-field Anthropic-only action — no longer called by anything after Step 1's rewrite). Also remove the now-unused import of `siteAnthropicApiKeyConfigured` from this file if it's no longer referenced.

In `src/lib/data/site-ai-keys.ts`, delete `getSiteAnthropicApiKey` and `siteAnthropicApiKeyConfigured` in their entirety (no longer called anywhere after Step 2). Do **not** delete `resolveClaudeApiKey` — `actions/prompts.ts` and `agents/run-agent.ts` still call it until Tasks 11/12.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/ai-key-setup.tsx "src/app/(app)/[siteId]/settings/page.tsx" src/lib/actions/ai-keys.ts src/lib/data/site-ai-keys.ts
git commit -m "feat: rewire Settings AI card to multi-provider connect/disconnect flow"
```

---

### Task 11: Wire Prompt Studio to `callAi`

**Files:**
- Modify: `src/lib/actions/prompts.ts`

**Interfaces:**
- Consumes: `callAi`, `extractText` (`@/lib/providers/ai`, Task 7), `resolveAiConfig` (`@/lib/data/site-ai-keys`, Task 8).
- After this task, `resolveClaudeApiKey`'s callers are down to just `agents/run-agent.ts` — do NOT delete it yet, Task 12 does that.

- [ ] **Step 1: Swap the imports and the API-key/call logic**

In `src/lib/actions/prompts.ts`, replace:
```ts
import { callClaude, extractText, DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
```
and
```ts
import { resolveClaudeApiKey } from '@/lib/data/site-ai-keys'
```
with:
```ts
import { callAi, extractText } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'
```

Replace this block inside `testRunPromptAction`:
```ts
  const apiKey = await resolveClaudeApiKey(site.id)
  if (!apiKey) {
    return { run: null, error: 'Chưa cấu hình Claude API Key cho website này. Vào Cài đặt để thêm.' }
  }
```
with:
```ts
  const aiConfig = await resolveAiConfig(site.id)
  if (!aiConfig) {
    return { run: null, error: 'Chưa cấu hình AI Key cho website này. Vào Cài đặt để thêm.' }
  }
```

Replace this block (the actual Claude call and `recordPromptRun`):
```ts
  const { message, latencyMs } = await callClaude({
    apiKey,
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
```
with:
```ts
  const result = await callAi({
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    systemPrompt: input.systemPrompt,
    messages: [{ role: 'user', content: [{ type: 'text', text: filledTemplate }] }],
  })

  const run = await recordPromptRun({
    promptId: input.promptId,
    versionId: input.versionId,
    inputs: resolvedVars,
    output: extractText(result),
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    latencyMs: result.latencyMs,
    ranBy: userId,
  })
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/prompts.ts
git commit -m "feat: wire Prompt Studio test-run to the multi-provider AI dispatcher"
```

---

### Task 12: Wire Agents to `callAi` and clean up now-dead legacy exports

**Files:**
- Modify: `src/lib/agents/run-agent.ts`
- Modify: `src/lib/providers/anthropic.ts` (delete now-dead `callClaude`/`extractText`/`ClaudeMessage`/`ClaudeToolDefinition`)
- Modify: `src/lib/data/site-ai-keys.ts` (delete now-dead `resolveClaudeApiKey`)

**Interfaces:**
- Consumes: `callAi`, `extractText`, `AiContentPart`, `AiMessage` (`@/lib/providers/ai`, Task 7), `resolveAiConfig` (`@/lib/data/site-ai-keys`, Task 8).
- After this task, both `testRunPromptAction` (Task 11) and `runAgent` (this task) have switched to the new abstraction — this is the last-caller task for `callClaude`/`extractText`/`ClaudeMessage`/`ClaudeToolDefinition` (anthropic.ts) and `resolveClaudeApiKey` (site-ai-keys.ts), so this task deletes them.

- [ ] **Step 1: Rewrite the imports**

In `src/lib/agents/run-agent.ts`, replace:
```ts
import { callClaude, extractText, DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import { resolveClaudeApiKey } from '@/lib/data/site-ai-keys'
```
```ts
import type Anthropic from '@anthropic-ai/sdk'
```
with:
```ts
import { callAi, extractText } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'
import type { AiContentPart, AiMessage } from '@/lib/providers/ai'
```
(the `Anthropic` type import is no longer used anywhere in this file after this task's remaining steps — remove it.)

- [ ] **Step 2: Replace the API-key resolution block**

Replace:
```ts
    // Cùng thông điệp với `testRunPromptAction` (`actions/prompts.ts`) — chưa
    // cấu hình Claude API Key là một lỗi CÓ THỂ SỬA từ UI, không phải lỗi hệ
    // thống, nên `finishRun('failed', ...)` với summary rõ nguyên nhân thay
    // vì throw một lỗi chung chung.
    const apiKey = await resolveClaudeApiKey(agentRow.siteId)
    if (!apiKey) {
      await finishRun(run.id, {
        status: 'failed',
        summary: 'Chưa cấu hình Claude API Key cho website này. Vào Cài đặt để thêm.',
        tokensUsed: 0,
      })
      finished = true
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }
```
with:
```ts
    // Cùng thông điệp với `testRunPromptAction` (`actions/prompts.ts`) — chưa
    // cấu hình AI Key là một lỗi CÓ THỂ SỬA từ UI, không phải lỗi hệ thống,
    // nên `finishRun('failed', ...)` với summary rõ nguyên nhân thay vì throw
    // một lỗi chung chung.
    const aiConfig = await resolveAiConfig(agentRow.siteId)
    if (!aiConfig) {
      await finishRun(run.id, {
        status: 'failed',
        summary: 'Chưa cấu hình AI Key cho website này. Vào Cài đặt để thêm.',
        tokensUsed: 0,
      })
      finished = true
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }
```

- [ ] **Step 3: Replace the message-building and tool-calling loop**

Replace:
```ts
    const messages: { role: 'user' | 'assistant'; content: Anthropic.MessageParam['content'] }[] = [
      { role: 'user', content: filledTemplate },
    ]

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const { message } = await callClaude({
        apiKey,
        systemPrompt: currentVersion.systemPrompt,
        messages,
        model: DEFAULT_CLAUDE_MODEL,
        tools: toolDefs,
      })

      totalTokens += message.usage.input_tokens + message.usage.output_tokens

      if (message.stop_reason !== 'tool_use') {
        // Chỉ ghi MỘT step 'output' cho lượt kết thúc — `extractText` đã gộp
        // đúng những text block này rồi, ghi thêm 'thought' nữa là lặp y hệt
        // nội dung trong transcript.
        const finalText = extractText(message)
        await appendRunStep(run.id, { kind: 'output', tool: null, content: finalText, at: new Date().toISOString() })

        if (message.stop_reason === 'end_turn') {
          await finishRun(run.id, { status: 'succeeded', summary: finalText, tokensUsed: totalTokens })
        } else {
          // max_tokens/refusal/stop_sequence/pause_turn/... KHÔNG phải một
          // phân tích đã hoàn tất — coi là thất bại và nêu rõ lý do dừng để
          // phân biệt với kết thúc bình thường.
          const reasonLabel = message.stop_reason ?? 'không rõ'
          await finishRun(run.id, {
            status: 'failed',
            summary: `Dừng bất thường (${reasonLabel}): ${finalText}`,
            tokensUsed: totalTokens,
          })
        }
        finished = true
        await setAgentLastRunAt(agentId, new Date().toISOString())
        return
      }

      const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
      for (const block of textBlocks) {
        await appendRunStep(run.id, { kind: 'thought', tool: null, content: block.text, at: new Date().toISOString() })
      }

      const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      messages.push({ role: 'assistant', content: message.content })

      let hasWriteTool = false
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of toolUseBlocks) {
        const toolName = block.name as AgentToolName
        await appendRunStep(run.id, {
          kind: 'tool-call',
          tool: toolName,
          content: JSON.stringify(block.input),
          at: new Date().toISOString(),
        })

        // Phòng vệ theo chiều sâu: `toolDefs` gửi cho Claude đã lọc theo tool
        // được bật, nhưng model vẫn có thể trả về tên tool KHÔNG nằm trong đó
        // (bịa tên, hoặc gọi một tool đã tắt) — không chạy tool đó, kể cả khi
        // nó tồn tại trong TOOL_REGISTRY.
        const isOffered = enabledToolNames.has(toolName)
        const definition = isOffered ? TOOL_REGISTRY[toolName] : undefined

        let resultText: string
        if (!isOffered) {
          resultText = `Tool "${toolName}" không được agent này bật, bỏ qua.`
        } else if (!definition) {
          resultText = `Tool "${toolName}" không tồn tại.`
        } else {
          if (isWriteTool(toolName)) hasWriteTool = true
          resultText = await definition.run(block.input as Record<string, unknown>, {
            siteId: agentRow.siteId,
            runId: run.id,
            range,
            currency: site.currency,
          })
        }

        await appendRunStep(run.id, { kind: 'tool-result', tool: toolName, content: resultText, at: new Date().toISOString() })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText })
      }

      if (hasWriteTool) {
        // Bất biến an toàn: dừng HẲN ngay khi có write-tool ĐÃ THỰC THI,
        // không cho vòng lặp tiếp tục dù model muốn làm gì thêm — xem
        // domain/agent.ts.
        await finishRun(run.id, {
          status: 'pending-approval',
          summary: 'Agent đã đề xuất một hành động, đang chờ duyệt.',
          tokensUsed: totalTokens,
        })
        finished = true
        await setAgentLastRunAt(agentId, new Date().toISOString())
        return
      }

      messages.push({ role: 'user', content: toolResults })
    }
```
with:
```ts
    const messages: AiMessage[] = [{ role: 'user', content: [{ type: 'text', text: filledTemplate }] }]

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const result = await callAi({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        systemPrompt: currentVersion.systemPrompt,
        messages,
        tools: toolDefs,
      })

      totalTokens += result.tokensIn + result.tokensOut

      if (result.stopReason !== 'tool_use') {
        // Chỉ ghi MỘT step 'output' cho lượt kết thúc — `extractText` đã gộp
        // đúng những text part này rồi, ghi thêm 'thought' nữa là lặp y hệt
        // nội dung trong transcript.
        const finalText = extractText(result)
        await appendRunStep(run.id, { kind: 'output', tool: null, content: finalText, at: new Date().toISOString() })

        if (result.stopReason === 'end_turn') {
          await finishRun(run.id, { status: 'succeeded', summary: finalText, tokensUsed: totalTokens })
        } else {
          // max_tokens/other KHÔNG phải một phân tích đã hoàn tất — coi là
          // thất bại và nêu rõ lý do dừng để phân biệt với kết thúc bình
          // thường.
          await finishRun(run.id, {
            status: 'failed',
            summary: `Dừng bất thường (${result.stopReason}): ${finalText}`,
            tokensUsed: totalTokens,
          })
        }
        finished = true
        await setAgentLastRunAt(agentId, new Date().toISOString())
        return
      }

      const textParts = result.content.filter(
        (p): p is Extract<AiContentPart, { type: 'text' }> => p.type === 'text',
      )
      for (const part of textParts) {
        await appendRunStep(run.id, { kind: 'thought', tool: null, content: part.text, at: new Date().toISOString() })
      }

      const toolUseParts = result.content.filter(
        (p): p is Extract<AiContentPart, { type: 'tool-use' }> => p.type === 'tool-use',
      )
      messages.push({ role: 'assistant', content: result.content })

      let hasWriteTool = false
      const toolResultParts: AiContentPart[] = []

      for (const part of toolUseParts) {
        const toolName = part.name as AgentToolName
        await appendRunStep(run.id, {
          kind: 'tool-call',
          tool: toolName,
          content: JSON.stringify(part.input),
          at: new Date().toISOString(),
        })

        // Phòng vệ theo chiều sâu: `toolDefs` gửi cho model đã lọc theo tool
        // được bật, nhưng model vẫn có thể trả về tên tool KHÔNG nằm trong đó
        // (bịa tên, hoặc gọi một tool đã tắt) — không chạy tool đó, kể cả khi
        // nó tồn tại trong TOOL_REGISTRY.
        const isOffered = enabledToolNames.has(toolName)
        const definition = isOffered ? TOOL_REGISTRY[toolName] : undefined

        let resultText: string
        if (!isOffered) {
          resultText = `Tool "${toolName}" không được agent này bật, bỏ qua.`
        } else if (!definition) {
          resultText = `Tool "${toolName}" không tồn tại.`
        } else {
          if (isWriteTool(toolName)) hasWriteTool = true
          resultText = await definition.run(part.input, {
            siteId: agentRow.siteId,
            runId: run.id,
            range,
            currency: site.currency,
          })
        }

        await appendRunStep(run.id, { kind: 'tool-result', tool: toolName, content: resultText, at: new Date().toISOString() })
        toolResultParts.push({ type: 'tool-result', toolUseId: part.id, name: part.name, content: resultText })
      }

      if (hasWriteTool) {
        // Bất biến an toàn: dừng HẲN ngay khi có write-tool ĐÃ THỰC THI,
        // không cho vòng lặp tiếp tục dù model muốn làm gì thêm — xem
        // domain/agent.ts.
        await finishRun(run.id, {
          status: 'pending-approval',
          summary: 'Agent đã đề xuất một hành động, đang chờ duyệt.',
          tokensUsed: totalTokens,
        })
        finished = true
        await setAgentLastRunAt(agentId, new Date().toISOString())
        return
      }

      messages.push({ role: 'user', content: toolResultParts })
    }
```

- [ ] **Step 4: Delete the now-dead legacy exports**

In `src/lib/providers/anthropic.ts`, delete `ClaudeToolDefinition`, `ClaudeMessage`, `callClaude`, and the OLD `extractText` (the one operating on `Anthropic.Message`, at the bottom of the file) — the new `extractText` now lives in `providers/ai.ts` and operates on `AiCallResult`. Keep `DEFAULT_CLAUDE_MODEL`, `clientsByApiKey`, `getClient`, `callAnthropic`, and every helper `callAnthropic` depends on (`toAnthropicContent`, `fromAnthropicContent`, `STOP_REASON_MAP`) — `DEFAULT_CLAUDE_MODEL` is still used by `data/site-ai-keys.ts`'s `resolveAiConfig`.

In `src/lib/data/site-ai-keys.ts`, delete `resolveClaudeApiKey` in its entirety — no callers remain after this task.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: zero errors. This is the task where the whole chain (types → adapters → dispatcher → data layer → actions → UI → both callers) is fully connected — if anything upstream had a type mismatch, it surfaces here.

- [ ] **Step 6: Verify lint passes**

Run: `npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/lib/agents/run-agent.ts src/lib/providers/anthropic.ts src/lib/data/site-ai-keys.ts
git commit -m "feat: wire Agents tool-calling loop to the multi-provider AI dispatcher"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint the whole project**

Run: `npm run lint`
Expected: zero errors, zero warnings — this repo's baseline is genuinely clean, not "pre-existing warnings excluded."

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds cleanly, all routes compile including `/[siteId]/settings`, `/[siteId]/prompts`, `/[siteId]/agents`, `/[siteId]/agents/[agentId]`, `/api/cron/sync-all`.

- [ ] **Step 4: Confirm dependencies installed correctly**

Run: `grep -E '"(openai|@google/genai)"' package.json`
Expected: both present with the versions installed in Tasks 5/6.

- [ ] **Step 5: Manual smoke check — at least the provider(s) you have a real key for**

Run `npm run dev`, sign in, navigate to `/[siteId]/settings`. Confirm the "AI Provider" card renders the provider picker (not connected yet) or the connected state (already connected from earlier work). For each provider you have a real API key for:

1. Connect it via the dialog (pick provider, paste key, enter a real current model name for that provider, save).
2. Navigate to `/[siteId]/prompts`, click "Chạy thử" on any prompt — confirm a real response renders with token counts, and the recorded run shows the correct `provider`/`model` you just connected.
3. Navigate to `/[siteId]/agents`, click "Chạy ngay" on an agent with `query-metrics` enabled — confirm the run reaches `succeeded` with real step content from that provider.
4. Back in Settings, click "Ngắt kết nối", confirm the card reverts to "not connected" and the provider picker reappears.

This is real UI + real API verification, not something `tsc`/`lint`/`build` substitute for. If you only have a real key for one provider, smoke-test that one now and note in your final report which providers remain untested — do not claim full verification for providers you couldn't actually call.

- [ ] **Step 6: Commit if Step 5 required any fixes**

If manual testing surfaced bugs, fix them in the relevant task's file, then:

```bash
git add -A
git commit -m "fix: address issues found in manual smoke test"
```
