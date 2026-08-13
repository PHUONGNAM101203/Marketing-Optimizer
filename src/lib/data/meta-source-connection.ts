import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isProviderId, type ProviderId } from '@/lib/domain/providers'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Một connection Meta BẤT KỲ của Site này (hiện chỉ có Instagram) — nguồn để
 * MƯỢN access token cho Facebook Ads, không tự dò được domain qua API. Cùng
 * vai trò với `findGoogleSourceConnection` bên Google.
 */
export interface MetaSourceConnection {
  readonly id: string
  readonly provider: ProviderId
}

export const findMetaSourceConnection = async (
  admin: SupabaseClient<Database>,
  siteId: string,
): Promise<MetaSourceConnection | null> => {
  const { data } = await admin
    .from('connections')
    .select('id, provider')
    .eq('site_id', siteId)
    .eq('provider', 'instagram')
    .limit(1)
    .maybeSingle()

  if (!data || !isProviderId(data.provider)) return null
  return { id: data.id, provider: data.provider }
}
