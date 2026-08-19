/** Số hàng tối đa cho MỖI hạng mục (trang/truy vấn/video) trên trang Khám
 * phá — đọc từ `?rowLimit=` giống hệt cách `date-range-param.ts` đọc
 * `?range=`. Trước đây mỗi provider tự hardcode `limit: 10` ngay trong lệnh
 * gọi API, người dùng không có cách nào xem nhiều hơn 10 hạng mục dù GA4/
 * Search Console thật cho phép tới hàng chục nghìn hàng một lượt gọi. */
export const EXPLORE_ROW_LIMITS = [10, 50, 100, 500, 1000] as const

export type ExploreRowLimit = (typeof EXPLORE_ROW_LIMITS)[number]

export const DEFAULT_EXPLORE_ROW_LIMIT: ExploreRowLimit = 10

export const parseExploreRowLimitParam = (value: string | undefined): ExploreRowLimit => {
  const parsed = Number(value)
  return (EXPLORE_ROW_LIMITS as readonly number[]).includes(parsed)
    ? (parsed as ExploreRowLimit)
    : DEFAULT_EXPLORE_ROW_LIMIT
}
