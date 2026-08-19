import type { ActionKind } from './insight'
import type { ProviderId } from './providers'

/**
 * AI Agent chạy tác vụ nhiều bước trên dữ liệu của một Site.
 *
 * BẤT BIẾN AN TOÀN CỦA CẢ MODULE:
 * agent chỉ được TỰ CHẠY các tool ĐỌC. Mọi tool GHI ra nền tảng ngoài đều
 * dừng lại ở `pending-approval` và chờ người duyệt. Không có cờ nào, không có
 * chế độ nào bỏ qua được cổng này — một agent tự đổi ngân sách là một agent
 * tiêu tiền thật của người dùng.
 *
 * Bất biến này được thực thi ở `isWriteTool` + `requiresApproval` bên dưới và
 * phải được kiểm lại ở tầng server khi module chạy thật (M8).
 */
export interface Agent {
  readonly id: string
  readonly siteId: string
  readonly role: AgentRole
  readonly name: string
  readonly description: string
  /** Prompt template điều khiển agent, tham chiếu sang Prompt Studio. */
  readonly promptId: string
  readonly tools: readonly AgentTool[]
  readonly schedule: AgentSchedule | null
  readonly enabled: boolean
  readonly lastRunAt: string | null
}

export type AgentRole =
  | 'ads-optimizer'
  | 'seo-analyst'
  | 'content-planner'
  | 'report-writer'
  | 'ai-visibility-tracker'
  | 'anomaly-watcher'

export const AGENT_ROLE_LABELS: Readonly<Record<AgentRole, string>> = {
  'ads-optimizer': 'Tối ưu quảng cáo',
  'seo-analyst': 'Phân tích SEO',
  'content-planner': 'Lập kế hoạch nội dung',
  'report-writer': 'Viết báo cáo',
  'ai-visibility-tracker': 'Theo dõi hiện diện AI',
  'anomaly-watcher': 'Canh bất thường',
}

/** Tool ĐỌC — agent tự chạy được, không cần duyệt. */
export type ReadToolName =
  | 'query-metrics'
  | 'list-entities'
  | 'compare-periods'
  | 'fetch-page-content'
  | 'check-ai-citation'
  | 'read-search-queries'

/** Tool GHI — luôn phải qua cổng duyệt. */
export type WriteToolName =
  | 'apply-budget-change'
  | 'pause-campaign'
  | 'resume-campaign'
  | 'update-ad-copy'
  | 'add-negative-keyword'
  | 'publish-report'

export type AgentToolName = ReadToolName | WriteToolName

const WRITE_TOOLS: ReadonlySet<string> = new Set<WriteToolName>([
  'apply-budget-change',
  'pause-campaign',
  'resume-campaign',
  'update-ad-copy',
  'add-negative-keyword',
  'publish-report',
])

export const isWriteTool = (tool: AgentToolName): tool is WriteToolName =>
  WRITE_TOOLS.has(tool)

/** Cổng duyệt. Suy ra từ bản chất tool, không phải từ cấu hình người dùng. */
export const requiresApproval = (tool: AgentToolName): boolean => isWriteTool(tool)

export interface AgentTool {
  readonly name: AgentToolName
  readonly provider: ProviderId | null
  readonly enabled: boolean
}

export interface AgentSchedule {
  readonly cadence: 'hourly' | 'daily' | 'weekly' | 'monthly'
  /** Giờ trong ngày theo timezone của Site. */
  readonly hourOfDay: number
  readonly dayOfWeek: number | null
}

/** 0 = Chủ nhật .. 6 = Thứ Bảy, khớp `AgentSchedule.dayOfWeek` và
 * `Date.getUTCDay()`. */
export const WEEKDAY_SHORT_LABELS: readonly string[] = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** Nhãn đầy đủ cho một lịch chạy — vd. "Hằng tuần · T2 · 8:00". Cron
 * (`api/cron/sync-hourly/route.ts`) honor đúng `hourOfDay`/`dayOfWeek` theo
 * múi giờ Site, nên hiện giờ/thứ ở đây phản ánh đúng hành vi thật. */
export const formatAgentSchedule = (schedule: AgentSchedule): string => {
  const cadenceLabel = CADENCE_LABELS[schedule.cadence]
  if (schedule.cadence === 'hourly') return cadenceLabel

  const hourLabel = `${schedule.hourOfDay}:00`
  if (schedule.cadence === 'weekly' && schedule.dayOfWeek !== null) {
    return `${cadenceLabel} · ${WEEKDAY_SHORT_LABELS[schedule.dayOfWeek]} · ${hourLabel}`
  }
  return `${cadenceLabel} · ${hourLabel}`
}

export const CADENCE_LABELS: Readonly<Record<AgentSchedule['cadence'], string>> = {
  hourly: 'Mỗi giờ',
  daily: 'Hằng ngày',
  weekly: 'Hằng tuần',
  monthly: 'Hằng tháng',
}

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'pending-approval'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rejected'

export const RUN_STATUS_LABELS: Readonly<Record<AgentRunStatus, string>> = {
  queued: 'Chờ chạy',
  running: 'Đang chạy',
  'pending-approval': 'Chờ duyệt',
  succeeded: 'Hoàn tất',
  failed: 'Thất bại',
  cancelled: 'Đã huỷ',
  rejected: 'Bị từ chối',
}

export interface AgentRun {
  readonly id: string
  readonly agentId: string
  readonly siteId: string
  readonly status: AgentRunStatus
  readonly trigger: 'schedule' | 'manual' | 'event'
  readonly steps: readonly AgentStep[]
  readonly pendingActions: readonly PendingAction[]
  readonly summary: string | null
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly tokensUsed: number | null
}

export interface AgentStep {
  readonly index: number
  readonly kind: 'thought' | 'tool-call' | 'tool-result' | 'output'
  readonly tool: AgentToolName | null
  readonly content: string
  readonly at: string
}

/** Một hành động ghi đang chờ người duyệt. Không bao giờ tự thực thi. */
export interface PendingAction {
  readonly id: string
  readonly runId: string
  readonly tool: WriteToolName
  readonly actionKind: ActionKind
  readonly provider: ProviderId
  readonly targetEntityId: string
  readonly targetEntityName: string
  readonly summary: string
  /** Trước → sau, để người duyệt thấy đúng cái gì sẽ đổi. */
  readonly diff: readonly ActionDiffRow[]
  readonly rationale: string
  readonly decidedBy: string | null
  readonly decidedAt: string | null
  readonly decision: 'approved' | 'rejected' | null
}

export interface ActionDiffRow {
  readonly field: string
  readonly before: string
  readonly after: string
}
