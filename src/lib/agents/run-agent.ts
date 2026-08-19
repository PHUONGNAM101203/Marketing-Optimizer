import 'server-only'

import { createRun, appendRunStep, finishRun, setAgentLastRunAt } from '@/lib/data/agents'
import { resolveVariables, fillTemplate, VariableResolutionError } from '@/lib/prompts/resolve-variables'
import { callAi, extractText } from '@/lib/providers/ai'
import { resolveAiConfig } from '@/lib/data/site-ai-keys'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOOL_REGISTRY } from './tools'
import { isWriteTool } from '@/lib/domain/agent'
import type { AgentTool, AgentToolName } from '@/lib/domain/agent'
import type { PromptVariable } from '@/lib/domain/prompt'
import type { Site } from '@/lib/domain/site'
import type { AiContentPart, AiMessage } from '@/lib/providers/ai'

const MAX_ROUNDS = 8

/** Không có "range hiện tại từ URL" khi chạy theo lịch/thủ công — 28 ngày
 * gần nhất là mặc định hợp lý nhất, khớp preset mặc định của topbar. */
const defaultRange = (): { readonly start: string; readonly end: string } => {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 27)
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toIso(start), end: toIso(end) }
}

type AdminClient = ReturnType<typeof createAdminClient>

interface RunAgentRow {
  readonly siteId: string
  readonly promptId: string
  readonly tools: readonly AgentTool[]
}

interface RunPromptRow {
  readonly variables: readonly PromptVariable[]
  readonly currentVersionId: string | null
}

interface RunPromptVersionRow {
  readonly systemPrompt: string
  readonly userTemplate: string
}

/**
 * `runAgent` chỉ chạy trong `after()`/cron (Task 14/16) — KHÔNG có phiên
 * người dùng, KHÔNG có request-scoped cookie. `getAgent`/`getPrompt`/
 * `getSite` (`src/lib/data/*.ts`) đều gọi `createClient()` đọc cookie qua
 * `next/headers`, đúng cho nơi có phiên (render trang, Server Action), NHƯNG
 * gọi `cookies()` bên trong `after()` sau khi response đã trả thì Next ném
 * lỗi runtime (xem comment ở `setLastSiteId`, `src/lib/data/sites.ts`) — trên
 * đường cron thì cookie rỗng nên RLS lọc về 0 hàng, cũng hỏng, chỉ là hỏng
 * kiểu khác. Vì vậy bốn hàm dưới đây tự đọc thẳng bằng admin client (bỏ qua
 * RLS có chủ đích, giống `createRun`/`appendRunStep`/`finishRun` ở Task 11) —
 * không đụng vào `getAgent`/`getPrompt`/`getSite`, những hàm đó vẫn đúng và
 * cần giữ nguyên cho các nơi gọi khác (render trang, Server Action).
 */
const fetchAgentRow = async (admin: AdminClient, agentId: string): Promise<RunAgentRow | null> => {
  const { data, error } = await admin.from('agents').select('site_id, prompt_id, tools').eq('id', agentId).maybeSingle()
  if (error) throw new Error(`Không đọc được agent: ${error.message}`)
  if (!data) return null
  return { siteId: data.site_id, promptId: data.prompt_id, tools: data.tools as unknown as readonly AgentTool[] }
}

const fetchPromptRow = async (admin: AdminClient, promptId: string): Promise<RunPromptRow | null> => {
  const { data, error } = await admin.from('prompts').select('variables, current_version_id').eq('id', promptId).maybeSingle()
  if (error) throw new Error(`Không đọc được prompt: ${error.message}`)
  if (!data) return null
  return { variables: data.variables as unknown as readonly PromptVariable[], currentVersionId: data.current_version_id }
}

