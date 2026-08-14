/**
 * Hình dạng chung cho "top mọi thời gian" / "tăng nhanh" — dùng chung cho
 * TikTok (đọc từ `video_metrics_daily`) và YouTube (gọi thẳng Analytics
 * API), để trang chi tiết kênh render một component bất kể nguồn dữ liệu
 * bên dưới khác nhau (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 */
export interface VideoSummary {
  readonly externalVideoId: string
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly views: number
  readonly likes: number
  readonly comments: number
  /** `null` = không đọc được (khác 0 chia sẻ thật) — YouTube Analytics chưa
   * chắc luôn trả cột này, xem `YoutubeExplore.topVideos[].shares`. */
  readonly shares: number | null
}

export interface VideoGrowthSummary extends VideoSummary {
  readonly growthDelta: number
  /** `null` khi mốc so sánh có 0 lượt xem — không chia được cho 0 (trong
   * thực tế không xảy ra vì cả hai nguồn đều lọc theo `MIN_TRENDING_VIEWS`
   * trước khi tính, nhưng kiểu vẫn khai báo đúng khả năng lý thuyết). */
  readonly growthPct: number | null
}

/** Ba cửa sổ CỐ ĐỊNH cho "tăng nhanh" — độc lập với khoảng ngày trang đang
 * chọn (khác mọi số liệu khác trên trang), để UI tự chuyển đổi phía client
 * không cần gọi lại server. */
export interface VideoTrendingWindows {
  readonly week: readonly VideoGrowthSummary[]
  readonly month: readonly VideoGrowthSummary[]
  readonly year: readonly VideoGrowthSummary[]
}

export interface VideoTrendingResult {
  readonly topAllTime: readonly VideoSummary[]
  readonly trendingFast: VideoTrendingWindows
  /** Ngày (YYYY-MM-DD) sớm nhất có dữ liệu thật cho connection này — `null`
   * nếu chưa có dữ liệu nào. Dùng để phân biệt "chưa đủ lịch sử cho cửa sổ
   * X" (vd mới kết nối 3 ngày, cửa sổ tuần chưa đủ) với "thực sự không có
   * video nào tăng trưởng" — không nên suy đoán bằng cách so 3 mảng
   * week/month/year có giống hệt nhau không, vì trùng hợp thật vẫn có thể
   * xảy ra. So `earliestSnapshotAt` với từng `TRENDING_WINDOW_DAYS[key]`
   * để biết cửa sổ đó đã đủ dữ liệu chưa. */
  readonly earliestSnapshotAt: string | null
}

export const TRENDING_WINDOW_DAYS = { week: 7, month: 30, year: 365 } as const

/** Trần trên số video trả về trong `topAllTime` — UI chỉ cần top 10, giữ dư
 * một chút thay vì trả nguyên danh sách (TikTok có thể lên tới ~1000 video,
 * YouTube tới 200) để đỡ nặng payload mà không phải đổi hợp đồng lần nữa
 * nếu UI sau này cần top 20/30. */
export const MAX_TOP_ALL_TIME = 50

/** Video có dưới ngần này view ở đầu cửa sổ bị loại khỏi "tăng nhanh" — %
 * tăng của một video 2 view lên 20 view (900%) không có ý nghĩa, chỉ là
 * nhiễu do chia cho một số gần 0. */
export const MIN_TRENDING_VIEWS = 50
