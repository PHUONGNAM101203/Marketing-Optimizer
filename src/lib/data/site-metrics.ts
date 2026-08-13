import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Số liệu THẬT của một Site, gộp từ `metrics_daily` — chỉ tồn tại cho những
 * connection có adapter kéo báo cáo thật (hiện tại: GA4, Search Console).
 *
 * `hasSpendSource` luôn `false` cho tới khi có adapter thật cho một nền tảng
 * quảng cáo (Google Ads/Meta/TikTok) — Overview dùng cờ này để biết khối chi
 * phí/ROAS/CPA phải khoá mờ, KHÔNG suy ra "có nguồn" chỉ vì có connection.
 */
export interface RealMetricsSummary {
  readonly hasGa4: boolean
  readonly hasGsc: boolean
  readonly hasSpendSource: boolean
  readonly totals: {
    readonly sessions: number
    readonly users: number
    readonly conversions: number
    readonly clicks: number
    readonly impressions: number
  }
  /** Sessions GA4 theo ngày — nguồn thật duy nhất đủ để vẽ một đường xu hướng. */
  readonly dailySessions: readonly { readonly date: string; readonly sessions: number }[]
}

const EMPTY_SUMMARY: RealMetricsSummary = {
  hasGa4: false,
  hasGsc: false,
  hasSpendSource: false,
  totals: { sessions: 0, users: 0, conversions: 0, clicks: 0, impressions: 0 },
  dailySessions: [],
}

export const getRealMetricsSummary = async (
  siteId: string,
  range: { readonly start: string; readonly end: string },
): Promise<RealMetricsSummary> => {
  const supabase = await createClient()

  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider')
    .eq('site_id', siteId)

  const ga4Ids = (connections ?? []).filter((c) => c.provider === 'ga4').map((c) => c.id)
  const gscIds = (connections ?? []).filter((c) => c.provider === 'gsc').map((c) => c.id)
  const connectionIds = [...ga4Ids, ...gscIds]

  if (connectionIds.length === 0) return EMPTY_SUMMARY

  const { data: rows } = await supabase
    .from('metrics_daily')
    .select('connection_id, date, sessions, users, conversions, clicks, impressions')
    .in('connection_id', connectionIds)
    .gte('date', range.start)
    .lte('date', range.end)
    .order('date', { ascending: true })

  const ga4IdSet = new Set(ga4Ids)
  const totals = { sessions: 0, users: 0, conversions: 0, clicks: 0, impressions: 0 }
  const sessionsByDate = new Map<string, number>()

  for (const row of rows ?? []) {
    totals.sessions += row.sessions
    totals.users += row.users
    totals.conversions += row.conversions
    totals.clicks += row.clicks
    totals.impressions += row.impressions

    if (ga4IdSet.has(row.connection_id)) {
      sessionsByDate.set(row.date, (sessionsByDate.get(row.date) ?? 0) + row.sessions)
    }
  }

  const dailySessions = [...sessionsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => ({ date, sessions }))

  return {
    hasGa4: ga4Ids.length > 0,
    hasGsc: gscIds.length > 0,
    hasSpendSource: false,
    totals,
    dailySessions,
  }
}
