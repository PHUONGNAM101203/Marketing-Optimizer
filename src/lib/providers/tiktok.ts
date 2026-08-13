import 'server-only'

import type { DiscoveredAccount, OAuthFamilyAdapter, TokenSet } from './types'

/**
 * Adapter OAuth cho TikTok Login Kit + Display API — nội dung hữu cơ của
 * CHÍNH tài khoản đã đăng nhập (video, lượt xem, thích, bình luận, chia sẻ).
 *
 * ĐỔI HẲN sản phẩm so với trước — không còn TikTok for Business (Marketing
 * API, `business-api.tiktok.com`, chi phí quảng cáo). Đây là API host hoàn
 * toàn khác (`open.tiktokapis.com`), app đăng ký riêng ở developers.tiktok.com
 * (sản phẩm "Login Kit" + "Display API"), scope khác, và mô hình một-tài-
 * khoản-một-token (không phải nhiều advertiser account như trước).
 *
 * CHƯA ai chạy thử được với app TikTok thật — hình dạng request/response
 * dưới đây bám theo nghiên cứu tài liệu Login Kit/Display API công khai
 * (8/2026), cần verify khi có Client Key/Secret thật.
 *
 * Access token ngắn hạn (`expires_in`, thường ~24h theo tài liệu) — KHÁC
 * hẳn token "không hết hạn" giả định trước đây của Business API. TikTok trả
 * `refresh_token` THẬT với TTL riêng (`refresh_expires_in`), dùng đúng vào
 * việc của nó — không còn phải gán refresh token = access token như cũ.
 */

const AUTHORIZE_ENDPOINT = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/'
const USER_INFO_ENDPOINT = 'https://open.tiktokapis.com/v2/user/info/'

// `user.info.basic` tự động cấp cho mọi app Login Kit, không cần duyệt.
// `user.info.stats` (follower/like/video count) và `video.list` (danh sách
// video) đòi App Review để chạy THẬT ngoài Sandbox — chạy được ngay trong
// Sandbox cho tối đa 10 tài khoản TikTok tự khai báo, không cần duyệt trước.
const SCOPES = ['user.info.basic', 'user.info.stats', 'video.list'] as const

interface TiktokTokenResponse {
  readonly open_id?: string
  readonly access_token?: string
  readonly expires_in?: number
  readonly refresh_token?: string
  readonly error?: string
  readonly error_description?: string
}

const toTokenSet = (body: TiktokTokenResponse): TokenSet => ({
  accessToken: body.access_token as string,
  refreshToken: body.refresh_token ?? null,
  expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000).toISOString() : null,
})

const requestToken = async (
  credentials: { readonly clientId: string; readonly clientSecret: string },
  body: Record<string, string>,
): Promise<TokenSet> => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'cache-control': 'no-cache',
    },
    body: new URLSearchParams({
      client_key: credentials.clientId,
      client_secret: credentials.clientSecret,
      ...body,
    }).toString(),
  })

  const data = (await response.json()) as TiktokTokenResponse
  if (!response.ok || !data.access_token) {
    throw new Error(`TikTok từ chối yêu cầu token: ${data.error_description ?? data.error ?? await response.text()}`)
  }
  return toTokenSet(data)
}

interface TiktokUserInfoData {
  readonly open_id?: string
  readonly display_name?: string
  readonly avatar_url?: string
}

export const tiktokAdapter: OAuthFamilyAdapter = {
  family: 'tiktok',
  scopes: SCOPES,

  authorizeUrl({ credentials, state, redirectUri }) {
    const url = new URL(AUTHORIZE_ENDPOINT)
    url.searchParams.set('client_key', credentials.clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', SCOPES.join(','))
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  },

  async exchangeCode({ credentials, code, redirectUri }) {
    // Mã xác thực TikTok trả về ĐÃ url-encode — phải decode lại trước khi
    // gửi, gửi thẳng chuỗi encode sẽ bị TikTok từ chối (đã xác nhận qua
    // nghiên cứu tài liệu OAuth 2026, khác Google/Meta không cần bước này).
    return requestToken(credentials, {
      code: decodeURIComponent(code),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })
  },

  async refresh(credentials, refreshToken) {
    return requestToken(credentials, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })
  },

  async listAccounts(accessToken) {
    // Display API không có khái niệm "nhiều tài khoản quản lý được" như
    // Business API cũ — một access token gắn CHÍNH XÁC một tài khoản TikTok
    // (người vừa đăng nhập). `listAccounts` vẫn giữ hình dạng mảng cho khớp
    // interface chung, nhưng luôn trả về đúng MỘT phần tử.
    const url = new URL(USER_INFO_ENDPOINT)
    url.searchParams.set('fields', 'open_id,display_name,avatar_url')
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return []

    const body = (await response.json()) as { data?: { user?: TiktokUserInfoData } }
    const user = body.data?.user
    if (!user?.open_id) return []

    const account: DiscoveredAccount = {
      provider: 'tiktok',
      externalAccountId: user.open_id,
      accountName: user.display_name ?? user.open_id,
      avatarUrl: user.avatar_url ?? null,
    }
    return [account]
  },
}

