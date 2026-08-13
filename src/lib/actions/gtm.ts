'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { copyConnectionSecret } from '@/lib/data/connection-secrets'
import { findGoogleSourceConnection } from '@/lib/data/google-source-connection'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient, getCurrentUser } from '@/lib/supabase/server'

/**
 * Kết nối MỘT container Tag Manager cụ thể mà người dùng tự chọn — xem lý do
 * không tự động ở `lib/data/gtm-containers.ts`.
 */

const schema = z.object({
  siteId: z.string().uuid('Site không hợp lệ'),
  containerPath: z.string().trim().min(1, 'Thiếu container'),
  name: z.string().trim().min(1, 'Thiếu tên container'),
})

export interface ConnectGtmContainerState {
  readonly error: string | null
  readonly success: boolean
}

export async function connectGtmContainer(
  _previous: ConnectGtmContainerState,
  formData: FormData,
): Promise<ConnectGtmContainerState> {
  const parsed = schema.safeParse({
    siteId: formData.get('siteId'),
    containerPath: formData.get('containerPath'),
    name: formData.get('name'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ', success: false }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Phiên đăng nhập đã hết hạn.', success: false }

  const { siteId, containerPath, name } = parsed.data

  const supabase = await createClient()
  const { data: connection, error: connectionError } = await supabase
    .from('connections')
    .upsert(
      {
        site_id: siteId,
        provider: 'gtm',
        external_account_id: containerPath,
        account_name: name,
        status: 'syncing',
        scopes: ['https://www.googleapis.com/auth/tagmanager.readonly'],
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
  const source = await findGoogleSourceConnection(admin, siteId)
  if (!source || !(await copyConnectionSecret(admin, source.id, connection.id))) {
    return { error: 'Không sao chép được quyền truy cập từ kết nối Google.', success: false }
  }

  // Tag Manager không có "số liệu hằng ngày" để đồng bộ (khác GA4/GSC/Ads) —
  // giá trị của nó là cấu hình (tag/trigger/variable) đọc trực tiếp ở trang
  // Khám phá khi cần, không phải một bảng metrics_daily. Đánh dấu kết nối
  // xong ngay, không gọi `syncConnection` (sẽ luôn báo `metrics-not-ready`).
  await admin
    .from('connections')
    .update({ status: 'connected', last_synced_at: new Date().toISOString() })
    .eq('id', connection.id)

  revalidatePath(`/${siteId}/connections`)
  revalidatePath(`/${siteId}/channels`)

  return { error: null, success: true }
}
