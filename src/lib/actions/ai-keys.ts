'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { decrypt, encrypt } from '@/lib/crypto'
import { getSiteAiConnection } from '@/lib/data/site-ai-keys'
import { listAvailableModels, type AiProvider } from '@/lib/providers/ai'
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
      .update({ available_models: [...models], models_fetched_at: new Date().toISOString() })
      .eq('site_id', siteId)
    revalidatePath(`/${siteId}/settings`)
    return { models, error: null }
  } catch (error) {
    return { models: [], error: `Không làm mới được: ${error instanceof Error ? error.message : String(error)}` }
  }
}
