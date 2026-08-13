import 'server-only'

import { normalizeHostname } from '@/lib/domain/hostname'
import type { DiscoveredAccount } from './types'

/**
 * Dò tài sản Google thật sự gắn với website của Site đang kết nối.
 *
 * Tách khỏi `google.ts` (OAuth) và `google-metrics.ts` (kéo báo cáo) — đây là
 * việc thứ ba, khác cả hai: "một access token này mở ra được những tài sản
 * nào, và cái nào trong số đó là CỦA WEBSITE NÀY".
 *
 * `discoverGoogleAccounts` gộp bốn sản phẩm (GA4/GSC/GTM/Merchant Center) —
 * bốn mức độ tin cậy domain khác nhau:
 *   · GA4, Search Console — domain xác minh được chắc chắn qua API, LỌC CỨNG.
 *     Không khớp thì bỏ qua, không đoán.
 *   · Tag Manager — container CÓ THỂ khai báo `domainName`, nhưng phần lớn
 *     không khai báo. Lọc khi có, KHÔNG có domainName nào khớp thì bỏ qua
 *     toàn bộ thay vì đoán — cùng nguyên tắc với GA4/GSC.
 *   · Merchant Center — tài khoản có `websiteUrl` xác minh được, LỌC CỨNG
 *     giống GA4/GSC. Chỉ trả về khi CHÍNH tài khoản đó (không phải MCA cha)
 *     khai báo đúng domain — không đoán qua tài khoản con.
 *
 * YouTube (`discoverYoutubeAccounts`, cuối file) TÁCH RIÊNG khỏi hàm trên —
 * từ khi YouTube trở thành family OAuth độc lập (đăng nhập bằng tài khoản
 * Google có thể khác hẳn tài khoản GA4/GSC/GTM), gộp chung sẽ trộn nhầm hai
 * lượt cấp quyền khác nhau. Kênh cũng không có khái niệm domain trong API —
 * bù lại bằng `mine=true`: chỉ trả kênh CHÍNH tài khoản Google đang đăng nhập
 * sở hữu, không phải mọi kênh nó quản lý hộ — phạm vi đã đủ hẹp để không cần
 * lọc domain.
 */

const GA4_ACCOUNT_SUMMARIES_ENDPOINT =
  'https://analyticsadmin.googleapis.com/v1beta/accountSummaries'
const GA4_DATA_STREAMS_ENDPOINT = (property: string) =>
  `https://analyticsadmin.googleapis.com/v1beta/${property}/dataStreams`
const SEARCH_CONSOLE_SITES_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites'
const GTM_ACCOUNTS_ENDPOINT = 'https://www.googleapis.com/tagmanager/v2/accounts'
const GTM_CONTAINERS_ENDPOINT = (accountId: string) =>
  `https://www.googleapis.com/tagmanager/v2/accounts/${accountId}/containers`
const YOUTUBE_CHANNELS_ENDPOINT =
  'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true'
const MERCHANT_AUTHINFO_ENDPOINT =
  'https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo'
const MERCHANT_ACCOUNT_ENDPOINT = (merchantId: string) =>
  `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/accounts/${merchantId}`

const authHeader = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

// ─── GA4 ────────────────────────────────────────────────────────────────────

interface Ga4PropertySummary {
  readonly property?: string
  readonly displayName?: string
}

interface Ga4AccountSummary {
  readonly propertySummaries?: readonly Ga4PropertySummary[]
}

interface Ga4DataStream {
  readonly webStreamData?: { readonly defaultUri?: string }
}

/** `accountSummaries` không mang theo domain — phải gọi riêng Data Streams
 * API cho từng property mới biết nó gắn với website nào. */
const ga4PropertyHostnames = async (accessToken: string, property: string): Promise<string[]> => {
  const response = await fetch(GA4_DATA_STREAMS_ENDPOINT(property), {
    headers: authHeader(accessToken),
  })
  if (!response.ok) return []

  const data = (await response.json()) as { dataStreams?: readonly Ga4DataStream[] }

  return (data.dataStreams ?? [])
    .map((stream) => stream.webStreamData?.defaultUri)
    .filter((uri): uri is string => Boolean(uri))
    .map((uri) => {
      try {
        return normalizeHostname(new URL(uri).hostname)
      } catch {
        return null
      }
    })
    .filter((hostname): hostname is string => hostname !== null)
}

