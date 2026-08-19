import 'server-only'

import { after } from 'next/server'

import { getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { isProviderId } from '@/lib/domain/providers'
import { METRICS_ADAPTERS } from '@/lib/providers'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccessToken, resolvePageAccessToken } from './access-token'
import { syncContentSnapshots } from './sync-content-snapshots'
import { syncTiktokVideoSnapshots } from './sync-video-snapshots'

/**
 * Đồng bộ MỘT connection: làm mới token nếu hết hạn, kéo 30 ngày số liệu gần
 * nhất, ghi đè vào `metrics_daily`, cập nhật trạng thái connection.
 *
 * Luôn dùng `service_role` — hàm này chạy sau OAuth callback (chưa có phiên
 * PostgREST của người dùng ổn định để dùng) và từ job nền, không phải từ một
 * request có phiên người dùng.
 *
 * Ghi đè 30 ngày gần nhất mỗi lần thay vì đồng bộ tăng dần (incremental) —
 * đơn giản và đúng: số liệu GA4/GSC có thể được xét lại vài ngày sau khi
 * phát sinh (late data), ghi đè định kỳ tránh số liệu cũ bị kẹt sai.
 */

const SYNC_WINDOW_DAYS = 30

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

export type SyncResult =
  | { readonly ok: true; readonly rows: number }
  | { readonly ok: false; readonly error: string }

export async function syncConnection(connectionId: string): Promise<SyncResult> {
  const admin = createAdminClient()

  const { data: connection } = await admin
    .from('connections')
    .select('id, site_id, provider, external_account_id')
    .eq('id', connectionId)
    .maybeSingle()

  if (!connection || !isProviderId(connection.provider)) {
    return { ok: false, error: 'not-found' }
  }

  const metricsAdapter = METRICS_ADAPTERS[connection.provider]
  if (!metricsAdapter) return { ok: false, error: 'metrics-not-ready' }

  // facebook/instagram: mọi edge cấp Page (fetchDailyMetrics đọc /insights,
  // content snapshot đọc /published_posts và /media) cần Page access token,
  // KHÁC User token mà `resolveAccessToken` trả cho mọi provider khác — xem
  // `resolvePageAccessToken` trong `access-token.ts`. Đây là nơi DUY NHẤT
  // `accessToken` biến thành Page token; mọi biến khác trong hàm này (kể cả
  // `syncTiktokVideoSnapshots` bên dưới) không đụng tới nhánh này.
  const tokenResult =
    connection.provider === 'facebook' || connection.provider === 'instagram'
      ? await resolvePageAccessToken(admin, connectionId, connection.site_id, connection.provider)
      : await resolveAccessToken(admin, connectionId, connection.site_id, connection.provider)
  if (!tokenResult.ok) {
    // Ghi lại lỗi thay vì để `status` cũ đứng yên — không làm vậy thì
    // connection tiếp tục hiện "Đã kết nối" trong khi mọi lượt sync sau đó
    // đều no-op âm thầm (đúng cách bug Page-token gốc đã ẩn mình một thời
    // gian dài trước khi bị phát hiện qua báo lỗi trực tiếp của người dùng).
    await admin
      .from('connections')
      .update({
        status: 'error',
        error_code: tokenResult.error,
        error_message: `Không lấy được access token: ${tokenResult.error}`,
        error_at: new Date().toISOString(),
      })
      .eq('id', connectionId)
    return { ok: false, error: tokenResult.error }
  }
  const accessToken = tokenResult.accessToken

  // Google Ads cần thêm Developer Token — không phải OAuth credential, một
  // mã Google cấp riêng cho MCC. Thiếu nó thì mọi request Ads đều bị từ chối,
  // kể cả access token còn sống.
  let developerToken: string | undefined
  if (connection.provider === 'google-ads') {
    const token = await getGoogleAdsDeveloperToken(connection.site_id)
    if (!token) return { ok: false, error: 'no-developer-token' }
    developerToken = token
  }

  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - (SYNC_WINDOW_DAYS - 1) * 86_400_000)

  try {
    const rows = await metricsAdapter.fetchDailyMetrics({
      accessToken,
      externalAccountId: connection.external_account_id,
      startDate: toIsoDate(startDate),
      endDate: toIsoDate(endDate),
      developerToken,
    })

    if (rows.length > 0) {
      const { error: upsertError } = await admin.from('metrics_daily').upsert(
        rows.map((row) => ({
          connection_id: connectionId,
          date: row.date,
          sessions: row.sessions,
          users: row.users,
          conversions: row.conversions,
          clicks: row.clicks,
          impressions: row.impressions,
          cost_micros: row.costMicros,
          conversion_value_micros: row.conversionValueMicros,
          extra: row.extra ?? {},
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'connection_id,date' },
      )

      if (upsertError) return { ok: false, error: `metrics-write-failed: ${upsertError.message}` }
    }

    // Xoá error_* cũ — không làm vậy thì một lần lỗi thoáng qua (vd.
    // `no-page-token` do Graph API chập chờn) để lại banner lỗi VĨNH VIỄN dù
    // `status` đã quay lại 'connected' và mọi lượt sync sau đó đều thành
    // công (`connections.ts`'s UI đọc error_code/error_message độc lập với
    // status, không tự suy ra "đã hết lỗi" từ status).
    await admin
      .from('connections')
      .update({
        status: 'connected',
        last_synced_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        error_at: null,
      })
      .eq('id', connectionId)

    // SAU khi đã đánh dấu `connected`, và chạy qua `after()` — bước này có thể
    // tốn tới 50 lượt gọi TikTok tuần tự, trong khi chỉ cron `sync-hourly`
    // (nơi TikTok/Facebook/Instagram được đồng bộ, xem `cron-providers.ts`)
    // mới có `maxDuration = 300`; 5 lối gọi còn lại (OAuth callback, resync thủ công,
    // resync-site, action Google/Meta Ads) dùng timeout mặc định. Đặt ở đây thì
    // snapshot chậm hay lỗi cũng không làm connection kẹt ở trạng thái cũ, và
    // không cộng thêm mili-giây nào vào response.
    if (connection.provider === 'tiktok') {
      after(() =>
        syncTiktokVideoSnapshots(connectionId, accessToken).catch((error) => {
          console.error(
            `Không đồng bộ được video snapshot: ${error instanceof Error ? error.message : String(error)}`,
          )
        }),
      )
    }

    const contentProvider = connection.provider
    if (contentProvider === 'facebook' || contentProvider === 'instagram') {
      after(() =>
        syncContentSnapshots(
          connectionId,
          contentProvider,
          accessToken,
          connection.external_account_id,
        ).catch((error) => {
          console.error(
            `Không đồng bộ được content snapshot: ${error instanceof Error ? error.message : String(error)}`,
          )
        }),
      )
    }

    return { ok: true, rows: rows.length }
  } catch (error) {
    await admin
      .from('connections')
      .update({
        status: 'error',
        error_code: 'sync-failed',
        error_message: error instanceof Error ? error.message : 'Lỗi không xác định',
        error_at: new Date().toISOString(),
      })
      .eq('id', connectionId)

    return { ok: false, error: 'fetch-failed' }
  }
}
