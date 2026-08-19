/** Trang Khám phá trước đây LUÔN cố định một "hạng mục" cho mỗi nền tảng —
 * GA4 luôn theo Trang, Search Console luôn theo Truy vấn — dù cả hai API đã
 * trả sẵn nhiều cách phân rã khác (GA4: Kênh/Thiết bị; GSC: Trang/Quốc
 * gia/Thiết bị) trong CÙNG một lượt gọi (`fetchGa4Explore`/`fetchGscExplore`
 * đã fetch song song cả 3-4 breakdown, chỉ site-explore.ts từng chọn cứng
 * một cái). Cho người dùng tự chọn hạng mục nào muốn xem — không cần gọi
 * thêm API nào cả, dữ liệu đã có sẵn. YouTube không có lựa chọn (chỉ một
 * hạng mục "video" có nghĩa), nên không cần dimension param riêng. */
export const GA4_EXPLORE_DIMENSIONS = ['page', 'channel', 'device'] as const
export type Ga4ExploreDimension = (typeof GA4_EXPLORE_DIMENSIONS)[number]

export const GA4_EXPLORE_DIMENSION_LABELS: Readonly<Record<Ga4ExploreDimension, string>> = {
  page: 'Trang',
  channel: 'Kênh',
  device: 'Thiết bị',
}

export const DEFAULT_GA4_EXPLORE_DIMENSION: Ga4ExploreDimension = 'page'

export const parseGa4ExploreDimensionParam = (value: string | undefined): Ga4ExploreDimension =>
  (GA4_EXPLORE_DIMENSIONS as readonly string[]).includes(value ?? '')
    ? (value as Ga4ExploreDimension)
    : DEFAULT_GA4_EXPLORE_DIMENSION

export const GSC_EXPLORE_DIMENSIONS = ['query', 'page', 'country', 'device'] as const
export type GscExploreDimension = (typeof GSC_EXPLORE_DIMENSIONS)[number]

export const GSC_EXPLORE_DIMENSION_LABELS: Readonly<Record<GscExploreDimension, string>> = {
  query: 'Truy vấn',
  page: 'Trang',
  country: 'Quốc gia',
  device: 'Thiết bị',
}

export const DEFAULT_GSC_EXPLORE_DIMENSION: GscExploreDimension = 'query'

export const parseGscExploreDimensionParam = (value: string | undefined): GscExploreDimension =>
  (GSC_EXPLORE_DIMENSIONS as readonly string[]).includes(value ?? '')
    ? (value as GscExploreDimension)
    : DEFAULT_GSC_EXPLORE_DIMENSION
