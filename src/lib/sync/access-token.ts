import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'
import { getSiteOAuthCredentials } from '@/lib/data/site-oauth-apps'
import { PROVIDER_META, type ProviderId } from '@/lib/domain/providers'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import {
  resolveFacebookPageAccessToken,
  resolveInstagramPageAccessToken,
} from '@/lib/providers/meta-discovery'
import type { Database } from '@/lib/supabase/database.types'

export type AccessTokenResult =
  | { readonly ok: true; readonly accessToken: string }
  | { readonly ok: false; readonly error: string }

/**
 * Một access token còn sống, dùng gọi API ngay bây giờ — tự làm mới và ghi
 * đè (mã hoá) nếu đã hết hạn. Dùng chung cho MỌI provider — kể cả
 * `facebook`/`instagram`, đây LUÔN là User token, KHÔNG phải Page token
 * (xem `resolvePageAccessToken` bên dưới cho trường hợp cần Page token) —
 * `resyncSite`/`findMetaSourceConnection` (mượn connection `instagram` để
 * lấy Facebook Ads account) và mọi request cấp-Business-Manager khác
 * (`/me/accounts`, `/me/adaccounts`) BẮT BUỘC User token, một Page token đưa
 * vào các edge đó trả lỗi khác hẳn (thường là rỗng, không phải lỗi rõ ràng)
 * — từng khiến `resyncSite` xoá nhầm toàn bộ connection Meta của Site khi
 * thử gộp hai khái niệm "token của connection" và "token cho request Page"
 * làm một, phát hiện qua review độc lập trước khi kịp lên production.
 */
export async function resolveAccessToken(
  admin: SupabaseClient<Database>,
  connectionId: string,
  siteId: string,
  provider: ProviderId,
): Promise<AccessTokenResult> {
  const { data: secret } = await admin
    .from('connection_secrets')
    .select('access_token_enc, refresh_token_enc, expires_at')
    .eq('connection_id', connectionId)
    .maybeSingle()

  if (!secret) return { ok: false, error: 'no-secret' }

  const expired = !secret.expires_at || new Date(secret.expires_at) <= new Date()
  if (!expired) return { ok: true, accessToken: decrypt(secret.access_token_enc) }

  if (!secret.refresh_token_enc) return { ok: false, error: 'expired-no-refresh' }

  const family = PROVIDER_META[provider].family
  const oauthAdapter = OAUTH_ADAPTERS[family]
  if (!oauthAdapter) return { ok: false, error: 'family-not-ready' }

  const credentials = await getSiteOAuthCredentials(siteId, family)
  if (!credentials) return { ok: false, error: 'app-not-configured' }

  const refreshToken = decrypt(secret.refresh_token_enc)
  const refreshed = await oauthAdapter.refresh(credentials, refreshToken)

  await admin
    .from('connection_secrets')
    .update({
      access_token_enc: encrypt(refreshed.accessToken),
      refresh_token_enc: encrypt(refreshed.refreshToken ?? refreshToken),
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', connectionId)

  return { ok: true, accessToken: refreshed.accessToken }
}

/**
 * Access token dùng để gọi các edge CẤP PAGE của Facebook/Instagram
 * (`/{page-id}/published_posts`, `/{page-id}/insights`, `/{ig-id}/media`) —
 * những edge này từ chối User token với HTTP 403 (xác nhận qua lỗi thật
 * trên app của người dùng, 8/2026), khác `/me/accounts`/`/me/adaccounts`
 * (cấp Business Manager, cần đúng User token, xem `resolveAccessToken` ở
 * trên). CHỈ dùng ở nơi THẬT SỰ gọi edge cấp Page — `sync-connection.ts`
 * (fetchDailyMetrics + content snapshot của facebook/instagram) và
 * `site-channel-detail.ts` (fetchFacebookContentExplore/fetchInstagramExplore).
 * KHÔNG dùng ở `resync-site.ts`/`meta-ads-accounts.ts`/mọi nơi gọi
 * `listAccounts`/`/me/adaccounts` — những nơi đó vẫn phải gọi thẳng
 * `resolveAccessToken`.
 *
 * KHÔNG lưu lại Page token — luôn dò LẠI từ User token hiện có (đã được
 * `resolveAccessToken` tự làm mới nếu hết hạn) mỗi lần cần dùng, xem chú
 * thích đầy đủ trong `resolveFacebookPageAccessToken`/
 * `resolveInstagramPageAccessToken` (`meta-discovery.ts`).
 */
export async function resolvePageAccessToken(
  admin: SupabaseClient<Database>,
  connectionId: string,
  siteId: string,
  provider: 'facebook' | 'instagram',
): Promise<AccessTokenResult> {
  const userTokenResult = await resolveAccessToken(admin, connectionId, siteId, provider)
  if (!userTokenResult.ok) return userTokenResult

  const { data: connection } = await admin
    .from('connections')
    .select('external_account_id')
    .eq('id', connectionId)
    .maybeSingle()
  if (!connection) return { ok: false, error: 'no-connection' }

  const pageAccessToken =
    provider === 'facebook'
      ? await resolveFacebookPageAccessToken(userTokenResult.accessToken, connection.external_account_id)
      : await resolveInstagramPageAccessToken(userTokenResult.accessToken, connection.external_account_id)

  if (!pageAccessToken) return { ok: false, error: 'no-page-token' }
  return { ok: true, accessToken: pageAccessToken }
}

/**
 * Key Klaviyo — KHÔNG dùng `resolveAccessToken` ở trên, cố tình tách riêng.
 * `resolveAccessToken` coi `!expires_at` là "đã hết hạn" (dòng 45) rồi đòi
 * `refresh_token_enc` (dòng 48) — đúng với MỌI provider OAuth khác (token
 * luôn có hạn, luôn refresh được), nhưng SAI với Klaviyo: private API key
 * không hết hạn và không có refresh token theo thiết kế (xem
 * `verifyKlaviyoApiKey` trong `providers/klaviyo.ts`). Gọi nhầm hàm kia sẽ
 * luôn trả lỗi `expired-no-refresh` dù key vẫn còn dùng được.
 */
export async function resolveKlaviyoApiKey(
  admin: SupabaseClient<Database>,
  connectionId: string,
): Promise<AccessTokenResult> {
  const { data: secret } = await admin
    .from('connection_secrets')
    .select('access_token_enc')
    .eq('connection_id', connectionId)
    .maybeSingle()

  if (!secret) return { ok: false, error: 'no-secret' }
  return { ok: true, accessToken: decrypt(secret.access_token_enc) }
}
