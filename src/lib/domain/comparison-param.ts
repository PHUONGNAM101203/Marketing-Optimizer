import type { IsoDate } from '@/lib/metrics/types'

/**
 * So sánh hai khoảng ngày — ĐỘC LẬP hoàn toàn với bộ chọn khoảng ngày ở
 * topbar (`?range=`/`?from=`/`?to=`).
 *
 * Mô hình cũ: kỳ chính LÀ khoảng ngày ở topbar, người dùng chỉ chọn được kỳ
 * đem ra so (`?compareFrom=`/`?compareTo=`), và lựa chọn đó còn ghi đè luôn
 * `previousStart`/`previousEnd` nên kéo theo cả nhãn delta của mọi KPI khác
 * trên trang. Hệ quả: không thể so hai khoảng bất kỳ mà không đồng thời đổi
 * số liệu đang xem.
 *
 * Mô hình mới: bốn tham số, hai khoảng ngang hàng nhau. Topbar không còn dính
 * gì tới so sánh; `previousStart`/`previousEnd` quay về đúng nghĩa "kỳ liền
 * trước tự động" cho delta thông thường.
 */
export interface ComparisonRanges {
  /** Kỳ A — cột trái của bảng so sánh. */
  readonly a: { readonly start: IsoDate; readonly end: IsoDate }
  /** Kỳ B — cột phải, kỳ đem ra đối chiếu. */
  readonly b: { readonly start: IsoDate; readonly end: IsoDate }
}

export const COMPARISON_PARAM_KEYS = ['cmpAFrom', 'cmpATo', 'cmpBFrom', 'cmpBTo'] as const

export interface ComparisonSearchParams {
  readonly cmpAFrom?: string
  readonly cmpATo?: string
  readonly cmpBFrom?: string
  readonly cmpBTo?: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const parseOne = (
  from: string | undefined,
  to: string | undefined,
): { readonly start: IsoDate; readonly end: IsoDate } | null => {
  if (!from || !to || !ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) return null
  if (from > to) return null
  return { start: from, end: to }
}

/**
 * `null` khi THIẾU BẤT KỲ vế nào trong bốn — không có chuyện so sánh "một
 * nửa". Một URL chỉ có kỳ A mà không có kỳ B (link bị cắt, người dùng sửa tay
 * thanh địa chỉ) phải coi như tắt so sánh, chứ không được lặng lẽ tự bịa nốt
 * kỳ còn lại rồi hiện ra một bảng mà người xem tưởng là mình đã chọn.
 */
export const parseComparisonParams = (params: ComparisonSearchParams): ComparisonRanges | null => {
  const a = parseOne(params.cmpAFrom, params.cmpATo)
  const b = parseOne(params.cmpBFrom, params.cmpBTo)
  return a && b ? { a, b } : null
}
