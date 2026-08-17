'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { encrypt } from '@/lib/crypto'
import { siteAnthropicApiKeyConfigured } from '@/lib/data/site-ai-keys'
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
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false }

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
    }
  }

  const admin = createAdminClient()

  if (!apiKey) {
    // Trống + đã có key trước đó = không đổi gì, coi như thành công (không
    // báo lỗi "bắt buộc" cho một field mà UI hiển thị đã cấu hình).
    const alreadyConfigured = await siteAnthropicApiKeyConfigured(siteId)

    if (!alreadyConfigured) {
      return { error: 'Claude API Key bắt buộc ở lần thiết lập đầu tiên.', success: false }
    }

    return { error: null, success: true }
  }

  const { error } = await admin.from('site_ai_keys').upsert({
    site_id: siteId,
    provider: 'anthropic',
    api_key_enc: encrypt(apiKey),
    created_by: user.id,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    return { error: `Không lưu được cấu hình: ${error.message}`, success: false }
  }

  revalidatePath(`/${siteId}/settings`)
  return { error: null, success: true }
}