const listGa4Properties = async (
  accessToken: string,
  targetDomain: string,
): Promise<DiscoveredAccount[]> => {
  const response = await fetch(GA4_ACCOUNT_SUMMARIES_ENDPOINT, {
    headers: authHeader(accessToken),
  })
  if (!response.ok) return []

  const data = (await response.json()) as { accountSummaries?: readonly Ga4AccountSummary[] }

  const candidates = (data.accountSummaries ?? []).flatMap((account) =>
    (account.propertySummaries ?? []).filter(
      (property): property is Required<Ga4PropertySummary> =>
        Boolean(property.property) && Boolean(property.displayName),
    ),
  )

  const matches = await Promise.all(
    candidates.map(async (property) => {
      const hostnames = await ga4PropertyHostnames(accessToken, property.property)
      return hostnames.includes(targetDomain) ? property : null
    }),
  )

  return matches
    .filter((property): property is Required<Ga4PropertySummary> => property !== null)
    .map((property) => ({
      provider: 'ga4' as const,
      // "properties/123456" → giữ nguyên dạng đủ, GA4 Data API cần cả tiền tố.
      externalAccountId: property.property,
      accountName: property.displayName,
    }))
}

// ─── Search Console ─────────────────────────────────────────────────────────

interface SearchConsoleSiteEntry {
  readonly siteUrl?: string
  readonly permissionLevel?: string
}

/** Search Console khai báo site theo hai dạng: `sc-domain:example.com` (toàn
 * domain) hoặc `https://example.com/` (URL-prefix). Quy cả hai về hostname
 * thuần để so khớp với domain của Site. */
const hostnameFromGscSiteUrl = (siteUrl: string): string | null => {
  if (siteUrl.startsWith('sc-domain:')) {
    return normalizeHostname(siteUrl.slice('sc-domain:'.length))
  }
  try {
    return normalizeHostname(new URL(siteUrl).hostname)
  } catch {
    return null
  }
}

const listSearchConsoleSites = async (
  accessToken: string,
  targetDomain: string,
): Promise<DiscoveredAccount[]> => {
  const response = await fetch(SEARCH_CONSOLE_SITES_ENDPOINT, {
    headers: authHeader(accessToken),
  })
  if (!response.ok) return []

  const data = (await response.json()) as { siteEntry?: readonly SearchConsoleSiteEntry[] }

  return (data.siteEntry ?? [])
    .filter((site) => Boolean(site.siteUrl) && site.permissionLevel !== 'siteUnverifiedUser')
    .filter((site) => hostnameFromGscSiteUrl(site.siteUrl as string) === targetDomain)
    .map((site) => ({
      provider: 'gsc' as const,
      externalAccountId: site.siteUrl as string,
      accountName: site.siteUrl as string,
    }))
}

// ─── Tag Manager ────────────────────────────────────────────────────────────

interface GtmAccount {
  readonly accountId?: string
}

interface GtmContainer {
  readonly path?: string
  readonly publicId?: string
  readonly name?: string
  readonly domainName?: readonly string[]
}

const fetchAllGtmContainers = async (accessToken: string): Promise<readonly GtmContainer[]> => {
  const accountsResponse = await fetch(GTM_ACCOUNTS_ENDPOINT, { headers: authHeader(accessToken) })
  if (!accountsResponse.ok) return []

  const accountsData = (await accountsResponse.json()) as { account?: readonly GtmAccount[] }
  const accountIds = (accountsData.account ?? [])
    .map((account) => account.accountId)
    .filter((id): id is string => Boolean(id))

  const containerLists = await Promise.all(
    accountIds.map(async (accountId) => {
      const response = await fetch(GTM_CONTAINERS_ENDPOINT(accountId), {
        headers: authHeader(accessToken),
      })
      if (!response.ok) return []
      const data = (await response.json()) as { container?: readonly GtmContainer[] }
      return data.container ?? []
    }),
  )

  return containerLists.flat().filter((container) => Boolean(container.path))
}

const toDiscoveredContainer = (container: GtmContainer): DiscoveredAccount => ({
  provider: 'gtm' as const,
  // Lưu `path` nội bộ ("accounts/X/containers/Y"), không phải publicId
  // ("GTM-XXXX") — mọi lệnh gọi sâu hơn (workspace, tag, trigger) đều
  // cần path này, publicId chỉ để hiển thị.
  externalAccountId: container.path as string,
  accountName: container.name ?? (container.publicId as string) ?? (container.path as string),
})

const listGtmContainers = async (
  accessToken: string,
  targetDomain: string,
): Promise<DiscoveredAccount[]> => {
  const containers = await fetchAllGtmContainers(accessToken)

  return containers
    .filter((container) =>
      (container.domainName ?? []).some((domain) => normalizeHostname(domain) === targetDomain),
    )
    .map(toDiscoveredContainer)
}

/**
 * TOÀN BỘ container Tag Manager tài khoản này thấy được, KHÔNG lọc domain —
 * dùng khi lọc cứng ở trên trả về rỗng (phần lớn container không khai báo
 * `domainName`). Người dùng tự chọn đúng cái ở `GtmPicker`, an toàn hơn suy
 * đoán sai.
 */