const fetchPromptVersionRow = async (admin: AdminClient, versionId: string): Promise<RunPromptVersionRow | null> => {
  const { data, error } = await admin.from('prompt_versions').select('system_prompt, user_template').eq('id', versionId).maybeSingle()
  if (error) throw new Error(`Không đọc được bản prompt: ${error.message}`)
  if (!data) return null
  return { systemPrompt: data.system_prompt, userTemplate: data.user_template }
}

const fetchSiteRow = async (admin: AdminClient, siteId: string): Promise<Site | null> => {
  const { data, error } = await admin.from('sites').select('*').eq('id', siteId).maybeSingle()
  if (error) throw new Error(`Không đọc được website: ${error.message}`)
  if (!data) return null
  return {
    id: data.id,
    ownerId: data.owner_id,
    name: data.name,
    url: data.url,
    domain: data.domain,
    timezone: data.timezone,
    currency: data.currency,
    country: data.country,
    createdAt: data.created_at,
    llmsTxtContent: data.llms_txt_content,
    llmsTxtGeneratedAt: data.llms_txt_generated_at,
    insightDropThresholdPct: data.insight_drop_threshold_pct,
    insightCriticalDropThresholdPct: data.insight_critical_drop_threshold_pct,
    insightStaleSyncHours: data.insight_stale_sync_hours,
  }
}

/**
 * Vòng lặp tool-calling của agent.
 *
 * BẤT BIẾN AN TOÀN (nửa còn lại của Task 12 — registry tool không bao giờ ghi
 * ra ngoài): ngay khi MỘT round có bất kỳ tool_use nào MÀ THỰC SỰ ĐƯỢC THỰC
 * THI (tức là tool đó được agent bật VÀ `isWriteTool` trả true), hàm gọi
 * `finishRun` với status 'pending-approval' rồi `return` NGAY — không có
 * đường nào trong hàm này quay lại gọi `callAi` sau đó, kể cả khi model
 * cũng xin gọi tool đọc trong cùng round đó. Mọi tool trong round (đọc lẫn
 * ghi, kể cả tool không được bật) vẫn được ghi step trước khi return — chỉ
 * là không có round tiếp theo được mở ra.
 */
