import 'server-only'

import { decrypt } from '@/lib/crypto'
import type { ProviderFamily } from '@/lib/domain/providers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OAuthCredentials } from '@/lib/providers/types'

/**
 * OAuth app do từng Site tự khai báo — đọc từ két `site_oauth_apps`.
 *
 * Bảng đó cố tình không có RLS policy nào (xem migration 006), giống hệt
 * `connection_secrets`. Đọc ở đây LUÔN qua `service_role`, và LUÔN sau khi
 * nơi gọi đã tự xác minh quyền (site membership để hiển thị trạng thái,
 * has_site_role để ghi) — bảng này không tự bảo vệ được bằng RLS.
 */

export const siteOAuthAppExists = async (
  siteId: string,
  family: ProviderFamily,
): Promise<boolean> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_oauth_apps')
    .select('site_id')
    .eq('site_id', siteId)
    .eq('family', family)
    .maybeSingle()

  return data !== null
}

/**
 * Gia đình nào Site này ĐÃ khai báo OAuth app, kèm Client ID (không phải
 * Secret) của từng cái — Client ID không phải bí mật, hiện lại được để
 * người dùng không phải gõ lại mỗi lần mở form sửa. Client Secret thì không
 * bao giờ đọc ra khỏi hàm này để hiện lên UI.
 */
export const getConfiguredOAuthApps = async (
  siteId: string,
): Promise<ReadonlyMap<ProviderFamily, string>> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_oauth_apps')
    .select('family, client_id_enc')
    .eq('site_id', siteId)

  return new Map(
    (data ?? []).map((row) => [row.family as ProviderFamily, decrypt(row.client_id_enc)]),
  )
}

export const getSiteOAuthCredentials = async (
  siteId: string,
  family: ProviderFamily,
): Promise<OAuthCredentials | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_oauth_apps')
    .select('client_id_enc, client_secret_enc')
    .eq('site_id', siteId)
    .eq('family', family)
    .maybeSingle()

  if (!data) return null

  return {
    clientId: decrypt(data.client_id_enc),
    clientSecret: decrypt(data.client_secret_enc),
  }
}

/**
 * Developer Token của Google Ads — KHÁC Client ID/Secret (đó là OAuth credential
 * dùng chung cho cả 5 sản phẩm Google; đây là mã riêng Google cấp cho MỘT tài
 * khoản MCC, chỉ Ads dùng). `null` nếu Site chưa nhập hoặc chưa được duyệt.
 */
export const getGoogleAdsDeveloperToken = async (siteId: string): Promise<string | null> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('site_oauth_apps')
    .select('developer_token_enc')
    .eq('site_id', siteId)
    .eq('family', 'google')
    .maybeSingle()

  if (!data?.developer_token_enc) return null
  return decrypt(data.developer_token_enc)
}
