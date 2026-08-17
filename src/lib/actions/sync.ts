'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSite } from '@/lib/data/sites'
import { resyncSite } from '@/lib/sync/resync-site'
import { syncConnection } from '@/lib/sync/sync-connection'
import { createClient } from '@/lib/supabase/server'

export interface ResyncState {
  readonly error: string | null
  readonly started: boolean
}

const INITIAL_STATE: ResyncState = { error: null, started: false }

/**
 * Nút "Đồng bộ lại" trên topbar. Xoá connection sai domain là hành động có
 * thật (mất cả lịch sử `metrics_daily` của nó qua cascade), nên giới hạn
 * bằng đúng ngưỡng các hành động ghi khác trong app: owner/admin, kiểm qua
 * RPC `has_site_role` — không viết lại logic phân quyền ở tầng ứng dụng.
 *
 * `resyncSite` lặp TUẦN TỰ qua mọi connection của Site, mỗi cái gọi API thật
 * — site nhiều kết nối (TikTok/GA4/GSC/Merchant Center/Facebook/GTM…) có thể
 * mất cả phút. Trước đây action `await` thẳng việc đó, giữ request mở suốt
 * thời gian đó — client thấy nút bấm "đứng" và, với site chậm, cả navigation
 * khác cũng phải đợi request đó xong. Chuyển sang `after()` (cùng pattern
 * `runSiteAuditAction`/`performAuditScan`): action chỉ xác thực quyền rồi trả
 * lời NGAY, việc đồng bộ thật chạy SAU khi response đã gửi, không giữ client
 * chờ nữa. Đổi lại: không còn trả về số `synced`/`removed` NGAY LÚC BẤM (chưa
 * biết được vì chưa chạy xong) — UI đổi thành thông báo "đang chạy nền",
 * số liệu thật tự cập nhật qua `lastSyncedAt` ở topbar khi tải lại/điều hướng
 * tiếp theo.
 */
export async function resyncSiteAction(
  _previous: ResyncState,
  formData: FormData,
): Promise<ResyncState> {
  const siteId = formData.get('siteId')
  if (typeof siteId !== 'string' || !siteId) {
    return { ...INITIAL_STATE, error: 'Thiếu website.' }
  }

  const site = await getSite(siteId)
  if (!site) {
    return { ...INITIAL_STATE, error: 'Không tìm thấy website hoặc bạn không có quyền.' }
  }

  const supabase = await createClient()
  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: siteId,
    allowed: ['owner', 'admin'],
  })

  if (!isAdmin) {
    return { ...INITIAL_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới đồng bộ lại được.' }
  }

  after(async () => {
    await resyncSite(site.id, site.domain)
    revalidatePath(`/${site.id}`, 'layout')
  })

  return { error: null, started: true }
}

export interface SyncConnectionState {
  readonly error: string | null
  readonly started: boolean
}

const SYNC_CONNECTION_INITIAL_STATE: SyncConnectionState = { error: null, started: false }

/**
 * Nút "Làm mới" trên một thẻ kết nối — đồng bộ đúng MỘT connection đó. Cùng
 * lý do chuyển sang `after()` như `resyncSiteAction` ở trên — một lượt gọi
 * API thật (30 ngày số liệu) đủ chậm để đáng tách khỏi request chính, dù chỉ
 * một connection.
 */
export async function syncConnectionAction(
  _previous: SyncConnectionState,
  formData: FormData,
): Promise<SyncConnectionState> {
  const connectionId = formData.get('connectionId')
  if (typeof connectionId !== 'string' || !connectionId) {
    return { ...SYNC_CONNECTION_INITIAL_STATE, error: 'Thiếu kết nối.' }
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
    return { ...SYNC_CONNECTION_INITIAL_STATE, error: 'Không tìm thấy kết nối.' }
  }

  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: connection.site_id,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) {
    return { ...SYNC_CONNECTION_INITIAL_STATE, error: 'Chỉ chủ sở hữu hoặc quản trị viên mới làm mới được.' }
  }

  after(async () => {
    await syncConnection(connectionId)
    // Chỉ 2 trang thật sự đọc trạng thái/số liệu connection này — không
    // `revalidatePath(.., 'layout')` cả cây Site như `resyncSiteAction`, kéo
    // theo 4 truy vấn của `[siteId]/layout.tsx` chạy lại dù chúng không đổi.
    // Cùng quy ước với `meta-ads.ts`/`google-ads.ts`/`gtm.ts`.
    revalidatePath(`/${connection.site_id}/connections`)
    revalidatePath(`/${connection.site_id}/channels`)
  })

  return { started: true, error: null }
}
