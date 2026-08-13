import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Sao token đã mã hoá từ một connection SANG một connection MỚI vừa tạo —
 * dùng khi người dùng tự chọn một tài khoản (Google Ads, Tag Manager) không
 * tự dò được domain: connection mới không tự đăng nhập OAuth riêng, nó dùng
 * lại đúng token của connection Google đã có sẵn của Site. Từ đây về sau
 * connection mới tự làm mới token của chính nó (`resolveAccessToken`), không
 * còn phụ thuộc connection nguồn nữa.
 */
export const copyConnectionSecret = async (
  admin: SupabaseClient<Database>,
  fromConnectionId: string,
  toConnectionId: string,
): Promise<boolean> => {
  const { data: secret } = await admin
    .from('connection_secrets')
    .select('access_token_enc, refresh_token_enc, expires_at')
    .eq('connection_id', fromConnectionId)
    .maybeSingle()

  if (!secret) return false

  const { error } = await admin.from('connection_secrets').upsert({
    connection_id: toConnectionId,
    access_token_enc: secret.access_token_enc,
    refresh_token_enc: secret.refresh_token_enc,
    expires_at: secret.expires_at,
    updated_at: new Date().toISOString(),
  })

  return !error
}
