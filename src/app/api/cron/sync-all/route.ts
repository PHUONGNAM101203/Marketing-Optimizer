import { NextResponse, type NextRequest } from 'next/server'
import { METRICS_ADAPTERS } from '@/lib/providers'
import { syncConnection } from '@/lib/sync/sync-connection'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'

/**
 * Đồng bộ tự động, chạy theo lịch (xem `vercel.json`) — không cần bấm "Đồng
 * bộ lại" thủ công thì số liệu vẫn mới trong vòng một giờ.
 *
 * Vercel tự thêm header `Authorization: Bearer $CRON_SECRET` cho request từ
 * Cron Job khi biến môi trường CRON_SECRET tồn tại — so khớp ở đây để chặn
 * ai đó gọi thẳng route này từ bên ngoài, chạy đồng bộ tốn quota mà không
 * qua lịch đã định.
 */
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  // Đủ sớm hơn 1 giờ một chút để lịch chạy có trễ vài phút cũng không bỏ sót.
  const staleBefore = new Date(Date.now() - 55 * 60 * 1000).toISOString()

  const { data: connections } = await admin
    .from('connections')
    .select('id')
    .in('provider', Object.keys(METRICS_ADAPTERS))
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

  return NextResponse.json({ synced, failed, total: (connections ?? []).length })
}
