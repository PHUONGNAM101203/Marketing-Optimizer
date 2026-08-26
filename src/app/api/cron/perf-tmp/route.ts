import { NextResponse, type NextRequest } from 'next/server'
import { getRealMetricsSummary } from '@/lib/data/site-metrics'
import { getChannelSummaries, getChannelDailySeriesByProvider } from '@/lib/data/site-channels'
import { getLatestAuditRun } from '@/lib/data/audit'
import { getSite, listSites, getCurrentProfile } from '@/lib/data/sites'
import { getConnectionSummary } from '@/lib/data/connections'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'

/**
 * TẠM THỜI — đo thời gian TỪNG hàm dữ liệu mà layout + trang Tổng quan gọi,
 * để biết cái gì thật sự chặn khung hình đầu tiên. Không ghi gì. Xoá sau khi
 * đo xong.
 */
export const maxDuration = 300

const time = async (label: string, fn: () => Promise<unknown>) => {
  const started = Date.now()
  try {
    await fn()
    return { label, ms: Date.now() - started, ok: true }
  } catch (error) {
    return {
      label,
      ms: Date.now() - started,
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120),
    }
  }
}

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: sites } = await admin.from('sites').select('id').limit(1)
  const siteId = sites?.[0]?.id
  if (!siteId) return NextResponse.json({ error: 'no-site' }, { status: 404 })

  const range = { start: '2026-07-28', end: '2026-08-24' }
  const previous = { start: '2026-06-30', end: '2026-07-27' }

  // Đo TUẦN TỰ để mỗi con số là chi phí riêng của hàm đó, không bị che bởi một
  // hàm chạy song song chậm hơn. Trang thật chạy song song, nên tổng thực tế
  // gần với giá trị LỚN NHẤT chứ không phải tổng các giá trị.
  const results = []
  results.push(await time('layout · getSite', () => getSite(siteId)))
  results.push(await time('layout · listSites', () => listSites()))
  results.push(await time('layout · getCurrentProfile', () => getCurrentProfile()))
  results.push(await time('layout · getConnectionSummary', () => getConnectionSummary(siteId)))
  results.push(await time('overview · getRealMetricsSummary (kỳ này)', () => getRealMetricsSummary(siteId, range)))
  results.push(await time('overview · getRealMetricsSummary (kỳ trước)', () => getRealMetricsSummary(siteId, previous)))
  results.push(await time('overview · getLatestAuditRun', () => getLatestAuditRun(siteId)))
  results.push(await time('overview · getChannelSummaries  <- goi API SONG', () => getChannelSummaries(siteId, range)))
  results.push(
    await time('overview · getChannelDailySeriesByProvider', () =>
      getChannelDailySeriesByProvider(siteId, range),
    ),
  )

  return NextResponse.json({
    siteId,
    slowest: [...results]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 3)
      .map((r) => `${r.label}: ${r.ms}ms`),
    results,
  })
}
