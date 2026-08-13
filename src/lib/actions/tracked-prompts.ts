'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { AI_ENGINES } from '@/lib/domain/geo'
import { createClient } from '@/lib/supabase/server'

const createSchema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  text: z.string().trim().min(5, 'Câu hỏi quá ngắn').max(300, 'Câu hỏi quá dài'),
  intent: z.enum(['informational', 'comparison', 'recommendation', 'transactional']),
  cadence: z.enum(['daily', 'weekly']),
  engines: z
    .array(z.enum(AI_ENGINES))
    .min(1, 'Chọn ít nhất một engine'),
})

export interface TrackedPromptActionState {
  readonly error: string | null
  readonly ok: boolean
}

const INITIAL_STATE: TrackedPromptActionState = { error: null, ok: false }

export async function createTrackedPromptAction(
  _previous: TrackedPromptActionState,
  formData: FormData,
): Promise<TrackedPromptActionState> {
  const parsed = createSchema.safeParse({
    siteId: formData.get('siteId'),
    text: formData.get('text'),
    intent: formData.get('intent'),
    cadence: formData.get('cadence'),
    engines: formData.getAll('engines'),
  })

  if (!parsed.success) {
    return { ...INITIAL_STATE, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ...INITIAL_STATE, error: 'Phiên đăng nhập đã hết hạn.' }

  const { siteId, text, intent, cadence, engines } = parsed.data
  const { error } = await supabase.from('tracked_prompts').insert({
    site_id: siteId,
    text,
    intent,
    cadence,
    engines,
    created_by: user.id,
  })

  if (error) {
    return {
      ...INITIAL_STATE,
      error:
        error.code === '42501'
          ? 'Chỉ chủ sở hữu hoặc quản trị viên mới thêm được câu hỏi theo dõi.'
          : `Không thêm được: ${error.message}`,
    }
  }

  revalidatePath(`/${siteId}/ai-visibility`)
  return { ok: true, error: null }
}

const toggleSchema = z.object({
  promptId: z.string().uuid(),
  siteId: z.string().uuid(),
  enabled: z.enum(['true', 'false']),
})

export async function toggleTrackedPromptAction(formData: FormData): Promise<void> {
  const parsed = toggleSchema.safeParse({
    promptId: formData.get('promptId'),
    siteId: formData.get('siteId'),
    enabled: formData.get('enabled'),
  })
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase
    .from('tracked_prompts')
    .update({ enabled: parsed.data.enabled === 'true' })
    .eq('id', parsed.data.promptId)

  revalidatePath(`/${parsed.data.siteId}/ai-visibility`)
}

const deleteSchema = z.object({
  promptId: z.string().uuid(),
  siteId: z.string().uuid(),
})

export async function deleteTrackedPromptAction(formData: FormData): Promise<void> {
  const parsed = deleteSchema.safeParse({
    promptId: formData.get('promptId'),
    siteId: formData.get('siteId'),
  })
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase.from('tracked_prompts').delete().eq('id', parsed.data.promptId)

  revalidatePath(`/${parsed.data.siteId}/ai-visibility`)
}