export const listAllGtmContainers = async (
  accessToken: string,
): Promise<readonly DiscoveredAccount[]> => {
  const containers = await fetchAllGtmContainers(accessToken)
  return containers.map(toDiscoveredContainer)
}

// ─── YouTube ────────────────────────────────────────────────────────────────

interface YoutubeChannel {
  readonly id?: string
  readonly snippet?: { readonly title?: string }
}

const listYoutubeChannels = async (accessToken: string): Promise<DiscoveredAccount[]> => {
  const response = await fetch(YOUTUBE_CHANNELS_ENDPOINT, { headers: authHeader(accessToken) })
  if (!response.ok) return []

  const data = (await response.json()) as { items?: readonly YoutubeChannel[] }

  return (data.items ?? [])
    .filter((channel): channel is Required<Pick<YoutubeChannel, 'id'>> & YoutubeChannel =>
      Boolean(channel.id),
    )
    .map((channel) => ({
      provider: 'youtube' as const,
      externalAccountId: channel.id,
      accountName: channel.snippet?.title ?? channel.id,
    }))
}

// ─── Merchant Center ────────────────────────────────────────────────────────

interface MerchantAccountIdentifier {
  readonly merchantId?: string
}

interface MerchantAccount {
  readonly id?: string
  readonly name?: string
  readonly websiteUrl?: string
}

/**
 * `accounts/authinfo` không cần biết merchantId trước — nó trả về TOÀN BỘ
 * tài khoản mà chính access token này truy cập được, y hệt cách GA4 dùng
 * `accountSummaries` mà không cần biết account ID trước.
 */
const listMerchantCenterAccounts = async (
  accessToken: string,
  targetDomain: string,
): Promise<DiscoveredAccount[]> => {
  const authInfoResponse = await fetch(MERCHANT_AUTHINFO_ENDPOINT, {
    headers: authHeader(accessToken),
  })
  if (!authInfoResponse.ok) return []

  const authInfoData = (await authInfoResponse.json()) as {
    readonly accountIdentifiers?: readonly MerchantAccountIdentifier[]
  }
  const merchantIds = (authInfoData.accountIdentifiers ?? [])
    .map((entry) => entry.merchantId)
    .filter((id): id is string => Boolean(id))

  const accounts = await Promise.all(
    merchantIds.map(async (merchantId) => {
      const response = await fetch(MERCHANT_ACCOUNT_ENDPOINT(merchantId), {
        headers: authHeader(accessToken),
      })
      if (!response.ok) return null
      return (await response.json()) as MerchantAccount
    }),
  )

  return accounts
    .filter((account): account is MerchantAccount => {
      if (!account?.id || !account.websiteUrl) return false
      try {
        return normalizeHostname(new URL(account.websiteUrl).hostname) === targetDomain
      } catch {
        return false
      }
    })
    .map((account) => ({
      provider: 'merchant-center' as const,
      externalAccountId: account.id as string,
      accountName: account.name ?? (account.id as string),
    }))
}

// ─── Tổng hợp ────────────────────────────────────────────────────────────────

export const discoverGoogleAccounts = async (
  accessToken: string,
  domain: string,
): Promise<readonly DiscoveredAccount[]> => {
  const targetDomain = normalizeHostname(domain)

  const [ga4, gsc, gtm, merchantCenter] = await Promise.all([
    listGa4Properties(accessToken, targetDomain),
    listSearchConsoleSites(accessToken, targetDomain),
    listGtmContainers(accessToken, targetDomain),
    listMerchantCenterAccounts(accessToken, targetDomain),
  ])

  return [...ga4, ...gsc, ...gtm, ...merchantCenter]
}

/** YouTube giờ là family OAuth riêng (`providers/youtube.ts`) — tài khoản
 * Google đăng nhập ở đó có thể khác hẳn tài khoản dùng cho GA4/GSC/GTM ở
 * trên, nên tách khỏi `discoverGoogleAccounts`. `domain` bỏ qua vì kênh
 * YouTube không có khái niệm domain trong API (xem docblock đầu file). */
export const discoverYoutubeAccounts = async (
  accessToken: string,
): Promise<readonly DiscoveredAccount[]> => listYoutubeChannels(accessToken)

/** Dùng riêng ở luồng nâng quyền (`mode === 'merchant-center'`) — sau khi
 * token đã có thêm scope Content API, dò NGAY tài khoản khớp domain thay vì
 * bắt người dùng bấm "Kết nối" một lần nữa. */
export const discoverMerchantCenterAccounts = listMerchantCenterAccounts
