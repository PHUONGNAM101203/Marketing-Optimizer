import 'server-only'

/**
 * TOÀN BỘ bài đăng Facebook Page / media Instagram Business của một
 * connection, tự phân trang — dùng để ghi snapshot hằng ngày vào
 * `content_metrics_daily` (xem `sync-content-snapshots.ts`), KHÁC
 * `fetchInstagramExplore`/`fetchFacebookContentExplore` trong
 * `meta-explore.ts` (chỉ 25 bài gần nhất trong một khoảng ngày, hiển thị
 * trực tiếp ở tab Khám phá, không lưu).
 *
 * Phân trang theo CHUẨN Graph API (`paging.next` — URL đầy đủ Facebook tự
 * dựng sẵn), KHÁC cơ chế `cursor`/`has_more` riêng của TikTok
 * (`fetchAllTiktokVideos` trong `tiktok.ts`) — mỗi nền tảng một kiểu, không
 * dùng chung được. Vẫn giữ cùng hai lớp phòng thủ đã trả giá một lần ở
 * TikTok: trần số trang (`MAX_CONTENT_PAGES`) và chặn lặp URL đã thăm, để
 * một `next` bất thường (rỗng, quay lại chính nó) không kéo vòng lặp chạy
 * tới hết trần một cách vô ích — dù về lý thuyết `paging.next` của Facebook
 * đáng tin hơn `cursor` tự chế của TikTok, không có lý do bỏ qua phòng thủ
 * rẻ tiền này.
 */

const GRAPH_VERSION = 'v25.0'
// Trần 10 trang × 100/trang = 1000 bài — CỐ Ý khớp trần thực tế của TikTok
// (`MAX_VIDEO_LIST_PAGES` × 20/trang = 1000 trong `tiktok.ts`), không phải để
// đơn giản. Không đặt cao hơn: RPC `get_content_trending_snapshots` trả về
// đúng MỘT dòng MỖI BÀI ĐĂNG, vẫn phải đi qua PostgREST (`max_rows` mặc định
// 1000) — nếu trần fetch/ghi ở đây vượt 1000, `content_metrics_daily` sẽ
// tích luỹ nhiều hơn 1000 bài phân biệt cho một connection theo thời gian
// (upsert không xoá lịch sử), khiến chính RPC bị PostgREST cắt bớt kết quả.
// Giữ trần fetch bằng trần đọc là cách rẻ nhất để tránh lặp lại bài học
// PostgREST `max_rows` đã gặp ở TikTok, không cần thêm `limit` tường minh
// trong RPC.
const MAX_CONTENT_PAGES = 10
const PAGE_LIMIT = 100

export interface ContentPostSnapshot {
  readonly externalPostId: string
  readonly message: string | null
  readonly imageUrl: string | null
  readonly permalink: string | null
  /** ISO 8601 — thời điểm bài đăng THẬT được tạo (`created_time`/`timestamp`
   * của Graph API), khác ngày snapshot được ghi. */
  readonly postedAt: string | null
  readonly likes: number
  readonly comments: number
  readonly shares: number
}

/** Chỉ đi tiếp `paging.next` nếu nó THẬT SỰ trỏ về Graph API — URL này đến
 * từ response, không phải do chính ta dựng (khác mọi request khác trong
 * repo), gắn kèm access token ở header mỗi lần gọi lại. Chặn domain lạ (dù
 * Facebook chưa từng trả sai) rẻ hơn để lộ token ra một host bất kỳ nếu API
 * đổi hành vi trong tương lai. */
const isGraphApiUrl = (url: string): boolean => {
  try {
    return new URL(url).origin === 'https://graph.facebook.com'
  } catch {
    return false
  }
}

