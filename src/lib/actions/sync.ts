'use server'

import { revalidatePath } from 'next/cache'
import { getSite } from '@/lib/data/sites'
import { resyncSite } from '@/lib/sync/resync-site'
import { syncConnection } from '@/lib/sync/sync-connection'
import { createClient } from '@/lib/supabase/server'

export interface ResyncState {
  readonly error: string | null
  readonly synced: number
  readonly removed: number
}

const INITIAL_STATE: ResyncState = { error: null, synced: 0, removed: 0 }

/**
 * Nút "Đồng bộ lại" trên topbar. Xoá connection sai domain là hành động có
 * thật (mất cả lịch sử `metrics_daily` của nó qua cascade), nên giới hạn
 * bằng đúng ngưỡng các hành động ghi khác trong app: owner/admin, kiểm qua
 * RPC `has_site_role` — không viết lại logic phân quyền ở tầng ứng dụng.
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

  const result = await resyncSite(site.id, site.domain)
  revalidatePath(`/${site.id}`, 'layout')
  return { error: null, ...result }
}

export interface SyncConnectionState {
  readonly error: string | null
  readonly ok: boolean
}

const SYNC_CONNECTION_INITIAL_STATE: SyncConnectionState = { error: null, ok: false }

/** Nút "Làm mới" trên một thẻ kết nối — đồng bộ đúng MỘT connection đó. */
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

  const result = await syncConnection(connectionId)
  // Chỉ 2 trang thật sự đọc trạng thái/số liệu connection này — không
  // `revalidatePath(.., 'layout')` cả cây Site như trước (kéo theo 4 truy
  // vấn của `[siteId]/layout.tsx` chạy lại mỗi lần bấm "Làm mới", dù chúng
  // không đổi). Cùng quy ước với `meta-ads.ts`/`google-ads.ts`/`gtm.ts`.
  revalidatePath(`/${connection.site_id}/connections`)
  revalidatePath(`/${connection.site_id}/channels`)

  if (!result.ok) {
    return { ok: false, error: `Đồng bộ thất bại (${result.error}).` }
  }
  return { ok: true, error: null }
}
