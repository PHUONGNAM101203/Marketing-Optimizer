'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { syncConnection } from '@/lib/sync/sync-connection'

/**
 * Xác nhận MỘT ứng viên (xem migration `pending_google_connections` +
 * `google-discovery.ts#listAllGooglePendingCandidates`) — chuyển pending
 * thành `connections` + `connection_secrets` thật, đồng bộ ngay, rồi xoá
 * hàng pending. Cùng khuôn với `connectGtmContainer` (`lib/actions/gtm.ts`),
 * khác ở chỗ nguồn token là hàng pending vừa lưu ở callback OAuth, không
 * phải mượn từ một connection Google đã có sẵn.
 */

export interface ConfirmPendingGoogleConnectionState {
  readonly error: string | null
  readonly success: boolean
}

const confirmSchema = z.object({
  pendingId: z.string().uuid('Thiếu ứng viên kết nối'),
})

export async function confirmPendingGoogleConnectionAction(
  _previous: ConfirmPendingGoogleConnectionState,
  formData: FormData,
): Promise<ConfirmPendingGoogleConnectionState> {
  const parsed = confirmSchema.safeParse({ pendingId: formData.get('pendingId') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false }

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('pending_google_connections')
    .select(
      'site_id, provider, external_account_id, account_name, scopes, access_token_enc, refresh_token_enc, expires_at',
    )
    .eq('id', parsed.data.pendingId)
    .maybeSingle()

  if (!pending) {
    return { error: 'Ứng viên này không còn nữa — có thể đã được xử lý.', success: false }
  }

  // Ghi bằng client PHIÊN NGƯỜI DÙNG — RLS `connections_insert_admin` tự chặn
  // nếu người bấm không phải owner/admin của Site sở hữu hàng pending này.
  const supabase = await createClient()
  const { data: connection, error: connectionError } = await supabase
    .from('connections')
    .upsert(
      {
        site_id: pending.site_id,
        provider: pending.provider,
        external_account_id: pending.external_account_id,
        account_name: pending.account_name,
        status: 'syncing',
        scopes: pending.scopes,
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

  const { error: secretError } = await admin.from('connection_secrets').upsert({
    connection_id: connection.id,
    access_token_enc: pending.access_token_enc,
    refresh_token_enc: pending.refresh_token_enc,
    expires_at: pending.expires_at,
    updated_at: new Date().toISOString(),
  })

  if (secretError) {
    return { error: 'Không lưu được token. Vui lòng thử lại.', success: false }
  }

  await admin.from('pending_google_connections').delete().eq('id', parsed.data.pendingId)

  // Người dùng vừa chọn xong thì phải thấy số liệu thật ngay — cùng lý do
  // OAuth callback tự dò cũng gọi thẳng hàm này, không đợi cron.
  await syncConnection(connection.id)

  revalidatePath(`/${pending.site_id}/connections`)
  revalidatePath(`/${pending.site_id}/channels`)

  return { error: null, success: true }
}

export interface DismissPendingGoogleConnectionState {
  readonly error: string | null
  readonly done: boolean
}

const dismissSchema = z.object({
  pendingId: z.string().uuid('Thiếu ứng viên kết nối'),
})

/** "Bỏ qua" — chỉ xoá hàng pending, không đụng gì tới `connections` thật.
 * Vẫn kiểm tra thành viên Site qua RPC `is_site_member` dù hậu quả sai sót ở
 * đây nhẹ (mất một gợi ý, không lộ dữ liệu) — giữ đúng thói quen kiểm quyền
 * nhất quán của cả file thay vì bỏ qua vì "ít rủi ro". */
export async function dismissPendingGoogleConnectionAction(
  _previous: DismissPendingGoogleConnectionState,
  formData: FormData,
): Promise<DismissPendingGoogleConnectionState> {
  const parsed = dismissSchema.safeParse({ pendingId: formData.get('pendingId') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', done: false }
  }

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('pending_google_connections')
    .select('site_id')
    .eq('id', parsed.data.pendingId)
    .maybeSingle()

  if (!pending) return { error: null, done: true } // đã bị xoá rồi, coi như xong

  const supabase = await createClient()
  const { data: isMember } = await supabase.rpc('is_site_member', { target_site: pending.site_id })
  if (!isMember) return { error: 'Bạn không phải thành viên website này.', done: false }

  await admin.from('pending_google_connections').delete().eq('id', parsed.data.pendingId)

  revalidatePath(`/${pending.site_id}/connections`)

  return { error: null, done: true }
}
