'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { encrypt } from '@/lib/crypto'
import { verifyKlaviyoApiKey } from '@/lib/providers/klaviyo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

/**
 * Kết nối Klaviyo — dán private API key trực tiếp, không OAuth (xem header
 * comment `providers/klaviyo.ts`). Cùng khuôn hai-bước với
 * `connectGtmContainer` (ghi `connections` bằng phiên người dùng trước —
 * RLS `connections_insert_admin` chặn không phải owner/admin — rồi ghi
 * `connection_secrets` bằng service role, bảng đó không có policy nào cho
 * `authenticated`), khác GTM ở chỗ secret là key người dùng tự dán, không
 * sao chép từ connection khác.
 */

const schema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  apiKey: z.string().trim().min(1, 'Vui lòng nhập private API key'),
})

export interface ConnectKlaviyoState {
  readonly error: string | null
  readonly success: boolean
}

export async function connectKlaviyo(
  _previous: ConnectKlaviyoState,
  formData: FormData,
): Promise<ConnectKlaviyoState> {
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

  const verified = await verifyKlaviyoApiKey(apiKey)
  if (!verified.ok) return { error: verified.error, success: false }

  const supabase = await createClient()
  const { data: connection, error: connectionError } = await supabase
    .from('connections')
    .upsert(
      {
        site_id: siteId,
        provider: 'klaviyo',
        external_account_id: verified.account.accountId,
        account_name: verified.account.companyName ?? verified.account.accountId,
        status: 'syncing',
        scopes: [],
        connected_by: user.id,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'site_id,provider,external_account_id' },
    )
    .select('id')
    .single()

  if (connectionError || !connection) {
    return {
      error:
        connectionError?.code === '42501'
          ? 'Chỉ chủ sở hữu hoặc quản trị viên mới được thêm kết nối.'
          : `Không ghi được kết nối: ${connectionError?.message}`,
      success: false,
    }
  }

  const admin = createAdminClient()
  const { error: secretError } = await admin.from('connection_secrets').upsert(
    {
      connection_id: connection.id,
      access_token_enc: encrypt(apiKey),
      refresh_token_enc: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'connection_id' },
  )
  if (secretError) {
    return { error: `Không lưu được key: ${secretError.message}`, success: false }
  }

  // Không gọi `syncConnection` — Klaviyo chưa có `MetricsAdapter` (số liệu
  // hiệu suất đọc trực tiếp lúc tải trang chi tiết kênh, có cache riêng vì
  // rate limit Reporting API rất chặt, xem `site-channel-detail.ts`). Cùng
  // lý do GTM đánh dấu `connected` ngay thay vì chờ đồng bộ.
  await admin
    .from('connections')
    .update({ status: 'connected', last_synced_at: new Date().toISOString() })
    .eq('id', connection.id)

  revalidatePath(`/${siteId}/connections`)
  revalidatePath(`/${siteId}/channels`)

  return { error: null, success: true }
}
