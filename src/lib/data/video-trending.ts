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
})

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

const EMPTY_RESULT = (): VideoTrendingResult => ({
  topAllTime: [],
  trendingFast: { week: [], month: [], year: [] },
  earliestSnapshotAt: null,
  latestSnapshotAt: null,
})

/**
 * Tăng trưởng của MỘT video cho MỘT cửa sổ, từ cặp (ngày, views) tại mốc cắt
 * — nếu video chưa có snapshot nào cũ đến mốc cắt đó (`cutoffDate` null,
 * connection mới/chưa đủ lịch sử), lùi về snapshot sớm nhất đang có —
 * "tăng trưởng từ lúc bắt đầu theo dõi", chấp nhận đánh giá thấp hơn tăng
 * trưởng thật thay vì không hiện gì.
 */
const computeGrowth = (
  row: VideoTrendingRow,
  cutoffDate: string | null,
  cutoffViews: number | null,
): VideoGrowthSummary | null => {
  const startDate = cutoffDate ?? row.earliest_date
  const startViews = cutoffDate !== null ? cutoffViews : row.earliest_views
  // `earliest_*` chỉ null khi video hoàn toàn không có snapshot nào — không
  // thể xảy ra ở đây vì `row` đến từ nhánh `latest` (JOIN vào `earliest`),
  // nhưng kiểu SQL LEFT JOIN vẫn khai báo nullable nên kiểm tra cho chắc.
  if (startDate === null || startViews === null) return null
  if (startDate === row.latest_date) return null
  if (startViews < MIN_TRENDING_VIEWS) return null

  const growthDelta = row.latest_views - startViews
  return { ...toSummary(row), growthDelta, growthPct: growthDelta / startViews }
}

/**
 * "Top mọi thời gian" và "tăng nhanh" (tuần/tháng/năm) cho TikTok. Không
 * nhận tham số ngày — `topAllTime` luôn là snapshot mới nhất mỗi video,
 * `trendingFast` luôn tính đúng 3 cửa sổ cố định, độc lập với khoảng ngày
 * trang đang chọn (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 *
 * Đọc qua RPC `get_video_trending_snapshots` (không phải `.from(...).select(...)`
 * đọc trực tiếp `video_metrics_daily`) — bảng đó có thể có hàng nghìn dòng
 * mỗi connection (video × ngày), vượt xa giới hạn `max_rows` mặc định của
 * PostgREST (1000) chỉ sau vài chục ngày theo dõi vài video. RPC trả về
 * ĐÚNG MỘT DÒNG MỖI VIDEO (không nhân theo ngày lịch sử lẫn không nhân theo
 * "vai trò") — xem
 * `supabase/migrations/20260814000004_video_trending_snapshots_fn.sql`.
 */
export const getTiktokVideoTrending = async (connectionId: string): Promise<VideoTrendingResult> => {
  const supabase = await createClient()
  const cutoffs = TRENDING_WINDOW_KEYS.map((key) =>
    toIsoDate(new Date(Date.now() - TRENDING_WINDOW_DAYS[key] * 86_400_000)),
  )

  const { data, error } = await supabase.rpc('get_video_trending_snapshots', {
    p_connection_id: connectionId,
    p_cutoffs: cutoffs,
  })

  // Không throw — một trang chi tiết kênh không được sập chỉ vì phần
  // trending lỗi (thiếu quyền EXECUTE, cache schema PostgREST cũ, sai kiểu
  // tham số...). Log để còn biết đây là LỖI THẬT, không phải "chưa có dữ
  // liệu" — hai trạng thái nhìn giống hệt nhau nếu không log.
  if (error) {
    console.error(`Không đọc được video trending (connection ${connectionId}): ${error.message}`)
    return EMPTY_RESULT()
  }

  const rows = data ?? []
  if (rows.length === 0) return EMPTY_RESULT()

  const topAllTime = rows
    .map(toSummary)
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_TOP_ALL_TIME)

  let earliestSnapshotAt: string | null = null
  let latestSnapshotAt: string | null = null
  const trendingFast = { week: [] as VideoGrowthSummary[], month: [] as VideoGrowthSummary[], year: [] as VideoGrowthSummary[] }

  for (const row of rows) {
    if (row.earliest_date !== null) {
      if (earliestSnapshotAt === null || row.earliest_date < earliestSnapshotAt) {
        earliestSnapshotAt = row.earliest_date
      }
    }
    if (latestSnapshotAt === null || row.latest_date > latestSnapshotAt) {
      latestSnapshotAt = row.latest_date
    }

    const weekGrowth = computeGrowth(row, row.cutoff0_date, row.cutoff0_views)
    if (weekGrowth) trendingFast.week.push(weekGrowth)
    const monthGrowth = computeGrowth(row, row.cutoff1_date, row.cutoff1_views)
    if (monthGrowth) trendingFast.month.push(monthGrowth)
    const yearGrowth = computeGrowth(row, row.cutoff2_date, row.cutoff2_views)
    if (yearGrowth) trendingFast.year.push(yearGrowth)
  }
  for (const windowKey of TRENDING_WINDOW_KEYS) {
    trendingFast[windowKey].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
  }

  return { topAllTime, trendingFast, earliestSnapshotAt, latestSnapshotAt }
}

interface VideoRangeRow {
  readonly external_video_id: string
  readonly title: string | null
  readonly cover_image_url: string | null
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
      }),
    )
    .filter((summary) => summary.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_RANGE_RESULTS)
}
