'use client'

import { useRealtimeRefresh } from '@/components/realtime/use-realtime-refresh'

/**
 * Quét giờ chạy NỀN, độc lập với tab trình duyệt (xem `lib/actions/audit.ts`)
 * — người dùng không còn cần tự bấm F5 để biết khi nào xong.
 *
 * Trước đây component này `setInterval(router.refresh, 5000)`. Một lượt quét
 * kéo dài tới 600s, tức tới ~120 lần render lại toàn bộ cây RSC của route,
 * mỗi lần là một lượt gọi hàm Vercel cộng cả chục truy vấn Supabase — tất cả
 * chỉ để bắt được đúng MỘT lần chuyển trạng thái `running` → xong. Giờ nghe
 * thẳng thay đổi của `audit_runs` qua Realtime (đã có trong gói Pro, xem
 * migration `20260822000001`), làm mới đúng lúc có thay đổi thật.
 *
 * Vẫn giữ một nhịp làm mới 30s làm lưới an toàn: `pagesScanned` hiện trên
 * tiêu đề trang tăng dần suốt lượt quét, và nếu WebSocket rớt giữa chừng mà
 * không kịp báo thì người dùng vẫn thấy tiến độ nhúc nhích thay vì đứng hình.
 * 30s thay cho 5s cũ đã cắt 6/7 số lần làm mới ngay cả ở kịch bản tệ nhất.
 */
export function AuditRunningPoller({
  isRunning,
  siteId,
}: {
  readonly isRunning: boolean
  readonly siteId: string
}) {
  useRealtimeRefresh({
    table: 'audit_runs',
    filter: `site_id=eq.${siteId}`,
    enabled: isRunning,
    fallbackIntervalMs: 30_000,
  })

  return null
}
