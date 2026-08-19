'use server'

import { z } from 'zod'
import { GA4_EXPLORE_DIMENSIONS } from '@/lib/domain/explore-dimension'
import {
  fetchGa4MetricBreakdown,
  GA4_OVERVIEW_METRICS,
  type Ga4MetricBreakdownRow,
} from '@/lib/providers/google-explore'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** Drill-down bấm-để-xem cho mỗi ô chỉ số ở tab "Chi tiết" GA4 — gọi TRỰC
 * TIẾP từ client (`ga4-overview-panel.tsx` qua `useTransition`), không phải
 * một form. Đây là điểm vào mạng công khai (bất kỳ ai đăng nhập cũng gọi
 * được với `connectionId`/`siteId` bất kỳ), nên tự kiểm `is_site_member`
 * ngay trong action — KHÔNG được dựa vào việc trang cha đã kiểm hộ, vì
 * request tới thẳng đây không đi qua trang cha. */
const schema = z.object({
  connectionId: z.string().uuid(),
  siteId: z.string().uuid(),
  metric: z.enum(GA4_OVERVIEW_METRICS),
  dimension: z.enum(GA4_EXPLORE_DIMENSIONS),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
})

export interface Ga4MetricBreakdownState {
  readonly rows: readonly Ga4MetricBreakdownRow[] | null
  readonly error: string | null
}

const MAX_BREAKDOWN_ROWS = 1000

export async function fetchGa4MetricBreakdownAction(input: {
  readonly connectionId: string
  readonly siteId: string
  readonly metric: string
  readonly dimension: string
  readonly startDate: string
  readonly endDate: string
}): Promise<Ga4MetricBreakdownState> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { rows: null, error: 'Dữ liệu không hợp lệ.' }

  const supabase = await createClient()
  const { data: isMember } = await supabase.rpc('is_site_member', { target_site: parsed.data.siteId })
  if (!isMember) return { rows: null, error: 'Bạn không phải thành viên website này.' }

  const admin = createAdminClient()
  const { data: connection } = await admin
    .from('connections')
    .select('external_account_id, provider, site_id')
    .eq('id', parsed.data.connectionId)
    .maybeSingle()

  // So khớp CẢ `provider` lẫn `site_id` — chặn một connectionId GA4 thật
  // nhưng thuộc Site KHÁC bị dùng kèm `siteId` mà người gọi thật sự là
  // thành viên (viewer hợp lệ ở Site B đọc lén dữ liệu GA4 của Site A).
  if (!connection || connection.provider !== 'ga4' || connection.site_id !== parsed.data.siteId) {
    return { rows: null, error: 'Không tìm thấy kết nối GA4 hợp lệ.' }
  }

  const tokenResult = await resolveAccessToken(admin, parsed.data.connectionId, parsed.data.siteId, 'ga4')
  if (!tokenResult.ok) return { rows: null, error: `Không lấy được access token: ${tokenResult.error}` }

  const { rows, error } = await fetchGa4MetricBreakdown(
    tokenResult.accessToken,
    connection.external_account_id,
    { startDate: parsed.data.startDate, endDate: parsed.data.endDate },
    parsed.data.metric,
    parsed.data.dimension,
    MAX_BREAKDOWN_ROWS,
  )
  return { rows, error }
}
