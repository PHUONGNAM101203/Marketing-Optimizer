import 'server-only'

/**
 * Số liệu cho trang chi tiết kênh Instagram — LẤY TRỰC TIẾP từ API mỗi lần
 * tải trang, KHÔNG lưu vào `metrics_daily`, cùng vai trò với
 * `google-explore.ts`. Bài đăng thay đổi liên tục, lưu lại chỉ tốn chỗ mà
 * không ai dùng lại.
 */

const GRAPH_VERSION = 'v25.0'

export interface InstagramExplore {
  readonly topPosts: readonly { readonly caption: string; readonly engagement: number }[]
}

interface InstagramMediaItem {
  readonly id?: string
  readonly caption?: string
  readonly like_count?: number
  readonly comments_count?: number
  readonly timestamp?: string
}

export const fetchInstagramExplore = async (
  accessToken: string,
  externalAccountId: string,
): Promise<InstagramExplore> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}/media`)
  url.searchParams.set('fields', 'caption,like_count,comments_count,timestamp')
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return { topPosts: [] }

  const data = (await response.json()) as { data?: readonly InstagramMediaItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      caption: (item.caption ?? '(không có chú thích)').slice(0, 80),
      engagement: (item.like_count ?? 0) + (item.comments_count ?? 0),
    }))
    .sort((a, b) => b.engagement - a.engagement)
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
  readonly topPosts: readonly { readonly message: string; readonly engagement: number }[]
}

interface FacebookPostItem {
  readonly id?: string
  readonly message?: string
  readonly created_time?: string
  readonly reactions?: { readonly summary?: { readonly total_count?: number } }
  readonly comments?: { readonly summary?: { readonly total_count?: number } }
  readonly shares?: { readonly count?: number }
}

export const fetchFacebookContentExplore = async (
  accessToken: string,
  pageId: string,
): Promise<FacebookExplore> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/published_posts`)
  url.searchParams.set(
    'fields',
    'message,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares',
  )
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) return { topPosts: [] }

  const data = (await response.json()) as { data?: readonly FacebookPostItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      message: (item.message ?? '(không có nội dung)').slice(0, 80),
      engagement:
        (item.reactions?.summary?.total_count ?? 0) +
        (item.comments?.summary?.total_count ?? 0) +
        (item.shares?.count ?? 0),
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 10)

  return { topPosts }
}
