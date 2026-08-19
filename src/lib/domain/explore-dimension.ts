/** Trang Khám phá trước đây LUÔN cố định một "hạng mục" cho mỗi nền tảng —
 * GA4 luôn theo Trang, Search Console luôn theo Truy vấn — dù cả hai API đã
 * trả sẵn nhiều cách phân rã khác (GA4: Kênh/Thiết bị; GSC: Trang/Quốc
 * gia/Thiết bị) trong CÙNG một lượt gọi (`fetchGa4Explore`/`fetchGscExplore`
 * đã fetch song song cả 3-4 breakdown). Chọn ở client (`report-builder.tsx`)
 * bằng `useState`, không gọi lại API — dữ liệu của mọi hạng mục đã có sẵn
 * trong `ExploreSource`. YouTube không có lựa chọn (chỉ một hạng mục "video"
 * có nghĩa), nên không cần kiểu dimension riêng. */
export const GA4_EXPLORE_DIMENSIONS = ['page', 'channel', 'device'] as const
export type Ga4ExploreDimension = (typeof GA4_EXPLORE_DIMENSIONS)[number]

export const GA4_EXPLORE_DIMENSION_LABELS: Readonly<Record<Ga4ExploreDimension, string>> = {
  page: 'Trang',
  channel: 'Kênh',
  device: 'Thiết bị',
}

export const DEFAULT_GA4_EXPLORE_DIMENSION: Ga4ExploreDimension = 'page'

export const GSC_EXPLORE_DIMENSIONS = ['query', 'page', 'country', 'device'] as const
export type GscExploreDimension = (typeof GSC_EXPLORE_DIMENSIONS)[number]

export const GSC_EXPLORE_DIMENSION_LABELS: Readonly<Record<GscExploreDimension, string>> = {
  query: 'Truy vấn',
  page: 'Trang',
  country: 'Quốc gia',
  device: 'Thiết bị',
}

export const DEFAULT_GSC_EXPLORE_DIMENSION: GscExploreDimension = 'query'
