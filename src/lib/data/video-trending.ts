import 'server-only'

import {
  MAX_TOP_ALL_TIME,
  MIN_TRENDING_VIEWS,
  TRENDING_WINDOW_DAYS,
  type VideoGrowthSummary,
  type VideoSummary,
  type VideoTrendingResult,
} from '@/lib/providers/video-trending-types'
import { createClient } from '@/lib/supabase/server'

const TRENDING_WINDOW_KEYS = ['week', 'month', 'year'] as const

interface VideoTrendingRow {
  readonly external_video_id: string
  readonly title: string | null
  readonly cover_image_url: string | null
  readonly posted_at: string | null
  readonly permalink_url: string | null
  readonly latest_date: string
  readonly latest_views: number
  readonly latest_likes: number
  readonly latest_comments: number
  readonly latest_shares: number
  readonly earliest_date: string | null
  readonly earliest_views: number | null
  readonly cutoff0_date: string | null
  readonly cutoff0_views: number | null
  readonly cutoff1_date: string | null
  readonly cutoff1_views: number | null
  readonly cutoff2_date: string | null
  readonly cutoff2_views: number | null
}

const toSummary = (row: VideoTrendingRow): VideoSummary => ({
  externalVideoId: row.external_video_id,
  title: row.title ?? '(không có chú thích)',
  thumbnailUrl: row.cover_image_url,
  views: row.latest_views,
  likes: row.latest_likes,
  comments: row.latest_comments,
  shares: row.latest_shares,
  createdAt: row.posted_at,
  permalinkUrl: row.permalink_url,
  // Nguồn này không biết video còn được liệt kê hay không — xem
  // chú thích của `unavailableSince`.
  unavailableSince: null,
})

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

const EMPTY_RESULT = (): VideoTrendingResult => ({
  topAllTime: [],
  trendingFast: [],
  earliestSnapshotAt: null,
  latestSnapshotAt: null,
})


/** Số lượt xem tối thiểu ở mốc đầu khoảng để một video được xếp vào "tăng
 * nhanh". Không có ngưỡng thì một video từ 2 lên 6 view ra +200% và đứng trên
 * mọi video thật — đúng lớp nhiễu mà `MIN_TRENDING_VIEWS` sinh ra để chặn. */
const MIN_RANGE_BASELINE_VIEWS = MIN_TRENDING_VIEWS

/**
 * Video tăng nhanh TRONG ĐÚNG một khoảng ngày.
 *
 * Dùng CHUNG RPC `get_video_range_snapshots` với `getTiktokVideoRangeStats`,
 * nên định nghĩa "tăng trưởng trong khoảng" ở hai chỗ không thể lệch nhau —
 * cùng cặp mốc `baseline_*` (đầu khoảng) và `end_*` (cuối khoảng).
 *
 * Video KHÔNG có `baseline_views` bị loại: nó mới đăng trong khoảng này nên
 * chưa có mốc đầu để so. Xếp nó vào "tăng nhanh" với growthPct vô cực sẽ đẩy
 * mọi video cũ xuống dưới, biến bảng thành danh sách "video mới đăng" — đã có
 * khối riêng cho việc đó.
 */
