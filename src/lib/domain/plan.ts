import type { IsoDate, Micros } from '@/lib/metrics/types'
import type { ProviderId } from './providers'

/** Kế hoạch phân bổ ngân sách và lịch triển khai cho một giai đoạn. */
export interface MarketingPlan {
  readonly id: string
  readonly siteId: string
  readonly name: string
  readonly periodStart: IsoDate
  /** `null` = kế hoạch còn MỞ, chưa đặt ngày kết thúc — hợp lệ, không phải
   * dữ liệu thiếu. Đặt sau qua `updatePlanPeriodAction` khi cần đóng lại. */
  readonly periodEnd: IsoDate | null
  readonly totalBudgetMicros: Micros
  readonly status: PlanStatus
  readonly items: readonly PlanItem[]
  readonly createdBy: string
  readonly source: 'manual' | 'ai'
  readonly createdAt: string
}

export type PlanStatus = 'draft' | 'approved' | 'active' | 'completed' | 'archived'

export const PLAN_STATUS_LABELS: Readonly<Record<PlanStatus, string>> = {
  draft: 'Nháp',
  approved: 'Đã duyệt',
  active: 'Đang chạy',
  completed: 'Hoàn tất',
  archived: 'Lưu trữ',
}

export interface PlanItem {
  readonly id: string
  readonly planId: string
  readonly provider: ProviderId
  readonly campaignName: string
  readonly objective: CampaignObjective
  readonly budgetMicros: Micros
  readonly startDate: IsoDate
  readonly endDate: IsoDate
  readonly kpiTargets: readonly KpiTarget[]
  readonly notes: string | null
}

export type CampaignObjective =
  | 'awareness'
  | 'traffic'
  | 'engagement'
  | 'leads'
  | 'sales'
  | 'retention'

export const OBJECTIVE_LABELS: Readonly<Record<CampaignObjective, string>> = {
  awareness: 'Nhận biết',
  traffic: 'Truy cập',
  engagement: 'Tương tác',
  leads: 'Khách tiềm năng',
  sales: 'Doanh số',
  retention: 'Giữ chân',
}

export interface KpiTarget {
  readonly metric: string
  readonly target: number
  readonly unit: 'count' | 'currency' | 'ratio' | 'percent'
}

/** Mục triển khai trên lịch — cái gì lên sóng lúc nào, ở đâu. */
export interface Deployment {
  readonly id: string
  readonly siteId: string
  readonly planItemId: string | null
  readonly title: string
  readonly providers: readonly ProviderId[]
  readonly scheduledAt: string
  readonly status: DeploymentStatus
  readonly owner: string
}

export type DeploymentStatus = 'scheduled' | 'in-progress' | 'live' | 'blocked' | 'done'

export const DEPLOYMENT_STATUS_LABELS: Readonly<Record<DeploymentStatus, string>> = {
  scheduled: 'Đã lên lịch',
  'in-progress': 'Đang chuẩn bị',
  live: 'Đang chạy',
  blocked: 'Bị chặn',
  done: 'Xong',
}

/** Tổng ngân sách các mục — dùng để cảnh báo khi vượt tổng của kế hoạch. */
export const sumItemBudgets = (items: readonly PlanItem[]): Micros =>
  items.reduce((total, item) => total + item.budgetMicros, 0)

export const isOverBudget = (plan: MarketingPlan): boolean =>
  sumItemBudgets(plan.items) > plan.totalBudgetMicros
