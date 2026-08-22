import { NextResponse, type NextRequest } from 'next/server'
import { HOURLY_PROVIDERS } from '@/lib/sync/cron-providers'
import { syncMany, type SyncTarget } from '@/lib/sync/sync-many'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'

/**
 * Đồng bộ MỖI GIỜ (xem `vercel.json`) các connection thuộc nhóm "cần dữ liệu
 * tươi" — mọi provider TRỪ `LOW_FREQUENCY_PROVIDERS`, nhóm đó đồng bộ ở
 * `cron/sync-daily`. Trên Vercel Pro không còn giới hạn 1 cron job/ngày của
 * Hobby nữa.
 *
 * Việc dispatch agent ĐÃ CHUYỂN sang `cron/run-agents` — xem file đó để biết
 * lý do tách.
 */
export const maxDuration = 800

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
    .select('id, provider')
    .in('provider', HOURLY_PROVIDERS)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`)

  const result = await syncMany((connections ?? []) as SyncTarget[])

  return NextResponse.json(result)
}