export const getTiktokVideoRangeGrowth = async (
  connectionId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<readonly VideoGrowthSummary[]> => {
  const supabase = await createClient()
  // `get_video_range_growth`, KHÔNG phải `get_video_range_snapshots`: hàm kia
  // chỉ nhận mốc đầu nằm TRƯỚC khoảng và trả null khi không có. Snapshot
  // TikTok mới có từ 13/8/2026 nên mọi khoảng bắt đầu trước đó đều null —
  // kể cả tháng 8. Hàm mới lùi về snapshot sớm nhất TRONG khoảng khi cần.
  const { data, error } = await supabase.rpc('get_video_range_growth', {
    p_connection_id: connectionId,
    p_range_start: range.startDate,
    p_range_end: range.endDate,
  })

  if (error) {
    console.error(
      `Không đọc được tăng trưởng video theo khoảng (connection ${connectionId}): ${error.message}`,
    )
    return []
  }

  // Kiểu riêng, KHÔNG dùng lại `VideoRangeRow`: RPC mới trả ít cột hơn (không
  // có `end_date` và các mốc likes/comments/shares đầu khoảng — bảng này chỉ
  // xếp hạng theo views). Ép về `VideoRangeRow` là nói dối trình biên dịch.
  type RangeGrowthRow = {
    readonly external_video_id: string
    readonly title: string | null
    readonly cover_image_url: string | null
    readonly posted_at: string | null
    readonly permalink_url: string | null
    readonly end_views: number
    readonly end_likes: number
    readonly end_comments: number
    readonly end_shares: number
    readonly baseline_views: number | null
  }

  return ((data ?? []) as readonly RangeGrowthRow[])
    .flatMap((row): VideoGrowthSummary[] => {
      const baseline = row.baseline_views
      if (baseline === null || baseline < MIN_RANGE_BASELINE_VIEWS) return []
      const growthDelta = Math.max(0, row.end_views - baseline)
      if (growthDelta === 0) return []

      return [
        {
          externalVideoId: row.external_video_id,
          title: row.title ?? '(không có chú thích)',
          thumbnailUrl: row.cover_image_url,
          views: row.end_views,
          likes: row.end_likes,
          comments: row.end_comments,
          shares: row.end_shares,
          createdAt: row.posted_at,
          permalinkUrl: row.permalink_url,
          // Nguồn này không biết video còn được liệt kê hay không — xem
          // chú thích của `unavailableSince`.
          unavailableSince: null,
          growthDelta,
          growthPct: growthDelta / baseline,
        },
      ]
    })
    .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
    .slice(0, MAX_RANGE_RESULTS)
}

/**
 * "Top mọi thời gian" và "tăng nhanh" cho TikTok.
 *
 * `topAllTime` luôn là snapshot mới nhất mỗi video (không phụ thuộc khoảng
 * ngày — "mọi thời gian" đúng nghĩa). `trendingFast` thì NGƯỢC LẠI: tính đúng
 * trong `range` đang chọn.
 *
 * Bản trước `trendingFast` là ba cửa sổ cố định tuần/tháng/năm tính từ HÔM
 * NAY, cố ý độc lập với khoảng ngày. Người dùng chọn tháng 7 nhưng danh sách
 * vẫn toàn video tháng 8, ngay cạnh những khối số liệu khác đều theo tháng 7 —
 * không thể đọc được là đang nói về cái gì.
 *
 * Hai RPC chạy song song vì đo hai thứ khác nhau:
 * `get_video_trending_snapshots` cho ảnh cộng dồn mới nhất mỗi video (và biên
 * ngày snapshot), `get_video_range_snapshots` cho cặp mốc đầu/cuối TRONG
 * khoảng — cùng RPC mà `getTiktokVideoRangeStats` đã dùng, nên hai chỗ không
 * thể lệch nhau về định nghĩa "tăng trưởng trong khoảng".
 *
 * Đọc qua RPC chứ không `.from(...).select(...)`: `video_metrics_daily` có thể
 * có hàng nghìn dòng mỗi connection (video × ngày), vượt xa `max_rows` mặc
 * định của PostgREST (1000) chỉ sau vài chục ngày. RPC trả ĐÚNG MỘT DÒNG MỖI
 * VIDEO.
 */
export const getTiktokVideoTrending = async (
  connectionId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<VideoTrendingResult> => {
  const supabase = await createClient()
  // `p_cutoffs` vẫn phải truyền đủ ba mốc (RPC trả ba cặp cột cutoff0/1/2) dù
  // giờ không dùng tới — đổi chữ ký RPC là một migration riêng, không đáng
  // cho một tham số bị bỏ qua.
  const cutoffs = TRENDING_WINDOW_KEYS.map((key) =>
    toIsoDate(new Date(Date.now() - TRENDING_WINDOW_DAYS[key] * 86_400_000)),
  )

  const [{ data, error }, rangeGrowth] = await Promise.all([
    supabase.rpc('get_video_trending_snapshots', {
      p_connection_id: connectionId,
      p_cutoffs: cutoffs,
    }),
    getTiktokVideoRangeGrowth(connectionId, range),
  ])

  // Không throw — một trang chi tiết kênh không được sập chỉ vì phần
  // trending lỗi (thiếu quyền EXECUTE, cache schema PostgREST cũ, sai kiểu
  // tham số...). Log để còn biết đây là LỖI THẬT, không phải "chưa có dữ
  // liệu" — hai trạng thái nhìn giống hệt nhau nếu không log.
  if (error) {
    console.error(`Không đọc được video trending (connection ${connectionId}): ${error.message}`)
    return { ...EMPTY_RESULT(), trendingFast: rangeGrowth }
  }

  const rows = data ?? []
  if (rows.length === 0) return { ...EMPTY_RESULT(), trendingFast: rangeGrowth }

  const topAllTime = rows
    .map(toSummary)
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_TOP_ALL_TIME)

  let earliestSnapshotAt: string | null = null
  let latestSnapshotAt: string | null = null

  for (const row of rows) {
    if (row.earliest_date !== null) {
      if (earliestSnapshotAt === null || row.earliest_date < earliestSnapshotAt) {
        earliestSnapshotAt = row.earliest_date
      }
    }
    if (latestSnapshotAt === null || row.latest_date > latestSnapshotAt) {
      latestSnapshotAt = row.latest_date
    }
  }

  return { topAllTime, trendingFast: rangeGrowth, earliestSnapshotAt, latestSnapshotAt }
}

interface VideoRangeRow {
  readonly external_video_id: string
  readonly title: string | null
  readonly cover_image_url: string | null
  readonly posted_at: string | null
  readonly permalink_url: string | null
  readonly end_date: string
  readonly end_views: number
  readonly end_likes: number
  readonly end_comments: number
  readonly end_shares: number
  readonly baseline_date: string | null
  readonly baseline_views: number | null
  readonly baseline_likes: number | null
  readonly baseline_comments: number | null
  readonly baseline_shares: number | null
}

/** Trần trên số video trả về từ `getTiktokVideoRangeStats` — trang chỉ cần
 * top 5 (`RANKING_LIMIT` ở `TiktokDashboard`), giữ dư một chút cùng quy ước
 * `MAX_TOP_ALL_TIME`. */
const MAX_RANGE_RESULTS = 50

/**
 * Số liệu "trong khoảng ngày đang chọn" cho TikTok, tính từ snapshot đã lưu
 * (`video_metrics_daily`) thay vì lọc 20-video-gần-nhất từ Display API theo
 * ngày đăng — xem docblock migration `get_video_range_snapshots` để hiểu lý
 * do cách cũ trả rỗng cho video cũ vẫn còn hoạt động trong khoảng ngày chọn.
 *
 * `views`/`likes`/`comments`/`shares` trả về ở đây là TĂNG TRƯỞNG trong
 * khoảng (end - baseline), KHÔNG PHẢI tổng cộng dồn như `topAllTime` — âm do
 * TikTok tự điều chỉnh ngược số đếm bị kẹp về 0 (`Math.max`) thay vì hiện số
 * âm gây khó hiểu. Video không có tăng trưởng views nào trong khoảng (bằng
 * 0) bị loại khỏi kết quả — "video xem nhiều nhất trong khoảng ngày" mà
 * tăng trưởng 0 thì không có ý nghĩa xếp hạng.
 */
export const getTiktokVideoRangeStats = async (
  connectionId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<readonly VideoSummary[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_video_range_snapshots', {
    p_connection_id: connectionId,
    p_range_start: range.startDate,
    p_range_end: range.endDate,
  })

  // Không throw — cùng lý do `getTiktokVideoTrending`: một phần lỗi không
  // được sập cả trang chi tiết kênh, log để phân biệt "lỗi thật" với "chưa
  // có dữ liệu" (hai trạng thái giống hệt nhau nếu không log).
  if (error) {
    console.error(`Không đọc được số liệu TikTok trong khoảng ngày (connection ${connectionId}): ${error.message}`)
    return []
  }

  const rows = (data ?? []) as readonly VideoRangeRow[]

  return rows
    .map(
      (row): VideoSummary => ({
        externalVideoId: row.external_video_id,
        title: row.title ?? '(không có chú thích)',
        thumbnailUrl: row.cover_image_url,
        views: Math.max(0, row.end_views - (row.baseline_views ?? 0)),
        likes: Math.max(0, row.end_likes - (row.baseline_likes ?? 0)),
        comments: Math.max(0, row.end_comments - (row.baseline_comments ?? 0)),
        shares: Math.max(0, row.end_shares - (row.baseline_shares ?? 0)),
        createdAt: row.posted_at,
        permalinkUrl: row.permalink_url,
        // Nguồn này không biết video còn được liệt kê hay không — xem
        // chú thích của `unavailableSince`.
        unavailableSince: null,
      }),
    )
    .filter((summary) => summary.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_RANGE_RESULTS)
}

