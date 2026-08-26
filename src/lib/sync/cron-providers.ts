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
 * - `gtm`: capability chỉ có 'tagging' — trạng thái cấu hình, không phải chỉ
 *   số chuỗi thời gian, tần suất cao không có lợi gì.
 *
 * `merchant-center` ĐÃ CHUYỂN sang nhóm hàng giờ. Lập luận cũ ("chỉ là trạng
 * thái danh mục, không cần tần suất cao") đúng về bản chất dữ liệu nhưng bỏ
 * sót hệ quả trên giao diện: mỗi hàng là snapshot của ĐÚNG NGÀY chạy đồng bộ,
 * nên khi người dùng chọn "Hôm nay" thì trước 20:00 UTC chưa có hàng nào của
 * hôm nay. Đo thật (26/8/2026, 03:00 UTC): 0/2 kết nối merchant-center có
 * hàng hôm nay, trong khi TikTok — cũng là snapshot nhưng chạy hàng giờ — có
 * đủ 3/3. Chạy hàng giờ thì "Hôm nay" là trạng thái danh mục THẬT LÚC NÀY.
 *
 * `gsc` thì KHÔNG chuyển và không nên chuyển: Search Console có độ trễ báo
 * cáo nội tại 2-3 ngày từ phía Google, đồng bộ dày hơn không lấy được số mới
 * hơn, chỉ tốn quota.
 */
export const LOW_FREQUENCY_PROVIDERS: ReadonlySet<ProviderId> = new Set(['gsc', 'gtm'])

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
