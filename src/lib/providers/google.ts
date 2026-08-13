import 'server-only'

import { discoverGoogleAccounts } from './google-discovery'
import type { OAuthFamilyAdapter, TokenSet } from './types'

/**
 * Adapter OAuth cho gia đình Google.
 *
 * Thuần (pure): không đọc biến môi trường, không đọc database — Client
 * ID/Secret luôn do nơi gọi truyền vào, vì mỗi Site tự khai báo OAuth app
 * riêng của họ (`site_oauth_apps`). Việc DÒ tài sản (GA4 property nào, GTM
 * container nào…) nằm ở `google-discovery.ts` — tách ra vì đó là một mối
 * quan tâm khác hẳn xin quyền và đổi mã token.
 *
 * `adwords` (Google Ads) KHÔNG nằm trong SCOPES mặc định — và ĐÂY LÀ CHỦ Ý
 * QUAN TRỌNG, không phải thiếu sót. Google Ads API chỉ có ĐÚNG MỘT scope duy
 * nhất, `adwords`, và nó KHÔNG có bản chỉ-đọc — cấp nó là cấp toàn quyền
 * xem/sửa/xoá chiến dịch. Nhét nó vào SCOPES chung nghĩa là MỌI người bấm
 * "Kết nối tài khoản Google" — kể cả người chỉ cần GA4 — đều bị xin quyền
 * quản lý Ads, mâu thuẫn thẳng với dòng chữ "Chúng tôi chỉ xin quyền đọc báo
 * cáo" hiện ngay trên trang Kết nối. Ads phải là một lượt cấp quyền RIÊNG,
 * người dùng chủ động bấm, xem `extraScopes` ở `authorizeUrl` và route
 * `/api/oauth/google/start?upgrade=ads`.
 */

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'

/** Content API for Shopping — cùng vấn đề như `adwords`: chỉ có ĐÚNG MỘT
 * scope, không có bản chỉ-đọc, cấp quyền sửa/xoá sản phẩm luôn dù app này
 * chỉ dùng để ĐỌC trạng thái duyệt. Cùng cơ chế `extraScopes` opt-in như Ads. */
export const GOOGLE_MERCHANT_SCOPE = 'https://www.googleapis.com/auth/content'

interface GoogleTokenResponse {
  readonly access_token: string
  readonly refresh_token?: string
  readonly expires_in: number
}

const toTokenSet = (data: GoogleTokenResponse): TokenSet => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token ?? null,
  expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
})

export const googleAdapter: OAuthFamilyAdapter = {
  family: 'google',
  scopes: SCOPES,

  authorizeUrl({ credentials, state, redirectUri, extraScopes }) {
    const url = new URL(AUTHORIZE_ENDPOINT)
    url.searchParams.set('client_id', credentials.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', [...SCOPES, ...(extraScopes ?? [])].join(' '))
    // offline + consent: bắt buộc để Google trả refresh_token. Không có
    // "consent" thì lần đăng nhập thứ hai trở đi Google âm thầm bỏ qua màn
    // hình chấp thuận và không gửi refresh_token nữa.
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('state', state)
    return url.toString()
  },

  async exchangeCode({ credentials, code, redirectUri }) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!response.ok) {
      throw new Error(`Google từ chối đổi mã xác thực: ${await response.text()}`)
    }

    return toTokenSet((await response.json()) as GoogleTokenResponse)
  },

  async refresh(credentials, refreshToken) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      throw new Error(`Google từ chối làm mới token: ${await response.text()}`)
    }

    const tokens = toTokenSet((await response.json()) as GoogleTokenResponse)
    // Lệnh refresh không trả refresh_token mới — Google chỉ cấp một lần.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  },

  async listAccounts(accessToken, domain) {
    return discoverGoogleAccounts(accessToken, domain)
  },
}
