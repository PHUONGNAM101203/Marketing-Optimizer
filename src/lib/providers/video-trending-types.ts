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
}

export const TRENDING_WINDOW_DAYS = { week: 7, month: 30, year: 365 } as const

/** Video có dưới ngần này view ở đầu cửa sổ bị loại khỏi "tăng nhanh" — %
 * tăng của một video 2 view lên 20 view (900%) không có ý nghĩa, chỉ là
 * nhiễu do chia cho một số gần 0. */
export const MIN_TRENDING_VIEWS = 50
