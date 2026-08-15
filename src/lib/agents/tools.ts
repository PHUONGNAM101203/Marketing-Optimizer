import 'server-only'

import { getCampaignPerformance, getChannelSummariesForAgent } from '@/lib/data/entities'
import { createPendingAction } from '@/lib/data/agents'
import { hasCapability, PROVIDERS, isProviderId } from '@/lib/domain/providers'
import { formatCurrencyCompact } from '@/lib/format'
import type { AgentToolName } from '@/lib/domain/agent'
import type { ActionKind } from '@/lib/domain/insight'

export interface ToolContext {
  readonly siteId: string
  readonly runId: string
  readonly range: { readonly start: string; readonly end: string }
  readonly currency: string
}

export interface ToolDefinition {
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>
}

/**
 * Mọi write-tool CHIA SẺ một hành vi: không ghi gì ra nền tảng ngoài, chỉ
 * tạo một hàng `pending_actions` rồi trả lời model bằng một câu xác nhận cố
 * định. Vòng lặp ở `run-agent.ts` là nơi THẬT SỰ dừng hẳn sau khi thấy write
 * tool — hàm `run` ở đây không tự dừng vòng lặp, chỉ ghi đề xuất.
 */
const proposeAction = async (
  tool: Extract<AgentToolName, 'apply-budget-change' | 'pause-campaign' | 'resume-campaign' | 'update-ad-copy' | 'add-negative-keyword' | 'publish-report'>,
  actionKind: ActionKind,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> => {
  const provider = typeof input.provider === 'string' && isProviderId(input.provider) ? input.provider : 'google-ads'
  const targetEntityId = String(input.entityId ?? input.campaignId ?? 'unknown')
  const targetEntityName = String(input.entityName ?? input.campaignName ?? 'Không rõ')
  const summary = String(input.summary ?? '')
  const rationale = String(input.rationale ?? '')
  const diff = Array.isArray(input.diff)
    ? (input.diff as readonly { field: string; before: string; after: string }[])
    : []

  await createPendingAction({
    runId: ctx.runId,
    tool,
    actionKind,
    provider,
    targetEntityId,
    targetEntityName,
    summary,
    diff,
    rationale,
  })

  return 'Đề xuất đã được ghi lại, chờ người dùng duyệt. Không có gì được ghi ra nền tảng quảng cáo — dừng phân tích ở đây.'
}

export const TOOL_REGISTRY: Readonly<Record<AgentToolName, ToolDefinition>> = {
  'query-metrics': {
    description: 'Đọc tổng số liệu thật (chi phí, chuyển đổi, CPA, ROAS) của mọi kênh quảng cáo đã kết nối trong khoảng ngày đang xét.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const summaries = await getChannelSummariesForAgent(ctx.siteId, ctx.range)
      const lines = PROVIDERS.filter((p) => hasCapability(p, 'spend'))
        .map((provider) => {
          const s = summaries.get(provider)
          if (!s?.connected) return null
          return `${provider}: chi phí ${formatCurrencyCompact(s.totals.costMicros, ctx.currency)}, chuyển đổi ${s.totals.conversions}`
        })
        .filter((line): line is string => line !== null)
      return lines.length > 0 ? lines.join('\n') : 'Chưa có kênh quảng cáo nào kết nối.'
    },
  },
  'list-entities': {
    description: 'Liệt kê chiến dịch thật (Google Ads, Meta Ads) kèm chi phí/chuyển đổi/CPA/ROAS trong khoảng ngày đang xét.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const campaigns = await getCampaignPerformance(ctx.siteId, ctx.range)
      if (campaigns.length === 0) return 'Chưa có dữ liệu chiến dịch.'
      return campaigns
        .slice(0, 30)
        .map((c) => `${c.campaignName} (${c.provider}): chi phí ${formatCurrencyCompact(c.costMicros, ctx.currency)}, chuyển đổi ${c.conversions}, CPA ${c.cpaMicros === null ? '—' : formatCurrencyCompact(c.cpaMicros, ctx.currency)}`)
        .join('\n')
    },
  },
  'compare-periods': {
    description: 'So tổng chi phí/chuyển đổi kỳ hiện tại với kỳ liền trước, cùng độ dài.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (_input, ctx) => {
      const length = Math.round((new Date(ctx.range.end).getTime() - new Date(ctx.range.start).getTime()) / 86_400_000) + 1
      const previousEnd = new Date(new Date(ctx.range.start).getTime() - 86_400_000)
      const previousStart = new Date(previousEnd.getTime() - (length - 1) * 86_400_000)
      const toIso = (d: Date) => d.toISOString().slice(0, 10)

      const [current, previous] = await Promise.all([
        getChannelSummariesForAgent(ctx.siteId, ctx.range),
        getChannelSummariesForAgent(ctx.siteId, { start: toIso(previousStart), end: toIso(previousEnd) }),
      ])

      const lines = PROVIDERS.filter((p) => hasCapability(p, 'spend')).map((provider) => {
        const c = current.get(provider)
        const p = previous.get(provider)
        if (!c?.connected) return null
        return `${provider}: chi phí ${formatCurrencyCompact(c.totals.costMicros, ctx.currency)} (kỳ trước ${formatCurrencyCompact(p?.totals.costMicros ?? 0, ctx.currency)})`
      }).filter((line): line is string => line !== null)

      return lines.length > 0 ? lines.join('\n') : 'Chưa có kênh quảng cáo nào kết nối.'
    },
  },
  'fetch-page-content': {
    description: 'Tool này CHƯA nối dữ liệu thật trong bản này — trả về thông báo rõ ràng thay vì bịa nội dung trang.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    run: async () => 'Tool đọc nội dung trang chưa sẵn sàng trong bản này.',
  },
  'check-ai-citation': {
    description: 'Tool này CHƯA nối dữ liệu thật trong bản này — trả về thông báo rõ ràng thay vì bịa kết quả.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => 'Tool kiểm tra trích dẫn AI chưa sẵn sàng trong bản này.',
  },
  'read-search-queries': {
    description: 'Tool này CHƯA nối dữ liệu thật trong bản này — trả về thông báo rõ ràng thay vì bịa truy vấn.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => 'Tool đọc truy vấn Search Console chưa sẵn sàng trong bản này.',
  },
  'apply-budget-change': {
    description: 'ĐỀ XUẤT đổi ngân sách một chiến dịch (không tự thực thi). Gọi khi thấy CPA chênh lệch rõ giữa các chiến dịch.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        campaignId: { type: 'string' },
        campaignName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
        diff: { type: 'array', items: { type: 'object' } },
      },
      required: ['campaignId', 'campaignName', 'summary', 'rationale', 'diff'],
    },
    run: (input, ctx) => proposeAction('apply-budget-change', 'adjust-budget', input, ctx),
  },
  'pause-campaign': {
    description: 'ĐỀ XUẤT tạm dừng một chiến dịch (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        campaignId: { type: 'string' },
        campaignName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['campaignId', 'campaignName', 'summary', 'rationale'],
    },
    run: (input, ctx) => proposeAction('pause-campaign', 'pause-entity', { ...input, diff: [] }, ctx),
  },
  'resume-campaign': {
    description: 'ĐỀ XUẤT chạy lại một chiến dịch đang tạm dừng (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        campaignId: { type: 'string' },
        campaignName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['campaignId', 'campaignName', 'summary', 'rationale'],
    },
    run: (input, ctx) => proposeAction('resume-campaign', 'resume-entity', { ...input, diff: [] }, ctx),
  },
  'update-ad-copy': {
    description: 'ĐỀ XUẤT đổi nội dung quảng cáo (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        entityId: { type: 'string' },
        entityName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
        diff: { type: 'array', items: { type: 'object' } },
      },
      required: ['entityId', 'entityName', 'summary', 'rationale', 'diff'],
    },
    run: (input, ctx) => proposeAction('update-ad-copy', 'replace-creative', input, ctx),
  },
  'add-negative-keyword': {
    description: 'ĐỀ XUẤT thêm từ khoá phủ định (không tự thực thi).',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        entityId: { type: 'string' },
        entityName: { type: 'string' },
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['entityId', 'entityName', 'summary', 'rationale'],
    },
    run: (input, ctx) => proposeAction('add-negative-keyword', 'add-negative-keyword', { ...input, diff: [] }, ctx),
  },
  'publish-report': {
    description: 'ĐỀ XUẤT đăng một báo cáo tổng hợp (không tự thực thi — chỉ tạo đề xuất chờ duyệt, giống mọi write-tool khác trong bản này).',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['summary', 'rationale'],
    },
    run: (input, ctx) =>
      proposeAction(
        'publish-report',
        'adjust-budget', // không có ActionKind riêng cho "publish" — xem ghi chú trong migration Task 2, cột không ràng buộc CHECK nên giá trị này chỉ để hiển thị nhãn, chọn tạm giá trị gần nghĩa nhất
        { ...input, provider: 'ga4', entityId: 'report', entityName: 'Báo cáo tuần', diff: [] },
        ctx,
      ),
  },
}
