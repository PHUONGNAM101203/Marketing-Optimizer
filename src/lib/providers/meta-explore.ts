import 'server-only'

/**
 * Số liệu cho trang chi tiết kênh Instagram — LẤY TRỰC TIẾP từ API mỗi lần
 * tải trang, KHÔNG lưu vào `metrics_daily`, cùng vai trò với
 * `google-explore.ts`. Bài đăng thay đổi liên tục, lưu lại chỉ tốn chỗ mà
 * không ai dùng lại.
 */

const GRAPH_VERSION = 'v25.0'

export interface InstagramExplore {
  readonly topPosts: readonly {
    readonly caption: string
    readonly likes: number
    readonly comments: number
  }[]
}

interface InstagramMediaItem {
  readonly id?: string
  readonly caption?: string
  readonly like_count?: number
  readonly comments_count?: number
  readonly timestamp?: string
}

/** `since`/`until` là mốc NGÀY (YYYY-MM-DD), Graph API tự hiểu — cùng cách
 * lọc theo khoảng ngày với GA4/GSC/YouTube ở trên, để bảng xếp hạng cũng đổi
 * theo bộ lọc ngày ở đầu trang thay vì luôn cố định "25 bài gần nhất". Không
 * có `shares` — Instagram Graph API không trả số lượt chia sẻ cho bài đăng
 * qua field cơ bản này (khác Facebook Page ở dưới). */
export const fetchInstagramExplore = async (
  accessToken: string,
  externalAccountId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<InstagramExplore> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/media`)
  url.searchParams.set('fields', 'caption,like_count,comments_count,timestamp')
  url.searchParams.set('since', range.startDate)
  url.searchParams.set('until', range.endDate)
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return { topPosts: [] }

  const data = (await response.json()) as { data?: readonly InstagramMediaItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      caption: (item.caption ?? '(không có chú thích)').slice(0, 80),
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
    }))
    .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
    .slice(0, 10)

  return { topPosts }
}

/**
 * Số liệu chi tiết cho trang chi tiết kênh Facebook (nội dung hữu cơ Page —
 * KHÁC `meta-ads`). Đọc like/comment/share thẳng từ NODE của post
 * (`reactions.summary`/`comments.summary`/`shares`) thay vì cạnh `insights`
 * — theo nghiên cứu 2026, nhiều metric `post_impressions*` đã bị Meta khai
 * tử (2025), field trên node bài viết ổn định hơn qua các đợt đổi đó.
 */
export interface FacebookExplore {
  readonly topPosts: readonly {
    readonly message: string
    readonly reactions: number
    readonly comments: number
    readonly shares: number
  }[]
}

interface FacebookPostItem {
  readonly id?: string
  readonly message?: string
  readonly created_time?: string
  readonly reactions?: { readonly summary?: { readonly total_count?: number } }
  readonly comments?: { readonly summary?: { readonly total_count?: number } }
  readonly shares?: { readonly count?: number }
}

/** `since`/`until` cùng cơ chế Instagram ở trên — lọc theo `created_time`
 * của bài viết, để bảng xếp hạng đổi theo bộ lọc ngày ở đầu trang. */
export const fetchFacebookContentExplore = async (
  accessToken: string,
  pageId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<FacebookExplore> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/published_posts`)
  url.searchParams.set(
    'fields',
    'message,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares',
  )
  url.searchParams.set('since', range.startDate)
  url.searchParams.set('until', range.endDate)
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) return { topPosts: [] }

  const data = (await response.json()) as { data?: readonly FacebookPostItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      message: (item.message ?? '(không có nội dung)').slice(0, 80),
      reactions: item.reactions?.summary?.total_count ?? 0,
      comments: item.comments?.summary?.total_count ?? 0,
      shares: item.shares?.count ?? 0,
    }))
    .sort(
      (a, b) =>
        b.reactions + b.comments + b.shares - (a.reactions + a.comments + a.shares),
    )
    .slice(0, 10)

  return { topPosts }
}
