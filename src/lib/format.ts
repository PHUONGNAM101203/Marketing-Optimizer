import { microsToUnits, type Micros } from './metrics/types'

/**
 * Định dạng số theo tiếng Việt.
 *
 * Tiếng Việt dùng dấu chấm phân nhóm nghìn và dấu phẩy thập phân — ngược hẳn
 * tiếng Anh. Gọi `toLocaleString()` không tham số sẽ lấy locale của trình duyệt,
 * nghĩa là hai người dùng nhìn thấy hai con số khác nhau cho cùng một dữ liệu.
 * Mọi con số hiển thị phải đi qua file này.
 */

const LOCALE = 'vi-VN'

/** Giá trị thiếu luôn hiện dấu gạch, không bao giờ hiện 0. */
export const EMPTY = '—'

export const formatNumber = (
  value: number | null,
  options: Intl.NumberFormatOptions = {},
): string =>
  value === null
    ? EMPTY
    : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, ...options }).format(
        value,
      )

/** Rút gọn cho tiêu đề và trục biểu đồ: 2.4Tr, 124,5N. */
export const formatCompact = (value: number | null): string => {
  if (value === null) return EMPTY

  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000)
    return `${formatNumber(value / 1_000_000_000, { maximumFractionDigits: 1 })} tỷ`
  if (absolute >= 1_000_000)
    return `${formatNumber(value / 1_000_000, { maximumFractionDigits: 1 })} tr`
  if (absolute >= 1_000)
    return `${formatNumber(value / 1_000, { maximumFractionDigits: 1 })} N`
  return formatNumber(value)
}

export const formatCurrency = (
  micros: Micros | null,
  currency: string,
  options: Intl.NumberFormatOptions = {},
): string =>
  micros === null
    ? EMPTY
    : new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency,
        maximumFractionDigits: currency === 'VND' ? 0 : 2,
        ...options,
      }).format(microsToUnits(micros))

/** Tiền rút gọn cho ô KPI, giữ ký hiệu tiền tệ. */
export const formatCurrencyCompact = (
  micros: Micros | null,
  currency: string,
): string => {
  if (micros === null) return EMPTY

  const units = microsToUnits(micros)
  const absolute = Math.abs(units)
  const symbol = currency === 'VND' ? '₫' : currency

  if (absolute >= 1_000_000_000)
    return `${formatNumber(units / 1_000_000_000, { maximumFractionDigits: 1 })} tỷ ${symbol}`
  if (absolute >= 1_000_000)
    return `${formatNumber(units / 1_000_000, { maximumFractionDigits: 1 })} tr ${symbol}`
  return formatCurrency(micros, currency)
}

/** Nhận tỉ lệ 0–1, hiện thành phần trăm. Không nhận sẵn 0–100. */
export const formatPercent = (ratio: number | null, fractionDigits = 1): string =>
  ratio === null
    ? EMPTY
    : new Intl.NumberFormat(LOCALE, {
        style: 'percent',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(ratio)

/** Delta luôn có dấu tường minh — "+2,4%" đọc rõ hơn "2,4%". */
export const formatDelta = (ratio: number | null, fractionDigits = 1): string => {
  if (ratio === null) return EMPTY
  const formatted = formatPercent(Math.abs(ratio), fractionDigits)
  if (ratio > 0) return `+${formatted}`
  if (ratio < 0) return `−${formatted}`
  return formatted
}

/** ROAS là bội số, không phải phần trăm: 3,4x. */
export const formatMultiplier = (value: number | null, fractionDigits = 1): string =>
  value === null
    ? EMPTY
    : `${new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value)}x`

export const formatDate = (
  isoDate: string | null,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' },
): string =>
  isoDate === null
    ? EMPTY
    : new Intl.DateTimeFormat(LOCALE, options).format(new Date(isoDate))

export const formatDateRange = (start: string, end: string): string =>
  `${formatDate(start)} – ${formatDate(end, { day: '2-digit', month: '2-digit', year: 'numeric' })}`

/** Ngày kèm GIỜ — dùng cho các mốc `timestamptz` mà giờ thật sự có ý nghĩa
 * (kế hoạch/mục ngân sách từ khi có DatePickerField + TimePickerField),
 * khác `formatDate` (chỉ ngày, dùng cho các mốc chỉ có ý nghĩa theo ngày). */
export const formatDateTime = (
  isoDateTime: string | null,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' },
): string =>
  isoDateTime === null ? EMPTY : new Intl.DateTimeFormat(LOCALE, options).format(new Date(isoDateTime))

const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/**
 * "2 giờ trước". Nhận `now` làm tham số thay vì gọi `Date.now()` bên trong —
 * hàm phụ thuộc đồng hồ hệ thống thì không test được, và trên Next.js còn gây
 * lệch giữa server và client khi hydrate.
 */
export const formatRelativeTime = (isoDate: string | null, now: Date): string => {
  if (isoDate === null) return EMPTY

  const elapsed = new Date(isoDate).getTime() - now.getTime()
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

  for (const [unit, milliseconds] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= milliseconds) {
      return formatter.format(Math.round(elapsed / milliseconds), unit)
    }
  }
  return formatter.format(Math.round(elapsed / 1000), 'second')
}
