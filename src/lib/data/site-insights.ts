import 'server-only'

import type { Connection } from '@/lib/domain/connection'
import { needsAttention } from '@/lib/domain/connection'
import type { Insight, InsightEvidence } from '@/lib/domain/insight'
import { PROVIDER_META, type ProviderId } from '@/lib/domain/providers'
import type { ResolvedDateRange } from '@/lib/domain/site'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { listConnections } from './connections'

/**
 * Đề xuất THEO LUẬT — không dùng mô hình ngôn ngữ, chỉ so sánh số thật trong
 * `connections` và `metrics_daily`. Nhóm "AI" (phân tích xu hướng sâu hơn,
 * vd. creative bão hoà) cần API key Claude của người dùng, làm ở lượt sau.
 *
 * Hai loại luật:
 *   1. Kết nối hỏng/trễ — đọc thẳng `connections.status`/`last_synced_at`,
 *      không cần metrics.
 *   2. Bất thường số liệu — so tổng kỳ hiện tại với tổng kỳ liền trước CÙNG
 *      độ dài (đã tính sẵn ở `range.previousStart/previousEnd`).
 */

interface PrimaryMetricDef {
  readonly key: 'sessions' | 'clicks' | 'impressions' | 'costMicros'
  readonly label: string
  readonly column: 'sessions' | 'clicks' | 'impressions' | 'cost_micros'
}

const PRIMARY_METRIC: Readonly<Partial<Record<ProviderId, PrimaryMetricDef>>> = {
  ga4: { key: 'sessions', label: 'Sessions', column: 'sessions' },
  gsc: { key: 'clicks', label: 'Lượt click', column: 'clicks' },
  youtube: { key: 'impressions', label: 'Lượt hiển thị', column: 'impressions' },
  'google-ads': { key: 'costMicros', label: 'Chi phí', column: 'cost_micros' },
}

/** Kỳ trước quá nhỏ thì so sánh % chỉ ra nhiễu — bỏ qua thay vì báo giả. */
const MIN_BASELINE: Readonly<Record<PrimaryMetricDef['key'], number>> = {
  sessions: 20,
  clicks: 20,
  impressions: 50,
  costMicros: 50_000_000, // 50 đơn vị tiền tệ, tính bằng micros
}

const DROP_THRESHOLD = 0.3
const CRITICAL_DROP_THRESHOLD = 0.6
const STALE_SYNC_HOURS = 48

const hoursSince = (isoDate: string): number =>
  (Date.now() - new Date(isoDate).getTime()) / 3_600_000

export const getRealInsights = async (
  siteId: string,
  range: ResolvedDateRange,
): Promise<readonly Insight[]> => {
  const connections = await listConnections(siteId)
  const insights: Insight[] = []

  for (const connection of connections) {
    if (needsAttention(connection.status)) {
      insights.push(brokenConnectionInsight(siteId, connection))
      continue
    }
    if (connection.status === 'connected' && connection.lastSyncedAt) {
      const hours = hoursSince(connection.lastSyncedAt)
      if (hours > STALE_SYNC_HOURS) {
        insights.push(staleSyncInsight(siteId, connection, hours))
      }
    }
  }

  insights.push(...(await detectAnomalies(siteId, connections, range)))

  return insights
}

const brokenConnectionInsight = (siteId: string, connection: Connection): Insight => {
  const statusLabel = connection.status === 'expired' ? 'Hết hạn cấp quyền' : 'Đồng bộ lỗi'
  const hours = connection.lastSyncedAt ? hoursSince(connection.lastSyncedAt) : null

  return {
    id: `broken-${connection.id}`,
    siteId,
    kind: 'tracking-broken',
    severity: 'critical',
    title: `${PROVIDER_META[connection.provider].label} mất kết nối — số liệu đang dừng cập nhật`,
    body: connection.error
      ? `${connection.error.message} Mọi báo cáo dùng nguồn này đang hiển thị số liệu CŨ, không phải số liệu hiện tại. Cấp quyền lại ở trang Kết nối trước khi ra quyết định ngân sách dựa vào số này.`
      : `Kết nối đang ở trạng thái "${statusLabel}". Mọi báo cáo dùng nguồn này đang hiển thị số liệu CŨ. Cấp quyền lại ở trang Kết nối.`,
    evidence: [
      {
        label: statusLabel,
        provider: connection.provider,
        entityId: connection.id,
        entityName: connection.accountName,
        metric: 'hoursSinceSync',
        value: hours !== null ? Math.round(hours) : 0,
        comparisonValue: null,
        dateRange: {
          start: (connection.lastSyncedAt ?? connection.connectedAt).slice(0, 10),
          end: new Date().toISOString().slice(0, 10),
        },
      },
    ],
    recommendedAction: null,
    estimatedImpact: null,
    status: 'new',
    source: 'rule',
    createdAt: new Date().toISOString(),
  }
}

