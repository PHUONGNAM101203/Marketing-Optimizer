import 'server-only'

export interface SiteLocalParts {
  readonly hour: number
  /** 0 = Chủ nhật .. 6 = Thứ Bảy, cùng quy ước với `Date.getUTCDay()`. */
  readonly dayOfWeek: number
  readonly dayOfMonth: number
  /** 'YYYY-MM-DD' theo múi giờ site — dùng để dedup theo "ngày" đúng nghĩa
   * site nhìn thấy, không phải ngày UTC của server chạy cron. */
  readonly dateKey: string
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/**
 * Giờ/thứ/ngày HIỆN TẠI theo múi giờ của Site — dùng để so khớp
 * `AgentSchedule.hourOfDay`/`dayOfWeek` (cả hai định nghĩa "theo timezone của
 * Site", xem `lib/domain/agent.ts`) với thời điểm cron đang chạy (luôn ở UTC
 * trên Vercel). Dùng `Intl.DateTimeFormat` thay vì thư viện ngoài — runtime
 * Node trên Vercel có sẵn đầy đủ dữ liệu ICU.
 */
export const siteLocalParts = (timezone: string, at: Date): SiteLocalParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(at)

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? ''

  // Một số ICU trả "24" cho nửa đêm khi hour12:false thay vì "00" — chia dư
  // 24 để luôn ra khoảng 0-23.
  const hour = Number(get('hour')) % 24
  const weekday = get('weekday')
  const day = get('day')
  const month = get('month')
  const year = get('year')

  return {
    hour,
    dayOfWeek: WEEKDAY_INDEX[weekday] ?? at.getUTCDay(),
    dayOfMonth: Number(day),
    dateKey: `${year}-${month}-${day}`,
  }
}
