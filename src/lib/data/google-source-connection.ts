import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isProviderId, type ProviderId } from '@/lib/domain/providers'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Một connection Google BẤT KỲ của Site này (GA4/GSC/GTM/YouTube) — nguồn để
 * MƯỢN access token cho những sản phẩm không tự dò được domain qua API
 * (Google Ads, và Tag Manager khi không khai báo `domainName`). Không mượn
 * từ 'google-ads' vì đó chính là thứ ta thường đang cố kết nối thêm.
 */
export interface GoogleSourceConnection {
  readonly id: string
  readonly provider: ProviderId
}

export const findGoogleSourceConnection = async (
  admin: SupabaseClient<Database>,
  siteId: string,
): Promise<GoogleSourceConnection | null> => {
  const { data } = await admin
    .from('connections')
    .select('id, provider')
    .eq('site_id', siteId)
    .in('provider', ['ga4', 'gsc', 'gtm', 'youtube'])
    .limit(1)
    .maybeSingle()

  if (!data || !isProviderId(data.provider)) return null
  return { id: data.id, provider: data.provider }
}
