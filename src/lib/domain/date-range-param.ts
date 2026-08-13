import type { IsoDate } from '@/lib/metrics/types'
import { isDateRangePreset, type DateRangePreset } from './site'

/** Đọc `?range=` từ URL, sập về mặc định nếu thiếu hoặc không hợp lệ — dùng
 * chung ở mọi trang có bộ lọc khoảng ngày, để không lặp lại logic validate. */
export const parseRangeParam = (value: string | undefined): DateRangePreset =>
  value && isDateRangePreset(value) ? value : 'last-28'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Đọc `?from=`/`?to=` — chỉ có ý nghĩa khi `range=custom`. Trả `null` nếu
 * thiếu một trong hai, sai định dạng, hoặc `from` sau `to` — mọi trường hợp
 * không hợp lệ đều coi như KHÔNG có khoảng tuỳ chỉnh, để nơi gọi tự sập về
 * preset mặc định thay vì render một khoảng ngày vô nghĩa. */
export const parseCustomRangeParams = (
  from: string | undefined,
  to: string | undefined,
): { readonly start: IsoDate; readonly end: IsoDate } | null => {
  if (!from || !to || !ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) return null
  if (from > to) return null
  return { start: from, end: to }
}
