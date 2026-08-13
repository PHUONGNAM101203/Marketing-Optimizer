import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/crypto'
import { getSiteOAuthCredentials } from '@/lib/data/site-oauth-apps'
import { PROVIDER_META, type ProviderId } from '@/lib/domain/providers'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import type { Database } from '@/lib/supabase/database.types'

export type AccessTokenResult =
  | { readonly ok: true; readonly accessToken: string }
  | { readonly ok: false; readonly error: string }

/**
 * Một access token còn sống, dùng gọi API ngay bây giờ — tự làm mới và ghi
 * đè (mã hoá) nếu đã hết hạn. Dùng chung cho `syncConnection` và
 * `resyncSite`: cả hai đều cần đúng một việc này trước khi gọi API thật.
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
