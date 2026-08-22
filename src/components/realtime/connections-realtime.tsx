'use client'

import { useRealtimeRefresh } from './use-realtime-refresh'

/**
 * Làm mới shell của Site khi một connection vừa đồng bộ xong.
 *
 * Vấn đề nó giải: sau khi kết nối một kênh, Topbar và trang Kết nối hiện
 * "Đang đồng bộ lần đầu…" cho tới khi người dùng TỰ bấm F5 — không hề có
 * polling nào. Job nền ghi xong `last_synced_at` từ lâu mà màn hình vẫn nói
 * là đang chạy.
 *
 * `enabled` cố tình HẸP: chỉ nghe khi thật sự đang có gì đó để chờ. Bật thường
 * trực sẽ khiến mỗi lượt cron hàng giờ (cập nhật `last_synced_at` cho từng
 * connection một) kích hoạt một loạt `router.refresh()` liên tiếp trên mọi tab
 * đang mở — tốn cả hạn mức tin nhắn Realtime lẫn lượt gọi hàm, đổi lại đúng
 * một dòng "đồng bộ 2 phút trước" nhích thành "1 phút trước".
 */
export function ConnectionsRealtime({
  siteId,
  waiting,
}: {
  readonly siteId: string
  readonly waiting: boolean
}) {
  useRealtimeRefresh({
    table: 'connections',
    filter: `site_id=eq.${siteId}`,
    enabled: waiting,
  })

  return null
}
