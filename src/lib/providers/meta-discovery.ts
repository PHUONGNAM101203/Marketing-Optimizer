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
  readonly instagram_business_account?: { readonly id?: string; readonly username?: string }
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
  url.searchParams.set('fields', 'name,website,instagram_business_account{id,username}')
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
    }))

  return [...facebookAccounts, ...instagramAccounts]
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
