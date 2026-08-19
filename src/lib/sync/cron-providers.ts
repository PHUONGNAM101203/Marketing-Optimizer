import 'server-only'

import type { ProviderId } from '@/lib/domain/providers'

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