export interface VideoRangeGrowthTotals {
  readonly viewsGrowth: number
  readonly likesGrowth: number
  readonly commentsGrowth: number
  readonly sharesGrowth: number
  /** Số video CÓ tăng trưởng views trong khoảng — khác `extra.videoCount`
   * (tổng số video account từng đăng, snapshot cộng dồn) — đây là "bao nhiêu
   * video thật sự hoạt động trong đúng khoảng ngày này". */
  readonly activeVideoCount: number
}

/**
 * Cộng dồn `getTiktokVideoRangeStats` thành tổng MỘT con số — dùng cho bảng
 * so sánh hai khoảng ngày (`ChannelComparisonPanel`), nơi cần "view tăng
 * thêm bao nhiêu trong kỳ" chứ không phải xếp hạng từng video. LƯU Ý: kế
 * thừa đúng giới hạn `MAX_RANGE_RESULTS` (top 50) của `getTiktokVideoRangeStats`
 * — tài khoản có trên 50 video tăng trưởng trong cùng một khoảng sẽ bị đếm
 * thiếu phần đuôi, chấp nhận được vì đây là con số THAM KHẢO đối chiếu hai kỳ,
 * không phải báo cáo tài chính cần chính xác tuyệt đối.
 */
export const aggregateVideoRangeGrowth = (stats: readonly VideoSummary[]): VideoRangeGrowthTotals =>
  stats.reduce(
    (totals, video) => ({
      viewsGrowth: totals.viewsGrowth + video.views,
      likesGrowth: totals.likesGrowth + video.likes,
      commentsGrowth: totals.commentsGrowth + video.comments,
      sharesGrowth: totals.sharesGrowth + (video.shares ?? 0),
      activeVideoCount: totals.activeVideoCount + 1,
    }),
    { viewsGrowth: 0, likesGrowth: 0, commentsGrowth: 0, sharesGrowth: 0, activeVideoCount: 0 },
  )

