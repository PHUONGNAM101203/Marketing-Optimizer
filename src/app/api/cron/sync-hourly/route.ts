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
 * bao giờ chạm ngân sách thời gian, thay vì cố làm hết trong một lần rồi bị cắt
 * giữa chừng.
 */
const MEDIA_BACKFILL_PER_RUN = 60

/**
 * 300 giây, KHÔNG phải 800.
 *
 * 800 là trần của Fluid Compute. Project này đã TẮT Fluid (19/9/2026) nên trần
 * thật là 300 — để nguyên 800 là giữ lại một con số không nền tảng nào tôn
 * trọng, và ai đọc nó rồi thiết kế một tác vụ dài 600 giây sẽ bị cắt giữa chừng
 * mà không hiểu vì sao.
 *
 * Đo thật trên production, ép TOÀN BỘ kết nối thành cũ để buộc đồng bộ lại:
 * 12,21 giây. 300 giây là gấp gần 25 lần — thừa biên cho cả lượt nạp lịch sử
 * 365 ngày (chỉ chạy một lần mỗi kết nối mới) lẫn phần chạy nền `after()` vốn
 * tiếp tục SAU khi đã trả lời, nên không nằm trong 12,21 giây đo được.
 *
 * Khai TẠI ĐÂY chứ không dựa vào cài đặt mặc định của project: cài đặt đó đổi
 * được từ bảng điều khiển mà không ai trong repo biết, còn dòng này đi cùng mã
 * nguồn và review được.
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
    .select('id, provider, backfilled_at')
    .is('disconnected_at', null)
    .in('provider', HOURLY_PROVIDERS)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore},backfilled_at.is.null`)

  const result = await syncMany((connections ?? []) as SyncTarget[])

  // Sau khi đồng bộ, không phải trước: số liệu tươi là việc chính, chép ảnh cũ
  // là việc dọn dẹp. Chép bù thất bại cũng không được phép làm hỏng lượt đồng
  // bộ vừa chạy xong.
  const media = await backfillMedia(admin, MEDIA_BACKFILL_PER_RUN)

  return NextResponse.json({ ...result, media })
}
