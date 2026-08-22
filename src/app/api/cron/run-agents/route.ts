import { after, NextResponse, type NextRequest } from 'next/server'
import { alreadyRanThisWindow, isAgentDue } from '@/lib/sync/agent-schedule'
import { siteLocalParts } from '@/lib/sync/site-local-time'
import { runAgent } from '@/lib/agents/run-agent'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'
import type { AgentSchedule } from '@/lib/domain/agent'

/**
 * Dispatch agent tới hạn, MỖI GIỜ (xem `vercel.json`).
 *
 * Trước đây việc này nằm chung trong `cron/sync-hourly`. Tách ra vì hai lý do
 * cụ thể, không phải để cho gọn:
 *
 * 1. Chung route nghĩa là chung `maxDuration`. Vòng lặp đồng bộ connection ăn
 *    trước một phần ngân sách thời gian, phần còn lại mới tới agent — nên
 *    phải chặn cứng ở 15 agent/lượt để invocation không bị Vercel giết giữa
 *    chừng. Site nào có nhiều hơn 15 agent due cùng lúc thì phần thừa bị đẩy
 *    sang giờ sau, giờ sau lại đụng đúng trần đó. Có route riêng thì agent
 *    được trọn 800s của chính nó.
 * 2. Đồng bộ hỏng (API Google sập, token hết hạn hàng loạt) không còn kéo
 *    theo việc agent không được dispatch.
 *
 * Lịch lệch 20 phút so với `sync-hourly` để agent luôn đọc được số liệu vừa
 * đồng bộ xong của cùng giờ đó, thay vì số liệu của giờ trước.
 */
export const maxDuration = 800

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  const { data: agents } = await admin
    .from('agents')
    .select('id, site_id, schedule, last_run_at')
    .eq('enabled', true)
    .not('schedule', 'is', null)

  const siteIds = [...new Set((agents ?? []).map((agent) => agent.site_id))]
  const { data: sites } =
    siteIds.length > 0
      ? await admin.from('sites').select('id, timezone').in('id', siteIds)
      : { data: [] as { id: string; timezone: string }[] }
  const timezoneBySiteId = new Map((sites ?? []).map((site) => [site.id, site.timezone]))

  let agentsScheduled = 0

  for (const agent of agents ?? []) {
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

  return NextResponse.json({ agentsScheduled, candidates: (agents ?? []).length })
}
