import 'server-only'

import {
  MIN_TRENDING_VIEWS,
  TRENDING_WINDOW_DAYS,
  type VideoGrowthSummary,
  type VideoSummary,
  type VideoTrendingResult,
} from '@/lib/providers/video-trending-types'
import { createClient } from '@/lib/supabase/server'

interface VideoMetricsRow {
  readonly external_video_id: string
  readonly date: string
  readonly views: number
  readonly likes: number
  readonly comments: number
  readonly shares: number
  readonly title: string | null
  readonly cover_image_url: string | null
}

const toSummary = (row: VideoMetricsRow): VideoSummary => ({
  externalVideoId: row.external_video_id,
  title: row.title ?? '(không có chú thích)',
  thumbnailUrl: row.cover_image_url,
  views: row.views,
  likes: row.likes,
  comments: row.comments,
  shares: row.shares,
})

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * Tăng trưởng của MỘT video trong `windowDays` ngày gần nhất. Mốc bắt đầu =
 * snapshot gần nhất TRƯỚC (hoặc đúng) ngày cắt; nếu chưa có snapshot nào cũ
 * đến vậy (connection mới, chưa đủ lịch sử), lùi về snapshot sớm nhất đang
 * có — "tăng trưởng từ lúc bắt đầu theo dõi", chấp nhận đánh giá thấp hơn
 * tăng trưởng thật thay vì không hiện gì. `snapshots` phải đã sắp theo ngày
 * tăng dần.
 */
const computeGrowth = (
  snapshots: readonly VideoMetricsRow[],
  windowDays: number,
): VideoGrowthSummary | null => {
  const endSnapshot = snapshots[snapshots.length - 1]!
  const cutoff = toIsoDate(new Date(Date.now() - windowDays * 86_400_000))
  const startSnapshot = [...snapshots].reverse().find((row) => row.date <= cutoff) ?? snapshots[0]!

  if (startSnapshot === endSnapshot) return null
  if (startSnapshot.views < MIN_TRENDING_VIEWS) return null

  const growthDelta = endSnapshot.views - startSnapshot.views
  return { ...toSummary(endSnapshot), growthDelta, growthPct: growthDelta / startSnapshot.views }
}

const TRENDING_WINDOW_KEYS = ['week', 'month', 'year'] as const

/**
 * "Top mọi thời gian" và "tăng nhanh" (tuần/tháng/năm) cho TikTok, đọc từ
 * `video_metrics_daily`. Không nhận tham số ngày — `topAllTime` luôn là
 * snapshot mới nhất mỗi video, `trendingFast` luôn tính đúng 3 cửa sổ cố
 * định, độc lập với khoảng ngày trang đang chọn (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 */
export const getTiktokVideoTrending = async (connectionId: string): Promise<VideoTrendingResult> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('video_metrics_daily')
    .select('external_video_id, date, views, likes, comments, shares, title, cover_image_url')
    .eq('connection_id', connectionId)
    // Chặn dưới 366 ngày — cửa sổ rộng nhất là "năm" (365 ngày) cộng một ngày
    // dư. Không có chính sách xoá lịch sử, nên thiếu mốc này mỗi lần tải trang
    // sẽ đọc TOÀN BỘ snapshot của connection và ngày càng nặng. `topAllTime`
    // không bị ảnh hưởng: nó chỉ cần snapshot mới nhất của mỗi video.
    .gte('date', toIsoDate(new Date(Date.now() - 366 * 86_400_000)))
    .order('date', { ascending: true })

  const rows = (data ?? []) as readonly VideoMetricsRow[]
  if (rows.length === 0) {
    return { topAllTime: [], trendingFast: { week: [], month: [], year: [] } }
  }

  const byVideo = new Map<string, VideoMetricsRow[]>()
  for (const row of rows) {
    const list = byVideo.get(row.external_video_id) ?? []
    list.push(row)
    byVideo.set(row.external_video_id, list)
  }

  const topAllTime = [...byVideo.values()]
    .map((snapshots) => toSummary(snapshots[snapshots.length - 1]!))
    .sort((a, b) => b.views - a.views)

  const trendingFast = { week: [] as VideoGrowthSummary[], month: [] as VideoGrowthSummary[], year: [] as VideoGrowthSummary[] }
  for (const snapshots of byVideo.values()) {
    for (const windowKey of TRENDING_WINDOW_KEYS) {
      const growth = computeGrowth(snapshots, TRENDING_WINDOW_DAYS[windowKey])
      if (growth) trendingFast[windowKey].push(growth)
    }
  }
  for (const windowKey of TRENDING_WINDOW_KEYS) {
    trendingFast[windowKey].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
  }

  return { topAllTime, trendingFast }
}
