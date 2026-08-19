import 'server-only'

import { unstable_cache } from 'next/cache'

/**
 * Klaviyo API.
 *
 * CHƯA ai chạy thử với tài khoản Klaviyo thật cho các endpoint MỚI thêm ở
 * lượt sửa này (forms, metrics, phân trang segments/lists/forms) — hình
 * dạng request/response bám theo tài liệu chính thức developers.klaviyo.com,
 * cần verify khi có key thật, giống `google-ads.ts`/`meta-metrics.ts` trước
 * đây. Campaigns/flows/segments/lists/profiles GỐC đã chạy thật (8/2026,
 * tài khoản "Handdn") — 52 campaign, 17 flow, 500+ khách hàng.
 *
 * KHÁC 10 provider còn lại ở HAI điểm:
 *   1. Xác thực bằng private API key dán trực tiếp, không OAuth — một key
 *      gắn với ĐÚNG MỘT tài khoản Klaviyo, không hết hạn, không refresh
 *      token (xem `resolveKlaviyoApiKey` trong `sync/access-token.ts`).
 *   2. Reporting API (campaign/flow-values-reports — nơi duy nhất có số
 *      liệu HIỆU SUẤT thật: opens/clicks/revenue) có rate limit RẤT chặt —
 *      1 request/giây, 2/phút, 225/NGÀY, khác hẳn hàng trăm/giây của
 *      GA4/GSC. Vì vậy các hàm report ở đây BẮT BUỘC phải cache ở tầng gọi
 *      (`unstable_cache`, xem `fetchKlaviyoPerformance` bên dưới) — gọi
 *      trực tiếp mỗi lần tải trang như GA4/GSC sẽ cạn hạn mức chỉ sau vài
 *      chục lượt xem. Các endpoint LIST (campaigns/flows/segments/lists/
 *      forms/metrics/profiles) KHÔNG thuộc Reporting API, hạn mức bình
 *      thường như GA4/GSC — không cần cache.
 */

const API_BASE = 'https://a.klaviyo.com/api'
const REVISION = '2026-07-15'

const authHeaders = (apiKey: string): Record<string, string> => ({
  authorization: `Klaviyo-API-Key ${apiKey}`,
  revision: REVISION,
  accept: 'application/json',
})

// ─── Xác thực lúc kết nối ────────────────────────────────────────────────

export interface KlaviyoAccountInfo {
  readonly accountId: string
  readonly companyName: string | null
}

export type KlaviyoVerifyOutcome = { readonly ok: true; readonly account: KlaviyoAccountInfo } | { readonly ok: false; readonly error: string }

/** Gọi MỘT lần khi người dùng dán key vào form kết nối — xác nhận key hợp
 * lệ và lấy tên tài khoản để hiện ngay, không cần chờ lượt đồng bộ đầu. */
