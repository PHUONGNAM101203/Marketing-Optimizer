import 'server-only'

import { isProviderId } from '@/lib/domain/providers'
import {
  fetchGa4Explore,
  fetchGscExplore,
  fetchYoutubeExplore,
  type Ga4Explore,
  type GscExplore,
  type YoutubeExplore,
} from '@/lib/providers/google-explore'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/** GA4 Data API/Search Console cho `limit` tới hàng chục nghìn dòng một lượt
 * gọi — luôn fetch ở TRẦN này một lần duy nhất, rồi để trang Khám phá tự cắt
 * xuống 10-1000 và đổi hạng mục HOÀN TOÀN Ở CLIENT (`buildExploreRows` trong
 * `report-builder.tsx`), không gọi lại API mỗi lần người dùng bấm nút khác.
 * Trước đây mỗi lần đổi số hàng/hạng mục là một lượt điều hướng Link mới →
 * gọi lại GA4/GSC/YouTube từ đầu, chậm rõ rệt vì phải chờ Google trả lời. */
const MAX_EXPLORE_FETCH_LIMIT = 1000

export interface ExploreSource {
  readonly ga4: Ga4Explore | null
  readonly gsc: GscExplore | null
  readonly youtube: YoutubeExplore | null
}

export const getExploreSource = async (
  siteId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<ExploreSource> => {
  const supabase = await createClient()
  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider, external_account_id')
    .eq('site_id', siteId)
    .in('provider', ['ga4', 'gsc', 'youtube'])

  const admin = createAdminClient()
  const source: { ga4: Ga4Explore | null; gsc: GscExplore | null; youtube: YoutubeExplore | null } = {
    ga4: null,
    gsc: null,
    youtube: null,
  }

  await Promise.all(
    (connections ?? []).map(async (connection): Promise<void> => {
      if (!isProviderId(connection.provider)) return

      const tokenResult = await resolveAccessToken(admin, connection.id, siteId, connection.provider)
      if (!tokenResult.ok) return

      if (connection.provider === 'ga4') {
        source.ga4 = await fetchGa4Explore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
      } else if (connection.provider === 'gsc') {
        source.gsc = await fetchGscExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
      } else if (connection.provider === 'youtube') {
        source.youtube = await fetchYoutubeExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
          MAX_EXPLORE_FETCH_LIMIT,
        )
      }
    }),
  )

  return source
}
