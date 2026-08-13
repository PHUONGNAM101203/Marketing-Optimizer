import 'server-only'

import type { MetricsAdapter } from './metrics-types'
import { countMerchantCenterProducts } from './google-merchant'

/**
 * Content API không có báo cáo LỊCH SỬ — chỉ cho biết trạng thái danh mục
 * NGAY BÂY GIỜ, khác hẳn GA4/GSC (có thể truy vấn lùi cả một khoảng ngày).
 * Nên bất kể `startDate`/`endDate` được yêu cầu gì, adapter này luôn trả
 * ĐÚNG MỘT hàng — snapshot của `endDate` (ngày chạy đồng bộ). Chạy đều đặn
 * qua cron mỗi ngày là cách duy nhất để dựng được xu hướng số lượng sản phẩm
 * theo thời gian, từng ngày một, không có cách nào lấy được số của quá khứ.
 */
export const merchantCenterMetricsAdapter: MetricsAdapter = {
  provider: 'merchant-center',

  async fetchDailyMetrics({ accessToken, externalAccountId, endDate }) {
    const counts = await countMerchantCenterProducts(accessToken, externalAccountId)

    return [
      {
        date: endDate,
        sessions: 0,
        users: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
        costMicros: 0,
        conversionValueMicros: 0,
        extra: {
          totalProducts: counts.total,
          approvedProducts: counts.approved,
          disapprovedProducts: counts.disapproved,
          pendingProducts: counts.pending,
          countIsApproximate: counts.truncated ? 1 : 0,
        },
      },
    ]
  },
}
