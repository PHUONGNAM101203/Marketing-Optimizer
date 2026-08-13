import 'server-only'

import { discoverYoutubeAccounts } from './google-discovery'
import type { OAuthFamilyAdapter, TokenSet } from './types'

/**
 * Adapter OAuth cho family YouTube — TÁCH RIÊNG khỏi family `google`
 * (`google.ts`) dù cùng chạy qua endpoint OAuth của Google, vì lý do nghiệp
 * vụ: một Site có thể có người quản lý GA4/Search Console khác hẳn người
 * quản lý kênh YouTube, hai tài khoản Google khác nhau. Gộp chung một lượt
 * cấp quyền (như trước đây) ép cả hai phải dùng chung MỘT tài khoản.
 *
 * Client ID/Secret (`site_oauth_apps`, key `family='youtube'`) có thể là
 * đúng cặp đã dùng cho family `google` — về mặt kỹ thuật đó chỉ là DANH TÍNH
 * ứng dụng, không gắn với một tài khoản Google cụ thể nào. Site vẫn có thể
 * tạo một OAuth Client khác nếu muốn tách quota — cả hai đều hợp lệ, đây
 * không phải yêu cầu bắt buộc của app.
 */

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const

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

export const youtubeAdapter: OAuthFamilyAdapter = {
  family: 'youtube',
  scopes: SCOPES,

  authorizeUrl({ credentials, state, redirectUri, extraScopes }) {
    const url = new URL(AUTHORIZE_ENDPOINT)
    url.searchParams.set('client_id', credentials.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', [...SCOPES, ...(extraScopes ?? [])].join(' '))
    // offline + consent: bắt buộc để Google trả refresh_token, và bắt buộc
    // để CHỌN LẠI tài khoản mỗi lần — không có consent, Google có thể âm
    // thầm dùng lại phiên đăng nhập Google gần nhất trên trình duyệt (rất có
    // thể là tài khoản GA4/GSC, sai ý đồ tách riêng của family này).
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent select_account')
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
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  },

  // `domain` bỏ qua — kênh YouTube không có khái niệm domain trong API, xem
  // docblock ở `google-discovery.ts`.
  async listAccounts(accessToken) {
    return discoverYoutubeAccounts(accessToken)
  },
}
