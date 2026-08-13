import 'server-only'

import { getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { isProviderId } from '@/lib/domain/providers'
import { METRICS_ADAPTERS } from '@/lib/providers'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccessToken } from './access-token'

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

  const tokenResult = await resolveAccessToken(
    admin,
    connectionId,
    connection.site_id,
    connection.provider,
  )
  if (!tokenResult.ok) return { ok: false, error: tokenResult.error }
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

    await admin
      .from('connections')
      .update({ status: 'connected', last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)

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
