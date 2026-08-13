import 'server-only'

import { listAllGtmContainers } from '@/lib/providers/google-discovery'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { findGoogleSourceConnection } from './google-source-connection'

/**
 * Container Tag Manager mà Site NÀY có thể kết nối — chỉ dùng khi lọc domain
 * tự động (`google-discovery.ts`) không tìm ra gì, vì phần lớn container
 * không khai báo `domainName`. Người dùng tự chọn đúng cái, an toàn hơn đoán.
 */
export interface GtmContainerOption {
  readonly containerPath: string
  readonly name: string
}

export type GtmContainersResult =
  | { readonly ok: true; readonly containers: readonly GtmContainerOption[] }
  | { readonly ok: false; readonly error: string }

export const listAvailableGtmContainers = async (
  siteId: string,
): Promise<GtmContainersResult> => {
  const admin = createAdminClient()

  const connection = await findGoogleSourceConnection(admin, siteId)
  if (!connection) return { ok: false, error: 'no-google-connection' }

  const tokenResult = await resolveAccessToken(admin, connection.id, siteId, connection.provider)
  if (!tokenResult.ok) return { ok: false, error: tokenResult.error }

  const containers = await listAllGtmContainers(tokenResult.accessToken)

  return {
    ok: true,
    containers: containers.map((container) => ({
      containerPath: container.externalAccountId,
      name: container.accountName,
    })),
  }
}
