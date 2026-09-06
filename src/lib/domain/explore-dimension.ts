/** Trang Khám phá trước đây LUÔN cố định một "hạng mục" cho mỗi nền tảng —
 * GA4 luôn theo Trang, Search Console luôn theo Truy vấn — dù cả hai API đã
 * trả sẵn nhiều cách phân rã khác (GA4: Kênh/Thiết bị; GSC: Trang/Quốc
 * gia/Thiết bị) trong CÙNG một lượt gọi (`fetchGa4Explore`/`fetchGscExplore`
 * đã fetch song song cả 3-4 breakdown). Chọn ở client (`report-builder.tsx`)
 * bằng `useState`, không gọi lại API — dữ liệu của mọi hạng mục đã có sẵn
 * trong `ExploreSource`. YouTube không có lựa chọn (chỉ một hạng mục "video"
 * có nghĩa), nên không cần kiểu dimension riêng. */
export const GA4_EXPLORE_DIMENSIONS = ['page', 'channel', 'device', 'country'] as const
export type Ga4ExploreDimension = (typeof GA4_EXPLORE_DIMENSIONS)[number]

export const GA4_EXPLORE_DIMENSION_LABELS: Readonly<Record<Ga4ExploreDimension, string>> = {
  page: 'Trang',
  channel: 'Kênh',
  device: 'Thiết bị',
  country: 'Quốc gia',
}

export const DEFAULT_GA4_EXPLORE_DIMENSION: Ga4ExploreDimension = 'page'

/**
 * Chiều phân rã cho phần bấm-để-xem-chi tiết ở tab "Chi tiết" của GA4 — SIÊU
 * TẬP của danh sách trên, thêm `eventName`.
 *
 * Vì sao là siêu tập chứ không phải cùng một danh sách: trang Khám phá đọc dữ
 * liệu ĐÃ LẤY SẴN (`fetchGa4Explore` gọi trước bốn breakdown trong một lượt),
 * nên thêm một chiều ở đó nghĩa là thêm một lượt gọi API cho MỌI lần tải trang,
 * kể cả khi không ai bấm vào. Phần chi tiết thì gọi GA4 ĐÚNG LÚC người dùng
 * bấm, nên thêm chiều ở đây không tốn gì cho người không dùng tới.
 *
 * `eventName` là thứ trả lời được câu hỏi thật của người quản lý: trong tổng số
 * sự kiện quan trọng, bao nhiêu là `purchase`, bao nhiêu là `add_to_cart`,
 * `begin_checkout` — tức đúng những mục tiêu họ tự đặt trong GA4.
 */
export const GA4_BREAKDOWN_DIMENSIONS = [...GA4_EXPLORE_DIMENSIONS, 'eventName'] as const
export type Ga4BreakdownDimension = (typeof GA4_BREAKDOWN_DIMENSIONS)[number]

export const GA4_BREAKDOWN_DIMENSION_LABELS: Readonly<Record<Ga4BreakdownDimension, string>> = {
  ...GA4_EXPLORE_DIMENSION_LABELS,
  eventName: 'Tên sự kiện',
}

export const GSC_EXPLORE_DIMENSIONS = ['query', 'page', 'country', 'device'] as const
export type GscExploreDimension = (typeof GSC_EXPLORE_DIMENSIONS)[number]

export const GSC_EXPLORE_DIMENSION_LABELS: Readonly<Record<GscExploreDimension, string>> = {
  query: 'Truy vấn',
  page: 'Trang',
  country: 'Quốc gia',
  device: 'Thiết bị',
}

export const DEFAULT_GSC_EXPLORE_DIMENSION: GscExploreDimension = 'query'
