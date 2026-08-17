import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveDisplayNames } from './profiles'
import type {
  ActionDiffRow,
  Agent,
  AgentRole,
  AgentRun,
  AgentRunStatus,
  AgentSchedule,
  AgentStep,
  AgentTool,
  PendingAction,
  WriteToolName,
} from '@/lib/domain/agent'
import type { ActionKind } from '@/lib/domain/insight'
import type { ProviderId } from '@/lib/domain/providers'
import type { Json } from '@/lib/supabase/database.types'

interface AgentRow {
  readonly id: string
  readonly site_id: string
  readonly role: string
  readonly name: string
  readonly description: string
  readonly prompt_id: string
  readonly tools: unknown
  readonly schedule: unknown
  readonly enabled: boolean
  readonly last_run_at: string | null
}

const toAgent = (row: AgentRow): Agent => ({
  id: row.id,
  siteId: row.site_id,
  role: row.role as AgentRole,
  name: row.name,
  description: row.description,
  promptId: row.prompt_id,
  tools: row.tools as readonly AgentTool[],
  schedule: row.schedule as AgentSchedule | null,
  enabled: row.enabled,
  lastRunAt: row.last_run_at,
})

interface RunRow {
  readonly id: string
  readonly agent_id: string
  readonly site_id: string
  readonly status: string
  readonly trigger: string
  readonly steps: unknown
  readonly summary: string | null
  readonly started_at: string
  readonly finished_at: string | null
  readonly tokens_used: number | null
}

interface PendingActionRow {
  readonly id: string
  readonly run_id: string
  readonly tool: string
  readonly action_kind: string
  readonly provider: string
  readonly target_entity_id: string
  readonly target_entity_name: string
  readonly summary: string
  readonly diff: unknown
  readonly rationale: string
  readonly decided_by: string | null
  readonly decided_at: string | null
  readonly decision: string | null
}

const toPendingAction = (row: PendingActionRow, names: ReadonlyMap<string, string>): PendingAction => ({
  id: row.id,
  runId: row.run_id,
  tool: row.tool as WriteToolName,
  actionKind: row.action_kind as ActionKind,
  provider: row.provider as ProviderId,
  targetEntityId: row.target_entity_id,
  targetEntityName: row.target_entity_name,
  summary: row.summary,
  diff: row.diff as readonly ActionDiffRow[],
  rationale: row.rationale,
  decidedBy: row.decided_by ? (names.get(row.decided_by) ?? 'Không rõ') : null,
  decidedAt: row.decided_at,
  decision: row.decision as 'approved' | 'rejected' | null,
})

const toRun = (row: RunRow, pendingActions: readonly PendingAction[]): AgentRun => ({
  id: row.id,
  agentId: row.agent_id,
  siteId: row.site_id,
  status: row.status as AgentRunStatus,
  trigger: row.trigger as AgentRun['trigger'],
  steps: row.steps as readonly AgentStep[],
  pendingActions,
  summary: row.summary,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  tokensUsed: row.tokens_used,
})

export const listAgents = async (siteId: string): Promise<readonly Agent[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Không đọc được agent: ${error.message}`)
  return (data ?? []).map((row) => toAgent(row as AgentRow))
}

export const getAgent = async (agentId: string): Promise<Agent | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('agents').select('*').eq('id', agentId).maybeSingle()
  if (error) throw new Error(`Không đọc được agent: ${error.message}`)
  return data ? toAgent(data as AgentRow) : null
}

export const createAgent = async (input: {
  readonly siteId: string
  readonly role: AgentRole
  readonly name: string
  readonly description: string
  readonly promptId: string
  readonly tools: readonly AgentTool[]
  readonly schedule: AgentSchedule | null
}): Promise<Agent> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agents')
    .insert({
      site_id: input.siteId,
      role: input.role,
      name: input.name,
      description: input.description,
      prompt_id: input.promptId,
      // Supabase gen types kỳ vọng mảng/object có thể mutate (`Json`); input
      // của hàm này cố tình readonly để giữ nguyên tắc immutability, nên phải
      // ép kiểu tường minh ở biên ghi xuống DB (cùng khuôn với `prompts.ts`).
      tools: input.tools as unknown as Json,
      schedule: input.schedule as unknown as Json,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Không tạo được agent: ${error.message}`)
  return toAgent(data as AgentRow)
}

