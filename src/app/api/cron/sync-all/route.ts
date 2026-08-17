import { after, NextResponse, type NextRequest } from 'next/server'
import { METRICS_ADAPTERS } from '@/lib/providers'
import { syncConnection } from '@/lib/sync/sync-connection'
import { runAgent } from '@/lib/agents/run-agent'
import { createAdminClient } from '@/lib/supabase/admin'
import { cronEnv } from '@/lib/supabase/env'
import type { AgentSchedule } from '@/lib/domain/agent'

/**
 * Đồng bộ tự động, chạy theo lịch (xem `vercel.json`) — không cần bấm "Đồng
 * bộ lại" thủ công thì số liệu vẫn mới trong vòng một giờ.
 *
 * Vercel tự thêm header `Authorization: Bearer $CRON_SECRET` cho request từ
 * Cron Job khi biến môi trường CRON_SECRET tồn tại — so khớp ở đây để chặn
 * ai đó gọi thẳng route này từ bên ngoài, chạy đồng bộ tốn quota mà không
 * qua lịch đã định.
 */
export const maxDuration = 300

/**
 * Trần số agent được giao cho `after()` trong MỘT lần cron — hằng số nhỏ vì
 * đây là cron 1 lần/ngày dùng chung với sync connection, không phải hàng đợi
 * riêng cho agent (xem Global Constraints: không thêm cron thứ hai). Agent
 * due nhưng vượt trần chỉ trễ tới lượt cron kế, không mất.
 */
const MAX_AGENTS_PER_CRON_RUN = 15

/**
 * "Tuần lịch" của một mốc thời gian, theo UTC — số nguyên tăng đều mỗi 7 ngày
 * kể từ epoch Unix. Chỉ dùng ngày (bỏ giờ:phút:giây) rồi chia nguyên cho 7
 * ngày: `floor(a/T) - floor(b/T) = (a-b)/T` mỗi khi `a-b` là bội số nguyên
 * của `T` (tính chất của phép chia sàn) — mà agent nhịp tuần LUÔN due đúng
 * một `dayOfWeek` cố định, nên hai lần due liên tiếp cách nhau đúng bội số
 * của 7 ngày theo lịch. Vì vậy so sánh "cùng tuần lịch" bằng cách này luôn
 * đúng bất kể epoch Unix rơi vào thứ mấy — không cần công thức tuần ISO
 * (Thursday-of-the-week) phức tạp hơn cho đúng bài toán này.
 *
 * LƯU Ý PHỤ THUỘC LỊCH CRON: bucket này tính từ `last_run_at` — một mốc HOÀN
 * TẤT run, không phải mốc ĐẾN HẠN. Cách này chỉ đúng chừng nào lượt hoàn tất
 * không bao giờ vắt qua ranh giới nửa đêm UTC so với ngày-trong-tuần đến hạn
 * của nó — đúng ở lịch hiện tại vì cron chạy ở một giờ UTC cố định vào buổi
 * chiều-tối (xem `vercel.json`) và hoàn tất từ lâu trước nửa đêm. Nếu sau này
 * đổi giờ chạy cron sát nửa đêm UTC, phải xem lại (neo bucket theo NGÀY ĐẾN
 * HẠN thay vì ngày hoàn tất — cần thêm cột lưu thời điểm dispatch riêng biệt
 * với thời điểm hoàn tất, ngoài phạm vi sửa lỗi tối thiểu này).
 */
const weekBucket = (date: Date): number => {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.floor(utcMidnight / (7 * 24 * 60 * 60 * 1000))
}

/**
 * Dedup: bỏ qua agent đã chạy (thành công/thất bại/chờ duyệt — bất kỳ nhánh
 * kết thúc nào, xem `setAgentLastRunAt` trong `run-agent.ts`) trong đúng cửa
 * sổ của nhịp hiện tại. Chặn được hai trường hợp: Vercel retry nguyên
 * invocation cron sau lỗi (agent đã chạy ở lượt trước đó không bị chạy lại
 * từ đầu), và agent tự due hai lần nếu logic `isDue` phía trên có kẽ hở nào
 * đó. KHÔNG phải reaper cho run bị kẹt `status='running'` mãi mãi (run đó
 * chưa từng tới `setAgentLastRunAt`) — đó là vấn đề khác, cố tình để ngoài
 * phạm vi sửa lỗi tối thiểu này.
 */
