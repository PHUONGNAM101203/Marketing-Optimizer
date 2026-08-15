import 'server-only'

import {
  MAX_TOP_ALL_TIME,
  MIN_TRENDING_ENGAGEMENT,
  TRENDING_WINDOW_DAYS,
  type ContentGrowthSummary,
  type ContentSummary,
  type ContentTrendingResult,
} from '@/lib/providers/content-trending-types'
import { createClient } from '@/lib/supabase/server'

const TRENDING_WINDOW_KEYS = ['week', 'month', 'year'] as const

interface ContentTrendingRow {
  readonly external_post_id: string
  readonly message: string | null
  readonly image_url: string | null
  readonly permalink: string | null
  readonly latest_posted_at: string | null
  readonly latest_date: string
  readonly latest_likes: number
  readonly latest_comments: number
  readonly latest_shares: number
  readonly earliest_date: string | null
  readonly earliest_score: number | null
  readonly cutoff0_date: string | null
  readonly cutoff0_score: number | null
  readonly cutoff1_date: string | null
  readonly cutoff1_score: number | null
  readonly cutoff2_date: string | null
  readonly cutoff2_score: number | null
}

const engagementScore = (row: ContentTrendingRow): number =>
  row.latest_likes + row.latest_comments + row.latest_shares

const toSummary = (row: ContentTrendingRow, provider: 'facebook' | 'instagram'): ContentSummary => ({
  externalPostId: row.external_post_id,
  title: row.message ?? '(không có nội dung)',
  thumbnailUrl: row.image_url,
  likes: row.latest_likes,
  comments: row.latest_comments,
  // Instagram không có field chia sẻ trên media — `null` khác 0 chia sẻ
  // thật (chỉ Facebook mới trả 0 thật), xem `content-trending-types.ts`.
  shares: provider === 'instagram' ? null : row.latest_shares,
  permalinkUrl: row.permalink,
  createdAt: row.latest_posted_at,
})

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

const EMPTY_RESULT = (): ContentTrendingResult => ({
  topAllTime: [],
  trendingFast: { week: [], month: [], year: [] },
  earliestSnapshotAt: null,
  latestSnapshotAt: null,
})

/**
 * Tăng trưởng của MỘT bài đăng cho MỘT cửa sổ, từ cặp (ngày, tổng engagement)
 * tại mốc cắt — cùng logic `computeGrowth` trong `video-trending.ts`, đổi
 * `views` thành tổng engagement (likes+comments+shares) và
 * `MIN_TRENDING_VIEWS` thành `MIN_TRENDING_ENGAGEMENT`.
 */
const computeGrowth = (
  row: ContentTrendingRow,
  provider: 'facebook' | 'instagram',
  cutoffDate: string | null,
  cutoffScore: number | null,
): ContentGrowthSummary | null => {
  const startDate = cutoffDate ?? row.earliest_date
  const startScore = cutoffDate !== null ? cutoffScore : row.earliest_score
  if (startDate === null || startScore === null) return null
  if (startDate === row.latest_date) return null
  if (startScore < MIN_TRENDING_ENGAGEMENT) return null

  const growthDelta = engagementScore(row) - startScore
  return { ...toSummary(row, provider), growthDelta, growthPct: growthDelta / startScore }
}

/**
 * "Top mọi thời gian" và "tăng nhanh" (tuần/tháng/năm) cho Facebook/Instagram
 * — cùng thiết kế `getTiktokVideoTrending` (`video-trending.ts`): đọc qua RPC
 * trả ĐÚNG MỘT DÒNG MỖI BÀI ĐĂNG, không đọc trực tiếp `content_metrics_daily`
 * (có thể vượt xa `max_rows` mặc định của PostgREST — xem
 * `get_content_trending_snapshots` trong
 * `supabase/migrations/20260814000007_content_trending_snapshots_fn.sql`).
 * Xếp hạng theo TỔNG ENGAGEMENT (likes+comments+shares), không phải views —
 * xem `content-trending-types.ts`.
 */
export const getContentTrending = async (
  connectionId: string,
  provider: 'facebook' | 'instagram',
): Promise<ContentTrendingResult> => {
  const supabase = await createClient()
  const cutoffs = TRENDING_WINDOW_KEYS.map((key) =>
    toIsoDate(new Date(Date.now() - TRENDING_WINDOW_DAYS[key] * 86_400_000)),
  )

  const { data, error } = await supabase.rpc('get_content_trending_snapshots', {
    p_connection_id: connectionId,
    p_provider: provider,
    p_cutoffs: cutoffs,
  })

  // Không throw — trang chi tiết kênh không được sập chỉ vì phần trending
  // lỗi. Log để biết đây là LỖI THẬT, không phải "chưa có dữ liệu".
  if (error) {
    console.error(`Không đọc được content trending (connection ${connectionId}, ${provider}): ${error.message}`)
    return EMPTY_RESULT()
  }

  const rows = data ?? []
  if (rows.length === 0) return EMPTY_RESULT()

  const topAllTime = rows
    .map((row) => toSummary(row, provider))
    .sort((a, b) => (b.likes + b.comments + (b.shares ?? 0)) - (a.likes + a.comments + (a.shares ?? 0)))
    .slice(0, MAX_TOP_ALL_TIME)

  let earliestSnapshotAt: string | null = null
  let latestSnapshotAt: string | null = null
  const trendingFast = {
    week: [] as ContentGrowthSummary[],
    month: [] as ContentGrowthSummary[],
    year: [] as ContentGrowthSummary[],
  }

  for (const row of rows) {
    if (row.earliest_date !== null) {
      if (earliestSnapshotAt === null || row.earliest_date < earliestSnapshotAt) {
        earliestSnapshotAt = row.earliest_date
      }
    }
    if (latestSnapshotAt === null || row.latest_date > latestSnapshotAt) {
      latestSnapshotAt = row.latest_date
    }

    const weekGrowth = computeGrowth(row, provider, row.cutoff0_date, row.cutoff0_score)
    if (weekGrowth) trendingFast.week.push(weekGrowth)
    const monthGrowth = computeGrowth(row, provider, row.cutoff1_date, row.cutoff1_score)
    if (monthGrowth) trendingFast.month.push(monthGrowth)
    const yearGrowth = computeGrowth(row, provider, row.cutoff2_date, row.cutoff2_score)
    if (yearGrowth) trendingFast.year.push(yearGrowth)
  }
  for (const windowKey of TRENDING_WINDOW_KEYS) {
    trendingFast[windowKey].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
  }

  return { topAllTime, trendingFast, earliestSnapshotAt, latestSnapshotAt }
}
