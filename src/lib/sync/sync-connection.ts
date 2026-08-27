import 'server-only'

import { after } from 'next/server'

import { getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { SNAPSHOT_PROVIDERS, isProviderId } from '@/lib/domain/providers'
import { refreshConnectionAvatar } from './refresh-avatar'
import { METRICS_ADAPTERS } from '@/lib/providers'
import type { DailyMetricRow, MetricsAdapter } from '@/lib/providers/metrics-types'
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

/** Cửa sổ nạp lịch sử, chạy ĐÚNG MỘT LẦN cho mỗi connection (đóng dấu bằng
 * `connections.backfilled_at`). Không nới thẳng `SYNC_WINDOW_DAYS` lên 365 vì
 * như vậy MỌI lượt đồng bộ hằng giờ đều kéo lại nguyên một năm — tốn quota API
 * và thời gian cron cho phần dữ liệu đã có sẵn từ lượt trước. */
const BACKFILL_WINDOW_DAYS = 365

/** Cắt lượt nạp thành từng đoạn thay vì hỏi 365 ngày trong một request: Meta
 * Insights giới hạn độ dài `time_range` mỗi lần gọi, và Search Console có trần
 * số hàng trả về. Đoạn 90 ngày nằm dưới cả hai ngưỡng cho mọi nền tảng đang
 * dùng. */
const BACKFILL_CHUNK_DAYS = 90

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

export type SyncResult =
  | { readonly ok: true; readonly rows: number }
  | { readonly ok: false; readonly error: string }

/**
 * Nạp một khoảng dài bằng nhiều lượt gọi liên tiếp, gộp kết quả.
 *
 * TUẦN TỰ, không `Promise.all`: cùng một connection nghĩa là cùng một tài
 * khoản nền tảng, bắn 5 request song song vào đó là cách nhanh nhất để ăn
 * rate limit — đúng lớp lỗi đã gặp với Klaviyo Reporting API. Nạp lịch sử chỉ
 * chạy một lần nên chậm hơn vài giây không đáng đánh đổi.
 *
 * Một đoạn lỗi thì NÉM ra ngoài chứ không nuốt: nuốt lỗi sẽ nạp thiếu một
 * quãng giữa mà vẫn đóng dấu `backfilled_at`, để lại một lỗ hổng vĩnh viễn
 * không ai biết. Ném ra thì lượt cron sau nạp lại từ đầu.
 */
const fetchInChunks = async (
  adapter: MetricsAdapter,
  params: {
    readonly accessToken: string
    readonly externalAccountId: string
    readonly startDate: Date
    readonly endDate: Date
    readonly developerToken?: string
  },
): Promise<readonly DailyMetricRow[]> => {
  const all: DailyMetricRow[] = []
  const chunkMs = BACKFILL_CHUNK_DAYS * 86_400_000

  for (let from = params.startDate.getTime(); from <= params.endDate.getTime(); from += chunkMs) {
    const to = Math.min(from + chunkMs - 86_400_000, params.endDate.getTime())
    const rows = await adapter.fetchDailyMetrics({
      accessToken: params.accessToken,
      externalAccountId: params.externalAccountId,
      startDate: toIsoDate(new Date(from)),
      endDate: toIsoDate(new Date(to)),
      developerToken: params.developerToken,
    })
    all.push(...rows)
  }

  return all
}

export async function syncConnection(connectionId: string): Promise<SyncResult> {
  const admin = createAdminClient()

  const { data: connection } = await admin
    .from('connections')
    .select('id, site_id, provider, external_account_id, backfilled_at, avatar_url')
    .eq('id', connectionId)
    .maybeSingle()

  if (!connection || !isProviderId(connection.provider)) {
    return { ok: false, error: 'not-found' }
  }

  const metricsAdapter = METRICS_ADAPTERS[connection.provider]
  if (!metricsAdapter) {
    // Nền tảng KHÔNG có `MetricsAdapter` (hiện chỉ GTM — cấu hình thẻ, không
    // phải số liệu theo ngày) có thể tới hàm này qua NHIỀU đường: picker thủ
    // công (`connectGtmContainer` trong `actions/gtm.ts`) đã tự set
    // `status:'connected'` TRƯỚC khi gọi hàm này rồi, nhưng đường dò domain
    // tự động (`google-discovery.ts` khớp `domainName` container, chạy
    // trong vòng lặp OAuth callback chung) KHÔNG tự set — nếu cứ `return`
    // suông như trước, connection đó kẹt nguyên `status:'syncing'` (giá trị
    // lúc `insert` ban đầu) và `last_synced_at:null` VĨNH VIỄN, vì không có
    // cron/pipeline nào khác đụng tới provider không-có-adapter. Trang Kết
    // nối đọc thẳng `last_synced_at` để quyết định hiện "Đang đồng bộ lần
    // đầu…" (`connections/page.tsx`), nên bug này hiện y hệt lớp lỗi Klaviyo
    // đã sửa — connection ĐÃ kết nối thật nhưng UI nói mãi là đang đồng bộ.
    // Set 'connected' NGAY TẠI ĐÂY (idempotent — vô hại nếu đã 'connected')
    // để MỌI đường gọi `syncConnection` cho provider không-có-adapter đều tự
    // thoát đúng trạng thái, không phải vá riêng từng nơi gọi.
    await admin
      .from('connections')
      .update({ status: 'connected', last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)
    return { ok: false, error: 'metrics-not-ready' }
  }

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

  // Nạp lịch sử khi connection này chưa từng được nạp. CỐ TÌNH loại
  // `SNAPSHOT_PROVIDERS`: API của merchant-center/tiktok không có báo cáo lịch
  // sử, hỏi khoảng ngày quá khứ thì chúng vẫn trả TRẠNG THÁI HIỆN TẠI rồi gắn
  // nhãn ngày cuối khoảng (đã đo thật 25/8/2026: cả hai trả đúng 1 hàng gắn
  // nhãn 2026-06-30). Nạp nhóm đó là ghi số của hôm nay xuống quá khứ — bịa ra
  // lịch sử, tệ hơn hẳn việc để trống.
  const shouldBackfill =
    !connection.backfilled_at && !SNAPSHOT_PROVIDERS.has(connection.provider)

  const endDate = new Date()
  const windowDays = shouldBackfill ? BACKFILL_WINDOW_DAYS : SYNC_WINDOW_DAYS
  const startDate = new Date(endDate.getTime() - (windowDays - 1) * 86_400_000)

  try {
    const rows = shouldBackfill
      ? await fetchInChunks(metricsAdapter, {
          accessToken,
          externalAccountId: connection.external_account_id,
          startDate,
          endDate,
          developerToken,
        })
      : await metricsAdapter.fetchDailyMetrics({
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
        // Đóng dấu cho MỌI provider, không riêng nhóm vừa nạp. Cột này nghĩa
        // là "đã xử lý xong việc nạp lịch sử", không phải "đã nạp": với
        // `SNAPSHOT_PROVIDERS` thì kết luận là KHÔNG CÓ GÌ để nạp, và đó cũng
        // là một kết luận đã xử lý xong.
        //
        // Bỏ sót nhóm snapshot ở đây thì `backfilled_at` của chúng vĩnh viễn
        // NULL, mà hai route cron lại chọn theo `backfilled_at.is.null` — tức
        // chúng khớp ở MỌI lượt chạy và bộ lọc `last_synced_at` thành vô
        // nghĩa với riêng nhóm đó.
        //
        // Tới được dòng này nghĩa là đã ghi đủ: mọi lỗi phía trên đều `return`
        // sớm hoặc ném ra ngoài.
        backfilled_at: new Date().toISOString(),
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
    // Cùng lý do đặt trong `after()` như hai bước snapshot bên dưới: đây là
    // việc dọn dẹp, không được cộng mili-giây nào vào response. Sau lần chép
    // đầu tiên nó chỉ còn là một phép so chuỗi rồi thoát ngay.
    const avatarProvider = connection.provider
    after(() =>
      refreshConnectionAvatar(
        admin,
        {
          id: connectionId,
          provider: avatarProvider,
          external_account_id: connection.external_account_id,
          avatar_url: connection.avatar_url,
        },
        accessToken,
      ).catch((error) => {
        console.error(
          `Không làm mới được ảnh đại diện: ${error instanceof Error ? error.message : String(error)}`,
        )
      }),
    )

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
