import type { ProviderId } from '@/lib/domain/providers'

/**
 * Một hàng số liệu theo ngày, đã chuẩn hoá về chung một hình dạng bất kể
 * nguồn là GA4 hay Search Console — `metrics_daily` chỉ biết hình dạng này,
 * không biết gì về API riêng của từng nền tảng.
 */
export interface DailyMetricRow {
  /** YYYY-MM-DD */
  readonly date: string
  readonly sessions: number
  readonly users: number
  readonly conversions: number
  readonly clicks: number
  readonly impressions: number
  readonly costMicros: number
  readonly conversionValueMicros: number
  /** Chỉ số riêng của nền tảng, không có chỗ trong 7 cột chung ở trên — vd.
   * views/watchTimeMinutes/subscribersGained của YouTube. Lưu vào cột
   * `extra` (jsonb) của `metrics_daily`. */
  readonly extra?: Readonly<Record<string, number>>
}

export interface MetricsAdapter {
  readonly provider: ProviderId
  fetchDailyMetrics(params: {
    readonly accessToken: string
    readonly externalAccountId: string
    readonly startDate: string
    readonly endDate: string
    /** Chỉ Google Ads cần — một mã Google cấp riêng cho MCC, không phải
     * OAuth credential. `undefined` với mọi adapter khác. */
    readonly developerToken?: string
  }): Promise<readonly DailyMetricRow[]>
}
