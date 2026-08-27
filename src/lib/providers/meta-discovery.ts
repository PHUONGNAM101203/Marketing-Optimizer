import 'server-only'

import { normalizeHostname } from '@/lib/domain/hostname'
import type { DiscoveredAccount } from './types'

/**
 * Dò tài sản Meta thật sự gắn với website của Site đang kết nối.
 *
 * Ba sản phẩm, hai mức tin cậy domain khác hẳn nhau:
 *   · Instagram — tài khoản chuyên nghiệp luôn gắn với một Facebook Page, và
 *     Page CÓ THỂ khai báo trường `website`. Lọc CỨNG như GA4/GSC: không khớp
 *     thì bỏ qua, không đoán.
 *   · Facebook (nội dung Page — KHÁC `meta-ads`) — cùng domain signal với
 *     Instagram vì cùng đọc từ CHÍNH Page đó (`website` field), không cần
 *     Instagram Business account liên kết. Site có Page khớp domain nhưng
 *     CHƯA link Instagram vẫn tự kết nối được `facebook`.
 *   Cả hai là sản phẩm Meta DUY NHẤT tự động kết nối được — cùng lý do Google
 *   Ads bị loại khỏi `google-discovery.ts`, một access token Meta có thể quản
 *   lý Business Manager của NHIỀU khách hàng khác nhau, ad account không có
 *   khái niệm domain để lọc an toàn.
 *   · Facebook Ads (`meta-ads`) — KHÔNG có domain signal nào (Marketing API
 *     không lưu website trên ad account), giống Google Ads hệt. Luôn thủ công
 *     qua `MetaAdsPicker`, xem `lib/data/meta-ads-accounts.ts`.
 */