export interface VideoPostedTotals {
  /** Số video ĐĂNG trong khoảng. */
  readonly postedVideoCount: number
  /** Cộng dồn TỚI SNAPSHOT MỚI NHẤT của những video đăng trong khoảng —
   * KHÔNG phải lượt phát sinh trong chính khoảng đó. */
  readonly postedViews: number
  readonly postedLikes: number
  readonly postedComments: number
  readonly postedShares: number
}

/**
 * Gộp video theo NGÀY ĐĂNG.
 *
 * Vì sao cần, bên cạnh `aggregateVideoRangeGrowth`: TikTok không có báo cáo
 * lịch sử, nên "lượt xem phát sinh trong khoảng X" chỉ tính được từ snapshot
 * app tự chụp — và app mới chụp từ 13/8/2026. Mọi khoảng trước đó ra 0, đúng
 * về mặt số học nhưng vô dụng để đối chiếu.
 *
 * Còn chỉ số CỘNG DỒN của từng video thì TikTok trả về đầy đủ, và mỗi video có
 * `posted_at` thật. Gộp theo ngày đăng vì vậy dùng được cho MỌI khoảng, xa tới
 * tận video cũ nhất tài khoản còn giữ.
 *
 * ĐÁNH ĐỔI phải nói rõ ở UI: đây là tổng cộng dồn TỚI NAY của một lứa video,
 * không phải hiệu suất TRONG khoảng. Lứa tháng 6 đã có vài tháng tích luỹ,
 * lứa tháng 8 mới vài tuần — so số thô là thiên vị tháng cũ.
 */
