'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface DisconnectConnectionState {
  readonly error: string | null
  readonly done: boolean
}

const INITIAL_STATE: DisconnectConnectionState = { error: null, done: false }

/**
 * Nút "Ngắt kết nối" trên thẻ connection — XOÁ hẳn connection, không chỉ đổi
 * status. Cascade xoá theo (xem migrations `connections`/`metrics_daily`/
 * `video_metrics_daily`/`content_metrics_daily`, tất cả `on delete cascade`
 * theo `connection_id`): token trong `connection_secrets` VÀ toàn bộ lịch sử
 * số liệu đã đồng bộ của connection đó. Đây là hành động không thể hoàn tác
 * — UI phải xác nhận trước khi gọi action này (xem
 * `DisconnectConnectionButton`), không tự ý bịa "soft disconnect" giữ lại dữ
 * liệu, vì trạng thái `disconnected` hiện KHÔNG có ý nghĩa gì khác trong
 * schema (không phải trạng thái mà `syncConnection`/cron từng đặt hay đọc).
 *
 * Cùng ngưỡng quyền với `syncConnectionAction`/`resyncSiteAction`: chỉ
 * owner/admin, xác thực qua RPC `has_site_role` thay vì tự viết lại logic
 * phân quyền ở tầng ứng dụng.
 */
export async function disconnectConnectionAction(
  _previous: DisconnectConnectionState,
  formData: FormData,
): Promise<DisconnectConnectionState> {
  const connectionId = formData.get('connectionId')
  if (typeof connectionId !== 'string' || !connectionId) {
    return { ...INITIAL_STATE, error: 'Thiếu kết nối.' }
  }

  // Đọc bằng client phiên người dùng — RLS `connections_select_member` tự
  // trả rỗng nếu người gọi không phải thành viên Site sở hữu connection này.
  const supabase = await createClient()
  const { data: connection } = await supabase
    .from('connections')
    .select('site_id')
    .eq('id', connectionId)
    .maybeSingle()

  if (!connection) {
    return { ...INITIAL_STATE, error: 'Không tìm thấy kết nối.' }
  }

  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: connection.site_id,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { ...INITIAL_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới ngắt kết nối được.' }
  }

  // `connections` không có write policy cho `authenticated` (xem CLAUDE.md/RLS
  // pattern) — phải xoá bằng `service_role`, cùng quy ước với mọi thao tác
  // ghi khác trong `lib/actions/`.
  const admin = createAdminClient()
  const { error } = await admin.from('connections').delete().eq('id', connectionId)

  if (error) {
    return { ...INITIAL_STATE, error: 'Không ngắt được kết nối. Vui lòng thử lại.' }
  }

  revalidatePath(`/${connection.site_id}/connections`)
  revalidatePath(`/${connection.site_id}/channels`)
  revalidatePath(`/${connection.site_id}/overview`)

  return { error: null, done: true }
}
