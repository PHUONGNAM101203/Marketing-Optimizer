import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { resolveDisplayNames } from './profiles'
import type { Json } from '@/lib/supabase/database.types'
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
      // Supabase gen types kỳ vọng mảng có thể mutate (`Json[]`/`string[]`);
      // input của hàm này cố tình readonly để giữ nguyên tắc immutability,
      // nên phải ép kiểu tường minh ở biên ghi xuống DB.
      variables: input.variables as unknown as Json,
      tags: [...input.tags],
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