export const aggregateVideosPostedInRange = (
  videos: readonly VideoSummary[],
): VideoPostedTotals =>
  videos.reduce(
    (totals, video) => ({
      postedVideoCount: totals.postedVideoCount + 1,
      postedViews: totals.postedViews + video.views,
      postedLikes: totals.postedLikes + video.likes,
      postedComments: totals.postedComments + video.comments,
      postedShares: totals.postedShares + (video.shares ?? 0),
    }),
    { postedVideoCount: 0, postedViews: 0, postedLikes: 0, postedComments: 0, postedShares: 0 },
  )

interface VideoPostedRow {
  readonly external_video_id: string
  readonly title: string | null
  readonly cover_image_url: string | null
  readonly posted_at: string | null
  readonly permalink_url: string | null
  readonly views: number
  readonly likes: number
  readonly comments: number
  readonly shares: number
  readonly last_seen_date: string
  readonly connection_last_seen_date: string
}

/**
 * TOÀN BỘ video có ngày đăng (`posted_at`) rơi vào khoảng đang chọn — dùng
 * cho tab "Tổng quan" của TikTok (`TiktokExploreSection`), sắp sẵn theo
 * `posted_at` GIẢM DẦN (video đăng gần đây nhất trước, đủ độ chính xác
 * giờ:phút:giây từ SQL — xem `get_videos_posted_in_range`). KHÔNG phải "xem
 * nhiều nhất": trang chỉ lọc theo ngày đăng, không sắp theo views — mọi video
 * trong khoảng đều hiện, không cắt còn "top" nào.
 */
export const getTiktokVideosPostedInRange = async (
  connectionId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<readonly VideoSummary[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_videos_posted_in_range', {
    p_connection_id: connectionId,
    p_range_start: range.startDate,
    p_range_end: range.endDate,
  })

  if (error) {
    console.error(`Không đọc được video theo ngày đăng (connection ${connectionId}): ${error.message}`)
    return []
  }

  return ((data ?? []) as readonly VideoPostedRow[]).map(
    (row): VideoSummary => ({
      externalVideoId: row.external_video_id,
      title: row.title ?? '(không có chú thích)',
      thumbnailUrl: row.cover_image_url,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      createdAt: row.posted_at,
      permalinkUrl: row.permalink_url,
      // Vắng mặt ở lượt đồng bộ mới nhất của kênh = TikTok đã thôi liệt kê.
      // So trực tiếp chứ không đặt ngưỡng vài ngày: người dùng cần biết NGAY
      // trong ngày nó xảy ra, và câu chữ trên thẻ chỉ khẳng định đúng điều đo
      // được ("không còn được liệt kê"), không suy diễn thành "đã bị xoá".
      unavailableSince:
        row.last_seen_date < row.connection_last_seen_date ? row.last_seen_date : null,
    }),
  )
}