interface GraphPageOutcome {
  readonly items: readonly Record<string, unknown>[]
  /** Trang ĐẦU lỗi — khác hẳn "tài khoản không có bài nào", mà `items` rỗng thì
   * hai trường hợp nhìn giống hệt nhau. Nơi gọi cần phân biệt để lui về bộ
   * trường cũ khi Graph từ chối một trường mới. Lỗi ở trang giữa chừng không
   * tính: những bài đã lấy được vẫn dùng tốt. Cùng khuôn với
   * `TiktokAllVideosOutcome.error`. */
  readonly firstPageFailed: boolean
}

const paginateGraph = async (
  initialUrl: string,
  accessToken: string,
): Promise<GraphPageOutcome> => {
  const items: Record<string, unknown>[] = []
  let firstPageFailed = false
  let url: string | null = initialUrl
  let pages = 0
  const visited = new Set<string>()

  while (url && pages < MAX_CONTENT_PAGES && !visited.has(url)) {
    visited.add(url)
    pages += 1

    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as
        | { readonly error?: { readonly message?: string } }
        | null
      console.error(
        `Graph API trả lỗi HTTP ${response.status}${errorBody?.error?.message ? ` — ${errorBody.error.message}` : ''} khi phân trang ${url}`,
      )
      if (pages === 1) firstPageFailed = true
      break
    }

    const body = (await response.json()) as {
      readonly data?: readonly Record<string, unknown>[]
      readonly paging?: { readonly next?: string }
    }

    // Graph API cursor-based paging KHÔNG đảm bảo `paging.next` biến mất khi
    // hết dữ liệu — có thể tiếp tục trả một `next` (cursor) mới dù `data`
    // rỗng, khiến điều kiện dừng đúng đắn là "trang này rỗng", không phải
    // "hết next". Khác `fetchAllTiktokVideos` (dừng đúng khi cursor không
    // tiến) — ở đây mỗi `next` LUÔN khác URL trước (cursor mới mỗi lần), nên
    // `visited` không bắt được vòng lặp này; phải kiểm tra `data` rỗng riêng.
    const pageItems = body.data ?? []
    if (pageItems.length === 0) break
    items.push(...pageItems)

    const nextUrl = body.paging?.next ?? null
    url = nextUrl && isGraphApiUrl(nextUrl) ? nextUrl : null
  }

  return { items, firstPageFailed }
}

interface FacebookPostItem {
  readonly id?: string
  readonly message?: string
  readonly full_picture?: string
  readonly attachments?: {
    readonly data?: readonly {
      readonly media?: { readonly image?: { readonly src?: string } }
    }[]
  }
  readonly permalink_url?: string
  readonly created_time?: string
  readonly reactions?: { readonly summary?: { readonly total_count?: number } }
  readonly comments?: { readonly summary?: { readonly total_count?: number } }
  readonly shares?: { readonly count?: number }
}

/** Đọc like/comment/share thẳng từ NODE của post, cùng lựa chọn với
 * `fetchFacebookContentExplore` (xem docblock ở đó) — field trên node bài
 * viết ổn định hơn cạnh `insights` qua các đợt Meta khai tử metric. */
const FACEBOOK_POST_FIELDS =
  'message,full_picture,permalink_url,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares'

/**
 * `attachments` cho ảnh Ở KÍCH THƯỚC ĐĂNG, `full_picture` thì không.
 *
 * `full_picture` nghe như ảnh đầy đủ nhưng Graph trả bản đã thu nhỏ — đo thật
 * ngày 27/8/2026 trên 193 ảnh đã lưu: từ 368x411 tới 755x503, trung vị 44 KB.
 * `attachments{media{image{src}}}` trỏ tới ảnh gốc của bài đăng.
 *
 * Tách riêng khỏi `FACEBOOK_POST_FIELDS` để lui lại được: `attachments` cần
 * quyền `pages_read_engagement`, mà một Page kết nối bằng bộ quyền cũ sẽ khiến
 * Graph từ chối CẢ request — tức mất trắng phần đồng bộ bài đăng chỉ vì muốn
 * ảnh nét hơn. Lui về bộ trường cũ giữ cho tệ nhất cũng chỉ là ảnh như trước.
 */