export const verifyKlaviyoApiKey = async (apiKey: string): Promise<KlaviyoVerifyOutcome> => {
  const response = await fetch(`${API_BASE}/accounts`, { headers: authHeaders(apiKey) })
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    return {
      ok: false,
      error:
        response.status === 401 || response.status === 403
          ? 'Key không hợp lệ hoặc không đủ quyền đọc.'
          : `HTTP ${response.status}: ${bodyText.slice(0, 300)}`,
    }
  }

  try {
    const data = (await response.json()) as {
      readonly data?: readonly {
        readonly id?: string
        readonly attributes?: { readonly contact_information?: { readonly organization_name?: string } }
      }[]
    }
    const account = data.data?.[0]
    if (!account?.id) return { ok: false, error: 'Không đọc được tài khoản từ key này.' }
    return {
      ok: true,
      account: {
        accountId: account.id,
        companyName: account.attributes?.contact_information?.organization_name ?? null,
      },
    }
  } catch (error) {
    return { ok: false, error: `Trả về 200 nhưng JSON không đọc được: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// ─── Helper phân trang dùng chung (JSON:API cursor) ───────────────────────

interface JsonApiRow {
  readonly id: string
  readonly attributes?: Readonly<Record<string, unknown>>
}

export interface PaginatedOutcome<T> {
  readonly items: readonly T[]
  /** true nếu còn trang chưa đọc (chạm `maxPages`) — số trên là MỘT PHẦN,
   * không phải toàn bộ. Không bao giờ âm thầm cắt bớt mà không báo. */
  readonly truncated: boolean
  /** Chỉ khác `null` khi TRANG ĐẦU thất bại (0 kết quả đọc được) — trang
   * sau lỗi chỉ dừng phân trang sớm, không coi là lỗi cứng vì đã có dữ
   * liệu một phần rồi. Đây là điểm khác với bug cũ: trước đây lỗi HTTP bị
   * nuốt hoàn toàn (`if (!response.ok) return null`, không log, không báo
   * lý do) khiến không ai biết VÌ SAO một lượt gọi thất bại. */
  readonly error: string | null
}

const MAX_LIST_PAGES = 10

const fetchPaginated = async <T>(
  apiKey: string,
  buildUrl: (cursor: string | undefined) => URL,
  mapRow: (row: JsonApiRow) => T,
  context: string,
): Promise<PaginatedOutcome<T>> => {
  const items: T[] = []
  let cursor: string | undefined
  let pages = 0
  let error: string | null = null

  do {
    const url = buildUrl(cursor)
    const response = await fetch(url.toString(), { headers: authHeaders(apiKey) })
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      const message = `HTTP ${response.status}: ${bodyText.slice(0, 300)}`
      console.error(`Klaviyo ${context} lỗi (trang ${pages + 1}): ${message}`)
      if (pages === 0) error = message
      break
    }

    const data = (await response.json()) as {
      readonly data?: readonly JsonApiRow[]
      readonly links?: { readonly next?: string | null }
    }
    items.push(...(data.data ?? []).map(mapRow))
    pages += 1

    const nextLink = data.links?.next
    cursor = nextLink ? (new URL(nextLink).searchParams.get('page[cursor]') ?? undefined) : undefined
  } while (cursor && pages < MAX_LIST_PAGES)

  return { items, truncated: Boolean(cursor), error }
}

// ─── Campaigns ───────────────────────────────────────────────────────────

export type KlaviyoCampaignChannel = 'email' | 'sms' | 'mobile_push'

export interface KlaviyoCampaign {
  readonly id: string
  readonly name: string
  readonly channel: KlaviyoCampaignChannel
  readonly status: string
  readonly sendTime: string | null
}

const fetchCampaignsByChannel = (
  apiKey: string,
  channel: KlaviyoCampaignChannel,
): Promise<PaginatedOutcome<KlaviyoCampaign>> =>
  fetchPaginated(
    apiKey,
    (cursor) => {
      const url = new URL(`${API_BASE}/campaigns`)
      url.searchParams.set('filter', `equals(messages.channel,'${channel}')`)
      url.searchParams.set('page[size]', '50')
      if (cursor) url.searchParams.set('page[cursor]', cursor)
      return url
    },
    (row) => ({
      id: row.id,
      name: (row.attributes?.name as string | undefined) ?? row.id,
      channel,
      status: (row.attributes?.status as string | undefined) ?? 'unknown',
      sendTime: (row.attributes?.send_time as string | undefined) ?? null,
    }),
    `campaigns (${channel})`,
  )

/** Trước đây chỉ đọc MỘT trang (page[size]=50, không theo `links.next`) —
 * tài khoản có đúng 52 campaign email là đã vượt cap, 2 campaign cuối bị
 * cắt lặng lẽ. Giờ theo cursor tới khi hết trang hoặc chạm `MAX_LIST_PAGES`.
 * Trước đây cũng chỉ gọi email + sms — API còn hỗ trợ kênh `mobile_push`
 * (xem docs Get Campaigns), thêm vào để không bỏ sót loại campaign nào. */
export const fetchKlaviyoCampaigns = async (apiKey: string): Promise<PaginatedOutcome<KlaviyoCampaign>> => {
  const [email, sms, mobilePush] = await Promise.all([
    fetchCampaignsByChannel(apiKey, 'email'),
    fetchCampaignsByChannel(apiKey, 'sms'),
    fetchCampaignsByChannel(apiKey, 'mobile_push'),
  ])
  return {
    items: [...email.items, ...sms.items, ...mobilePush.items],
    truncated: email.truncated || sms.truncated || mobilePush.truncated,
    error: email.error ?? sms.error ?? mobilePush.error,
  }
}

// ─── Flows ───────────────────────────────────────────────────────────────

export interface KlaviyoFlow {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly triggerType: string | null
}

export const fetchKlaviyoFlows = (apiKey: string): Promise<PaginatedOutcome<KlaviyoFlow>> =>
  fetchPaginated(
    apiKey,
    (cursor) => {
      const url = new URL(`${API_BASE}/flows`)
      url.searchParams.set('page[size]', '50')
      if (cursor) url.searchParams.set('page[cursor]', cursor)
      return url
    },
    (row) => ({
      id: row.id,
      name: (row.attributes?.name as string | undefined) ?? row.id,
      status: (row.attributes?.status as string | undefined) ?? 'unknown',
      triggerType: (row.attributes?.trigger_type as string | undefined) ?? null,
    }),
    'flows',
  )

// ─── Metric hội tụ (bắt buộc cho report doanh thu) + danh sách metric ─────

export interface KlaviyoMetric {
  readonly id: string
  readonly name: string
}

/** Toàn bộ metric (loại sự kiện) tài khoản Klaviyo này đang ghi nhận — vd.
 * "Placed Order", "Opened Email", "Clicked Email", "Subscribed to List"…
 * Tự sinh từ mọi tích hợp (Shopify, chính Klaviyo, API riêng…), không phải
 * cấu hình tay. Hiện ra để người dùng thấy TOÀN BỘ dữ liệu Klaviyo đang có,
 * và để chẩn đoán khi report doanh thu lỗi (xem `resolveConversionMetricId`).
 *
 * KHÔNG set `page[size]` — endpoint `/metrics` không hỗ trợ tham số này
 * (xác nhận qua docs chính thức developers.klaviyo.com/en/reference/get_metrics,
 * 8/2026: "Returns a maximum of 200 results per page", cố định, chỉ nhận
 * `page[cursor]`). Set nó gây lỗi 400 "'page_size' is not a valid field" —
 * đúng lỗi thực tế gặp phải khi mới thêm hàm này. */
export const fetchKlaviyoMetrics = (apiKey: string): Promise<PaginatedOutcome<KlaviyoMetric>> =>
  fetchPaginated(
    apiKey,
    (cursor) => {
      const url = new URL(`${API_BASE}/metrics`)
      if (cursor) url.searchParams.set('page[cursor]', cursor)
      return url
    },
    (row) => ({ id: row.id, name: (row.attributes?.name as string | undefined) ?? row.id }),
    'metrics',
  )

export type ConversionMetricOutcome =
  | { readonly ok: true; readonly metricId: string }
  | { readonly ok: false; readonly error: string }

/** "Placed Order" là tên sự kiện chuẩn Klaviyo dùng cho đơn hàng — hầu hết
 * tích hợp ecommerce (Shopify/WooCommerce…) đều sinh event này. Site không
 * phải ecommerce hợp lệ sẽ không có — rơi về metric đầu tiên tìm được thay
 * vì báo lỗi, report khi đó vẫn chạy được, chỉ là "conversions" theo nghĩa
 * event đó thay vì đơn hàng.
 *
 * TRƯỚC ĐÂY hàm này trả `null` im lặng khi gọi `/metrics` thất bại
 * (`if (!response.ok) return null`, không log, không có lý do) — người
 * dùng chỉ thấy "Không tìm được metric nào" dù nguyên nhân thật có thể là
 * key thiếu quyền `metrics:read`, key hết hạn, hay lỗi tạm thời phía
 * Klaviyo. Giờ trả về lý do THẬT (HTTP status + body) để chẩn đoán được. */
export const resolveConversionMetricId = async (apiKey: string): Promise<ConversionMetricOutcome> => {
  const metrics = await fetchKlaviyoMetrics(apiKey)
  if (metrics.error) {
    return { ok: false, error: `Không đọc được danh sách metric: ${metrics.error}` }
  }
  if (metrics.items.length === 0) {
    return { ok: false, error: 'Tài khoản Klaviyo này chưa ghi nhận metric/sự kiện nào.' }
  }
  const placedOrder = metrics.items.find((metric) => metric.name === 'Placed Order')
  return { ok: true, metricId: (placedOrder ?? metrics.items[0]).id }
}

// ─── Reports (hiệu suất thật) ───────────────────────────────────────────

export interface KlaviyoValuesRow {
  readonly groupId: string
  readonly opens: number
  readonly clicks: number
  readonly conversions: number
  /** Micros — nhân 1.000.000 ngay khi đọc, khớp quy ước `costMicros`/
   * `conversionValueMicros` dùng khắp app (Klaviyo API trả số tiền thường,
   * không phải micros). */
  readonly conversionValueMicros: number
  readonly recipients: number
}

export interface KlaviyoValuesOutcome {
  readonly rows: readonly KlaviyoValuesRow[]
  readonly error: string | null
}

const STATISTICS = ['opens', 'clicks', 'conversions', 'conversion_value', 'recipients'] as const

const fetchValuesReport = async (
  apiKey: string,
  resource: 'campaign' | 'flow',
  conversionMetricId: string,
  range: { readonly start: string; readonly end: string },
): Promise<KlaviyoValuesOutcome> => {
  const groupKey = `${resource}_id`
  const response = await fetch(`${API_BASE}/${resource}-values-reports`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'content-type': 'application/vnd.api+json' },
    body: JSON.stringify({
      data: {
        type: `${resource}-values-report`,
        attributes: {
          statistics: STATISTICS,
          timeframe: { start: range.start, end: range.end },
          conversion_metric_id: conversionMetricId,
          group_by: [groupKey],
        },
      },
    }),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    const error = `HTTP ${response.status}: ${bodyText.slice(0, 300)}`
    console.error(`Klaviyo ${resource}-values-reports lỗi: ${error}`)
    return { rows: [], error }
  }

  try {
    const data = (await response.json()) as {
      readonly data?: {
        readonly attributes?: {
          readonly results?: readonly {
            readonly groupings?: Readonly<Record<string, string>>
            readonly statistics?: Readonly<Record<string, number>>
          }[]
        }
      }
    }
    const rows = (data.data?.attributes?.results ?? [])
      .filter((row) => Boolean(row.groupings?.[groupKey]))
      .map((row) => ({
        groupId: row.groupings?.[groupKey] as string,
        opens: row.statistics?.opens ?? 0,
        clicks: row.statistics?.clicks ?? 0,
        conversions: row.statistics?.conversions ?? 0,
        conversionValueMicros: Math.round((row.statistics?.conversion_value ?? 0) * 1_000_000),
        recipients: row.statistics?.recipients ?? 0,
      }))
    return { rows, error: null }
  } catch (error) {
    const message = `Trả về 200 nhưng JSON không đọc được: ${error instanceof Error ? error.message : String(error)}`
    console.error(`Klaviyo ${resource}-values-reports: ${message}`)
    return { rows: [], error: message }
  }
}

export const fetchCampaignValuesReport = (
  apiKey: string,
  conversionMetricId: string,
  range: { readonly start: string; readonly end: string },
): Promise<KlaviyoValuesOutcome> => fetchValuesReport(apiKey, 'campaign', conversionMetricId, range)

export const fetchFlowValuesReport = (
  apiKey: string,
  conversionMetricId: string,
  range: { readonly start: string; readonly end: string },
): Promise<KlaviyoValuesOutcome> => fetchValuesReport(apiKey, 'flow', conversionMetricId, range)

// ─── Profiles (khách hàng) ───────────────────────────────────────────────

export interface KlaviyoProfileCount {
  readonly count: number
  /** true nếu danh sách lớn hơn số đọc được (`maxPages × 100`) — số trên là
   * MỘT PHẦN, không phải toàn bộ. Cùng quy ước với `MerchantProductCounts`
   * ở `google-merchant.ts` — không âm thầm hiện thiếu. Klaviyo không trả
   * tổng số trực tiếp ở endpoint danh sách, phải đếm qua phân trang. */
  readonly truncated: boolean
  /** Chỉ khác `null` khi TRANG ĐẦU thất bại — trước đây lỗi trang đầu vẫn
   * trả `count: 0`, hiện thành "0 khách hàng" giả trong lúc thật ra là lỗi
   * đọc API. Nơi gọi phải map `error ? null : count`, không phải hiện
   * thẳng `count`. */
  readonly error: string | null
}

export const countKlaviyoProfiles = async (apiKey: string, maxPages = 5): Promise<KlaviyoProfileCount> => {
  let count = 0
  let cursor: string | undefined
  let pages = 0
  let error: string | null = null

  do {
    const url = new URL(`${API_BASE}/profiles`)
    url.searchParams.set('page[size]', '100')
    if (cursor) url.searchParams.set('page[cursor]', cursor)

    const response = await fetch(url.toString(), { headers: authHeaders(apiKey) })
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      const message = `HTTP ${response.status}: ${bodyText.slice(0, 300)}`
      console.error(`Klaviyo profiles lỗi (trang ${pages + 1}): ${message}`)
      if (pages === 0) error = message
      break
    }

    const data = (await response.json()) as {
      readonly data?: readonly unknown[]
      readonly links?: { readonly next?: string | null }
    }
    count += data.data?.length ?? 0
    pages += 1

    const nextLink = data.links?.next
    cursor = nextLink ? (new URL(nextLink).searchParams.get('page[cursor]') ?? undefined) : undefined
  } while (cursor && pages < maxPages)

  return { count, truncated: Boolean(cursor), error }
}

// ─── Segments & Lists ────────────────────────────────────────────────────

export interface KlaviyoSegment {
  readonly id: string
  readonly name: string
  readonly isActive: boolean
}

/** `page[size]` max THẬT SỰ của endpoint này là 10 (xác nhận qua docs
 * get_segments, 8/2026: "Default: 10. Min: 1. Max: 10.") — set cao hơn sẽ
 * lỗi 400 giống bug `fetchKlaviyoMetrics` gặp phải. Bù lại bằng cursor
 * pagination (`fetchPaginated`) đọc nhiều trang thay vì một trang 10 dòng
 * như bản đầu. */
export const fetchKlaviyoSegments = (apiKey: string): Promise<PaginatedOutcome<KlaviyoSegment>> =>
  fetchPaginated(
    apiKey,
    (cursor) => {
      const url = new URL(`${API_BASE}/segments`)
      url.searchParams.set('page[size]', '10')
      if (cursor) url.searchParams.set('page[cursor]', cursor)
      return url
    },
    (row) => ({
      id: row.id,
      name: (row.attributes?.name as string | undefined) ?? row.id,
      isActive: (row.attributes?.is_active as boolean | undefined) ?? false,
    }),
    'segments',
  )

export interface KlaviyoList {
  readonly id: string
  readonly name: string
}

/** Max thật sự 10, cùng lý do `fetchKlaviyoSegments` ở trên (docs get_lists:
 * "Default: 10. Min: 1. Max: 10."). */
export const fetchKlaviyoLists = (apiKey: string): Promise<PaginatedOutcome<KlaviyoList>> =>
  fetchPaginated(
    apiKey,
    (cursor) => {
      const url = new URL(`${API_BASE}/lists`)
      url.searchParams.set('page[size]', '10')
      if (cursor) url.searchParams.set('page[cursor]', cursor)
      return url
    },
    (row) => ({ id: row.id, name: (row.attributes?.name as string | undefined) ?? row.id }),
    'lists',
  )

// ─── Forms (biểu mẫu đăng ký) ──────────────────────────────────────────────

/** `status` chỉ có hai giá trị thật ('draft'/'live') — resource form KHÔNG
 * có field `form_type` (xác nhận qua docs get_forms, 8/2026: attributes chỉ
 * gồm name/status/ab_test/created_at/updated_at). `page[size]` max 100. */
export interface KlaviyoForm {
  readonly id: string
  readonly name: string
  readonly status: 'draft' | 'live' | 'unknown'
}

export const fetchKlaviyoForms = (apiKey: string): Promise<PaginatedOutcome<KlaviyoForm>> =>
  fetchPaginated(
    apiKey,
    (cursor) => {
      const url = new URL(`${API_BASE}/forms`)
      url.searchParams.set('page[size]', '50')
      if (cursor) url.searchParams.set('page[cursor]', cursor)
      return url
    },
    (row) => {
      const status = row.attributes?.status as string | undefined
      return {
        id: row.id,
        name: (row.attributes?.name as string | undefined) ?? row.id,
        status: status === 'draft' || status === 'live' ? status : 'unknown',
      }
    },
    'forms',
  )

// ─── Hiệu suất, ĐÃ CACHE (dùng chung cho channel-detail lẫn Khám phá/Tổng quan) ──

export interface KlaviyoPerformanceOutcome {
  readonly campaignPerformance: readonly KlaviyoValuesRow[] | null
  readonly flowPerformance: readonly KlaviyoValuesRow[] | null
  readonly error: string | null
}

/** Reporting API giới hạn 225 request/NGÀY (so với hàng trăm/giây của
 * GA4/GSC) — gọi trực tiếp mỗi lần tải trang như các provider khác sẽ cạn
 * hạn mức chỉ sau vài chục lượt xem. Cache 6 giờ (tối đa 4 lượt gọi thật/
 * ngày mỗi report dù có bao nhiêu người xem trang) — chấp nhận số liệu có
 * thể trễ tới 6 giờ, đổi lấy việc KHÔNG BAO GIỜ cạn hạn mức trong điều kiện
 * dùng thực tế. Export TỪ FILE NÀY (không phải riêng ở `site-channel-detail.ts`)
 * để trang chi tiết kênh VÀ trang Khám phá/Tổng quan (khi thêm tab Klaviyo)
 * dùng CHUNG một cache — cùng site/apiKey/range trong cùng cửa sổ 6 giờ chỉ
 * tốn đúng 2 request thật, bất kể gọi từ mấy trang khác nhau. `apiKey` nằm
 * trong tham số hàm nên đổi key (kết nối lại) tự ra cache key khác, không
 * cần tự tay bump tag. */
const KLAVIYO_REPORT_REVALIDATE_SECONDS = 6 * 60 * 60

export const fetchKlaviyoPerformance = unstable_cache(
  async (
    apiKey: string,
    range: { readonly startDate: string; readonly endDate: string },
  ): Promise<KlaviyoPerformanceOutcome> => {
    const metricResult = await resolveConversionMetricId(apiKey)
    if (!metricResult.ok) {
      return { campaignPerformance: null, flowPerformance: null, error: metricResult.error }
    }

    const reportRange = { start: range.startDate, end: range.endDate }
    const [campaigns, flows] = await Promise.all([
      fetchCampaignValuesReport(apiKey, metricResult.metricId, reportRange),
      fetchFlowValuesReport(apiKey, metricResult.metricId, reportRange),
    ])

    const error = campaigns.error ?? flows.error
    return {
      campaignPerformance: campaigns.error ? null : campaigns.rows,
      flowPerformance: flows.error ? null : flows.rows,
      error,
    }
  },
  ['klaviyo-performance'],
  { revalidate: KLAVIYO_REPORT_REVALIDATE_SECONDS },
)
