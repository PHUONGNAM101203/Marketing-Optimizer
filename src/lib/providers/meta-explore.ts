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
    /** ISO 8601 — Instagram's `timestamp` field is already this format, no
     * conversion needed (unlike TikTok's Unix-seconds `create_time`). */
    readonly createdAt: string | null
    readonly permalinkUrl: string | null
    /** Ảnh bài đăng — Graph trả field này MIỄN PHÍ trong cùng response đang
     * gọi, không tốn thêm request. Dùng cho thumbnail nhỏ trong danh sách,
     * KHÔNG đổi quyết định dùng danh sách thay vì lưới ảnh (xem spec). */
    readonly thumbnailUrl: string | null
  }[]
  /** `null` = tải thành công (danh sách có thể rỗng — bình thường). Khác
   * `null` = request thất bại thật, kèm lý do — không được lẫn với "chưa có
   * bài đăng nào", cùng quy ước với `TiktokExplore.fetchError`. */
  readonly fetchError: string | null
}

interface InstagramMediaItem {
  readonly id?: string
  readonly caption?: string
  readonly like_count?: number
  readonly comments_count?: number
  readonly timestamp?: string
  readonly permalink?: string
  readonly media_url?: string
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
  url.searchParams.set('fields', 'caption,like_count,comments_count,timestamp,permalink,media_url')
  url.searchParams.set('since', range.startDate)
  url.searchParams.set('until', range.endDate)
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    return { topPosts: [], fetchError: `Instagram trả lỗi HTTP ${response.status}` }
  }

  const data = (await response.json()) as { data?: readonly InstagramMediaItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      caption: item.caption ?? '(không có chú thích)',
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      createdAt: item.timestamp ?? null,
      permalinkUrl: item.permalink ?? null,
      thumbnailUrl: item.media_url ?? null,
    }))
    .sort((a, b) => b.likes + b.comments - (a.likes + a.comments))
    .slice(0, 10)

  return { topPosts, fetchError: null }
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
    /** ISO 8601 — Facebook's `created_time` là format chuẩn Graph API, không
     * cần đổi đơn vị (khác TikTok's Unix-seconds `create_time`). */
    readonly createdAt: string | null
    readonly permalinkUrl: string | null
    /** Ảnh bài đăng — `full_picture` trả MIỄN PHÍ trong cùng response, xem
     * ghi chú tương ứng ở `InstagramExplore` phía trên. */
    readonly thumbnailUrl: string | null
  }[]
  /** Cùng quy ước với `InstagramExplore.fetchError` — xem ghi chú ở đó. */
  readonly fetchError: string | null
}

interface FacebookPostItem {
  readonly id?: string
  readonly message?: string
  readonly created_time?: string
  readonly reactions?: { readonly summary?: { readonly total_count?: number } }
  readonly comments?: { readonly summary?: { readonly total_count?: number } }
  readonly shares?: { readonly count?: number }
  readonly permalink_url?: string
  readonly full_picture?: string
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
    'message,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares,permalink_url,full_picture',
  )
  url.searchParams.set('since', range.startDate)
  url.searchParams.set('until', range.endDate)
  url.searchParams.set('limit', '25')

  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    return { topPosts: [], fetchError: `Facebook trả lỗi HTTP ${response.status}` }
  }

  const data = (await response.json()) as { data?: readonly FacebookPostItem[] }

  const topPosts = (data.data ?? [])
    .map((item) => ({
      message: item.message ?? '(không có nội dung)',
      reactions: item.reactions?.summary?.total_count ?? 0,
      comments: item.comments?.summary?.total_count ?? 0,
      shares: item.shares?.count ?? 0,
      createdAt: item.created_time ?? null,
      permalinkUrl: item.permalink_url ?? null,
      thumbnailUrl: item.full_picture ?? null,
    }))
    .sort(
      (a, b) =>
        b.reactions + b.comments + b.shares - (a.reactions + a.comments + a.shares),
    )
    .slice(0, 10)

  return { topPosts, fetchError: null }
}
