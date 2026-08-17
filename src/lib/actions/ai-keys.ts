'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { encrypt } from '@/lib/crypto'
import { getSiteAiConnection } from '@/lib/data/site-ai-keys'
import type { AiProvider } from '@/lib/providers/ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

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
 * 20260817000003_site_ai_keys_multi_provider.sql) — submit thẳng một provider KHÁC provider đang kết nối bị
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