export const runAgent = async (agentId: string, trigger: 'schedule' | 'manual'): Promise<void> => {
  const admin = createAdminClient()

  const agentRow = await fetchAgentRow(admin, agentId)
  if (!agentRow) return

  const [promptRow, site] = await Promise.all([fetchPromptRow(admin, agentRow.promptId), fetchSiteRow(admin, agentRow.siteId)])
  if (!promptRow || !site) return

  const run = await createRun({ agentId, siteId: agentRow.siteId, trigger })
  const range = defaultRange()
  let totalTokens = 0
  // Đánh dấu run đã được `finishRun` HỢP LỆ (succeeded/failed/pending-approval)
  // ở nhánh bình thường — nếu một exception bay tới `catch` SAU khi cờ này đã
  // `true`, nghĩa là chỉ có `setAgentLastRunAt` (bước dọn dẹp, không phải
  // trạng thái run) bị lỗi, KHÔNG được ghi đè lại `finishRun('failed')` lên
  // một run đã kết thúc đúng — xem catch bên dưới.
  let finished = false

  try {
    // Cùng thông điệp với `testRunPromptAction` (`actions/prompts.ts`) — chưa
    // cấu hình AI Key là một lỗi CÓ THỂ SỬA từ UI, không phải lỗi hệ thống,
    // nên `finishRun('failed', ...)` với summary rõ nguyên nhân thay vì throw
    // một lỗi chung chung.
    const aiConfig = await resolveAiConfig(agentRow.siteId)
    if (!aiConfig) {
      await finishRun(run.id, {
        status: 'failed',
        summary: 'Chưa cấu hình AI Key cho website này. Vào Cài đặt để thêm.',
        tokensUsed: 0,
      })
      finished = true
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    const currentVersion = promptRow.currentVersionId ? await fetchPromptVersionRow(admin, promptRow.currentVersionId) : null
    if (!currentVersion) {
      await finishRun(run.id, { status: 'failed', summary: 'Prompt không có bản hiện tại', tokensUsed: 0 })
      finished = true
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    let resolvedVars: Readonly<Record<string, string>>
    try {
      resolvedVars = await resolveVariables({
        variables: promptRow.variables,
        site,
        range,
        manualInputs: {},
        // Chạy trong after()/cron — không có phiên người dùng (xem comment
        // đầu file về fetchAgentRow/fetchPromptRow/fetchSiteRow).
        clientMode: 'admin',
      })
    } catch (error) {
      const message = error instanceof VariableResolutionError ? error.message : 'Lỗi không xác định khi điền biến prompt'
      await appendRunStep(run.id, { kind: 'output', tool: null, content: message, at: new Date().toISOString() })
      await finishRun(run.id, { status: 'failed', summary: message, tokensUsed: 0 })
      finished = true
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    // Dùng chung `fillTemplate` với `testRunPromptAction` (`actions/prompts.ts`)
    // — trước đây thay bằng `replaceAll` khớp chính xác, không chấp nhận
    // `{{ name }}` có khoảng trắng như bước validate/rút biến đã chấp nhận.
    const filledTemplate = fillTemplate(currentVersion.userTemplate, resolvedVars)

    const enabledToolNames = new Set<AgentToolName>(agentRow.tools.filter((t) => t.enabled).map((t) => t.name))
    const toolDefs = [...enabledToolNames].map((name) => ({
      name,
      description: TOOL_REGISTRY[name].description,
      inputSchema: TOOL_REGISTRY[name].inputSchema,
    }))

    const messages: AiMessage[] = [{ role: 'user', content: [{ type: 'text', text: filledTemplate }] }]

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const result = await callAi({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        systemPrompt: currentVersion.systemPrompt,
        messages,
        tools: toolDefs,
      })

      totalTokens += result.tokensIn + result.tokensOut

      if (result.stopReason !== 'tool_use') {
        // Chỉ ghi MỘT step 'output' cho lượt kết thúc — `extractText` đã gộp
        // đúng những text part này rồi, ghi thêm 'thought' nữa là lặp y hệt
        // nội dung trong transcript.
        const finalText = extractText(result)
        await appendRunStep(run.id, { kind: 'output', tool: null, content: finalText, at: new Date().toISOString() })

        if (result.stopReason === 'end_turn') {
          await finishRun(run.id, { status: 'succeeded', summary: finalText, tokensUsed: totalTokens })
        } else {
          // max_tokens/other KHÔNG phải một phân tích đã hoàn tất — coi là
          // thất bại và nêu rõ lý do dừng để phân biệt với kết thúc bình
          // thường.
          await finishRun(run.id, {
            status: 'failed',
            summary: `Dừng bất thường (${result.stopReason}): ${finalText}`,
            tokensUsed: totalTokens,
          })
        }
        finished = true
        await setAgentLastRunAt(agentId, new Date().toISOString())
        return
      }

      const textParts = result.content.filter(
        (p): p is Extract<AiContentPart, { type: 'text' }> => p.type === 'text',
      )
      for (const part of textParts) {
        await appendRunStep(run.id, { kind: 'thought', tool: null, content: part.text, at: new Date().toISOString() })
      }

      const toolUseParts = result.content.filter(
        (p): p is Extract<AiContentPart, { type: 'tool-use' }> => p.type === 'tool-use',
      )
      messages.push({ role: 'assistant', content: result.content })

      let hasWriteTool = false
      const toolResultParts: AiContentPart[] = []

      for (const part of toolUseParts) {
        const toolName = part.name as AgentToolName
        await appendRunStep(run.id, {
          kind: 'tool-call',
          tool: toolName,
          content: JSON.stringify(part.input),
          at: new Date().toISOString(),
        })

        // Phòng vệ theo chiều sâu: `toolDefs` gửi cho model đã lọc theo tool
        // được bật, nhưng model vẫn có thể trả về tên tool KHÔNG nằm trong đó
        // (bịa tên, hoặc gọi một tool đã tắt) — không chạy tool đó, kể cả khi
        // nó tồn tại trong TOOL_REGISTRY.
        const isOffered = enabledToolNames.has(toolName)
        const definition = isOffered ? TOOL_REGISTRY[toolName] : undefined

        let resultText: string
        if (!isOffered) {
          resultText = `Tool "${toolName}" không được agent này bật, bỏ qua.`
        } else if (!definition) {
          resultText = `Tool "${toolName}" không tồn tại.`
        } else {
          if (isWriteTool(toolName)) hasWriteTool = true
          resultText = await definition.run(part.input, {
            siteId: agentRow.siteId,
            runId: run.id,
            range,
            currency: site.currency,
          })
        }

        await appendRunStep(run.id, { kind: 'tool-result', tool: toolName, content: resultText, at: new Date().toISOString() })
        toolResultParts.push({ type: 'tool-result', toolUseId: part.id, name: part.name, content: resultText })
      }

      if (hasWriteTool) {
        // Bất biến an toàn: dừng HẲN ngay khi có write-tool ĐÃ THỰC THI,
        // không cho vòng lặp tiếp tục dù model muốn làm gì thêm — xem
        // domain/agent.ts.
        await finishRun(run.id, {
          status: 'pending-approval',
          summary: 'Agent đã đề xuất một hành động, đang chờ duyệt.',
          tokensUsed: totalTokens,
        })
        finished = true
        await setAgentLastRunAt(agentId, new Date().toISOString())
        return
      }

      messages.push({ role: 'user', content: toolResultParts })
    }

    await finishRun(run.id, {
      status: 'failed',
      summary: `Vượt số vòng lặp tối đa (${MAX_ROUNDS}) mà chưa có kết luận.`,
      tokensUsed: totalTokens,
    })
    finished = true
    await setAgentLastRunAt(agentId, new Date().toISOString())
  } catch (error) {
    // Bất kỳ throw nào chưa được bắt ở trên (callAi lỗi mạng/429/500,
    // appendRunStep/finishRun lỗi Supabase, tool.run() ném lỗi, ...) đều rơi
    // vào đây — không được để run kẹt mãi ở status='running'/finished_at=null:
    // một pending action thật (nếu round đó vừa tạo trước khi lỗi) sẽ treo
    // dưới một run trông như đang chạy mãi mãi, và cron dựa vào last_run_at
    // sẽ cứ chọn lại + tính phí lại agent này.
    //
    // NHƯNG: nếu `finished` đã `true`, nghĩa là run đã `finishRun` đúng cách
    // (succeeded/failed/pending-approval) rồi mới lỗi — lỗi đó chỉ có thể đến
    // từ `setAgentLastRunAt` sau đó. KHÔNG được ghi đè lại thành 'failed' lên
    // một run đã kết thúc hợp lệ chỉ vì bước dọn dẹp cuối cùng hiccup.
    const message = error instanceof Error ? error.message : String(error)
    if (!finished) {
      try {
        await appendRunStep(run.id, { kind: 'output', tool: null, content: `Lỗi không xử lý được: ${message}`, at: new Date().toISOString() })
      } catch {
        // Best-effort — không để lỗi ghi step che mất lỗi gốc phía trên.
      }
      try {
        await finishRun(run.id, { status: 'failed', summary: message, tokensUsed: totalTokens })
      } catch {
        // Best-effort — nếu chính finishRun cũng lỗi thì không còn gì an toàn
        // để thử lại ở đây nữa.
      }
    }
    try {
      await setAgentLastRunAt(agentId, new Date().toISOString())
    } catch {
      // Best-effort — dù `finished` hay chưa, đây luôn chỉ là dọn dẹp
      // `last_run_at`, không đụng tới status của run.
    }
  }
}