const alreadyRanThisWindow = (
  cadence: AgentSchedule['cadence'],
  lastRunAt: string | null,
  now: Date,
): boolean => {
  if (!lastRunAt) return false
  const last = new Date(lastRunAt)

  if (cadence === 'daily') {
    return (
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate()
    )
  }

  if (cadence === 'weekly') {
    // So theo TUẦN LỊCH (xem `weekBucket` ở trên), không phải mốc "cách nhau
    // dưới 7*24h" như trước — `last_run_at` được ghi ở lúc `runAgent` HOÀN
    // TẤT (sau `finishRun`/`setAgentLastRunAt`, có thể vài lượt gọi Claude
    // sau khi round đầu bắt đầu), còn cron lại chạy ở một GIỜ CỐ ĐỊNH mỗi
    // ngày (`vercel.json`) — nên lần due tuần kế luôn rơi vào đúng dưới
    // 7*24h kể từ lúc hoàn tất lần trước, khiến so bằng mili-giây rơi luôn
    // vào "đã chạy trong cửa sổ này" một cách sai, và agent chỉ thực chạy
    // được mỗi TUẦN THỨ HAI. So theo tuần lịch không phụ thuộc độ trễ hoàn
    // tất run — chỉ cần khác tuần lịch là due lại, đúng bài toán "một
    // lần/tuần" thay vì "một lần/hơn-7-ngày".
    return weekBucket(last) === weekBucket(now)
  }

  if (cadence === 'monthly') {
    return last.getUTCFullYear() === now.getUTCFullYear() && last.getUTCMonth() === now.getUTCMonth()
  }

  // 'hourly': không bao giờ vào tới đây vì `isDue` ở trên đã luôn false cho
  // nhịp này (xem Global Constraints) — nhánh này chỉ để switch đủ kiểu.
  return false
}

export async function GET(request: NextRequest) {
  const { CRON_SECRET } = cronEnv()
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  // Đủ sớm hơn 1 giờ một chút để lịch chạy có trễ vài phút cũng không bỏ sót.
  const staleBefore = new Date(Date.now() - 55 * 60 * 1000).toISOString()

  const { data: connections } = await admin
    .from('connections')
    .select('id')
    .in('provider', Object.keys(METRICS_ADAPTERS))
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

  // Lập lịch agent: chỉ hỗ trợ daily/weekly/monthly qua cron 1 lần/ngày.
  // 'hourly' không khả thi với lịch này (xem Global Constraints).
  const today = new Date()
  const todayDayOfWeek = today.getUTCDay()

  const { data: dueAgents } = await admin
    .from('agents')
    .select('id, schedule, last_run_at')
    .eq('enabled', true)
    .not('schedule', 'is', null)

  let agentsScheduled = 0

  for (const agent of dueAgents ?? []) {
    // Chặn ngay khi chạm trần — agent còn lại due ở lượt này sẽ due lại đúng
    // ở lần cron kế tiếp (chỉ trễ, không mất), thay vì bung `after()` không
    // giới hạn khiến vòng lặp đồng bộ connection ở trên (đã tiêu một phần
    // `maxDuration`=300s) làm invocation bị Vercel giết giữa chừng.
    if (agentsScheduled >= MAX_AGENTS_PER_CRON_RUN) break

    const schedule = agent.schedule as unknown as AgentSchedule
    const isDue =
      schedule.cadence === 'daily' ||
      (schedule.cadence === 'weekly' && schedule.dayOfWeek === todayDayOfWeek) ||
      (schedule.cadence === 'monthly' && today.getUTCDate() === 1)

    if (!isDue) continue
    if (alreadyRanThisWindow(schedule.cadence, agent.last_run_at, today)) continue

    // Không await tuần tự từng agent — mỗi agent có thể mất nhiều lượt gọi
    // Claude, giữ cron chờ hết tất cả sẽ dễ chạm timeout của chính cron route.
    after(() => runAgent(agent.id, 'schedule'))
    agentsScheduled += 1
  }

  return NextResponse.json({ synced, failed, total: (connections ?? []).length, agentsScheduled })
}
