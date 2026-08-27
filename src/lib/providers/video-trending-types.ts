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
  /** ISO 8601 — ngày đăng THẬT của video (TikTok: `posted_at` lưu từ
   * `create_time`; YouTube: gán ở nơi gọi từ `YoutubeExplore.topVideos[].createdAt`).
   * `null` khi nguồn dữ liệu chưa lưu được (vd. dòng snapshot TikTok ghi
   * TRƯỚC khi cột `posted_at` tồn tại — xem
   * `20260820000001_video_metrics_posted_at.sql` — chỉ trống tạm đến lần
   * đồng bộ tiếp theo, không phải lỗi). */
  readonly createdAt: string | null
  /** Link gốc xem video trên nền tảng — TikTok: `share_url` lưu sẵn (không
   * suy ra được chỉ từ ID vì cần username); YouTube: dựng thuần từ
   * `externalVideoId`. `null` cùng điều kiện với `createdAt`. */
  readonly permalinkUrl: string | null
  /**
   * Ngày cuối cùng nền tảng còn liệt kê video này, khi khác với lượt đồng bộ
   * mới nhất của kênh — tức video KHÔNG còn khả dụng.
   *
   * `null` nghĩa là vẫn bình thường HOẶC nguồn không biết: YouTube Analytics
   * trả theo khoảng ngày chứ không phải danh sách hiện có, nên không suy ra
   * được điều này và luôn để `null`. Đừng đọc `null` thành "chắc chắn còn".
   *
   * Display API của TikTok KHÔNG có trường trạng thái, nên không phân biệt
   * được video đã xoá, chuyển riêng tư, hay đưa về nháp — cả ba đều biểu hiện
   * y hệt nhau: biến mất khỏi danh sách. Giao diện phải nói đúng mức đó.
   */
  readonly unavailableSince: string | null
}

export interface VideoGrowthSummary extends VideoSummary {
  readonly growthDelta: number
  /** `null` khi mốc so sánh có 0 lượt xem — không chia được cho 0 (trong
   * thực tế không xảy ra vì cả hai nguồn đều lọc theo `MIN_TRENDING_VIEWS`
   * trước khi tính, nhưng kiểu vẫn khai báo đúng khả năng lý thuyết). */
  readonly growthPct: number | null
}

export interface VideoTrendingResult {
  readonly topAllTime: readonly VideoSummary[]
  /** Video tăng nhanh TRONG ĐÚNG khoảng ngày trang đang chọn.
   *
   * Trước đây đây là ba cửa sổ cố định (tuần/tháng/năm tính từ HÔM NAY) và UI
   * có nút tự chuyển giữa chúng — cố ý độc lập với khoảng ngày đang chọn.
   * Nhưng người dùng đọc bảng này cạnh mọi số liệu khác trên trang, vốn đều
   * theo khoảng đã chọn: chọn tháng 7 mà danh sách toàn video tháng 8 thì
   * không đọc được là đang nói về cái gì. Giờ nó theo đúng khoảng, và nút
   * tuần/tháng/năm bỏ đi vì đã trùng chức năng với bộ chọn khoảng ngày. */
  readonly trendingFast: readonly VideoGrowthSummary[]
  /** Ngày (YYYY-MM-DD) sớm nhất TRONG TẬP DỮ LIỆU ĐÃ LẤY VỀ. TikTok: ngày
   * snapshot sớm nhất THẬT SỰ có (không còn bị chặn dưới ở 366 ngày như
   * bản đầu — xem `get_video_trending_snapshots` trong
   * `supabase/migrations/20260814000004_video_trending_snapshots_fn.sql`).
   * YouTube: có thể bị CẮT BỚT ngày cũ nếu báo cáo vượt `maxResults` (tài
   * khoản nhiều video) — với kênh lâu năm, giá trị này có thể gần hơn hôm
   * nay nhiều so với ngày kênh thật sự bắt đầu có dữ liệu, không phải
   * "ngày kết nối thật". `null` khi tập dữ liệu rỗng — HOẶC vì chưa có
   * snapshot/video nào, HOẶC vì lượt gọi API bị lỗi (xem log server) — hai
   * trường hợp không phân biệt được từ mỗi field này.
   *
   * Dùng `hasEnoughHistory()` bên dưới thay vì tự so sánh — đã xử lý đúng
   * biên (đủ chính xác ngày). Một cửa sổ trả về rỗng dù đủ lịch sử vẫn có
   * thể xảy ra (video bị lọc vì dưới `MIN_TRENDING_VIEWS`, hoặc chỉ có 1
   * snapshot) — "đủ lịch sử" không đồng nghĩa "chắc chắn có video trending". */
  readonly earliestSnapshotAt: string | null
  /** Ngày (YYYY-MM-DD) MỚI NHẤT trong tập dữ liệu đã lấy về — tín hiệu độ
   * mới của đồng bộ. TikTok: ngày snapshot gần nhất còn ghi được (nếu đồng
   * bộ bị gián đoạn lâu — vd token hết hạn — giá trị này sẽ cũ, báo hiệu số
   * liệu "tăng nhanh" có thể đang tính trên khoảng trống dữ liệu chứ không
   * phải tuần/tháng gần nhất thật). YouTube: ngày gần nhất Analytics API
   * thực sự trả dữ liệu (thường trễ 2-3 ngày so với hôm nay, không phải lỗi).
   * `null` cùng điều kiện với `earliestSnapshotAt`. */
  readonly latestSnapshotAt: string | null
}

export const TRENDING_WINDOW_DAYS = { week: 7, month: 30, year: 365 } as const

/** Cửa sổ `windowKey` có đủ lịch sử để tin cậy hay chưa — so `earliestSnapshotAt`
 * với số ngày của cửa sổ đó, tính theo UTC (khớp cách server tính `cutoff` ở
 * cả hai nguồn TikTok/YouTube) để tránh lệch một ngày nếu UI tự tính bằng giờ
 * địa phương. `false` khi `earliestSnapshotAt` là `null` (chưa có dữ liệu). */
export const hasEnoughHistory = (
  earliestSnapshotAt: string | null,
  windowKey: keyof typeof TRENDING_WINDOW_DAYS,
): boolean => {
  if (earliestSnapshotAt === null) return false
  const cutoff = new Date(Date.now() - TRENDING_WINDOW_DAYS[windowKey] * 86_400_000)
    .toISOString()
    .slice(0, 10)
  return earliestSnapshotAt <= cutoff
}

/** Trần trên số video trả về trong `topAllTime` — UI chỉ cần top 10, giữ dư
 * một chút thay vì trả nguyên danh sách (TikTok có thể lên tới ~1000 video,
 * YouTube tới 200) để đỡ nặng payload mà không phải đổi hợp đồng lần nữa
 * nếu UI sau này cần top 20/30. */
export const MAX_TOP_ALL_TIME = 50

/** Video có dưới ngần này view ở đầu cửa sổ bị loại khỏi "tăng nhanh" — %
 * tăng của một video 2 view lên 20 view (900%) không có ý nghĩa, chỉ là
 * nhiễu do chia cho một số gần 0. */
export const MIN_TRENDING_VIEWS = 50
