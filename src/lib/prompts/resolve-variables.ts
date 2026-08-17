import 'server-only'

import { getChannelSummaries } from '@/lib/data/site-channels'
import { getCampaignPerformance } from '@/lib/data/entities'
import { deriveMetrics } from '@/lib/metrics/derive'
import { hasCapability, PROVIDER_META, PROVIDERS } from '@/lib/domain/providers'
import { formatCurrencyCompact, formatDateRange } from '@/lib/format'
import { VARIABLE_PATTERN } from '@/lib/domain/prompt'
import type { PromptVariable } from '@/lib/domain/prompt'
import type { Site } from '@/lib/domain/site'

/**
 * Registry biến metric/entity — CỐ TÌNH là danh sách hữu hạn, không phải bộ
 * ánh xạ tên-biến-tuỳ-ý-sang-số-liệu. Một registry mở sẽ là đúng cách một
 * prompt tự bịa số cho biến chưa ai nối dữ liệu thật — thà báo lỗi rõ ràng.
 * Thêm biến mới = thêm một entry ở đây.
 */

export class VariableResolutionError extends Error {
  constructor(
    readonly variableName: string,
    message: string,
  ) {
    super(message)
    this.name = 'VariableResolutionError'
  }
}

type Resolver = (site: Site, range: { readonly start: string; readonly end: string }) => Promise<string>

const SPEND_PROVIDERS = PROVIDERS.filter((provider) => hasCapability(provider, 'spend'))

const METRIC_RESOLVERS: Readonly<Record<string, Resolver>> = {
  accountCpa: async (site, range) => {
    const summaries = await getChannelSummaries(site.id, range)
    let costMicros = 0
    let conversions = 0
    for (const provider of SPEND_PROVIDERS) {
      const summary = summaries.get(provider)
      if (!summary?.connected) continue
      costMicros += summary.totals.costMicros
      conversions += summary.totals.conversions
    }
    const { cpaMicros } = deriveMetrics({
      sessions: null,
      users: null,
      conversions,
      clicks: null,
      impressions: null,
      costMicros,
      conversionValueMicros: null,
      // MetricTotals đòi đủ mọi AdditiveMetricKey (kể cả revenueMicros) —
      // ChannelSummary không có trường doanh thu, luôn null.
      revenueMicros: null,
    })
    return formatCurrencyCompact(cpaMicros, site.currency)
  },
}

const ENTITY_RESOLVERS: Readonly<Record<string, Resolver>> = {
  campaignTable: async (site, range) => {
    const campaigns = await getCampaignPerformance(site.id, range)
    if (campaigns.length === 0) return '(Chưa có dữ liệu chiến dịch trong khoảng ngày này)'

    const header = '| Chiến dịch | Nền tảng | Chi phí | Chuyển đổi | CPA | ROAS |\n|---|---|---|---|---|---|'
    const rows = campaigns
      .slice(0, 20)
      .map((c) => {
        const cpa = c.cpaMicros === null ? '—' : formatCurrencyCompact(c.cpaMicros, site.currency)
        const roas = c.roas === null ? '—' : `${c.roas.toFixed(2)}x`
        return `| ${c.campaignName} | ${PROVIDER_META[c.provider].label} | ${formatCurrencyCompact(c.costMicros, site.currency)} | ${c.conversions} | ${cpa} | ${roas} |`
      })
      .join('\n')
    return `${header}\n${rows}`
  },
}

const SITE_RESOLVERS: Readonly<Record<string, Resolver>> = {
  domain: async (site) => site.domain,
  dateRange: async (_site, range) => formatDateRange(range.start, range.end),
}

export const resolveVariables = async (params: {
  readonly variables: readonly PromptVariable[]
  readonly site: Site
  readonly range: { readonly start: string; readonly end: string }
  readonly manualInputs: Readonly<Record<string, string>>
}): Promise<Readonly<Record<string, string>>> => {
  const resolved: Record<string, string> = {}

  for (const variable of params.variables) {
    if (variable.source === 'manual') {
      const value = params.manualInputs[variable.name] ?? variable.defaultValue
      if (value === null || value === undefined) {
        if (variable.required) {
          throw new VariableResolutionError(variable.name, `Thiếu giá trị nhập tay cho "${variable.label}"`)
        }
        continue
      }
      resolved[variable.name] = value
      continue
    }

    const registry = variable.source === 'site' ? SITE_RESOLVERS : variable.source === 'metric' ? METRIC_RESOLVERS : ENTITY_RESOLVERS
    const resolver = registry[variable.name]

    if (!resolver) {
      if (variable.required) {
        throw new VariableResolutionError(
          variable.name,
          `Chưa có cách lấy biến "${variable.label}" (nguồn: ${variable.source}) — chưa nối dữ liệu thật cho biến này`,
        )
      }
      continue
    }

    resolved[variable.name] = await resolver(params.site, params.range)
  }

  return resolved
}

/**
 * Thay `{{ tên }}` bằng giá trị đã resolve — dùng CHUNG một nơi cho cả
 * Prompt Studio "Chạy thử" (`actions/prompts.ts`) lẫn vòng lặp agent
 * (`agents/run-agent.ts`). Trước đây `run-agent.ts` tự thay bằng
 * `replaceAll(\`{{${name}}}\`, ...)` — khớp chính xác, không chấp nhận
 * khoảng trắng trong `{{ name }}` như `VARIABLE_PATTERN`/`extractVariableNames`
 * đã chấp nhận, nên một prompt hợp lệ ở Prompt Studio có thể chạy qua agent
 * mà biến không được thay. Dùng lại đúng `VARIABLE_PATTERN` để hai đường
 * luôn khớp nhau.
 */
export const fillTemplate = (
  template: string,
  resolvedVars: Readonly<Record<string, string>>,
): string => template.replace(VARIABLE_PATTERN, (_match, name: string) => resolvedVars[name] ?? '')
