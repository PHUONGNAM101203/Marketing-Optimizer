'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { encrypt } from '@/lib/crypto'
import { siteOAuthAppExists } from '@/lib/data/site-oauth-apps'
import { isProviderFamily } from '@/lib/domain/providers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

/**
 * Lưu OAuth app (Client ID/Secret) của một Site.
 *
 * Quyền ghi KHÔNG dựa vào RLS policy trên `site_oauth_apps` — bảng đó không
 * có policy nào (két niêm phong, xem migration 006). Quyền được kiểm bằng
 * chính hàm `has_site_role` mà các policy khác trong hệ thống dùng, gọi qua
 * RPC bằng phiên người dùng thật — không viết lại logic phân quyền ở tầng
 * ứng dụng, chỉ hỏi lại đúng câu database đã biết cách trả lời.
 */

const schema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  family: z.string().refine(isProviderFamily, 'Nhà cung cấp không hợp lệ'),
  clientId: z.string().trim().min(10, 'Client ID trông không hợp lệ'),
  // Để trống khi sửa = giữ nguyên secret cũ. Bắt buộc ở lần thiết lập đầu
  // tiên, kiểm ở thân hàm (cần biết đã có cấu hình trước đó hay chưa).
  clientSecret: z
    .string()
    .trim()
    .refine((value) => value.length === 0 || value.length >= 10, 'Client Secret trông không hợp lệ'),
  // Chỉ family 'google' + có dùng Google Ads mới cần. Để trống thì không đụng
  // gì tới giá trị đã lưu — cùng quy ước với clientSecret.
  //
  // `z.string().optional()` CHỈ chấp nhận `undefined`, không chấp nhận
  // `null` — mà field này chỉ tồn tại trong DOM ở family 'google'
  // (`oauth-app-setup.tsx`), nên `formData.get('developerToken')` trả về
  // `null` (không phải `undefined`) ở mọi family khác. Zod fail ngay ở bước
  // kiểm kiểu với thông điệp chung "Invalid input: expected string, received
  // null" — đúng lỗi người dùng gặp khi lưu OAuth app cho YouTube/TikTok/Meta.
  // `preprocess` chuẩn hoá cả `null` lẫn `undefined` về '' TRƯỚC khi Zod kiểm
  // kiểu, nên không còn phân biệt field có mặt trong DOM hay không.
  developerToken: z.preprocess((value) => value ?? '', z.string().trim()),
})

export interface SaveOAuthAppState {
  readonly error: string | null
  readonly success: boolean
}

export async function saveSiteOAuthApp(
  _previous: SaveOAuthAppState,
  formData: FormData,
): Promise<SaveOAuthAppState> {
  const parsed = schema.safeParse({
    siteId: formData.get('siteId'),
    family: formData.get('family'),
    clientId: formData.get('clientId'),
    clientSecret: formData.get('clientSecret'),
    developerToken: formData.get('developerToken'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false }

  const { siteId, family, clientId, clientSecret, developerToken } = parsed.data

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })

  if (!isAdmin) {
    return {
      error: 'Chỉ chủ sở hữu hoặc quản trị viên của website mới được cấu hình OAuth app.',
      success: false,
    }
  }

  const alreadyConfigured = await siteOAuthAppExists(siteId, family)
  if (!clientSecret && !alreadyConfigured) {
    return {
      error: 'Client Secret bắt buộc ở lần thiết lập đầu tiên.',
      success: false,
    }
  }

  const admin = createAdminClient()
  // Bỏ qua field này hoàn toàn khi để trống — cả upsert lẫn update chỉ SET
  // những cột có mặt trong payload, developer token cũ (nếu có) giữ nguyên.
  const developerTokenField = developerToken ? { developer_token_enc: encrypt(developerToken) } : {}

  // Hai nhánh riêng thay vì một upsert với field tuỳ chọn: kiểu Insert của
  // Supabase bắt buộc client_secret_enc (cột NOT NULL), còn kiểu Update thì
  // mọi cột đều tuỳ chọn — đúng ý muốn "không đụng vào secret cũ khi để
  // trống" mà không cần ép kiểu qua mặt type-check.
  const { error } = clientSecret
    ? await admin.from('site_oauth_apps').upsert({
        site_id: siteId,
        family,
        client_id_enc: encrypt(clientId),
        client_secret_enc: encrypt(clientSecret),
        created_by: user.id,
        updated_at: new Date().toISOString(),
        ...developerTokenField,
      })
    : await admin
        .from('site_oauth_apps')
        .update({
          client_id_enc: encrypt(clientId),
          updated_at: new Date().toISOString(),
          ...developerTokenField,
        })
        .eq('site_id', siteId)
        .eq('family', family)

  if (error) {
    return { error: `Không lưu được cấu hình: ${error.message}`, success: false }
  }

  revalidatePath(`/${siteId}/connections`)
  return { error: null, success: true }
}
