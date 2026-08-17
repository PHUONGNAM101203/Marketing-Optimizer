'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { encrypt } from '@/lib/crypto'
import { getSiteAiConnection, siteAnthropicApiKeyConfigured } from '@/lib/data/site-ai-keys'
import type { AiProvider } from '@/lib/providers/ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

/**
 * Lưu Claude API Key của một Site.
 *
 * Quyền ghi KHÔNG dựa vào RLS policy trên `site_ai_keys` — bảng đó không có
 * policy nào (két niêm phong, xem migration 20260817000001). Quyền được kiểm
 * bằng chính hàm `has_site_role` mà các policy khác trong hệ thống dùng, gọi
 * qua RPC bằng phiên người dùng thật — giống hệt `saveSiteOAuthApp`
 * (`actions/oauth-apps.ts`), không viết lại logic phân quyền ở tầng ứng dụng.
 */

const schema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  // Để trống khi đã cấu hình = giữ nguyên key cũ (kiểm ở thân hàm, cần biết
  // đã có key trước đó hay chưa). Field duy nhất nên không cần convention
  // "trống nghĩa là bỏ qua field đó" phức tạp như developerToken ở
  // oauth-apps.ts — trống ở đây LUÔN nghĩa là "không đổi".
  apiKey: z
    .string()
    .trim()
    .refine((value) => value.length === 0 || value.length >= 10, 'Claude API Key trông không hợp lệ'),
})

export interface SaveAiKeyState {
  readonly error: string | null
  readonly success: boolean
  /** `true` chỉ khi thực sự có upsert ghi xuống `site_ai_keys` — `false` cho
   * mọi đường không ghi gì, kể cả khi `success` là `true` (vd. để trống form
   * khi đã cấu hình = "không đổi", coi là thành công nhưng không phải một lượt
   * lưu thật). UI dựa vào field này để không hiển thị "Đã lưu." nhầm cho một
   * submit không làm gì cả. */
  readonly changed: boolean
}

export async function saveSiteAiKeyAction(
  _previous: SaveAiKeyState,
  formData: FormData,
): Promise<SaveAiKeyState> {
  const parsed = schema.safeParse({
    siteId: formData.get('siteId'),
    apiKey: formData.get('apiKey'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false, changed: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false, changed: false }

  const { siteId, apiKey } = parsed.data

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })

  if (!isAdmin) {
    return {
      error: 'Chỉ chủ sở hữu hoặc quản trị viên của website mới được cấu hình Claude API Key.',
      success: false,
      changed: false,
    }
  }

  const admin = createAdminClient()

  if (!apiKey) {
    // Trống + đã có key trước đó = không đổi gì, coi như thành công (không
    // báo lỗi "bắt buộc" cho một field mà UI hiển thị đã cấu hình).
    const alreadyConfigured = await siteAnthropicApiKeyConfigured(siteId)

    if (!alreadyConfigured) {
      return { error: 'Claude API Key bắt buộc ở lần thiết lập đầu tiên.', success: false, changed: false }
    }

    // Không ghi gì — `changed: false` để UI không báo "Đã lưu." cho một submit
    // không làm gì cả.
    return { error: null, success: true, changed: false }
  }

  const { error } = await admin.from('site_ai_keys').upsert({
    site_id: siteId,
    provider: 'anthropic',
    api_key_enc: encrypt(apiKey),
    created_by: user.id,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    return { error: `Không lưu được cấu hình: ${error.message}`, success: false, changed: false }
  }

  revalidatePath(`/${siteId}/settings`)
  return { error: null, success: true, changed: true }
}

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
