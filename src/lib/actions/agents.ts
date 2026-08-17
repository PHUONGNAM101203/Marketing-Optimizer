'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAgent, setAgentEnabled, decidePendingAction } from '@/lib/data/agents'
import { runAgent } from '@/lib/agents/run-agent'
import { getCurrentUser, createClient } from '@/lib/supabase/server'
import type { Agent, AgentRole, AgentSchedule, AgentTool } from '@/lib/domain/agent'

const requireUserId = async (): Promise<string> => {
  const user = await getCurrentUser()
  if (!user) throw new Error('Chưa đăng nhập')
  return user.id
}

/**
 * Cùng khuôn với `CreatePromptState` (`src/lib/actions/prompts.ts`) — lỗi
 * ghi (vd. `promptId` tham chiếu tới prompt không tồn tại) là thứ người
 * dùng cần đọc đúng nguyên văn trên form tạo agent, nên trả về qua `error`
 * thay vì throw (throw bị Next.js redact thành chuỗi chung chung trên
 * production build).
 */
export interface CreateAgentState {
  readonly agent: Agent | null
  readonly error: string | null
}

export const createAgentAction = async (input: {
  readonly siteId: string
  readonly role: AgentRole
  readonly name: string
  readonly description: string
  readonly promptId: string
  readonly tools: readonly AgentTool[]
  readonly schedule: AgentSchedule | null
}): Promise<CreateAgentState> => {
  await requireUserId()
  try {
    const agent = await createAgent(input)
    revalidatePath(`/${input.siteId}/agents`)
    return { agent, error: null }
  } catch (error) {
    return { agent: null, error: error instanceof Error ? error.message : 'Không tạo được agent.' }
  }
}

export const toggleAgentEnabledAction = async (siteId: string, agentId: string, enabled: boolean): Promise<void> => {
  await requireUserId()
  await setAgentEnabled(agentId, enabled)
  revalidatePath(`/${siteId}/agents`)
}

/**
 * Ghi run=running rồi giao việc chạy thật cho `after()` — request trả về
 * ngay, không đợi hết vòng lặp Claude (có thể mất nhiều lượt gọi). Cùng
 * pattern với đồng bộ snapshot video TikTok trong `sync-connection.ts`.
 *
 * KHÔNG tự tạo run row ở đây: `runAgent` (Task 13) đã là nơi DUY NHẤT gọi
 * `createRun` — action này chỉ có nhiệm vụ giao việc cho `after()` rồi trả
 * về, tránh tạo hai run row cho một lần bấm "Chạy ngay". `revalidatePath`
 * re-render danh sách agent ở lượt render đầu có thể chưa kịp thấy run mới
 * nhất (vì `createRun` bên trong `runAgent` chỉ chạy sau khi response đã
 * trả) — chấp nhận được, cùng kiểu "eventually consistent" như mọi async
 * action khác trong app này.
 *
 * `runAgent` tự đọc mọi thứ qua admin client (không có phiên trong `after()`,
 * xem comment ở `run-agent.ts`) nên RLS không chặn được gì ở đó — phải kiểm
 * quyền owner/admin trên chính `site_id` thật của agent NGAY TẠI ĐÂY, trước
 * khi giao việc cho `after()`. Đọc `agents` qua client phiên người dùng (có
 * RLS `is_site_member`) trước, rồi mới kiểm role — không tin `agentId` do
 * client gửi lên trỏ đúng site nào, phải tự tra ra `site_id` thật.
 */
export const runAgentNowAction = async (siteId: string, agentId: string): Promise<void> => {
  await requireUserId()

  const supabase = await createClient()
  const { data: agent } = await supabase.from('agents').select('site_id').eq('id', agentId).maybeSingle()
  if (!agent) throw new Error('Không tìm thấy agent.')

  const { data: isAdmin } = await supabase.rpc('has_site_role', {
    target_site: agent.site_id,
    allowed: ['owner', 'admin'],
  })
  if (!isAdmin) throw new Error('Chỉ chủ sở hữu hoặc quản trị viên mới chạy được agent.')

  after(() => runAgent(agentId, 'manual'))
  revalidatePath(`/${siteId}/agents`)
}

export const approvePendingActionAction = async (siteId: string, pendingActionId: string): Promise<void> => {
  const userId = await requireUserId()
  await decidePendingAction(pendingActionId, 'approved', userId)
  revalidatePath(`/${siteId}/agents`)
}

export const rejectPendingActionAction = async (siteId: string, pendingActionId: string): Promise<void> => {
  const userId = await requireUserId()
  await decidePendingAction(pendingActionId, 'rejected', userId)
  revalidatePath(`/${siteId}/agents`)
}