const staleSyncInsight = (siteId: string, connection: Connection, hours: number): Insight => ({
  id: `stale-${connection.id}`,
  siteId,
  kind: 'tracking-broken',
  severity: 'warning',
  title: `${PROVIDER_META[connection.provider].label} chưa đồng bộ hơn ${Math.floor(hours / 24)} ngày`,
  body: `Lần đồng bộ gần nhất là ${formatDate(connection.lastSyncedAt as string)}. Số liệu hiện tại có thể chưa phản ánh đúng những gì đang diễn ra — bấm "Làm mới" ở trang Kết nối hoặc đợi vòng đồng bộ tự động tiếp theo.`,
  evidence: [
    {
      label: 'Giờ kể từ lần đồng bộ gần nhất',
      provider: connection.provider,
      entityId: connection.id,
      entityName: connection.accountName,
      metric: 'hoursSinceSync',
      value: Math.round(hours),
      comparisonValue: null,
      dateRange: {
        start: (connection.lastSyncedAt as string).slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
      },
    },
  ],
  recommendedAction: null,
  estimatedImpact: null,
  status: 'new',
  source: 'rule',
  createdAt: new Date().toISOString(),
})

const detectAnomalies = async (
  siteId: string,
  connections: readonly Connection[],
  range: ResolvedDateRange,
): Promise<readonly Insight[]> => {
  const eligible = connections.filter(
    (connection): connection is Connection & { readonly provider: ProviderId } =>
      connection.status === 'connected' && Boolean(PRIMARY_METRIC[connection.provider]),
  )
  if (eligible.length === 0) return []

  const supabase = await createClient()
  const ids = eligible.map((connection) => connection.id)
  const providerByConnectionId = new Map(eligible.map((c) => [c.id, c.provider]))

  const { data: rows } = await supabase
    .from('metrics_daily')
    .select('connection_id, date, sessions, clicks, impressions, cost_micros')
    .in('connection_id', ids)
    .gte('date', range.previousStart)
    .lte('date', range.end)

  const sums = new Map<string, { current: number; previous: number }>()
  for (const row of rows ?? []) {
    const provider = providerByConnectionId.get(row.connection_id)
    const def = provider ? PRIMARY_METRIC[provider] : undefined
    if (!def) continue

    const bucket = sums.get(row.connection_id) ?? { current: 0, previous: 0 }
    const value = Number(row[def.column]) || 0
    if (row.date <= range.previousEnd) bucket.previous += value
    else bucket.current += value
    sums.set(row.connection_id, bucket)
  }

  const insights: Insight[] = []

  for (const connection of eligible) {
    const def = PRIMARY_METRIC[connection.provider] as PrimaryMetricDef
    const { current, previous } = sums.get(connection.id) ?? { current: 0, previous: 0 }
    if (previous < MIN_BASELINE[def.key]) continue

    const deltaPct = (current - previous) / previous

    if (deltaPct <= -DROP_THRESHOLD) {
      insights.push(
        anomalyInsight(siteId, connection, def, { current, previous, deltaPct, range, kind: 'drop' }),
      )
    } else if (def.key === 'costMicros' && deltaPct >= DROP_THRESHOLD) {
      insights.push(
        anomalyInsight(siteId, connection, def, { current, previous, deltaPct, range, kind: 'spike' }),
      )
    }
  }

  return insights
}

const anomalyInsight = (
  siteId: string,
  connection: Connection,
  def: PrimaryMetricDef,
  params: {
    readonly current: number
    readonly previous: number
    readonly deltaPct: number
    readonly range: ResolvedDateRange
    readonly kind: 'drop' | 'spike'
  },
): Insight => {
  const { current, previous, deltaPct, range, kind } = params
  const pctLabel = `${Math.round(Math.abs(deltaPct) * 100)}%`
  const severity =
    Math.abs(deltaPct) >= CRITICAL_DROP_THRESHOLD ? 'critical' : ('warning' as const)

  const title =
    kind === 'drop'
      ? `${def.label} của ${PROVIDER_META[connection.provider].label} giảm ${pctLabel}`
      : `Chi phí ${PROVIDER_META[connection.provider].label} tăng ${pctLabel} so với kỳ trước`

  const body =
    kind === 'drop'
      ? `${def.label} giảm từ ${Math.round(previous)} xuống ${Math.round(current)} so với kỳ trước liền kề. Kiểm tra kết nối, cấu hình chiến dịch và trang đích trước khi điều chỉnh ngân sách.`
      : `Chi phí tăng từ ${Math.round(previous / 1_000_000)} lên ${Math.round(current / 1_000_000)} (đơn vị tiền tệ Site) so với kỳ trước, chưa rõ hiệu quả có tăng tương ứng không. Kiểm tra ngân sách chiến dịch có đang chạy đúng dự kiến.`

  const evidence: InsightEvidence = {
    label: `${def.label} (${range.start} → ${range.end})`,
    provider: connection.provider,
    entityId: connection.id,
    entityName: connection.accountName,
    metric: def.key,
    value: Math.round(current),
    comparisonValue: Math.round(previous),
    dateRange: { start: range.start, end: range.end },
  }

  return {
    id: `anomaly-${connection.id}-${range.start}-${kind}`,
    siteId,
    kind: 'anomaly',
    severity,
    title,
    body,
    evidence: [evidence],
    recommendedAction: null,
    estimatedImpact: {
      metric: def.key,
      deltaMicros: def.key === 'costMicros' ? Math.round(current - previous) : null,
      deltaPct,
      confidence: 'medium',
    },
    status: 'new',
    source: 'rule',
    createdAt: new Date().toISOString(),
  }
}