const FACEBOOK_ATTACHMENT_FIELD = 'attachments{media{image{src}}}'

export const fetchAllFacebookPosts = async (
  accessToken: string,
  pageId: string,
): Promise<readonly ContentPostSnapshot[]> => {
  const buildUrl = (fields: string): string => {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/published_posts`)
    url.searchParams.set('fields', fields)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    return url.toString()
  }

  let outcome = await paginateGraph(
    buildUrl(`${FACEBOOK_POST_FIELDS},${FACEBOOK_ATTACHMENT_FIELD}`),
    accessToken,
  )
  if (outcome.firstPageFailed) {
    console.error('Graph từ chối trường attachments — thử lại không kèm ảnh gốc')
    outcome = await paginateGraph(buildUrl(FACEBOOK_POST_FIELDS), accessToken)
  }

  return outcome.items
    .map((raw) => raw as FacebookPostItem)
    .filter((item): item is FacebookPostItem & { readonly id: string } => Boolean(item.id))
    .map((item) => ({
      externalPostId: item.id,
      // Ảnh gốc trước, `full_picture` là đường lui.
      imageUrl: item.attachments?.data?.[0]?.media?.image?.src ?? item.full_picture ?? null,
      message: item.message ? item.message.slice(0, 500) : null,
      permalink: item.permalink_url ?? null,
      postedAt: item.created_time ?? null,
      likes: item.reactions?.summary?.total_count ?? 0,
      comments: item.comments?.summary?.total_count ?? 0,
      shares: item.shares?.count ?? 0,
    }))
}

interface InstagramMediaItem {
  readonly id?: string
  readonly caption?: string
  readonly media_url?: string
  readonly media_type?: string
  readonly thumbnail_url?: string
  readonly permalink?: string
  readonly timestamp?: string
  readonly like_count?: number
  readonly comments_count?: number
}

/** Instagram Graph API không có field chia sẻ cho media — `shares` luôn 0
 * (khớp cột `content_metrics_daily.shares default 0`), lớp đọc ở
 * `content-trending.ts` chuyển thành `null` khi trả ra `ContentSummary`
 * (xem `content-trending-types.ts`). `media_url` có thể vắng mặt ở
 * `CAROUSEL_ALBUM` (nằm trên từng `children`, không phải container) — chấp
 * nhận `null`, không gọi thêm request để lấy child đầu tiên. */
export const fetchAllInstagramMedia = async (
  accessToken: string,
  igUserId: string,
): Promise<readonly ContentPostSnapshot[]> => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`)
  // `thumbnail_url` là BẮT BUỘC, không phải tuỳ chọn: với media dạng VIDEO/REELS
  // thì `media_url` trỏ tới FILE VIDEO chứ không phải ảnh. Thiếu nó thì bước chép
  // ảnh nhận về `video/mp4`, loại đi vì không phải ảnh, và bài video vĩnh viễn
  // không có ảnh minh hoạ. Instagram bỏ qua trường này với media dạng ảnh.
  url.searchParams.set(
    'fields',
    'caption,media_url,media_type,thumbnail_url,permalink,timestamp,like_count,comments_count',
  )
  url.searchParams.set('limit', String(PAGE_LIMIT))

  const { items } = await paginateGraph(url.toString(), accessToken)

  return items
    .map((raw) => raw as InstagramMediaItem)
    .filter((item): item is InstagramMediaItem & { readonly id: string } => Boolean(item.id))
    .map((item) => ({
      externalPostId: item.id,
      message: item.caption ? item.caption.slice(0, 500) : null,
      imageUrl:
        item.media_type === 'VIDEO' ? (item.thumbnail_url ?? null) : (item.media_url ?? null),
      permalink: item.permalink ?? null,
      postedAt: item.timestamp ?? null,
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      shares: 0,
    }))
}
