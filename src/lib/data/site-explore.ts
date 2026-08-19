import 'server-only'

import { colorTokenOf } from '@/mock/metrics'
import { isProviderId } from '@/lib/domain/providers'
import type { Ga4ExploreDimension, GscExploreDimension } from '@/lib/domain/explore-dimension'
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
  rowLimit: number,
  ga4Dimension: Ga4ExploreDimension,
  gscDimension: GscExploreDimension,
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
          rowLimit,
        )
        // `impressions` đứng thay "lượt xem/sessions" cho cả 3 hạng mục —
        // GA4 không có khái niệm impressions kiểu ads, và ReportRow chỉ có
        // một cột "số lượng" chung cho các nền tảng không phải ads (xem
        // JSDoc `ReportRow` ở đầu file).
        const ga4Rows: readonly { readonly label: string; readonly value: number }[] =
          ga4Dimension === 'channel'
            ? explore.channels.map((row) => ({ label: row.channel, value: row.sessions }))
            : ga4Dimension === 'device'
              ? explore.devices.map((row) => ({ label: row.device, value: row.sessions }))
              : explore.topPages.map((row) => ({ label: row.path, value: row.views }))
        return ga4Rows.map(
          (row): ReportRow => ({
            key: `ga4:${ga4Dimension}:${row.label}`,
            dimension: row.label,
            group: 'GA4',
            colorToken: colorTokenOf('ga4'),
            impressions: row.value,
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
          rowLimit,
        )
        // Chỉ Truy vấn/Trang có sẵn impressions+CTR — Quốc gia/Thiết bị của
        // Search Console chỉ trả về clicks (xem `GscExplore` trong
        // `google-explore.ts`), nên hai cột kia hợp lệ là `null`, không phải
        // thiếu sót.
        const gscRows: readonly {
          readonly label: string
          readonly clicks: number
          readonly impressions: number | null
        }[] =
          gscDimension === 'page'
            ? explore.topPages.map((row) => ({ label: row.page, clicks: row.clicks, impressions: row.impressions }))
            : gscDimension === 'country'
              ? explore.countries.map((row) => ({ label: row.country, clicks: row.clicks, impressions: null }))
              : gscDimension === 'device'
                ? explore.devices.map((row) => ({ label: row.device, clicks: row.clicks, impressions: null }))
                : explore.topQueries.map((row) => ({ label: row.query, clicks: row.clicks, impressions: row.impressions }))
        return gscRows.map(
          (row): ReportRow => ({
            key: `gsc:${gscDimension}:${row.label}`,
            dimension: row.label,
            group: 'Search Console',
            colorToken: colorTokenOf('gsc'),
            impressions: row.impressions,
            clicks: row.clicks,
            costMicros: null,
            conversions: null,
            ctr: row.impressions && row.impressions > 0 ? row.clicks / row.impressions : null,
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
          rowLimit,
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