const GRAPH_VERSION = 'v25.0'
const PAGES_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
const AD_ACCOUNTS_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts`

const authHeader = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

interface FacebookPage {
  readonly id?: string
  readonly name?: string
  readonly website?: string
  readonly access_token?: string
  readonly picture?: { readonly data?: { readonly url?: string } }
  readonly instagram_business_account?: {
    readonly id?: string
    readonly username?: string
    readonly profile_picture_url?: string
  }
}

const pageMatchesDomain = (page: FacebookPage, targetDomain: string): boolean => {
  if (!page.website) return false
  try {
    return normalizeHostname(new URL(page.website).hostname) === targetDomain
  } catch {
    return false
  }
}

export const discoverMetaAccounts = async (
  accessToken: string,
  domain: string,
): Promise<DiscoveredAccount[]> => {
  const targetDomain = normalizeHostname(domain)

  const url = new URL(PAGES_ENDPOINT)
  url.searchParams.set(
    'fields',
    'name,website,picture{url},instagram_business_account{id,username,profile_picture_url}',
  )
  const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
  if (!response.ok) return []

  const data = (await response.json()) as { data?: readonly FacebookPage[] }
  const matchingPages = (data.data ?? []).filter((page) => pageMatchesDomain(page, targetDomain))

  const facebookAccounts: DiscoveredAccount[] = matchingPages
    .filter((page): page is Required<Pick<FacebookPage, 'id'>> & FacebookPage => Boolean(page.id))
    .map((page) => ({
      provider: 'facebook' as const,
      externalAccountId: page.id as string,
      accountName: page.name ?? (page.id as string),
      avatarUrl: page.picture?.data?.url ?? null,
    }))

  const instagramAccounts: DiscoveredAccount[] = matchingPages
    .filter(
      (page): page is Required<Pick<FacebookPage, 'instagram_business_account'>> & FacebookPage =>
        Boolean(page.instagram_business_account?.id),
    )
    .map((page) => ({
      provider: 'instagram' as const,
      externalAccountId: page.instagram_business_account.id as string,
      accountName:
        page.instagram_business_account.username ?? page.name ?? (page.instagram_business_account.id as string),
      avatarUrl: page.instagram_business_account.profile_picture_url ?? null,
    }))

  return [...facebookAccounts, ...instagramAccounts]
}

interface GraphErrorBody {
  readonly error?: { readonly message?: string; readonly code?: number }
}

/** Log lý do THẬT khi Graph từ chối — không bao giờ log token. Không log
 * được lý do là lý do khiến lỗi 403 gốc phải mất cả một vòng đối chiếu
 * screenshot + git archaeology mới root-cause được, không lặp lại điều đó. */
const logGraphFailure = async (context: string, response: Response): Promise<void> => {
  const body = (await response.json().catch(() => null)) as GraphErrorBody | null
  console.error(`${context}: HTTP ${response.status}${body?.error?.message ? ` — ${body.error.message}` : ''}`)
}

/**
 * Đổi User access token sang PAGE access token của đúng một Page —
 * `/{page-id}/published_posts`, `/{page-id}/insights` và mọi edge cấp Page
 * khác của Graph API từ chối thẳng User token với HTTP 403 (đã xác nhận qua
 * lỗi thật trên app của người dùng, 8/2026) — CHỈ `/me/accounts` (dò tài sản
 * lúc kết nối, xem `discoverMetaAccounts` ở trên) và vài edge cấp-người-dùng
 * khác chấp nhận User token. Đây là lỗ hổng gốc khiến toàn bộ pipeline đọc
 * nội dung Facebook luôn trả 403 kể từ khi được build — `meta-discovery.ts`
 * trước đó không request field `access_token` nên chưa từng lấy được Page
 * token nào.
 *
 * KHÔNG lưu lại Page token — luôn dò LẠI từ User token hiện có (đã được
 * `resolveAccessToken` tự làm mới nếu hết hạn) mỗi lần cần dùng. Page token
 * lấy từ một User token dài hạn thường không tự hết hạn theo thời gian như
 * User token, nhưng cũng không có endpoint "làm mới" riêng cho nó — dò lại
 * mỗi lần là cách đơn giản nhất, tránh phải thêm một tầng lưu trữ/làm mới
 * riêng cho một token phụ.
 */
export const resolveFacebookPageAccessToken = async (
  userAccessToken: string,
  pageId: string,
): Promise<string | null> => {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}`)
    url.searchParams.set('fields', 'access_token')
    const response = await fetch(url.toString(), { headers: authHeader(userAccessToken) })
    if (!response.ok) {
      await logGraphFailure(`Không dò được Page access token (page ${pageId})`, response)
      return null
    }

    const body = (await response.json()) as { readonly access_token?: string }
    return body.access_token ?? null
  } catch (error) {
    console.error(`Không dò được Page access token (page ${pageId}): ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Instagram Business API (qua luồng Facebook Login mà app này triển khai)
 * xác thực bằng Page token của CHÍNH Page đã liên kết tài khoản Instagram
 * đó — không có khái niệm "Instagram token" riêng. `externalAccountId` của
 * connection `instagram` là ID tài khoản Instagram Business, KHÔNG phải ID
 * Page, nên phải dò lại `/me/accounts` để tìm đúng Page đang liên kết
 * (không có endpoint đảo ngược "từ IG account ID ra Page ID" trực tiếp).
 */
export const resolveInstagramPageAccessToken = async (
  userAccessToken: string,
  instagramBusinessAccountId: string,
): Promise<string | null> => {
  try {
    const url = new URL(PAGES_ENDPOINT)
    url.searchParams.set('fields', 'access_token,instagram_business_account{id}')
    url.searchParams.set('limit', '100')
    const response = await fetch(url.toString(), { headers: authHeader(userAccessToken) })
    if (!response.ok) {
      await logGraphFailure(`Không dò được Page access token (Instagram ${instagramBusinessAccountId})`, response)
      return null
    }

    const body = (await response.json()) as { readonly data?: readonly FacebookPage[] }
    const page = (body.data ?? []).find(
      (candidate) => candidate.instagram_business_account?.id === instagramBusinessAccountId,
    )
    return page?.access_token ?? null
  } catch (error) {
    console.error(`Không dò được Page access token (Instagram ${instagramBusinessAccountId}): ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export interface FacebookAdAccount {
  readonly id: string
  readonly name: string
}

interface FacebookAdAccountEntry {
  readonly id?: string
  readonly name?: string
  readonly account_status?: number
}

/** TOÀN BỘ ad account tài khoản này quản lý được, KHÔNG lọc domain — dùng
 * cho `MetaAdsPicker`, người dùng tự chọn đúng cái, an toàn hơn đoán sai. */
export const listAccessibleFacebookAdAccounts = async (
  accessToken: string,
): Promise<readonly FacebookAdAccount[]> => {
  const url = new URL(AD_ACCOUNTS_ENDPOINT)
  url.searchParams.set('fields', 'name,account_status')
  const response = await fetch(url.toString(), { headers: authHeader(accessToken) })
  if (!response.ok) return []

  const data = (await response.json()) as { data?: readonly FacebookAdAccountEntry[] }

  return (data.data ?? [])
    .filter((account): account is Required<Pick<FacebookAdAccountEntry, 'id'>> & FacebookAdAccountEntry =>
      Boolean(account.id),
    )
    .map((account) => ({ id: account.id, name: account.name ?? account.id }))
}

/**
 * Số người theo dõi CỐ ĐỊNH (không phụ thuộc khoảng ngày trang đang lọc) —
 * dùng cho header trang chi tiết kênh. `followers_count` có mặt trên CẢ node
 * Facebook Page lẫn node Instagram Business Account (cùng tên field, cùng
 * hình dạng response) nên dùng chung một hàm cho cả hai — khác `fan_count`
 * (Facebook, "lượt thích Page", khái niệm cũ Meta đang dần bỏ, không dùng ở
 * đây). Nhận thẳng Page access token đã resolve sẵn ở nơi gọi
 * (`getChannelDetail`) — edge cấp Page cùng lý do
 * `resolveFacebookPageAccessToken`/`resolveInstagramPageAccessToken`, không
 * cần dò lại token trong hàm này.
 */
/**
 * Ảnh đại diện HIỆN TẠI của Page/tài khoản IG, gọi thẳng node bằng Page token —
 * cùng khuôn `fetchMetaFollowerCount` ngay dưới, KHÁC `discoverMetaAccounts` ở
 * chỗ không cần User token và không phải liệt kê toàn bộ Page.
 *
 * Cần vì `connections.avatar_url` chỉ được ghi MỘT LẦN lúc kết nối, mà URL ảnh
 * của fbcdn có chữ ký và hết hạn — đo thật 27/8/2026: ảnh đại diện đang lưu trả
 * về HTTP 403. Muốn chép được ảnh về Storage thì phải xin link còn sống trước.
 */
export const fetchMetaAvatarUrl = async (
  pageAccessToken: string,
  externalAccountId: string,
  provider: 'facebook' | 'instagram',
): Promise<string | null> => {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}`)
    // Hai nền tảng phơi ảnh đại diện qua HAI field khác nhau: Page dùng
    // `picture` (lồng trong `data`), tài khoản IG dùng `profile_picture_url`
    // (chuỗi phẳng). Xin nhầm field thì Graph trả 400 chứ không bỏ qua.
    url.searchParams.set('fields', provider === 'facebook' ? 'picture{url}' : 'profile_picture_url')
    const response = await fetch(url.toString(), { headers: authHeader(pageAccessToken) })
    if (!response.ok) {
      await logGraphFailure(`Không lấy được ảnh đại diện (${externalAccountId})`, response)
      return null
    }

    const body = (await response.json()) as {
      readonly picture?: { readonly data?: { readonly url?: string } }
      readonly profile_picture_url?: string
    }
    return (provider === 'facebook' ? body.picture?.data?.url : body.profile_picture_url) ?? null
  } catch (error) {
    console.error(
      `Không lấy được ảnh đại diện (${externalAccountId}): ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

export const fetchMetaFollowerCount = async (
  pageAccessToken: string,
  externalAccountId: string,
): Promise<number | null> => {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${externalAccountId}`)
    url.searchParams.set('fields', 'followers_count')
    const response = await fetch(url.toString(), { headers: authHeader(pageAccessToken) })
    if (!response.ok) {
      await logGraphFailure(`Không lấy được followers_count (${externalAccountId})`, response)
      return null
    }

    const body = (await response.json()) as { readonly followers_count?: number }
    return body.followers_count ?? null
  } catch (error) {
    console.error(`Không lấy được followers_count (${externalAccountId}): ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
