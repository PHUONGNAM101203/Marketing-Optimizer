'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { copyConnectionSecret } from '@/lib/data/connection-secrets'
import { findGoogleSourceConnection } from '@/lib/data/google-source-connection'
import { syncConnection } from '@/lib/sync/sync-connection'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

/**
 * Kết nối MỘT tài khoản Google Ads cụ thể mà người dùng tự chọn từ danh sách
 * — xem lý do không tự động ở `lib/data/google-ads-accounts.ts`.
 */

const schema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  customerId: z.string().trim().min(1, 'Thiếu mã tài khoản Google Ads'),
  accountName: z.string().trim().min(1, 'Thiếu tên tài khoản'),
})

export interface ConnectGoogleAdsState {
  readonly error: string | null
  readonly success: boolean
}

export async function connectGoogleAdsAccount(
  _previous: ConnectGoogleAdsState,
  formData: FormData,
): Promise<ConnectGoogleAdsState> {
  const parsed = schema.safeParse({
    siteId: formData.get('siteId'),
    customerId: formData.get('customerId'),
    accountName: formData.get('accountName'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false }

  const { siteId, customerId, accountName } = parsed.data

  const supabase = await createClient()
  const { data: connection, error: connectionError } = await supabase
    .from('connections')
    .upsert(
      {
        site_id: siteId,
        provider: 'google-ads',
        external_account_id: customerId,
        account_name: accountName,
        status: 'syncing',
        scopes: ['https://www.googleapis.com/auth/adwords'],
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

  // Connection MỚI này không tự đăng nhập OAuth riêng — nó cần một bản sao
  // token từ connection Google đã có sẵn của Site để `syncConnection` (và mọi
  // lần làm mới sau này) hoạt động độc lập.
  const admin = createAdminClient()
  const source = await findGoogleSourceConnection(admin, siteId)
  if (!source || !(await copyConnectionSecret(admin, source.id, connection.id))) {
    return { error: 'Không sao chép được quyền truy cập từ kết nối Google.', success: false }
  }

  const result = await syncConnection(connection.id)
  revalidatePath(`/${siteId}/connections`)
  revalidatePath(`/${siteId}/channels`)

  if (!result.ok) {
    return { error: `Đã kết nối nhưng đồng bộ thất bại (${result.error}).`, success: false }
  }

  return { error: null, success: true }
}