/**
 * `agents` UPDATE chỉ có policy cho owner/admin (migration 20260814000012).
 * Với một `viewer`, update này khớp 0 hàng — Supabase trả `error: null` cho
 * UPDATE 0 hàng (không tự ném lỗi), nên PHẢI tự kiểm `data` rỗng rồi ném lỗi
 * ở đây, nếu không request "thành công" một cách im lặng mà không đổi gì.
 */
export const setAgentEnabled = async (agentId: string, enabled: boolean): Promise<void> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('agents').update({ enabled }).eq('id', agentId).select('id')
  if (error) throw new Error(`Không đổi được trạng thái agent: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Bạn không có quyền bật/tắt agent này.')
}

export const listRunsForSite = async (siteId: string): Promise<readonly AgentRun[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('site_id', siteId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Không đọc được lịch sử chạy: ${error.message}`)
  return (data ?? []).map((row) => toRun(row as RunRow, []))
}

const attachPendingActions = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  runRows: readonly RunRow[],
): Promise<readonly AgentRun[]> => {
  if (runRows.length === 0) return []

  const { data: pendingRows, error } = await supabase
    .from('pending_actions')
    .select('*')
    .in(
      'run_id',
      runRows.map((r) => r.id),
    )
  if (error) throw new Error(`Không đọc được hành động chờ duyệt: ${error.message}`)

  const names = await resolveDisplayNames(
    supabase,
    (pendingRows ?? []).map((row) => row.decided_by).filter((id): id is string => id !== null),
  )

  const byRun = new Map<string, PendingAction[]>()
  for (const row of (pendingRows ?? []) as PendingActionRow[]) {
    const list = byRun.get(row.run_id) ?? []
    list.push(toPendingAction(row, names))
    byRun.set(row.run_id, list)
  }

  return runRows.map((row) => toRun(row, byRun.get(row.id) ?? []))
}

export const listRunsForAgent = async (agentId: string): Promise<readonly AgentRun[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('agent_id', agentId)
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(`Không đọc được lịch sử chạy: ${error.message}`)
  return attachPendingActions(supabase, (data ?? []) as RunRow[])
}

export const getRun = async (runId: string): Promise<AgentRun | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('agent_runs').select('*').eq('id', runId).maybeSingle()
  if (error) throw new Error(`Không đọc được lượt chạy: ${error.message}`)
  if (!data) return null
  const [run] = await attachPendingActions(supabase, [data as RunRow])
  return run ?? null
}

