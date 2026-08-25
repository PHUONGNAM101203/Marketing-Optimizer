import type { IsoDate } from '@/lib/metrics/types'

/**
 * Site là thực thể gốc của toàn bộ ứng dụng.
 * Mọi connection, metric, insight, plan, agent run đều treo dưới một `siteId`.
 * Không có gì trong hệ thống tồn tại ngoài phạm vi một Site.
 */
export interface Site {
  readonly id: string
  readonly ownerId: string
  readonly name: string
  /** URL đầy đủ người dùng nhập lúc onboarding. */
  readonly url: string
  /** Host đã chuẩn hoá, bỏ `www.` — dùng để khớp với property của GSC/GA4. */
  readonly domain: string
  /** IANA timezone. Quyết định ranh giới "ngày" của mọi hàng metric. */
  readonly timezone: string
  /** Mã ISO 4217. Mọi giá trị micros trong Site được hiểu theo đơn vị này. */
  readonly currency: string
  /** Mã quốc gia (khoá của `TLD_MARKET`, vd. 'vn', 'dk') — `null` nếu chưa tự
   * phát hiện được hoặc quốc gia nằm ngoài danh sách đã hỗ trợ. Chỉ mang tính
   * hiển thị + tiện chọn nhanh currency/timezone khớp nhau, KHÔNG phải nguồn
   * sự thật (currency/timezone mới là hai trường thực sự được dùng để tính
   * toán số liệu). */
  readonly country: string | null
  readonly createdAt: string
  /** Nội dung llms.txt tự sinh gần nhất — người dùng tự tải lên
   * `{domain}/llms.txt` trên server thật, app này không có quyền ghi. */
  readonly llmsTxtContent: string | null
  readonly llmsTxtGeneratedAt: string | null
  /** Ngưỡng cảnh báo cho trang Đề xuất — `null` nghĩa là dùng mặc định hệ
   * thống (xem `DEFAULT_INSIGHT_THRESHOLDS` trong `domain/insight.ts`), chưa
   * từng là "tắt cảnh báo". */
  readonly insightDropThresholdPct: number | null
  readonly insightCriticalDropThresholdPct: number | null
  readonly insightStaleSyncHours: number | null
}

export type SiteRole = 'owner' | 'admin' | 'viewer'

export interface SiteMember {
  readonly siteId: string
  readonly userId: string
  readonly role: SiteRole
  readonly displayName: string
  readonly email: string
  readonly avatarUrl: string | null
  readonly joinedAt: string
}

/** `viewer` không được kết nối tài khoản quảng cáo hay duyệt hành động agent. */
export const canManageConnections = (role: SiteRole): boolean => role !== 'viewer'

export const canApproveAgentActions = (role: SiteRole): boolean => role !== 'viewer'

/** Preset khoảng ngày dùng chung ở mọi màn hình. */
export type DateRangePreset =
  | 'today'
  | 'last-7'
  | 'last-28'
  | 'last-30'
  | 'last-90'
  | 'this-month'
  | 'last-month'
  | 'custom'

export const DATE_RANGE_LABELS: Readonly<Record<DateRangePreset, string>> = {
  today: 'Hôm nay',
  'last-7': '7 ngày qua',
  'last-28': '28 ngày qua',
  'last-30': '30 ngày qua',
  'last-90': '90 ngày qua',
  'this-month': 'Tháng này',
  'last-month': 'Tháng trước',
  custom: 'Tuỳ chọn',
}

export const isDateRangePreset = (value: string): value is DateRangePreset =>
  value in DATE_RANGE_LABELS

export interface ResolvedDateRange {
  readonly preset: DateRangePreset
  readonly start: IsoDate
  readonly end: IsoDate
  /** Kỳ liền trước cùng độ dài, LUÔN tự động suy ra từ kỳ chính — dùng cho
   * delta mặc định ("so với kỳ liền trước") của các KPI.
   *
   * Trước đây người dùng ghi đè được hai field này qua `?compareFrom=`/
   * `?compareTo=`, khiến việc so sánh hai khoảng bất kỳ kéo theo cả nhãn
   * delta của mọi KPI khác trên trang. So sánh giờ là một tính năng RIÊNG với
   * bộ tham số riêng — xem `domain/comparison-param.ts`. */
  readonly previousStart: IsoDate
  readonly previousEnd: IsoDate
}
