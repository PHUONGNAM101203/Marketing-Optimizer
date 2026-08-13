import 'server-only'

import { PROVIDER_META, isProviderId, type ProviderFamily, type ProviderId } from '@/lib/domain/providers'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccessToken } from './access-token'
import { syncConnection } from './sync-connection'

export interface ResyncSiteResult {
  readonly synced: number
  readonly removed: number
}

/**
 * Đồng bộ lại TOÀN BỘ connection của một Site — nút "Đồng bộ lại" trên
 * topbar. Hai việc trong một lượt:
 *
 *   1. Đồng bộ số liệu cho những connection còn khớp domain của Site này.
 *   2. GỠ những connection KHÔNG còn khớp — trường hợp thường gặp: một tài
 *      khoản Google quản lý nhiều website, và một property/site đã lỡ gắn
 *      nhầm vào Site này (kể cả những kết nối tạo trước khi có bước lọc
 *      domain lúc OAuth callback).
 *
 * Gọi `listAccounts` MỘT LẦN cho mỗi gia đình OAuth thay vì mỗi connection —
 * một access token đại diện đủ cho cả gia đình (cùng một lượt cấp quyền).
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
  let removed = 0

  for (const [family, familyConnections] of byFamily) {
    const adapter = OAUTH_ADAPTERS[family]
    if (!adapter) continue // chưa có adapter thật cho gia đình này — không đụng vào

    // Dò tài sản hợp lệ để dọn kết nối sai domain là việc CỐ GẮNG TỐT NHẤT,
    // không phải điều kiện để được đồng bộ. Trước đây một token đại diện
    // (của connection đầu tiên) hỏng là cả gia đình bị BỎ QUA HOÀN TOÀN,
    // kể cả những connection lẽ ra đồng bộ bình thường được — "Đồng bộ lại"
    // báo "không có gì để đồng bộ" trong khi rõ ràng có việc phải làm.
    // `syncConnection` tự lo token của chính nó, không phụ thuộc vào đây.
    const [first] = familyConnections
    const tokenResult = await resolveAccessToken(admin, first.id, siteId, first.provider)

    let validKeys: Set<string> | null = null
    if (tokenResult.ok) {
      const validAccounts = await adapter.listAccounts(tokenResult.accessToken, domain)
      validKeys = new Set(
        validAccounts.map((account) => `${account.provider}:${account.externalAccountId}`),
      )
    }

    for (const connection of familyConnections) {
      const key = `${connection.provider}:${connection.external_account_id}`

      // Không dò được tài sản hợp lệ (validKeys === null) → không xoá gì cả.
      // Xoá nhầm một kết nối còn tốt vì một lần dò lỗi tệ hơn nhiều so với
      // việc hoãn dọn dẹp sang lượt "Đồng bộ lại" kế tiếp.
      if (validKeys && !validKeys.has(key)) {
        await admin.from('connections').delete().eq('id', connection.id)
        removed += 1
        continue
      }

      const result = await syncConnection(connection.id)
      if (result.ok) synced += 1
    }
  }

  return { synced, removed }
}
