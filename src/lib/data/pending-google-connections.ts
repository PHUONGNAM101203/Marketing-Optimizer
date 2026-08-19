import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export interface PendingGoogleConnection {
  readonly id: string
  readonly provider: 'ga4' | 'gsc' | 'gtm'
  readonly externalAccountId: string
  readonly accountName: string
  readonly detail: string | null
}

/**
 * Đọc bằng admin client (bảng không có RLS policy nào cho `authenticated` —
 * xem migration `pending_google_connections`), KHÔNG tự kiểm tra lại quyền
 * thành viên Site ở đây — tin vào việc trang gọi hàm này (`connections/page.tsx`)
 * đã xác nhận qua `getSite()` (RLS session client) trước đó trong CÙNG
 * request. Cùng mô hình tin cậy với `GtmPicker`/`listAvailableGtmContainers`.
 */
export const listPendingGoogleConnections = async (
  siteId: string,
): Promise<readonly PendingGoogleConnection[]> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('pending_google_connections')
    .select('id, provider, external_account_id, account_name, detail')
    .eq('site_id', siteId)
    .order('provider', { ascending: true })

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider as PendingGoogleConnection['provider'],
    externalAccountId: row.external_account_id,
    accountName: row.account_name,
    detail: row.detail,
  }))
}
