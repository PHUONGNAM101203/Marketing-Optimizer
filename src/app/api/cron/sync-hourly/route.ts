import { NextResponse, type NextRequest } from 'next/server'
import { HOURLY_PROVIDERS } from '@/lib/sync/cron-providers'
import { syncMany, type SyncTarget } from '@/lib/sync/sync-many'
import { backfillMedia } from '@/lib/sync/backfill-media'
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

/**
 * Số ảnh chép bù mỗi lượt. Việc chép bù chỉ xử lý ảnh CŨ (ghi trước khi tính
 * năng chép ảnh tồn tại) nên nó có điểm dừng: ~318 ảnh, hết trong khoảng sáu
 * lượt rồi tự về 0 và gần như không tốn gì nữa. Đặt trần để một lượt cron không
 * bao giờ chạm ngân sách 800s, thay vì cố làm hết trong một lần rồi bị cắt
 * giữa chừng.
 */
const MEDIA_BACKFILL_PER_RUN = 60
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
    .select('id, provider, backfilled_at')
    .in('provider', HOURLY_PROVIDERS)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore},backfilled_at.is.null`)

  const result = await syncMany((connections ?? []) as SyncTarget[])

  // Sau khi đồng bộ, không phải trước: số liệu tươi là việc chính, chép ảnh cũ
  // là việc dọn dẹp. Chép bù thất bại cũng không được phép làm hỏng lượt đồng
  // bộ vừa chạy xong.
  const media = await backfillMedia(admin, MEDIA_BACKFILL_PER_RUN)

  return NextResponse.json({ ...result, media })
}
