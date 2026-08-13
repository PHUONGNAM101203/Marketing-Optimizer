import type { ProviderFamily, ProviderId } from '@/lib/domain/providers'

/**
 * Bộ adapter OAuth theo NHÀ CUNG CẤP, không theo nền tảng.
 *
 * Lệch có chủ đích so với ý tưởng ban đầu "một interface, 8 adapter": OAuth
 * cấp quyền theo tài khoản, nên authorize/exchange/refresh chỉ có ý nghĩa ở
 * cấp gia đình (Google, Meta, TikTok). `listAccounts` là chỗ một token của
 * gia đình toả ra nhiều sản phẩm — một access token Google có thể liệt kê cả
 * property GA4 lẫn site Search Console.
 *
 * Adapter KHÔNG tự đọc Client ID/Secret từ đâu cả — mỗi Site tự khai báo
 * OAuth app riêng của họ (`site_oauth_apps`), nên credentials luôn được
 * truyền vào từ nơi gọi. Giữ adapter thuần (pure) như vậy để test không cần
 * mock biến môi trường hay database.
 *
 * `fetchEntities` / `fetchDailyMetrics` (kéo số liệu thật) thuộc M4, chưa khai
 * báo ở đây — thêm phương thức chưa có cách gọi là abstraction đoán trước.
 */

export interface OAuthCredentials {
  readonly clientId: string
  readonly clientSecret: string
}

export interface TokenSet {
  readonly accessToken: string
  /** Google chỉ trả refresh token ở lần cấp quyền đầu tiên (prompt=consent). */
  readonly refreshToken: string | null
  readonly expiresAt: string | null
}

export interface DiscoveredAccount {
  readonly provider: ProviderId
  readonly externalAccountId: string
  readonly accountName: string
  /** Ảnh đại diện kênh (YouTube/TikTok/Instagram/Facebook) — `null`/thiếu ở
   * các nền tảng không có khái niệm "kênh" (Ads/Analytics/GSC/GTM/Merchant
   * Center). Lưu một lần vào `connections.avatar_url` lúc kết nối. */
  readonly avatarUrl?: string | null
}

export interface OAuthFamilyAdapter {
  readonly family: ProviderFamily
  readonly scopes: readonly string[]
  authorizeUrl(params: {
    readonly credentials: OAuthCredentials
    readonly state: string
    readonly redirectUri: string
    /** Quyền THÊM ngoài `scopes` mặc định — dùng cho nâng quyền có chủ đích
     * (vd. Google Ads), không trộn vào lượt kết nối chung để không xin thừa
     * quyền cho người không cần. */
    readonly extraScopes?: readonly string[]
  }): string
  exchangeCode(params: {
    readonly credentials: OAuthCredentials
    readonly code: string
    readonly redirectUri: string
  }): Promise<TokenSet>
  refresh(credentials: OAuthCredentials, refreshToken: string): Promise<TokenSet>
  /**
   * `domain` giới hạn kết quả về đúng tài sản của Site đang kết nối. Một tài
   * khoản Google có thể quản lý nhiều website — không truyền domain thì
   * adapter sẽ trả về tất cả, gắn nhầm số liệu của site khác vào site này.
   */
  listAccounts(accessToken: string, domain: string): Promise<readonly DiscoveredAccount[]>
}
