/** Số hàng tối đa cho MỖI hạng mục (trang/truy vấn/video) trên trang Khám
 * phá — chọn ở client (`report-builder.tsx`), cắt trực tiếp từ dữ liệu đã
 * fetch sẵn tới 1000 dòng (`getExploreSource`), KHÔNG gọi lại API. Trước đây
 * mỗi provider tự hardcode `limit: 10` ngay trong lệnh gọi API, người dùng
 * không có cách nào xem nhiều hơn 10 hạng mục dù GA4/Search Console thật cho
 * phép tới hàng chục nghìn hàng một lượt gọi. */
export const EXPLORE_ROW_LIMITS = [10, 50, 100, 500, 1000] as const

export type ExploreRowLimit = (typeof EXPLORE_ROW_LIMITS)[number]

export const DEFAULT_EXPLORE_ROW_LIMIT: ExploreRowLimit = 10
