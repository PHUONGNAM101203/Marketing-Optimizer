import type { IsoDate, DateRange } from '@/lib/metrics/types'
import type { DateRangePreset, ResolvedDateRange } from '@/lib/domain/site'

/**
 * Ngày tham chiếu cố định cho toàn bộ dữ liệu mẫu.
 *
 * Neo vào một ngày cụ thể thay vì `new Date()` để mọi ảnh chụp, mọi test và mọi
 * lần render đều ra cùng một kết quả. Khi nối dữ liệu thật ở M4, chỉ file này
 * bị xoá — component không đổi dòng nào.
 */
export const MOCK_TODAY = new Date('2026-08-12T09:30:00Z')

export const toIsoDate = (date: Date): IsoDate =>
  date.toISOString().slice(0, 10) as IsoDate

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export const daysBetween = (range: DateRange): number => {
  const start = new Date(range.start).getTime()
  const end = new Date(range.end).getTime()
  return Math.round((end - start) / 86_400_000) + 1
}

/** Dãy ngày liên tục, bao gồm cả hai đầu mút. */
export const dateSequence = (range: DateRange): readonly IsoDate[] => {
  const total = daysBetween(range)
  const start = new Date(range.start)
  return Array.from({ length: total }, (_unused, index) =>
    toIsoDate(addDays(start, index)),
  )
}

const PRESET_LENGTHS: Readonly<Partial<Record<DateRangePreset, number>>> = {
  'last-7': 7,
  'last-28': 28,
  'last-30': 30,
  'last-90': 90,
}

/**
 * Giải preset thành khoảng ngày cụ thể kèm kỳ so sánh.
 * Kỳ trước LUÔN cùng độ dài và liền kề — so 30 ngày với 28 ngày là so sai.
 *
 * `custom` cần `customRange` (từ `parseCustomRangeParams`, `?from=`/`?to=`)
 * — thiếu nó (bookmark cũ, gõ tay URL) thì SẬP VỀ `last-28` như trước khi có
 * tuỳ chọn này, không render một khoảng ngày trống nghĩa.
 */
/** `compareRange`: kỳ so sánh người dùng TỰ CHỌN (từ `?compareFrom=`/
 * `?compareTo=`), ghi đè lên kỳ liền-trước-tự-động — áp dụng cho MỌI preset,
 * không chỉ `custom`. Đặt sau khi hàm bên trong đã tính xong kỳ chính + kỳ
 * trước mặc định, để không phải lặp lại logic ghi đè ở từng nhánh preset. */
export const resolveDateRange = (
  preset: DateRangePreset,
  today: Date = MOCK_TODAY,
  customRange?: { readonly start: IsoDate; readonly end: IsoDate },
  compareRange?: { readonly start: IsoDate; readonly end: IsoDate },
): ResolvedDateRange => {
  const base = resolveDateRangeWithoutCompare(preset, today, customRange)
  if (!compareRange) return { ...base, isCustomCompare: false }
  return {
    ...base,
    previousStart: compareRange.start,
    previousEnd: compareRange.end,
    isCustomCompare: true,
  }
}

const resolveDateRangeWithoutCompare = (
  preset: DateRangePreset,
  today: Date,
  customRange?: { readonly start: IsoDate; readonly end: IsoDate },
): Omit<ResolvedDateRange, 'isCustomCompare'> => {
  if (preset === 'custom' && customRange) {
    const start = new Date(customRange.start)
    const length = daysBetween(customRange)
    return {
      preset,
      start: customRange.start,
      end: customRange.end,
      previousStart: toIsoDate(addDays(start, -length)),
      previousEnd: toIsoDate(addDays(start, -1)),
    }
  }

  // "Hôm nay" là ngoại lệ có chủ đích — người dùng chọn preset này chính là
  // để xem phần dữ liệu ĐANG tích luỹ trong ngày, biết là chưa đầy đủ.
  if (preset === 'today') {
    return {
      preset,
      start: toIsoDate(today),
      end: toIsoDate(today),
      previousStart: toIsoDate(addDays(today, -1)),
      previousEnd: toIsoDate(addDays(today, -1)),
    }
  }

  // Dữ liệu hôm nay chưa đủ ở mọi nền tảng, nên kỳ kết thúc ở hôm qua.
  const end = addDays(today, -1)

  if (preset === 'this-month') {
    const start = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1),
    )
    const length = daysBetween({ start: toIsoDate(start), end: toIsoDate(end) })
    return {
      preset,
      start: toIsoDate(start),
      end: toIsoDate(end),
      previousStart: toIsoDate(addDays(start, -length)),
      previousEnd: toIsoDate(addDays(start, -1)),
    }
  }

  if (preset === 'last-month') {
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
    const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0))
    const length = daysBetween({
      start: toIsoDate(start),
      end: toIsoDate(monthEnd),
    })
    return {
      preset,
      start: toIsoDate(start),
      end: toIsoDate(monthEnd),
      previousStart: toIsoDate(addDays(start, -length)),
      previousEnd: toIsoDate(addDays(start, -1)),
    }
  }

  const length = PRESET_LENGTHS[preset] ?? 28
  const start = addDays(end, -(length - 1))

  return {
    preset,
    start: toIsoDate(start),
    end: toIsoDate(end),
    previousStart: toIsoDate(addDays(start, -length)),
    previousEnd: toIsoDate(addDays(start, -1)),
  }
}

/** 0 = Chủ nhật, khớp với quy ước của `Date.getUTCDay()`. */
export const dayOfWeekOf = (isoDate: IsoDate): number =>
  new Date(isoDate).getUTCDay()

/** Số ngày từ mốc gốc tới một ngày — dùng để cắt lát chuỗi liên tục. */
export const daysSince = (origin: IsoDate, date: IsoDate): number =>
  Math.round((new Date(date).getTime() - new Date(origin).getTime()) / 86_400_000)