export const listPendingActionsForSite = async (siteId: string): Promise<readonly PendingAction[]> => {
  const supabase = await createClient()
  const { data: runRows, error: runsError } = await supabase.from('agent_runs').select('id').eq('site_id', siteId)
  if (runsError) throw new Error(`Không đọc được danh sách lượt chạy: ${runsError.message}`)
  const runIds = (runRows ?? []).map((r) => r.id)
  if (runIds.length === 0) return []

  const { data: pendingRows, error } = await supabase
    .from('pending_actions')
    .select('*')
    .in('run_id', runIds)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Không đọc được hành động chờ duyệt: ${error.message}`)

  const names = await resolveDisplayNames(
    supabase,
    (pendingRows ?? []).map((row) => row.decided_by).filter((id): id is string => id !== null),
  )

  return ((pendingRows ?? []) as PendingActionRow[]).map((row) => toPendingAction(row, names))
}

/** Dùng ADMIN client — được gọi từ cron (không có phiên người dùng) VÀ từ
 * Server Action chạy trong `after()` (phiên request gốc đã trả response,
 * cookie không còn đáng tin để tạo client thường — cùng lý do
 * `sync-connection.ts` luôn dùng admin). `agent_runs` cố tình không có
 * policy ghi nào cho `authenticated` (xem 20260814000012 migration) nên
 * `createClient()` thường sẽ ném lỗi/no-op ở đây. */
export const createRun = async (input: {
  readonly agentId: string
  readonly siteId: string
  readonly trigger: 'schedule' | 'manual' | 'event'
}): Promise<AgentRun> => {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_runs')
    .insert({ agent_id: input.agentId, site_id: input.siteId, trigger: input.trigger, status: 'running' })
    .select('*')
    .single()

  if (error) throw new Error(`Không tạo được lượt chạy: ${error.message}`)
  return toRun(data as RunRow, [])
}

export const appendRunStep = async (runId: string, step: Omit<AgentStep, 'index'>): Promise<void> => {
  const admin = createAdminClient()
  // Đọc lỗi ở đây KHÔNG được nuốt: nếu bỏ qua, `existingSteps` âm thầm rơi về
  // `[]` và lệnh update bên dưới sẽ GHI ĐÈ toàn bộ lịch sử bước của run bằng
  // đúng một bước mới — mất dữ liệu audit trail thật, không chỉ là thiếu dữ
  // liệu đọc.
  const { data: current, error: readError } = await admin
    .from('agent_runs')
    .select('steps')
    .eq('id', runId)
    .maybeSingle()
  if (readError) throw new Error(`Không đọc được lịch sử bước chạy: ${readError.message}`)
  const existingSteps = (current?.steps as readonly AgentStep[] | undefined) ?? []
  const nextStep: AgentStep = { ...step, index: existingSteps.length }

  const { error } = await admin
    .from('agent_runs')
    .update({ steps: [...existingSteps, nextStep] as unknown as Json })
    .eq('id', runId)

  if (error) throw new Error(`Không ghi được bước chạy: ${error.message}`)
}

export const finishRun = async (
  runId: string,
  result: { readonly status: 'succeeded' | 'failed' | 'pending-approval'; readonly summary: string | null; readonly tokensUsed: number },
): Promise<void> => {
  const admin = createAdminClient()
  const { error } = await admin
    .from('agent_runs')
    .update({
      status: result.status,
      summary: result.summary,
      tokens_used: result.tokensUsed,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (error) throw new Error(`Không đóng được lượt chạy: ${error.message}`)
}

/** Dùng ADMIN client — `pending_actions` cố tình không có policy INSERT cho
 * `authenticated` (chỉ có policy UPDATE cho quyết định duyệt/từ chối); hàng
 * pending action chỉ được tool registry của agent tạo ra, không bao giờ từ
 * phiên người dùng (xem comment trong 20260814000012 migration). */
export const createPendingAction = async (input: {
  readonly runId: string
  readonly tool: WriteToolName
  readonly actionKind: ActionKind
  readonly provider: ProviderId
  readonly targetEntityId: string
  readonly targetEntityName: string
  readonly summary: string
  readonly diff: readonly ActionDiffRow[]
  readonly rationale: string
}): Promise<PendingAction> => {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pending_actions')
    .insert({
      run_id: input.runId,
      tool: input.tool,
      action_kind: input.actionKind,
      provider: input.provider,
      target_entity_id: input.targetEntityId,
      target_entity_name: input.targetEntityName,
      summary: input.summary,
      diff: input.diff as unknown as Json,
      rationale: input.rationale,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Không tạo được đề xuất: ${error.message}`)
  return toPendingAction(data as PendingActionRow, new Map())
}

/** Dùng client phiên người dùng — `pending_actions` có policy UPDATE cho
 * `authenticated` (gate ở mức admin site), đây là đường ghi hợp lệ duy nhất
 * qua phiên người dùng cho bảng này (duyệt/từ chối).
 *
 * Với một `viewer` (không đạt gate owner/admin trong policy), update này
 * khớp 0 hàng — Supabase trả `error: null` cho UPDATE 0 hàng, im lặng như
 * thành công thật. Không kiểm `data` rỗng thì `approval-actions.tsx` sẽ hiện
 * badge "Đã duyệt" dù hàng `pending_actions` không hề đổi — một lời hứa sai
 * về trạng thái hệ thống. */
export const decidePendingAction = async (
  pendingActionId: string,
  decision: 'approved' | 'rejected',
  decidedBy: string,
): Promise<void> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pending_actions')
    .update({ decision, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq('id', pendingActionId)
    .select('id')

  if (error) throw new Error(`Không lưu được quyết định: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Bạn không có quyền duyệt hành động này.')
}

export const setAgentLastRunAt = async (agentId: string, at: string): Promise<void> => {
  const admin = createAdminClient()
  const { error } = await admin.from('agents').update({ last_run_at: at }).eq('id', agentId)
  if (error) throw new Error(`Không cập nhật được lần chạy gần nhất: ${error.message}`)
}
