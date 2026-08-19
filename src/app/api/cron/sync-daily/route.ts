import { NextResponse, type NextRequest } from 'next/server'
import { METRICS_ADAPTERS } from '@/lib/providers'
import { syncConnection } from '@/lib/sync/sync-connection'
import { LOW_FREQUENCY_PROVIDERS } from '@/lib/sync/cron-providers'
import { refreshAllSiteAiModelCaches } from '@/lib/data/site-ai-keys'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'
import type { ProviderId } from '@/lib/domain/providers'

/**
 * Chạy 1 LẦN/NGÀY (xem `vercel.json`) — phần việc không có lợi gì từ tần
 * suất cao hơn:
 * 1. Đồng bộ `LOW_FREQUENCY_PROVIDERS` (gsc/gtm/merchant-center — xem lý do
 *    ở file đó). Đồng bộ ở `cron/sync-hourly` cho mọi provider còn lại.
 * 2. Làm mới cache `available_models` của mọi Site (`refreshAllSiteAiModelCaches`)
 *    — danh sách model AI hiếm khi đổi, chạy mỗi giờ chỉ tốn lượt gọi API
 *    của từng site vô ích.
 */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  // Đủ sớm hơn 24h một chút để lịch chạy có trễ vài phút cũng không bỏ sót.
  const staleBefore = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()

  const dailyProviders = Object.keys(METRICS_ADAPTERS).filter((provider) =>
    LOW_FREQUENCY_PROVIDERS.has(provider as ProviderId),
  )

  const { data: connections } = await admin
    .from('connections')
    .select('id')
    .in('provider', dailyProviders)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`)

  let synced = 0
  let failed = 0

  // Tuần tự, không Promise.all — hạn chế số request đồng thời gửi tới API
  // Google trong một lượt cron, tránh chạm rate limit của chính Google.
  for (const connection of connections ?? []) {
    const result = await syncConnection(connection.id)
    if (result.ok) synced += 1
    else failed += 1
  }

  const { refreshed: modelsRefreshed, failed: modelsFailed } = await refreshAllSiteAiModelCaches()

  return NextResponse.json({
    synced,
    failed,
    total: (connections ?? []).length,
    modelsRefreshed,
    modelsFailed,
  })
}