/**
 * Danh sách video của CHÍNH tài khoản đã đăng nhập, sắp theo lượt xem giảm
 * dần — dùng cho trang chi tiết kênh, cùng vai trò `fetchYoutubeExplore`.
 * LẤY TRỰC TIẾP mỗi lần tải trang, không lưu `metrics_daily` — video mới
 * đăng thay đổi thứ hạng liên tục, lưu lại chỉ tốn chỗ không ai dùng lại.
 *
 * `video/list` không hỗ trợ tham số lọc theo ngày (khác GA4/GSC/YouTube ở
 * trên) NÊN cũng không hỗ trợ sort theo server — tự lọc theo `create_time`
 * (Unix giây, có sẵn trong response) và tự sắp lại ở client, chỉ lấy 1 trang
 * (tối đa `max_count`, TikTok giới hạn cứng 20/lần, luôn là 20 video ĐĂNG GẦN
 * NHẤT bất kể khoảng ngày chọn). Nghĩa là chọn một khoảng ngày cũ hơn 20 video
 * gần nhất sẽ ra danh sách rỗng — giới hạn thật của API một trang, không phải
 * lỗi, không đoán thêm dữ liệu để lấp chỗ trống.
 */
const VIDEO_LIST_ENDPOINT = 'https://open.tiktokapis.com/v2/video/list/'

export interface TiktokExplore {
  readonly topVideos: readonly {
    readonly title: string
    readonly coverImageUrl: string | null
    readonly views: number
    readonly likes: number
    readonly comments: number
    readonly shares: number
  }[]
  /** `null` = tải thành công (danh sách CÓ THỂ rỗng — chọn khoảng ngày cũ
   * hơn video gần nhất, hoặc video không công khai — đó là trạng thái bình
   * thường). Khác `null` = TikTok từ chối/lỗi request, kèm lý do thô để phân
   * biệt với "chưa có video nào" — KHÔNG được lẫn hai trường hợp này, vì
   * TikTok Display API trả HTTP 200 kể cả khi có lỗi logic (mã lỗi nằm
   * trong `body.error.code`, không phải status code). */
  readonly fetchError: string | null
}

interface TiktokVideoItem {
  readonly id?: string
  readonly title?: string
  /** Chú thích thật của hầu hết video — `title` phần lớn để trống vì ứng
   * dụng TikTok không có ô nhập "tiêu đề" riêng cho bài đăng thường, chỉ có
   * ô caption/mô tả. Ưu tiên field này trước `title`. */
  readonly video_description?: string
  readonly cover_image_url?: string
  readonly view_count?: number
  readonly like_count?: number
  readonly comment_count?: number
  readonly share_count?: number
  readonly create_time?: number
}

export const fetchTiktokContentExplore = async (
  accessToken: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<TiktokExplore> => {
  const url = new URL(VIDEO_LIST_ENDPOINT)
  url.searchParams.set(
    'fields',
    'id,title,video_description,cover_image_url,view_count,like_count,comment_count,share_count,create_time',
  )

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ max_count: 20 }),
  })
  if (!response.ok) {
    return { topVideos: [], fetchError: `TikTok trả lỗi HTTP ${response.status}` }
  }

  const body = (await response.json()) as {
    readonly data?: { readonly videos?: readonly TiktokVideoItem[] }
    readonly error?: { readonly code?: string; readonly message?: string }
  }

  // HTTP 200 không đảm bảo thành công — xem docblock trên interface.
  if (body.error && body.error.code && body.error.code !== 'ok') {
    return {
      topVideos: [],
      fetchError: body.error.message ?? `TikTok từ chối yêu cầu (${body.error.code})`,
    }
  }

  const rangeStartSeconds = Math.floor(new Date(`${range.startDate}T00:00:00Z`).getTime() / 1000)
  const rangeEndSeconds = Math.floor(new Date(`${range.endDate}T23:59:59Z`).getTime() / 1000)

  const topVideos = (body.data?.videos ?? [])
    .filter(
      (video) =>
        video.create_time === undefined ||
        (video.create_time >= rangeStartSeconds && video.create_time <= rangeEndSeconds),
    )
    .map((video) => ({
      title: (video.video_description || video.title || '(không có chú thích)').slice(0, 80),
      coverImageUrl: video.cover_image_url ?? null,
      views: video.view_count ?? 0,
      likes: video.like_count ?? 0,
      comments: video.comment_count ?? 0,
      shares: video.share_count ?? 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)

  return { topVideos, fetchError: null }
}
