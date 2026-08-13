import 'server-only'

import {
  GoogleAdsApiError,
  listAccessibleGoogleAdsAccounts,
  type GoogleAdsAccount,
} from '@/lib/providers/google-ads'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { findGoogleSourceConnection } from './google-source-connection'
import { getGoogleAdsDeveloperToken } from './site-oauth-apps'

/**
 * Tài khoản Google Ads mà Site NÀY có thể kết nối — khác GA4/GSC ở một điểm
 * quan trọng: Ads không cho biết tài khoản nào gắn với domain nào qua API,
 * nên KHÔNG tự động kết nối được. Trang Kết nối liệt kê ra, người dùng tự
 * chọn đúng tài khoản — an toàn hơn đoán sai.
 */
export type GoogleAdsAccountsResult =
  | { readonly ok: true; readonly accounts: readonly GoogleAdsAccount[] }
  | { readonly ok: false; readonly error: string; readonly detail?: string }

export const listAvailableGoogleAdsAccounts = async (
  siteId: string,
): Promise<GoogleAdsAccountsResult> => {
  const admin = createAdminClient()

  // Ads dùng CHUNG lượt cấp quyền Google với GA4/GSC/GTM/YouTube — mượn token
  // từ bất kỳ connection Google nào của Site đã có, không cần xin lại.
  const connection = await findGoogleSourceConnection(admin, siteId)

  if (!connection) {
    return { ok: false, error: 'no-google-connection' }
  }

  const [tokenResult, developerToken] = await Promise.all([
    resolveAccessToken(admin, connection.id, siteId, connection.provider),
    getGoogleAdsDeveloperToken(siteId),
  ])

  if (!tokenResult.ok) return { ok: false, error: tokenResult.error }
  if (!developerToken) return { ok: false, error: 'no-developer-token' }

  try {
    const accounts = await listAccessibleGoogleAdsAccounts(tokenResult.accessToken, developerToken)
    return { ok: true, accounts }
  } catch (error) {
    if (!(error instanceof GoogleAdsApiError)) {
      return { ok: false, error: 'ads-api-error' }
    }

    // Đọc đúng lý do Google trả về thay vì đoán từ mã HTTP — 403 có thể là
    // rất nhiều nguyên nhân khác nhau, mỗi cái cần một hướng dẫn khác nhau.
    if (error.googleMessage.toLowerCase().includes('insufficient authentication scopes')) {
      return { ok: false, error: 'insufficient-scope' }
    }
    if (error.googleErrorCode === 'DEVELOPER_TOKEN_NOT_APPROVED') {
      return { ok: false, error: 'developer-token-test-only', detail: error.googleMessage }
    }

    return { ok: false, error: 'ads-api-error', detail: error.googleMessage }
  }
}
