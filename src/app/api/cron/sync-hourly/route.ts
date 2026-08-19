import { after, NextResponse, type NextRequest } from 'next/server'
import { METRICS_ADAPTERS } from '@/lib/providers'
import { syncConnection } from '@/lib/sync/sync-connection'
import { LOW_FREQUENCY_PROVIDERS } from '@/lib/sync/cron-providers'
import { siteLocalParts, type SiteLocalParts } from '@/lib/sync/site-local-time'
import { runAgent } from '@/lib/agents/run-agent'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'
import type { AgentSchedule } from '@/lib/domain/agent'
import type { ProviderId } from '@/lib/domain/providers'

/**
 * Đồng bộ + dispatch agent chạy MỖI GIỜ (xem `vercel.json`) — trên Vercel Pro
 * không còn giới hạn 1 cron job/ngày của Hobby nữa. Đảm nhận:
 * 1. Đồng bộ các connection thuộc nhóm "cần dữ liệu tươi" (mọi provider TRỪ
 *    `LOW_FREQUENCY_PROVIDERS` — nhóm đó đồng bộ ở `cron/sync-daily` thay vì
 *    ở đây).
 * 2. Dispatch TẤT CẢ agent đến hạn — kể cả nhịp 'daily'/'weekly'/'monthly',
 *    không chỉ 'hourly'. Cron tick mỗi giờ nên daily/weekly/monthly giờ có
 *    thể honor đúng `hourOfDay` (theo múi giờ Site) thay vì luôn chạy ở một
 *    giờ UTC cố định của server bất kể người dùng chọn gì — xem `isAgentDue`.
 */
export const maxDuration = 300

const MAX_AGENTS_PER_CRON_RUN = 15

const isAgentDue = (schedule: AgentSchedule, local: SiteLocalParts): boolean => {
  if (schedule.cadence === 'hourly') return true
  if (local.hour !== schedule.hourOfDay) return false
  if (schedule.cadence === 'daily') return true
  if (schedule.cadence === 'weekly') return schedule.dayOfWeek === local.dayOfWeek
  return local.dayOfMonth === 1 // monthly
}

/** Số ngày tuyệt đối kể từ epoch, suy từ 'YYYY-MM-DD' local — cùng thủ thuật
 * floor-division như `weekBucket` ở bản cron cũ, chỉ khác là tính trên NGÀY
 * LOCAL của site thay vì ngày UTC của server. */
const localDayNumber = (dateKey: string): number => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000))
}

/**
 * Dedup: bỏ qua agent đã chạy trong đúng cửa sổ của nhịp hiện tại — chặn
 * Vercel retry nguyên invocation cron chạy lại agent đã xong, và chặn agent
 * due hai lần nếu `isAgentDue` có kẽ hở nào đó (vd. hai site cùng cấu hình
 * giờ nhưng khác múi giờ trùng giờ UTC).
 */
const alreadyRanThisWindow = (
  schedule: AgentSchedule,
  lastRunAt: string | null,
  now: Date,
  timezone: string,
): boolean => {
  if (!lastRunAt) return false
  const last = new Date(lastRunAt)

  if (schedule.cadence === 'hourly') {
    const hourBucket = (d: Date) => Math.floor(d.getTime() / (60 * 60 * 1000))
    return hourBucket(last) === hourBucket(now)
  }

  const lastLocal = siteLocalParts(timezone, last)
  const nowLocal = siteLocalParts(timezone, now)

  if (schedule.cadence === 'daily') return lastLocal.dateKey === nowLocal.dateKey
  if (schedule.cadence === 'weekly') {
    return (
      Math.floor(localDayNumber(lastLocal.dateKey) / 7) === Math.floor(localDayNumber(nowLocal.dateKey) / 7)
    )
  }
  return lastLocal.dateKey.slice(0, 7) === nowLocal.dateKey.slice(0, 7) // monthly: cùng 'YYYY-MM'
}

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  // Đủ sớm hơn 1 giờ một chút để lịch chạy có trễ vài phút cũng không bỏ sót.
  const staleBefore = new Date(now.getTime() - 55 * 60 * 1000).toISOString()

  const hourlyProviders = Object.keys(METRICS_ADAPTERS).filter(
    (provider) => !LOW_FREQUENCY_PROVIDERS.has(provider as ProviderId),
  )

  const { data: connections } = await admin
    .from('connections')
    .select('id')
    .in('provider', hourlyProviders)
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleBefore}`)

  let synced = 0
  let failed = 0

  // Tuần tự, không Promise.all — hạn chế số request đồng thời gửi tới API
  // Google trong một lượt cron, tránh chạm rate limit của chính Google.
  for (const connection of connections ?? []) {
    const result = await syncConnection(connection.id)
    if (result.ok) synced += 1
    else failed += 1
  }

  const { data: dueAgents } = await admin
    .from('agents')
    .select('id, site_id, schedule, last_run_at')
    .eq('enabled', true)
    .not('schedule', 'is', null)

  const siteIds = [...new Set((dueAgents ?? []).map((agent) => agent.site_id))]
  const { data: sites } =
    siteIds.length > 0
      ? await admin.from('sites').select('id, timezone').in('id', siteIds)
      : { data: [] as { id: string; timezone: string }[] }
  const timezoneBySiteId = new Map((sites ?? []).map((site) => [site.id, site.timezone]))

  let agentsScheduled = 0

  for (const agent of dueAgents ?? []) {
    // Chặn ngay khi chạm trần — agent còn lại due ở lượt này sẽ due lại đúng
    // ở lần cron kế tiếp (chỉ trễ 1 giờ, không mất), thay vì bung `after()`
    // không giới hạn khiến vòng lặp đồng bộ connection ở trên (đã tiêu một
    // phần `maxDuration`=300s) làm invocation bị Vercel giết giữa chừng.
    if (agentsScheduled >= MAX_AGENTS_PER_CRON_RUN) break

    const timezone = timezoneBySiteId.get(agent.site_id)
    if (!timezone) continue // site đã bị xoá hoặc quan hệ lỗi — bỏ qua an toàn thay vì throw

    const schedule = agent.schedule as unknown as AgentSchedule
    const local = siteLocalParts(timezone, now)

    if (!isAgentDue(schedule, local)) continue
    if (alreadyRanThisWindow(schedule, agent.last_run_at, now, timezone)) continue

    // Không await tuần tự từng agent — mỗi agent có thể mất nhiều lượt gọi
    // Claude, giữ cron chờ hết tất cả sẽ dễ chạm timeout của chính cron route.
    after(() =>
      runAgent(agent.id, 'schedule').catch((error) => {
        console.error(
          `Không chạy được agent ${agent.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }),
    )
    agentsScheduled += 1
  }

  return NextResponse.json({
    synced,
    failed,
    total: (connections ?? []).length,
    agentsScheduled,
  })
}
