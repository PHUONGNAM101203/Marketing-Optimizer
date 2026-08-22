import 'server-only'

import { PROVIDERS, type ProviderId } from '@/lib/domain/providers'

/**
 * Nền tảng đồng bộ 1 lần/ngày (ở `cron/sync-daily`) thay vì mỗi giờ (ở
 * `cron/sync-hourly`) — dùng CHUNG giữa hai route đó để không có provider
 * nào bị bỏ sót (không nằm trong route nào) hoặc đồng bộ trùng (nằm trong cả
 * hai, tốn quota gấp đôi vô ích).
 *
 * - `gsc`: Search Console có độ trễ báo cáo nội tại ~2-3 ngày từ phía Google
 *   — đồng bộ mỗi giờ không lấy được số mới hơn, chỉ tốn quota.
 * - `gtm`, `merchant-center`: capabilities chỉ có 'tagging'/'catalog' (xem
 *   `lib/domain/providers.ts`) — đây là trạng thái cấu hình/danh mục hiện
 *   tại, KHÔNG phải chỉ số chuỗi thời gian, nên tần suất cao không có lợi gì.
 */
export const LOW_FREQUENCY_PROVIDERS: ReadonlySet<ProviderId> = new Set(['gsc', 'gtm', 'merchant-center'])

/**
 * Danh sách provider của TỪNG cron, suy thẳng từ `PROVIDERS` (đủ 11 nền tảng)
 * rồi chia đôi theo `LOW_FREQUENCY_PROVIDERS`. Mỗi provider thuộc đúng MỘT
 * bên: không bỏ sót, không trùng.
 *
 * Trước đây hai route cron tự lọc `Object.keys(METRICS_ADAPTERS)`. Nhưng
 * registry đó CHỈ chứa nền tảng có adapter kéo số liệu theo ngày — `gtm`
 * (cấu hình thẻ) và `klaviyo` (số liệu live-fetch, Reporting API giới hạn
 * 225 request/ngày nên không sync hằng ngày được) KHÔNG có mặt. Hệ quả: hai
 * nền tảng đó rơi ra ngoài CẢ HAI cron và không lịch nào chạm tới.
 *
 * Đã thấy hậu quả thật trên production: một connection `gtm` kẹt
 * `status:'syncing'`, `last_synced_at:null` từ 14/8/2026 — trang Kết nối hiện
 * "Đang đồng bộ lần đầu…" vô thời hạn dù container đã kết nối xong từ lâu.
 * `syncConnection` vốn ĐÃ tự thoát đúng trạng thái cho provider không-adapter,
 * nhưng nó chỉ chạy nếu có ai gọi — mà không cron nào gọi.
 *
 * Suy từ `PROVIDERS` thay vì từ `METRICS_ADAPTERS` khiến việc thêm một nền
 * tảng mới không-có-adapter về sau không thể tái lập lỗi này.
 */
export const DAILY_PROVIDERS: readonly ProviderId[] = PROVIDERS.filter((provider) =>
  LOW_FREQUENCY_PROVIDERS.has(provider),
)

export const HOURLY_PROVIDERS: readonly ProviderId[] = PROVIDERS.filter(
  (provider) => !LOW_FREQUENCY_PROVIDERS.has(provider),
)
