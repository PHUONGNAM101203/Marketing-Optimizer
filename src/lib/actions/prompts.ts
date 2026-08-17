'use server'

import { revalidatePath } from 'next/cache'
import { callClaude, extractText, DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import { createPrompt, createPromptVersion, recordPromptRun, ratePromptRun } from '@/lib/data/prompts'
import { resolveVariables, fillTemplate, VariableResolutionError } from '@/lib/prompts/resolve-variables'
import { getSite } from '@/lib/data/sites'
import { getCurrentUser } from '@/lib/supabase/server'
import { findUndeclaredVariables } from '@/lib/domain/prompt'
import type { PromptCategory, PromptRun, PromptTemplate, PromptVariable } from '@/lib/domain/prompt'

const requireUserId = async (): Promise<string> => {
  const user = await getCurrentUser()
  if (!user) throw new Error('Chưa đăng nhập')
  return user.id
}

/**
 * Cùng khuôn với `TestRunState` bên dưới — lỗi VALIDATION (biến chưa khai
 * báo) và lỗi GHI (Supabase) đều là thứ người dùng cần đọc đúng nguyên văn,
 * nên trả về qua `error` thay vì throw: Next.js redact message của lỗi throw
 * từ Server Action thành một chuỗi chung chung trên build production (xem
 * node_modules/next/dist/docs/.../10-error-handling.md), nên throw ở đây sẽ
 * giấu mất đúng phần người dùng cần thấy nhất — biến nào chưa khai báo, hay
 * vì sao ghi thất bại. `requireUserId()` vẫn để throw như `testRunPromptAction`
 * — phiên hết hạn là lỗi thật sự bất ngờ, không phải điều form cần hiển thị.
 */
export interface CreatePromptState {
  readonly prompt: PromptTemplate | null
  readonly error: string | null
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
}): Promise<CreatePromptState> => {
  const userId = await requireUserId()
  const undeclared = findUndeclaredVariables(input.userTemplate, input.variables)
  if (undeclared.length > 0) {
    return { prompt: null, error: `Template dùng biến chưa khai báo: ${undeclared.join(', ')}` }
  }

  try {
    const prompt = await createPrompt({ ...input, createdBy: userId })
    revalidatePath(`/${input.siteId}/prompts`)
    return { prompt, error: null }
  } catch (error) {
    return { prompt: null, error: error instanceof Error ? error.message : 'Không tạo được prompt.' }
  }
}

export interface SaveVersionState {
  readonly prompt: PromptTemplate | null
  readonly error: string | null
}

export const savePromptVersionAction = async (input: {
  readonly siteId: string
  readonly promptId: string
  readonly systemPrompt: string
  readonly userTemplate: string
  readonly notes: string | null
}): Promise<SaveVersionState> => {
  const userId = await requireUserId()
  try {
    const prompt = await createPromptVersion({
      promptId: input.promptId,
      systemPrompt: input.systemPrompt,
      userTemplate: input.userTemplate,
      notes: input.notes,
      createdBy: userId,
    })
    revalidatePath(`/${input.siteId}/prompts`)
    return { prompt, error: null }
  } catch (error) {
    return { prompt: null, error: error instanceof Error ? error.message : 'Không lưu được bản mới.' }
  }
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

  // `fillTemplate` dùng lại đúng VARIABLE_PATTERN của bước rút tên biến
  // (chấp nhận `{{ name }}` có khoảng trắng) — thay vì tự dựng chuỗi
  // `{{name}}` cứng, vốn sẽ bỏ sót biến có khoảng trắng đã được coi là "đã
  // khai báo" ở bước kiểm tra undeclared variables phía trên. Dùng chung với
  // `run-agent.ts` để hai đường "Chạy thử" và agent luôn thay biến giống hệt
  // nhau.
  const filledTemplate = fillTemplate(input.userTemplate, resolvedVars)

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
  await requireUserId()
  await ratePromptRun(runId, rating)
}
