import 'server-only'

import { listAccessibleFacebookAdAccounts, type FacebookAdAccount } from '@/lib/providers/meta-discovery'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { findMetaSourceConnection } from './meta-source-connection'

/**
 * Tài khoản Facebook Ads mà Site NÀY có thể kết nối — không tự dò được domain
 * qua API (xem `meta-discovery.ts`), người dùng tự chọn, cùng vai trò với
 * `google-ads-accounts.ts`.
 */
export type MetaAdsAccountsResult =
  | { readonly ok: true; readonly accounts: readonly FacebookAdAccount[] }
  | { readonly ok: false; readonly error: string }

export const listAvailableMetaAdsAccounts = async (
  siteId: string,
): Promise<MetaAdsAccountsResult> => {
  const admin = createAdminClient()

  // Ads dùng CHUNG lượt cấp quyền Meta với Instagram — mượn token từ
  // connection Instagram đã có sẵn của Site, không cần xin lại.
  const connection = await findMetaSourceConnection(admin, siteId)
  if (!connection) return { ok: false, error: 'no-meta-connection' }

  const tokenResult = await resolveAccessToken(admin, connection.id, siteId, connection.provider)
  if (!tokenResult.ok) return { ok: false, error: tokenResult.error }

  const accounts = await listAccessibleFacebookAdAccounts(tokenResult.accessToken)
  return { ok: true, accounts }
}
