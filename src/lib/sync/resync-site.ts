import 'server-only'

import { PROVIDER_META, isProviderId, type ProviderFamily, type ProviderId } from '@/lib/domain/providers'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccessToken } from './access-token'
import { syncConnection } from './sync-connection'

export interface ResyncSiteResult {
  readonly synced: number
  /** Số kết nối bị đánh dấu là không còn khớp tài khoản. KHÔNG phải số bị xoá —
   * xem lý do ở docblock dưới. */
  readonly flagged: number
}

/**
 * Đồng bộ lại TOÀN BỘ connection của một Site — nút "Đồng bộ lại" trên
 * topbar. Hai việc trong một lượt:
 *
 *   1. Đồng bộ số liệu cho những connection còn khớp domain của Site này.
 *   2. ĐÁNH DẤU những connection KHÔNG còn khớp — trường hợp thường gặp: một
 *      tài khoản Google quản lý nhiều website, và một property/site đã lỡ gắn
 *      nhầm vào Site này.
 *
 * ĐÁNH DẤU, KHÔNG XOÁ. Bản trước xoá thẳng, và ngày 7/9/2026 nó xoá mất một
 * kênh TikTok thật cùng toàn bộ 997 hàng lịch sử snapshot — không khôi phục
 * được. Xoá dữ liệu người dùng không bao giờ được phép là hệ quả tự động của
 * một nút "Đồng bộ lại"; nhiều nhất là chỉ ra chỗ nghi ngờ rồi để người dùng
 * tự quyết định trên trang Kết nối.
 *
 * XÁC THỰC BẰNG TOKEN CỦA CHÍNH KẾT NỐI ĐÓ, không phải token của kết nối đầu
 * tiên trong gia đình. Bản trước giả định "một access token đại diện đủ cho cả
 * gia đình" — đúng với Google (một lượt cấp quyền liệt kê được nhiều property)
 * nhưng SAI HOÀN TOÀN với TikTok: Display API gắn mỗi token với ĐÚNG MỘT tài
 * khoản (xem `tiktok.ts`), nên hỏi bằng token của kênh A thì kênh B và C chắc
 * chắn bị coi là không hợp lệ. Đó chính là cách kênh TikTok kia biến mất, và
 * `access-token.ts` còn ghi lại một lần tương tự đã xảy ra với Meta trước đó.
 *
 * Kết quả `listAccounts` được nhớ theo TOKEN: các connection Google trong cùng
 * một lượt cấp quyền dùng chung token nên vẫn chỉ tốn một lượt gọi, còn TikTok
 * ba token khác nhau thì hỏi đúng ba lần.
 */
export async function resyncSite(siteId: string, domain: string): Promise<ResyncSiteResult> {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('connections')
    .select('id, provider, external_account_id')
    .eq('site_id', siteId)

  const connections = (rows ?? []).filter(
    (row): row is typeof row & { provider: ProviderId } => isProviderId(row.provider),
  )

  const byFamily = new Map<ProviderFamily, typeof connections>()
  for (const connection of connections) {
    const family = PROVIDER_META[connection.provider].family
    byFamily.set(family, [...(byFamily.get(family) ?? []), connection])
  }

  let synced = 0
  let flagged = 0

  // Nhớ theo access token: nhiều connection dùng chung một lượt cấp quyền
  // (Google) chỉ tốn một lượt gọi, còn token khác nhau thì hỏi riêng.
  const accountsByToken = new Map<string, ReadonlySet<string>>()

  for (const [family, familyConnections] of byFamily) {
    const adapter = OAUTH_ADAPTERS[family]
    if (!adapter) continue // chưa có adapter thật cho gia đình này — không đụng vào

    for (const connection of familyConnections) {
      const tokenResult = await resolveAccessToken(
        admin,
        connection.id,
        siteId,
        connection.provider,
      )

      // Không lấy được token thì KHÔNG kết luận gì về kết nối này. Vẫn thử
      // đồng bộ: `syncConnection` tự lo token của chính nó và tự ghi lỗi đúng
      // cách nếu hỏng thật.
      if (tokenResult.ok) {
        let validKeys = accountsByToken.get(tokenResult.accessToken)
        if (!validKeys) {
          const accounts = await adapter.listAccounts(tokenResult.accessToken, domain)
          validKeys = new Set(
            accounts.map((account) => `${account.provider}:${account.externalAccountId}`),
          )
          accountsByToken.set(tokenResult.accessToken, validKeys)
        }

        // Danh sách RỖNG nghĩa là không liệt kê được gì — lượt gọi hỏng, thiếu
        // quyền, hoặc nền tảng đang trục trặc. Coi đó là "không tài khoản nào
        // hợp lệ" rồi đánh dấu hàng loạt là đúng cách hỏng nguy hiểm nhất:
        // một sự cố tạm thời phía nền tảng biến thành báo động giả trên mọi
        // kết nối. Chỉ kết luận khi CÓ liệt kê được ít nhất một tài khoản.
        const key = `${connection.provider}:${connection.external_account_id}`
        if (validKeys.size > 0 && !validKeys.has(key)) {
          await admin
            .from('connections')
            .update({
              status: 'error',
              error_code: 'account-not-found',
              error_message:
                'Tài khoản này không còn nằm trong quyền truy cập đã cấp. Nếu đúng là không dùng nữa, gỡ kết nối ở trang Kết nối; nếu vẫn cần, kết nối lại.',
              error_at: new Date().toISOString(),
            })
            .eq('id', connection.id)
          flagged += 1
          continue
        }
      }

      const result = await syncConnection(connection.id)
      if (result.ok) synced += 1
    }
  }

  return { synced, flagged }
}
