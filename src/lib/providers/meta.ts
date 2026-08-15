import 'server-only'

import { discoverMetaAccounts } from './meta-discovery'
import type { OAuthFamilyAdapter, TokenSet } from './types'

/**
 * Adapter OAuth cho gia đình Meta (Facebook Ads + Instagram + Facebook nội
 * dung hữu cơ).
 *
 * CHƯA ai chạy thử được với một App Meta thật — hình dạng request/response
 * dưới đây bám theo tài liệu Graph API v25.0 công khai (research 2026), cần
 * verify khi có Client ID/Secret thật, giống `google-ads.ts` trước đây.
 *
 * `ads_read` KHÔNG nằm trong SCOPES mặc định — cùng lý do `adwords` của
 * Google bị tách riêng: Business Manager của một tài khoản có thể quản lý
 * quảng cáo cho NHIỀU khách hàng khác nhau, cấp `ads_read` cho mọi người bấm
 * "Kết nối tài khoản Meta" — kể cả người chỉ cần Instagram — là xin thừa
 * quyền. Xem `META_ADS_SCOPE` + checkbox tương ứng ở `ConnectPanel`.
 *
 * Meta KHÔNG có refresh token kiểu Google — access token dài hạn (long-lived,
 * ~60 ngày) tự nó là "vật liệu" để đổi lấy một access token dài hạn MỚI qua
 * cùng endpoint `fb_exchange_token`, miễn là đổi TRƯỚC KHI token cũ hết hạn.
 * `refreshToken` ở đây vì vậy luôn là chính access token đang dùng, không
 * phải một chuỗi bí mật riêng như Google.
 */

const GRAPH_VERSION = 'v25.0'
const AUTHORIZE_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`

// ĐÃ XÁC MINH với App Meta thật (8/2026): `instagram_business_basic` bị
// Facebook từ chối thẳng "Invalid Scopes" trên chính app này — quyền đó chỉ
// tồn tại ở luồng "API setup with Instagram Login" (đăng nhập trực tiếp qua
// Instagram), KHÔNG áp dụng cho luồng "API setup with Facebook Login" mà
// adapter này triển khai (`AUTHORIZE_ENDPOINT` ở trên là dialog OAuth của
// facebook.com, không phải Instagram). Với luồng Facebook Login, tên quyền
// đúng vẫn là `instagram_basic` — xác nhận bằng cách đọc trực tiếp trang
// "Quyền và tính năng" của app: `instagram_basic` đã có sẵn (nằm trong nhóm
// quyền bắt buộc của use case "Quản lý nội dung trên Instagram"), còn
// `instagram_business_basic` không xuất hiện trong danh sách quyền khả dụng
// của app này. Tài liệu Meta về việc khai tử `instagram_basic` (27/1/2025) áp
// dụng cho Instagram Basic Display API cũ, KHÔNG áp dụng cho quyền cùng tên
// trong luồng Instagram API qua Facebook Login — hai thứ trùng tên nhưng
// khác API, dễ nhầm khi chỉ tra tài liệu chung chung không đối chiếu với app
// thật (bài học: ưu tiên lỗi "Invalid Scopes" thật từ chính app hơn tài liệu).
// `read_insights` KHÔI PHỤC (8/2026) — TẠM BỎ trước đó (xem lịch sử commit
// `b1dc08d`) vì app bị Facebook từ chối "Invalid Scopes"; người dùng đã tự
// thêm quyền này vào đúng Use Case trên App Dashboard và XÁC NHẬN nó xuất
// hiện trong "Quyền và tính năng" (Standard Access, app còn ở Development
// Mode nên không cần App Review) trước khi báo lại — cùng kỷ luật đã dùng
// cho `instagram_basic`: tin lỗi/xác nhận thật từ chính app hơn tài liệu
// chung chung. Quyền này chỉ ảnh hưởng `facebookMetricsAdapter`
// (facebook-metrics.ts, gọi `/insights` cấp Page — "Lượt hiển thị Page theo
// ngày" ở tab Tổng quan) — code đọc insight đã viết sẵn từ trước, không cần
// sửa gì thêm ngoài dòng scope này. Token cũ (cấp trước khi thêm quyền)
// KHÔNG tự có quyền mới — người dùng cần ngắt kết nối rồi kết nối lại
// Facebook để lấy token mang đủ scope.
const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
  'instagram_basic',
  'instagram_manage_insights',
  'business_management',
] as const

/** Cùng cơ chế `extraScopes` opt-in như Google Ads — chỉ xin khi người dùng
 * chủ động tick "Website này có chạy Facebook Ads?". */
export const META_ADS_SCOPE = 'ads_read'

interface MetaTokenResponse {
  readonly access_token?: string
  readonly expires_in?: number
  readonly error?: { readonly message?: string }
}

const exchangeForLongLivedToken = async (
  credentials: { readonly clientId: string; readonly clientSecret: string },
  shortLivedToken: string,
): Promise<TokenSet> => {
  const url = new URL(TOKEN_ENDPOINT)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', credentials.clientId)
  url.searchParams.set('client_secret', credentials.clientSecret)
  url.searchParams.set('fb_exchange_token', shortLivedToken)

  const response = await fetch(url.toString())
  const body = (await response.json()) as MetaTokenResponse
  if (!response.ok || !body.access_token) {
    throw new Error(`Meta từ chối đổi sang token dài hạn: ${body.error?.message ?? await response.text()}`)
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.access_token,
    expiresAt: body.expires_in
      ? new Date(Date.now() + body.expires_in * 1000).toISOString()
      : null,
  }
}

export const metaAdapter: OAuthFamilyAdapter = {
  family: 'meta',
  scopes: SCOPES,

  authorizeUrl({ credentials, state, redirectUri, extraScopes }) {
    const url = new URL(AUTHORIZE_ENDPOINT)
    url.searchParams.set('client_id', credentials.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', [...SCOPES, ...(extraScopes ?? [])].join(','))
    url.searchParams.set('state', state)
    return url.toString()
  },

  async exchangeCode({ credentials, code, redirectUri }) {
    const url = new URL(TOKEN_ENDPOINT)
    url.searchParams.set('client_id', credentials.clientId)
    url.searchParams.set('client_secret', credentials.clientSecret)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('code', code)

    const response = await fetch(url.toString())
    const body = (await response.json()) as MetaTokenResponse
    if (!response.ok || !body.access_token) {
      throw new Error(`Meta từ chối đổi mã xác thực: ${body.error?.message ?? await response.text()}`)
    }

    // Token vừa đổi là short-lived (~1-2 giờ) — đổi ngay sang long-lived
    // (~60 ngày) để không phải làm mới liên tục.
    return exchangeForLongLivedToken(credentials, body.access_token)
  },

  async refresh(credentials, refreshToken) {
    // `refreshToken` ở đây chính là access token dài hạn hiện tại — xem ghi
    // chú đầu file. Đổi lại được CHỈ KHI nó chưa thật sự hết hạn; nếu đã hết
    // hạn, lệnh gọi này thất bại và `syncConnection` ghi status='error',
    // người dùng cần kết nối lại từ đầu.
    return exchangeForLongLivedToken(credentials, refreshToken)
  },

  async listAccounts(accessToken, domain) {
    return discoverMetaAccounts(accessToken, domain)
  },
}
