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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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

/** Đơn vị tiền THẬT của tài khoản Klaviyo — `preferred_currency` trên
 * `/api/accounts` ("the currency used for currency-based metrics in
 * dashboards, analytics, coupons, and templates", xác nhận qua SDK Python
 * chính thức). BUG THẬT đã xảy ra: trước đây `conversion_value` từ report
 * campaign/flow bị format bằng `site.currency` (đơn vị người dùng cấu hình
 * cho các nền tảng QUẢNG CÁO — Google Ads/Meta Ads, có thể là VND) thay vì
 * đơn vị THẬT Klaviyo trả về — doanh thu USD hiện nhầm ký hiệu "đ" khiến số
 * trông nhỏ hơn ~25.000 lần giá trị thật. `null` nếu gọi lỗi — nơi dùng
 * PHẢI fallback về 'USD' (mặc định phổ biến nhất của Klaviyo), TUYỆT ĐỐI
 * không fallback về `site.currency` — đó chính là bug vừa sửa. */
export const fetchKlaviyoAccountCurrency = async (apiKey: string): Promise<string | null> => {
  const response = await fetch(`${API_BASE}/accounts`, { headers: authHeaders(apiKey) })
  if (!response.ok) return null

  try {
    const data = (await response.json()) as {
      readonly data?: readonly { readonly attributes?: { readonly preferred_currency?: string } }[]
    }
    return data.data?.[0]?.attributes?.preferred_currency ?? null
  } catch {
    return null
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

/** Đọc "Expected available in 1 second." từ body lỗi 429 để biết CHÍNH XÁC
 * chờ bao lâu trước khi thử lại, thay vì đoán một hằng số cố định — Klaviyo
 * trả con số này thẳng trong response. `null` nếu không parse được (dùng
 * mặc định 1500ms ở nơi gọi). */
const parseThrottleWaitMs = (bodyText: string): number | null => {
  const match = bodyText.match(/available in ([\d.]+) second/i)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 100 : null
}

const MAX_THROTTLE_ATTEMPTS = 3

const fetchValuesReport = async (
  apiKey: string,
  resource: 'campaign' | 'flow',
  conversionMetricId: string,
  range: { readonly start: string; readonly end: string },
): Promise<KlaviyoValuesOutcome> => {
  const groupKey = `${resource}_id`
  // Klaviyo BẮT BUỘC group theo cả `{resource}_id` LẪN `{resource}_message_id`
  // cùng lúc — một campaign/flow có thể có nhiều message (A/B test variant),
  // Klaviyo từ chối group chỉ theo ID cha. Hệ quả: response trả NHIỀU dòng
  // cho CÙNG một campaign/flow khi có >1 message — phải cộng dồn lại bên
  // dưới, không lấy đè dòng cuối lên dòng đầu.
  //
  // Tên field body ĐÚNG LÀ `group_by` (số ít) — xác nhận trực tiếp từ mã
  // nguồn SDK Python CHÍNH THỨC của Klaviyo (github.com/klaviyo/klaviyo-api-python,
  // file campaign_values_request_dto_resource_object_attributes.py, sinh tự
  // động từ OpenAPI spec thật, không phải bản tóm tắt docs): field
  // `group_by: Optional[List[StrictStr]]`, KHÔNG có alias nào khác — JSON
  // key gửi lên đúng là "group_by". Một lượt sửa trước đó đã đổi nhầm thành
  // `group_bys` (số nhiều) do suy diễn sai từ field `source.pointer` trong
  // response lỗi (pointer đó là cách Klaviyo HIỂN THỊ lỗi, không phải tên
  // field JSON thật) — đọc thẳng mã nguồn SDK mới là bằng chứng đáng tin.
  const messageGroupKey = `${resource}_message_id`

  // Reporting API giới hạn ~1 request/giây — gọi TỪ ĐÂY campaign VÀ flow
  // gần như cùng lúc (xem `fetchKlaviyoPerformance`) từng bị throttle 429
  // thật (8/2026). Nơi gọi giờ đã giãn cách hai lượt gọi, nhưng vẫn retry ở
  // đây làm lớp phòng thủ thứ hai — chờ đúng thời gian Klaviyo yêu cầu rồi
  // thử lại, tối đa `MAX_THROTTLE_ATTEMPTS` lần thay vì trả lỗi ngay.
  for (let attempt = 1; attempt <= MAX_THROTTLE_ATTEMPTS; attempt += 1) {
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
            group_by: [groupKey, messageGroupKey],
          },
        },
      }),
    })

    if (response.status === 429 && attempt < MAX_THROTTLE_ATTEMPTS) {
      const bodyText = await response.text().catch(() => '')
      const waitMs = parseThrottleWaitMs(bodyText) ?? 1500
      console.error(
        `Klaviyo ${resource}-values-reports bị throttle (lần ${attempt}/${MAX_THROTTLE_ATTEMPTS}) — chờ ${waitMs}ms rồi thử lại.`,
      )
      await sleep(waitMs)
      continue
    }

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
      // Cộng dồn theo `{resource}_id` — mỗi message/variant của cùng một
      // campaign/flow ra một dòng riêng ở API, nhưng UI hiện MỘT dòng/campaign
      // (giống bản trước khi group theo message_id trở thành bắt buộc).
      const aggregated = new Map<string, { opens: number; clicks: number; conversions: number; conversionValueMicros: number; recipients: number }>()
      for (const row of data.data?.attributes?.results ?? []) {
        const id = row.groupings?.[groupKey]
        if (!id) continue
        const existing = aggregated.get(id) ?? {
          opens: 0,
          clicks: 0,
          conversions: 0,
          conversionValueMicros: 0,
          recipients: 0,
        }
        aggregated.set(id, {
          opens: existing.opens + (row.statistics?.opens ?? 0),
          clicks: existing.clicks + (row.statistics?.clicks ?? 0),
          conversions: existing.conversions + (row.statistics?.conversions ?? 0),
          conversionValueMicros:
            existing.conversionValueMicros + Math.round((row.statistics?.conversion_value ?? 0) * 1_000_000),
          recipients: existing.recipients + (row.statistics?.recipients ?? 0),
        })
      }
      const rows = [...aggregated.entries()].map(([groupId, stats]) => ({ groupId, ...stats }))
      return { rows, error: null }
    } catch (error) {
      const message = `Trả về 200 nhưng JSON không đọc được: ${error instanceof Error ? error.message : String(error)}`
      console.error(`Klaviyo ${resource}-values-reports: ${message}`)
      return { rows: [], error: message }
    }
  }

  return { rows: [], error: `Klaviyo báo throttled (429) ${MAX_THROTTLE_ATTEMPTS} lần liên tiếp — thử lại sau.` }
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

