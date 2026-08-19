import type { DateRange, Micros } from '@/lib/metrics/types'
import type { ProviderId } from './providers'

/**
 * Một phát hiện hoặc đề xuất, do luật hoặc do AI sinh ra.
 *
 * QUY TẮC KHÔNG ĐƯỢC PHÁ: mảng `evidence` không được rỗng. Mọi insight phải
 * trỏ ngược về hàng metric có thật. Đây là hàng rào chống việc mô hình bịa số —
 * nếu không truy được nguồn thì không được hiển thị.
 */
export interface Insight {
  readonly id: string
  readonly siteId: string
  readonly kind: InsightKind
  readonly severity: InsightSeverity
  readonly title: string
  readonly body: string
  /** Bắt buộc có ít nhất một phần tử. */
  readonly evidence: readonly InsightEvidence[]
  readonly recommendedAction: RecommendedAction | null
  readonly estimatedImpact: EstimatedImpact | null
  readonly status: InsightStatus
  readonly source: 'rule' | 'ai'
  readonly createdAt: string
}

export type InsightKind =
  | 'budget-risk'
  | 'creative-fatigue'
  | 'bid-opportunity'
  | 'anomaly'
  | 'tracking-broken'
  | 'ranking-drop'
  | 'audience-overlap'
  | 'ai-visibility-gap'

/** Ngưỡng phát hiện bất thường — cấu hình được theo site (xem
 * `Site.insightDropThresholdPct` và tương ứng), mặc định dùng khi site chưa
 * tự đặt. `dropThresholdPct`/`criticalDropThresholdPct` tính theo tỉ lệ
 * (0.3 = 30%), không phải phần trăm nguyên — khớp cách `deltaPct` đã tính
 * trong `site-insights.ts`. */
export interface InsightThresholds {
  readonly dropThresholdPct: number
  readonly criticalDropThresholdPct: number
  readonly staleSyncHours: number
}

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  dropThresholdPct: 0.3,
  criticalDropThresholdPct: 0.6,
  staleSyncHours: 48,
}

export type InsightSeverity = 'critical' | 'warning' | 'opportunity' | 'info'

export type InsightStatus = 'new' | 'acknowledged' | 'applied' | 'dismissed'

/** Một số liệu có thật, kèm khoảng thời gian, chứng minh cho insight. */
export interface InsightEvidence {
  readonly label: string
  readonly provider: ProviderId
  readonly entityId: string | null
  readonly entityName: string | null
  readonly metric: string
  readonly value: number
  readonly comparisonValue: number | null
  readonly dateRange: DateRange
}

/**
 * Hành động đề xuất. `requiresApproval` là true với MỌI hành động ghi ra nền
 * tảng ngoài — không có ngoại lệ. Đổi ngân sách là tiêu tiền thật.
 */
export interface RecommendedAction {
  readonly kind: ActionKind
  readonly summary: string
  readonly provider: ProviderId
  readonly targetEntityId: string | null
  readonly parameters: Readonly<Record<string, string | number | boolean>>
  readonly requiresApproval: true
}

export type ActionKind =
  | 'adjust-budget'
  | 'pause-entity'
  | 'resume-entity'
  | 'shift-budget'
  | 'replace-creative'
  | 'add-negative-keyword'
  | 'adjust-bid'
  | 'publish-report'

export const ACTION_KIND_LABELS: Readonly<Record<ActionKind, string>> = {
  'adjust-budget': 'Điều chỉnh ngân sách',
  'pause-entity': 'Tạm dừng',
  'resume-entity': 'Chạy lại',
  'shift-budget': 'Chuyển ngân sách',
  'replace-creative': 'Thay creative',
  'add-negative-keyword': 'Thêm từ khoá phủ định',
  'adjust-bid': 'Điều chỉnh giá thầu',
  'publish-report': 'Đăng báo cáo',
}

/**
 * Tác động ước tính. `confidence` bắt buộc — một con số không kèm độ tin cậy
 * đọc như sự thật, trong khi nó là dự báo.
 */
export interface EstimatedImpact {
  readonly metric: string
  readonly deltaMicros: Micros | null
  readonly deltaPct: number | null
  readonly confidence: 'low' | 'medium' | 'high'
}

export const SEVERITY_LABELS: Readonly<Record<InsightSeverity, string>> = {
  critical: 'Nghiêm trọng',
  warning: 'Cảnh báo',
  opportunity: 'Cơ hội',
  info: 'Thông tin',
}

const SEVERITY_ORDER: Readonly<Record<InsightSeverity, number>> = {
  critical: 0,
  warning: 1,
  opportunity: 2,
  info: 3,
}

export const bySeverity = (a: Insight, b: Insight): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]

/** Hàng rào chống bịa số. Gọi trước khi render bất kỳ insight nào. */
export const hasValidEvidence = (insight: Insight): boolean =>
  insight.evidence.length > 0
