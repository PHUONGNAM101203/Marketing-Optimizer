import 'server-only'

import { colorTokenOf } from '@/mock/metrics'
import { isProviderId } from '@/lib/domain/providers'
import {
  fetchGa4Explore,
  fetchGscExplore,
  fetchYoutubeExplore,
} from '@/lib/providers/google-explore'
import { resolveAccessToken } from '@/lib/sync/access-token'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ReportRow } from '@/components/explore/report-builder'

/**
 * Hàng cho bảng Khám phá — gộp MỘT loại "hạng mục" đại diện từ mỗi nền tảng
 * để so sánh chéo có nghĩa: trang (GA4), truy vấn (Search Console), video
 * (YouTube). Không trộn nhiều loại hạng mục của cùng một nền tảng vào đây —
 * "trang" và "thiết bị" không nên nằm chung một cột dimension. Muốn xem đủ
 * mọi góc của một nền tảng thì vào trang Kênh → chi tiết nền tảng đó.
 *
 * `impressions` đứng thay cho "lượt xem" của GA4/YouTube — không có cột
 * riêng cho views trong ReportRow (schema đó vốn dành cho ads), và "được
 * nhìn thấy bao nhiêu lần" là đúng bản chất impressions diễn tả.
 */
export const getRealExploreRows = async (
  siteId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<readonly ReportRow[]> => {
  const supabase = await createClient()
  const { data: connections } = await supabase
    .from('connections')
    .select('id, provider, external_account_id')
    .eq('site_id', siteId)
    .in('provider', ['ga4', 'gsc', 'youtube'])

  const admin = createAdminClient()

  const rowGroups = await Promise.all(
    (connections ?? []).map(async (connection): Promise<readonly ReportRow[]> => {
      if (!isProviderId(connection.provider)) return []

      const tokenResult = await resolveAccessToken(
        admin,
        connection.id,
        siteId,
        connection.provider,
      )
      if (!tokenResult.ok) return []

      if (connection.provider === 'ga4') {
        const explore = await fetchGa4Explore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
        return explore.topPages.map(
          (page): ReportRow => ({
            key: `ga4:${page.path}`,
            dimension: page.path,
            group: 'GA4',
            colorToken: colorTokenOf('ga4'),
            impressions: page.views,
            clicks: null,
            costMicros: null,
            conversions: null,
            ctr: null,
            cpaMicros: null,
            roas: null,
          }),
        )
      }

      if (connection.provider === 'gsc') {
        const explore = await fetchGscExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
        return explore.topQueries.map(
          (row): ReportRow => ({
            key: `gsc:${row.query}`,
            dimension: row.query,
            group: 'Search Console',
            colorToken: colorTokenOf('gsc'),
            impressions: row.impressions,
            clicks: row.clicks,
            costMicros: null,
            conversions: null,
            ctr: row.impressions > 0 ? row.clicks / row.impressions : null,
            cpaMicros: null,
            roas: null,
          }),
        )
      }

      if (connection.provider === 'youtube') {
        const explore = await fetchYoutubeExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        )
        return explore.topVideos.map(
          (video): ReportRow => ({
            key: `youtube:${video.title}`,
            dimension: video.title,
            group: 'YouTube',
            colorToken: colorTokenOf('youtube'),
            impressions: video.views,
            clicks: null,
            costMicros: null,
            conversions: null,
            ctr: null,
            cpaMicros: null,
            roas: null,
          }),
        )
      }

      return []
    }),
  )

  return rowGroups.flat()
}
