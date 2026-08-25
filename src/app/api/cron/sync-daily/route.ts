import { NextResponse, type NextRequest } from 'next/server'
import { DAILY_PROVIDERS } from '@/lib/sync/cron-providers'
import { syncMany, type SyncTarget } from '@/lib/sync/sync-many'
import { refreshAllSiteAiModelCaches } from '@/lib/data/site-ai-keys'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'

/**
 * Chạy 1 LẦN/NGÀY (xem `vercel.json`) — phần việc không có lợi gì từ tần
 * suất cao hơn:
 * 1. Đồng bộ `LOW_FREQUENCY_PROVIDERS` (gsc/gtm/merchant-center — xem lý do
 *    ở file đó). Đồng bộ ở `cron/sync-hourly` cho mọi provider còn lại.
 * 2. Làm mới cache `available_models` của mọi Site (`refreshAllSiteAiModelCaches`)
 *    — danh sách model AI hiếm khi đổi, chạy mỗi giờ chỉ tốn lượt gọi API
 *    của từng site vô ích.
 */
export const maxDuration = 800

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  // Đủ sớm hơn 24h một chút để lịch chạy có trễ vài phút cũng không bỏ sót.
  const staleBefore = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()

  const { data: connections } = await admin
    .from('connections')
    .select('id, provider, backfilled_at')
    .in('provider', DAILY_PROVIDERS)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore},backfilled_at.is.null`)

  const result = await syncMany((connections ?? []) as SyncTarget[])
  const { refreshed: modelsRefreshed, failed: modelsFailed } = await refreshAllSiteAiModelCaches()

  return NextResponse.json({ ...result, modelsRefreshed, modelsFailed })
}
