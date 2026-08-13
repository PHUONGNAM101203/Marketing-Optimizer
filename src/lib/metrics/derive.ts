import type {
  AdditiveMetricKey,
  ComparedValue,
  DerivedMetrics,
  MetricRow,
  MetricTotals,
} from './types'
import { ADDITIVE_METRICS } from './types'

/**
 * Chỉ số dẫn xuất và hướng tốt/xấu.
 *
 * Bản Stitch tham chiếu tô đỏ "Spend +12.5%" — tức là coi chi nhiều hơn là xấu.
 * Sai. Chi tăng khi ROAS giữ nguyên là mở rộng quy mô, không phải sự cố. File
 * này là nơi duy nhất quyết định một thay đổi nên hiện màu gì, để cả app không
 * bao giờ tự bịa ra ngữ nghĩa ở từng component.
 */

/** Chia an toàn: mẫu bằng 0 hoặc null trả về null, không trả về Infinity. */
const safeDiv = (numerator: number | null, denominator: number | null): number | null =>
  numerator === null || denominator === null || denominator === 0
    ? null
    : numerator / denominator

/**
 * Tính chỉ số dẫn xuất TỪ TỔNG, không bao giờ từ trung bình của các tỉ lệ.
 * Trung bình của các CTR ngày không bằng CTR của cả kỳ — đây là lỗi thống kê
 * kinh điển trong dashboard marketing.
 */
export const deriveMetrics = (totals: MetricTotals): DerivedMetrics => ({
  ctr: safeDiv(totals.clicks, totals.impressions),
  cpcMicros: safeDiv(totals.costMicros, totals.clicks),
  cpaMicros: safeDiv(totals.costMicros, totals.conversions),
  roas: safeDiv(totals.conversionValueMicros, totals.costMicros),
  conversionRate: safeDiv(totals.conversions, totals.clicks),
})

/** Tổng hợp nhiều hàng ngày thành một bộ tổng. */
export const sumTotals = (rows: readonly MetricRow[]): MetricTotals => {
  const seed = Object.fromEntries(
    ADDITIVE_METRICS.map((key) => [key, null]),
  ) as Record<AdditiveMetricKey, number | null>

  return rows.reduce<MetricTotals>((accumulated, row) => {
    const next = { ...accumulated }
    for (const key of ADDITIVE_METRICS) {
      const value = row[key]
      if (value === null) continue
      const running = next[key]
      // null nghĩa là "nền tảng không có chỉ số này" — chỉ chuyển thành số khi
      // gặp hàng đầu tiên thực sự có dữ liệu, để không biến "không áp dụng"
      // thành số 0.
      next[key] = running === null ? value : running + value
    }
    return next
  }, seed as MetricTotals)
}

/** So sánh một giá trị với kỳ trước. */
export const compare = (
  current: number | null,
  previous: number | null,
): ComparedValue => ({
  current,
  previous,
  deltaPct:
    current === null || previous === null || previous === 0
      ? null
      : (current - previous) / previous,
})

/** Kỳ trước bằng 0 hoặc thiếu dữ liệu → hiện "mới", không hiện phần trăm. */
export const isNewValue = (comparison: ComparedValue): boolean =>
  comparison.deltaPct === null && comparison.current !== null

export type MetricDirection = 'higher-is-better' | 'lower-is-better' | 'neutral'

export type MetricKey = AdditiveMetricKey | keyof DerivedMetrics

/**
 * `neutral` là lựa chọn có chủ đích, không phải chỗ trống chưa điền:
 * chi phí, hiển thị và số phiên không tự thân tốt hay xấu — chúng chỉ có nghĩa
 * khi đặt cạnh hiệu quả. Tô màu chúng là nói dối người đọc.
 */
export const METRIC_DIRECTION: Readonly<Record<MetricKey, MetricDirection>> = {
  impressions: 'neutral',
  clicks: 'higher-is-better',
  costMicros: 'neutral',
  conversions: 'higher-is-better',
  conversionValueMicros: 'higher-is-better',
  sessions: 'higher-is-better',
  users: 'higher-is-better',
  revenueMicros: 'higher-is-better',
  ctr: 'higher-is-better',
  cpcMicros: 'lower-is-better',
  cpaMicros: 'lower-is-better',
  roas: 'higher-is-better',
  conversionRate: 'higher-is-better',
}

export type DeltaTone = 'positive' | 'negative' | 'neutral'

/** Ngưỡng dưới mức này coi như đứng yên — tránh tô màu cho nhiễu. */
const FLAT_THRESHOLD = 0.005

export const deltaTone = (metric: MetricKey, deltaPct: number | null): DeltaTone => {
  if (deltaPct === null || Math.abs(deltaPct) < FLAT_THRESHOLD) return 'neutral'

  const direction = METRIC_DIRECTION[metric]
  if (direction === 'neutral') return 'neutral'

  const rising = deltaPct > 0
  return direction === 'higher-is-better'
    ? rising
      ? 'positive'
      : 'negative'
    : rising
      ? 'negative'
      : 'positive'
}
