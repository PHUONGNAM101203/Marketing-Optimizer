import type { AgentSchedule } from '@/lib/domain/agent'
import { siteLocalParts, type SiteLocalParts } from './site-local-time'

/**
 * Logic "agent này đã tới hạn chạy chưa" — tách riêng khỏi route cron vì cả
 * `cron/run-agents` lẫn bất kỳ lối chạy thủ công nào về sau đều cần đúng một
 * định nghĩa, không được có hai bản lệch nhau.
 */

export const isAgentDue = (schedule: AgentSchedule, local: SiteLocalParts): boolean => {
  if (schedule.cadence === 'hourly') return true
  if (local.hour !== schedule.hourOfDay) return false
  if (schedule.cadence === 'daily') return true
  if (schedule.cadence === 'weekly') return schedule.dayOfWeek === local.dayOfWeek
  return local.dayOfMonth === 1 // monthly
}

/** Số ngày tuyệt đối kể từ epoch, suy từ 'YYYY-MM-DD' local — thủ thuật
 * floor-division để gom tuần, tính trên NGÀY LOCAL của site thay vì ngày UTC
 * của server. */
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
export const alreadyRanThisWindow = (
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
      Math.floor(localDayNumber(lastLocal.dateKey) / 7) ===
      Math.floor(localDayNumber(nowLocal.dateKey) / 7)
    )
  }
  return lastLocal.dateKey.slice(0, 7) === nowLocal.dateKey.slice(0, 7) // monthly: cùng 'YYYY-MM'
}
