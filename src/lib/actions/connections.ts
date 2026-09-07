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

  // ĐÁNH DẤU, KHÔNG XOÁ. Bản trước gọi `.delete()`, và ràng buộc `on delete
  // cascade` cuốn theo toàn bộ lịch sử của kết nối đó — ngày 7/9/2026 một lần
  // mất như vậy tốn 1.877 hàng snapshot và hai lượt khôi phục toàn bộ database
  // để lấy lại. Không có nút hoàn tác nào cho một cú bấm nhầm.
  //
  // Giữ nguyên hàng nghĩa là khôi phục chỉ là xoá dấu: cùng `id` cũ nên mọi số
  // liệu tự gắn lại. Dọn thật diễn ra ở cron hằng ngày sau 30 ngày — xem
  // `purgeDisconnectedConnections`.
  //
  // `connections` không có write policy cho `authenticated` (xem CLAUDE.md/RLS
  // pattern) — phải ghi bằng `service_role`, cùng quy ước với mọi thao tác ghi
  // khác trong `lib/actions/`.
  const admin = createAdminClient()
  const { error } = await admin
    .from('connections')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('id', connectionId)

  if (error) {
    return { ...INITIAL_STATE, error: 'Không ngắt được kết nối. Vui lòng thử lại.' }
  }

  revalidatePath(`/${connection.site_id}/connections`)
  revalidatePath(`/${connection.site_id}/channels`)
  revalidatePath(`/${connection.site_id}/overview`)

  return { error: null, done: true }
}

export interface RestoreConnectionState {
  readonly error: string | null
  readonly done: boolean
}

const INITIAL_RESTORE_STATE: RestoreConnectionState = { error: null, done: false }

/**
 * Bỏ dấu đã-gỡ, đưa kết nối trở lại.
 *
 * Không phục dựng gì cả — hàng chưa từng bị xoá nên toàn bộ lịch sử vẫn gắn với
 * đúng `id` này. Đây chính là điều mà cách xoá cũ không cho phép.
 *
 * Cùng ngưỡng quyền với `disconnectConnectionAction`: gỡ được thì khôi phục
 * được, không nới lỏng cũng không siết thêm.
 */
export async function restoreConnectionAction(
  _previous: RestoreConnectionState,
  formData: FormData,
): Promise<RestoreConnectionState> {
  const connectionId = formData.get('connectionId')
  if (typeof connectionId !== 'string' || !connectionId) {
    return { ...INITIAL_RESTORE_STATE, error: 'Thiếu kết nối.' }
  }

  // Đọc bằng `service_role`: hàng đã gỡ vẫn qua được RLS, nhưng mọi truy vấn
  // liệt kê của phiên người dùng đều lọc `disconnected_at is null` nên client
  // phiên người dùng không thấy nó. Quyền vẫn kiểm bằng `has_site_role` ngay
  // dưới, không bỏ qua bước nào.
  const admin = createAdminClient()
  const { data: connection } = await admin
    .from('connections')
    .select('site_id, disconnected_at')
    .eq('id', connectionId)
    .maybeSingle()

  if (!connection || !connection.disconnected_at) {
    return { ...INITIAL_RESTORE_STATE, error: 'Không tìm thấy kết nối đã gỡ.' }
  }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: connection.site_id,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { ...INITIAL_RESTORE_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới khôi phục được.' }
  }

  const { error } = await admin
    .from('connections')
    .update({ disconnected_at: null })
    .eq('id', connectionId)

  if (error) {
    return { ...INITIAL_RESTORE_STATE, error: 'Không khôi phục được kết nối. Vui lòng thử lại.' }
  }

  revalidatePath(`/${connection.site_id}/connections`)
  revalidatePath(`/${connection.site_id}/channels`)
  revalidatePath(`/${connection.site_id}/overview`)

  return { error: null, done: true }
}
