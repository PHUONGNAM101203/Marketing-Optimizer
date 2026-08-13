import type { ProviderId } from '@/lib/domain/providers'

/**
 * HỢP ĐỒNG DỮ LIỆU TRUNG TÂM.
 *
 * Mock data ở M1 và adapter thật ở M4 đều phải thoả mãn các type trong file này.
 * Nhờ vậy khi nối API thật, ta chỉ đổi NGUỒN dữ liệu — không đụng vào component.
 *
 * Hai quy ước bắt buộc:
 *
 * 1. TIỀN LUÔN LƯU DẠNG MICROS (1 đơn vị tiền = 1_000_000 micros).
 *    Google Ads trả về micros nguyên bản. Dùng số thực cho tiền là nguồn bug
 *    kinh điển — cộng dồn 90 ngày chi phí bằng float sẽ lệch. Chỉ đổi sang đơn
 *    vị tiền ở lớp hiển thị.
 *
 * 2. DÙNG `null`, KHÔNG DÙNG `undefined`.
 *    `null` mang nghĩa "nền tảng này không có chỉ số đó" (Search Console không
 *    có chi phí) — khác hẳn với "chưa lấy được". Ép khai báo tường minh giúp
 *    không vô tình cộng 0 vào chỗ đáng lẽ phải hiện dấu gạch.
 */

/** Ngày dạng ISO `YYYY-MM-DD` theo múi giờ của Site. */
export type IsoDate = string

/** Khoảng ngày, bao gồm cả hai đầu mút. */
export interface DateRange {
  readonly start: IsoDate
  readonly end: IsoDate
}

/** Số tiền tính bằng micros của đơn vị tiền tệ Site. */
export type Micros = number

export const MICROS_PER_UNIT = 1_000_000

export const microsToUnits = (micros: Micros): number => micros / MICROS_PER_UNIT

export const unitsToMicros = (units: number): Micros =>
  Math.round(units * MICROS_PER_UNIT)

/**
 * Một hàng số liệu ngày của một thực thể.
 * Đây chính là hình dạng của bảng `metrics_daily` trong Postgres.
 */
export interface MetricRow {
  readonly provider: ProviderId
  readonly connectionId: string
  readonly entityId: string
  readonly date: IsoDate

  readonly impressions: number | null
  readonly clicks: number | null
  readonly costMicros: Micros | null
  readonly conversions: number | null
  readonly conversionValueMicros: Micros | null
  readonly sessions: number | null
  readonly users: number | null
  readonly revenueMicros: Micros | null

  /** Chỉ số riêng của nền tảng: `{ averagePosition: 3.2, videoViews: 1840 }`. */
  readonly extra: Readonly<Record<string, number | string | null>>
}

/** Các khoá chỉ số dạng số có thể cộng dồn được. */
export const ADDITIVE_METRICS = [
  'impressions',
  'clicks',
  'costMicros',
  'conversions',
  'conversionValueMicros',
  'sessions',
  'users',
  'revenueMicros',
] as const

export type AdditiveMetricKey = (typeof ADDITIVE_METRICS)[number]

/** Tổng cộng dồn qua một khoảng ngày. */
export type MetricTotals = {
  readonly [K in AdditiveMetricKey]: number | null
}

/**
 * Chỉ số dẫn xuất — KHÔNG lưu vào database, luôn tính từ tổng.
 * Lưu tỉ lệ rồi cộng dồn là sai về mặt toán học (trung bình của các tỉ lệ
 * không bằng tỉ lệ của các tổng).
 */
export interface DerivedMetrics {
  readonly ctr: number | null
  readonly cpcMicros: Micros | null
  readonly cpaMicros: Micros | null
  readonly roas: number | null
  readonly conversionRate: number | null
}

/** Một điểm trên biểu đồ chuỗi thời gian. */
export interface TimeSeriesPoint extends MetricTotals {
  readonly date: IsoDate
}

/**
 * Hàng dữ liệu rộng cho biểu đồ nhiều chuỗi: một cột ngày, còn lại là các
 * chuỗi đặt tên tự do. Đây là hình dạng thư viện biểu đồ cần.
 */
export interface DatedRow {
  readonly date: IsoDate
  readonly [seriesKey: string]: string | number | null
}

/** Một chuỗi được gắn nhãn để vẽ biểu đồ nhiều đường. */
export interface MetricSeries {
  readonly key: string
  readonly label: string
  readonly colorToken: string
  readonly points: readonly TimeSeriesPoint[]
}

/**
 * Một giá trị kèm so sánh với kỳ trước.
 * `deltaPct` là null khi kỳ trước bằng 0 — chia cho 0 phải hiện "mới", không
 * phải hiện `Infinity%`.
 */
export interface ComparedValue {
  readonly current: number | null
  readonly previous: number | null
  readonly deltaPct: number | null
}

/** Hiệu suất đã cộng dồn của một thực thể, dùng cho bảng xếp hạng. */
export interface EntityPerformance {
  readonly entityId: string
  readonly entityName: string
  readonly provider: ProviderId
  readonly totals: MetricTotals
  readonly derived: DerivedMetrics
}

/** Phân rã theo kênh dùng cho dashboard tổng quan chéo nền tảng. */
export interface ChannelBreakdown {
  readonly provider: ProviderId
  readonly totals: MetricTotals
  readonly derived: DerivedMetrics
  readonly shareOfSpend: number | null
  readonly shareOfConversions: number | null
}