/** Lọc theo ngày tạo profile (`created`) — dùng để đếm khách hàng MỚI trong
 * một khoảng ngày, khác đếm TỔNG toàn thời gian. Klaviyo chỉ hỗ trợ
 * `greater-than`/`less-than` cho field `created` (không có or-equal, xác
 * nhận qua docs `get_profiles`), và nhiều điều kiện nối bằng dấu phẩy được
 * hiểu là AND (docs Klaviyo). `createdBefore` nên là NGÀY SAU `endDate` mong
 * muốn (biên trên loại trừ) để không bỏ sót khách hàng tạo trong chính
 * ngày `endDate`. */
export interface KlaviyoCreatedFilter {
  readonly createdAfterIso: string
  readonly createdBeforeIso: string
}

/** `maxPages` mặc định CAO (200 trang × 100 = tối đa 20.000 khách hàng) để
 * ra được SỐ CHÍNH XÁC cho hầu hết tài khoản thay vì "500+" ước lượng —
 * Get Profiles có rate limit rộng (75/s burst, 750/phút), khác hẳn Reporting
 * API 1/s, nên phân trang sâu ở đây an toàn, không cần giãn cách. */
export const countKlaviyoProfiles = async (
  apiKey: string,
  filter?: KlaviyoCreatedFilter,
  maxPages = 200,
): Promise<KlaviyoProfileCount> => {
  let count = 0
  let cursor: string | undefined
  let pages = 0
  let error: string | null = null

  do {
    const url = new URL(`${API_BASE}/profiles`)
    url.searchParams.set('page[size]', '100')
    if (cursor) url.searchParams.set('page[cursor]', cursor)
    if (filter) {
      url.searchParams.set(
        'filter',
        `greater-than(created,${filter.createdAfterIso}),less-than(created,${filter.createdBeforeIso})`,
      )
    }

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

/** BÀI HỌC THỰC TẾ (8/2026): bản đầu `return` cả kết quả LỖI từ trong hàm
 * cache — `unstable_cache` coi đó là một kết quả THÀNH CÔNG bình thường và
 * cache y nguyên 6 giờ. Khi bug `page[size]` ở `/metrics` bị sửa xong và
 * deploy, người dùng vẫn thấy CÙNG MỘT lỗi cũ (cùng UUID trong body lỗi!)
 * suốt nhiều phút sau — vì cache key (apiKey + range) không đổi, Next vẫn
 * trả thẳng bản ghi lỗi đã lưu, không gọi lại Klaviyo. Sửa triệt để: hàm
 * bên trong `unstable_cache` giờ THROW khi lỗi — `unstable_cache` không
 * bao giờ lưu một promise bị reject, nên lần gọi kế tiếp LUÔN thử lại thật,
 * không bị "đóng băng" lỗi cũ tới 6 giờ. Hàm export ở dưới bắt lỗi đó và
 * đổi lại thành hình dạng `{error}` cũ cho nơi gọi, không phải đổi API.
 * Key bump 'v2' để xoá NGAY bản ghi lỗi đã cache trước khi có sửa này —
 * không đợi hết 6 giờ mới hết cache cũ. */
const fetchKlaviyoPerformanceCached = unstable_cache(
  async (
    apiKey: string,
    range: { readonly startDate: string; readonly endDate: string },
  ): Promise<{ readonly campaignPerformance: readonly KlaviyoValuesRow[]; readonly flowPerformance: readonly KlaviyoValuesRow[] }> => {
    const metricResult = await resolveConversionMetricId(apiKey)
    if (!metricResult.ok) {
      throw new Error(metricResult.error)
    }

    const reportRange = { start: range.startDate, end: range.endDate }
    // TUẦN TỰ, không Promise.all — Reporting API chỉ cho ~1 request/giây,
    // gọi campaign+flow đồng thời từng gây 429 thật (8/2026). `fetchValuesReport`
    // tự retry khi bị throttle rồi, nhưng giãn cách sẵn ở đây để KHÔNG PHẢI
    // dựa vào retry cho trường hợp phổ biến nhất.
    const campaigns = await fetchCampaignValuesReport(apiKey, metricResult.metricId, reportRange)
    await sleep(1100)
    const flows = await fetchFlowValuesReport(apiKey, metricResult.metricId, reportRange)

    const error = campaigns.error ?? flows.error
    if (error) throw new Error(error)
    return { campaignPerformance: campaigns.rows, flowPerformance: flows.rows }
  },
  ['klaviyo-performance', 'v2'],
  { revalidate: KLAVIYO_REPORT_REVALIDATE_SECONDS },
)

export const fetchKlaviyoPerformance = async (
  apiKey: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<KlaviyoPerformanceOutcome> => {
  try {
    const result = await fetchKlaviyoPerformanceCached(apiKey, range)
    return { campaignPerformance: result.campaignPerformance, flowPerformance: result.flowPerformance, error: null }
  } catch (error) {
    return {
      campaignPerformance: null,
      flowPerformance: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
