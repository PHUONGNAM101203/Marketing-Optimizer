export { TRENDING_WINDOW_DAYS, MAX_TOP_ALL_TIME, hasEnoughHistory } from './video-trending-types'

/**
 * Hình dạng "top mọi thời gian" / "tăng nhanh" cho Facebook/Instagram — SONG
 * SONG với `VideoSummary`/`VideoTrendingResult` (`video-trending-types.ts`),
 * KHÔNG tái dùng chung type — hai nền tảng này thiếu hẳn "views" (không có
 * field impressions ổn định nào không cần `read_insights`, quyền đang tạm bỏ
 * khỏi OAuth scope, xem `src/lib/providers/meta.ts`) nên xếp hạng theo TỔNG
 * ENGAGEMENT (likes/reactions + comments + shares) thay vì views — ép chung
 * một type với TikTok/YouTube sẽ phải giả vờ "views" nghĩa là gì đó khác,
 * dễ gây nhầm lẫn hơn là tách hẳn. Dùng chung `TRENDING_WINDOW_DAYS`/
 * `hasEnoughHistory`/`MAX_TOP_ALL_TIME` (re-export ở trên) vì phần đó THẬT SỰ
 * platform-agnostic (chỉ tính ngày/lịch sử, không đụng đến metric).
 */
export interface ContentSummary {
  readonly externalPostId: string
  readonly title: string
  /** `full_picture` (facebook) / `media_url` (instagram) — có sẵn miễn phí
   * trong cùng response đang gọi để lấy bài đăng, không tốn thêm request.
   * `null` nếu bài đăng không có ảnh/media (vd. cập nhật chỉ có chữ trên
   * Facebook Page — xảy ra thường xuyên, khác TikTok/YouTube luôn có media). */
  readonly thumbnailUrl: string | null
  /** Facebook: tổng reactions. Instagram: like_count. */
  readonly likes: number
  readonly comments: number
  /** `null` cho Instagram — Graph API không lộ field chia sẻ cho media, khác
   * 0 chia sẻ thật (Facebook luôn là số thật, kể cả 0). */
  readonly shares: number | null
  /** Link xem bài gốc — `permalink_url` (facebook) / `permalink` (instagram). */
  readonly permalinkUrl: string | null
  readonly createdAt: string | null
}

export interface ContentGrowthSummary extends ContentSummary {
  /** Delta của TỔNG ENGAGEMENT (likes+comments+shares, shares=0 nếu null),
   * không phải delta của một con số đơn lẻ như `views` bên TikTok/YouTube. */
  readonly growthDelta: number
  readonly growthPct: number | null
}

export interface ContentTrendingWindows {
  readonly week: readonly ContentGrowthSummary[]
  readonly month: readonly ContentGrowthSummary[]
  readonly year: readonly ContentGrowthSummary[]
}

export interface ContentTrendingResult {
  readonly topAllTime: readonly ContentSummary[]
  readonly trendingFast: ContentTrendingWindows
  readonly earliestSnapshotAt: string | null
  readonly latestSnapshotAt: string | null
}

/** Bài đăng có tổng engagement dưới ngần này ở đầu cửa sổ bị loại khỏi "tăng
 * nhanh" — cùng lý do `MIN_TRENDING_VIEWS` bên TikTok (tránh % tăng vọt vô
 * nghĩa khi chia cho số gần 0), nhưng THẤP HƠN NHIỀU: một bài Facebook
 * Page/Instagram nhỏ hoàn toàn có thể chỉ có chục lượt tương tác mỗi bài,
 * ngưỡng 50 của TikTok (views) sẽ loại gần hết dữ liệu thật. */
export const MIN_TRENDING_ENGAGEMENT = 5
