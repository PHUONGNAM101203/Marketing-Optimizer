import 'server-only'

import { getAgent, createRun, appendRunStep, finishRun, setAgentLastRunAt } from '@/lib/data/agents'
import { getPrompt } from '@/lib/data/prompts'
import { getSite } from '@/lib/data/sites'
import { resolveVariables, VariableResolutionError } from '@/lib/prompts/resolve-variables'
import { callClaude, extractText, DEFAULT_CLAUDE_MODEL } from '@/lib/providers/anthropic'
import { TOOL_REGISTRY } from './tools'
import { isWriteTool } from '@/lib/domain/agent'
import type { AgentToolName } from '@/lib/domain/agent'
import type Anthropic from '@anthropic-ai/sdk'

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

/**
 * Vòng lặp tool-calling của agent.
 *
 * BẤT BIẾN AN TOÀN (nửa còn lại của Task 12 — registry tool không bao giờ ghi
 * ra ngoài): ngay khi MỘT round có bất kỳ tool_use nào mà `isWriteTool` trả
 * true, hàm gọi `finishRun` với status 'pending-approval' rồi `return` NGAY —
 * không có đường nào trong hàm này quay lại gọi `callClaude` sau đó, kể cả
 * khi model cũng xin gọi tool đọc trong cùng round đó. Mọi tool trong round
 * (đọc lẫn ghi) vẫn được thực thi và ghi step trước khi return — chỉ là
 * không có round tiếp theo được mở ra.
 */
export const runAgent = async (agentId: string, trigger: 'schedule' | 'manual'): Promise<void> => {
  const agent = await getAgent(agentId)
  if (!agent) return

  const [prompt, site] = await Promise.all([getPrompt(agent.promptId), getSite(agent.siteId)])
  if (!prompt || !site) return

  const run = await createRun({ agentId, siteId: agent.siteId, trigger })
  const range = defaultRange()

  let resolvedVars: Readonly<Record<string, string>>
  try {
    resolvedVars = await resolveVariables({
      variables: prompt.variables,
      site,
      range,
      manualInputs: {},
    })
  } catch (error) {
    const message = error instanceof VariableResolutionError ? error.message : 'Lỗi không xác định khi điền biến prompt'
    await appendRunStep(run.id, { kind: 'output', tool: null, content: message, at: new Date().toISOString() })
    await finishRun(run.id, { status: 'failed', summary: message, tokensUsed: 0 })
    return
  }

  const currentVersion = prompt.versions.find((v) => v.id === prompt.currentVersionId)
  if (!currentVersion) {
    await finishRun(run.id, { status: 'failed', summary: 'Prompt không có bản hiện tại', tokensUsed: 0 })
    return
  }

  let filledTemplate = currentVersion.userTemplate
  for (const [name, value] of Object.entries(resolvedVars)) {
    filledTemplate = filledTemplate.replaceAll(`{{${name}}}`, value)
  }

  const enabledTools = agent.tools.filter((t) => t.enabled).map((t) => t.name)
  const toolDefs = enabledTools.map((name) => ({
    name,
    description: TOOL_REGISTRY[name].description,
    inputSchema: TOOL_REGISTRY[name].inputSchema,
  }))

  const messages: { role: 'user' | 'assistant'; content: Anthropic.MessageParam['content'] }[] = [
    { role: 'user', content: filledTemplate },
  ]

  let totalTokens = 0

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { message } = await callClaude({
      systemPrompt: currentVersion.systemPrompt,
      messages,
      model: DEFAULT_CLAUDE_MODEL,
      tools: toolDefs,
    })

    totalTokens += message.usage.input_tokens + message.usage.output_tokens

    const textBlocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    for (const block of textBlocks) {
      await appendRunStep(run.id, { kind: 'thought', tool: null, content: block.text, at: new Date().toISOString() })
    }

    if (message.stop_reason !== 'tool_use') {
      const finalText = extractText(message)
      await appendRunStep(run.id, { kind: 'output', tool: null, content: finalText, at: new Date().toISOString() })
      await finishRun(run.id, { status: 'succeeded', summary: finalText, tokensUsed: totalTokens })
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    messages.push({ role: 'assistant', content: message.content })

    const hasWriteTool = toolUseBlocks.some((block) => isWriteTool(block.name as AgentToolName))

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      const toolName = block.name as AgentToolName
      await appendRunStep(run.id, {
        kind: 'tool-call',
        tool: toolName,
        content: JSON.stringify(block.input),
        at: new Date().toISOString(),
      })

      const definition = TOOL_REGISTRY[toolName]
      const resultText = definition
        ? await definition.run(block.input as Record<string, unknown>, {
            siteId: agent.siteId,
            runId: run.id,
            range,
            currency: site.currency,
          })
        : `Tool "${toolName}" không tồn tại.`

      await appendRunStep(run.id, { kind: 'tool-result', tool: toolName, content: resultText, at: new Date().toISOString() })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText })
    }

    if (hasWriteTool) {
      // Bất biến an toàn: dừng HẲN ngay khi có write-tool, không cho vòng
      // lặp tiếp tục dù model muốn làm gì thêm — xem domain/agent.ts.
      await finishRun(run.id, {
        status: 'pending-approval',
        summary: 'Agent đã đề xuất một hành động, đang chờ duyệt.',
        tokensUsed: totalTokens,
      })
      await setAgentLastRunAt(agentId, new Date().toISOString())
      return
    }

    messages.push({ role: 'user', content: toolResults })
  }

  await finishRun(run.id, {
    status: 'failed',
    summary: `Vượt số vòng lặp tối đa (${MAX_ROUNDS}) mà chưa có kết luận.`,
    tokensUsed: totalTokens,
  })
  await setAgentLastRunAt(agentId, new Date().toISOString())
}
