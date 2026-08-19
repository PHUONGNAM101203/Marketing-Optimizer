import 'server-only'

/**
 * Klaviyo API.
 *
 * CHƯA ai chạy thử với tài khoản Klaviyo thật — hình dạng request/response
 * dưới đây bám theo tài liệu chính thức developers.klaviyo.com (xác nhận
 * qua nghiên cứu 8/2026), cần verify khi có key thật, giống `google-ads.ts`/
 * `meta-metrics.ts` trước đây.
 *
 * KHÁC 10 provider còn lại ở HAI điểm:
 *   1. Xác thực bằng private API key dán trực tiếp, không OAuth — một key
 *      gắn với ĐÚNG MỘT tài khoản Klaviyo, không hết hạn, không refresh
 *      token (xem `resolveKlaviyoApiKey` trong `sync/access-token.ts`).
 *   2. Reporting API (campaign/flow-values-reports — nơi duy nhất có số
 *      liệu HIỆU SUẤT thật: opens/clicks/revenue) có rate limit RẤT chặt —
 *      1 request/giây, 2/phút, 225/NGÀY, khác hẳn hàng trăm/giây của
 *      GA4/GSC. Vì vậy các hàm report ở đây BẮT BUỘC phải cache ở tầng gọi
 *      (`unstable_cache`, xem `site-channel-detail.ts`) — gọi trực tiếp mỗi
 *      lần tải trang như GA4/GSC sẽ cạn hạn mức chỉ sau vài chục lượt xem.
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

// ─── Campaigns ───────────────────────────────────────────────────────────

export interface KlaviyoCampaign {
  readonly id: string
  readonly name: string
  readonly channel: 'email' | 'sms'
  readonly status: string
  readonly sendTime: string | null
}

const fetchCampaignsByChannel = async (
  apiKey: string,
  channel: 'email' | 'sms',
): Promise<readonly KlaviyoCampaign[]> => {
  const url = new URL(`${API_BASE}/campaigns`)
  url.searchParams.set('filter', `equals(messages.channel,'${channel}')`)
  url.searchParams.set('page[size]', '50')

  const response = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!response.ok) {
    console.error(`Klaviyo campaigns (${channel}) lỗi: HTTP ${response.status}`)
    return []
  }

  const data = (await response.json()) as {
    readonly data?: readonly {
      readonly id: string
      readonly attributes?: { readonly name?: string; readonly status?: string; readonly send_time?: string }
    }[]
  }
  return (data.data ?? []).map((row) => ({
    id: row.id,
    name: row.attributes?.name ?? row.id,
    channel,
    status: row.attributes?.status ?? 'unknown',
    sendTime: row.attributes?.send_time ?? null,
  }))
}

export const fetchKlaviyoCampaigns = async (apiKey: string): Promise<readonly KlaviyoCampaign[]> => {
  const [email, sms] = await Promise.all([
    fetchCampaignsByChannel(apiKey, 'email'),
    fetchCampaignsByChannel(apiKey, 'sms'),
  ])
  return [...email, ...sms]
}

// ─── Flows ───────────────────────────────────────────────────────────────

export interface KlaviyoFlow {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly triggerType: string | null
}

export const fetchKlaviyoFlows = async (apiKey: string): Promise<readonly KlaviyoFlow[]> => {
  const url = new URL(`${API_BASE}/flows`)
  url.searchParams.set('page[size]', '50')

  const response = await fetch(url.toString(), { headers: authHeaders(apiKey) })
  if (!response.ok) {
    console.error(`Klaviyo flows lỗi: HTTP ${response.status}`)
    return []
  }

  const data = (await response.json()) as {
    readonly data?: readonly {
      readonly id: string
      readonly attributes?: { readonly name?: string; readonly status?: string; readonly trigger_type?: string }
    }[]
  }
  return (data.data ?? []).map((row) => ({
    id: row.id,
    name: row.attributes?.name ?? row.id,
    status: row.attributes?.status ?? 'unknown',
    triggerType: row.attributes?.trigger_type ?? null,
  }))
}

// ─── Metric hội tụ (bắt buộc cho report doanh thu) ─────────────────────────

/** "Placed Order" là tên sự kiện chuẩn Klaviyo dùng cho đơn hàng — hầu hết
 * tích hợp ecommerce (Shopify/WooCommerce…) đều sinh event này. Site không
 * phải ecommerce hợp lệ sẽ không có — rơi về metric đầu tiên tìm được thay
 * vì báo lỗi, report khi đó vẫn chạy được, chỉ là "conversions" theo nghĩa
 * event đó thay vì đơn hàng. */
export const resolveConversionMetricId = async (apiKey: string): Promise<string | null> => {
  const response = await fetch(`${API_BASE}/metrics?page[size]=100`, { headers: authHeaders(apiKey) })
  if (!response.ok) return null

  const data = (await response.json()) as {
    readonly data?: readonly { readonly id: string; readonly attributes?: { readonly name?: string } }[]
  }
  const metrics = data.data ?? []
  const placedOrder = metrics.find((metric) => metric.attributes?.name === 'Placed Order')
  return placedOrder?.id ?? metrics[0]?.id ?? null
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
}

export const countKlaviyoProfiles = async (apiKey: string, maxPages = 5): Promise<KlaviyoProfileCount> => {
  let count = 0
  let cursor: string | undefined
  let pages = 0

  do {
    const url = new URL(`${API_BASE}/profiles`)
    url.searchParams.set('page[size]', '100')
    if (cursor) url.searchParams.set('page[cursor]', cursor)

    const response = await fetch(url.toString(), { headers: authHeaders(apiKey) })
    if (!response.ok) break

    const data = (await response.json()) as {
      readonly data?: readonly unknown[]
      readonly links?: { readonly next?: string | null }
    }
    count += data.data?.length ?? 0
    pages += 1

    const nextLink = data.links?.next
    cursor = nextLink ? (new URL(nextLink).searchParams.get('page[cursor]') ?? undefined) : undefined
  } while (cursor && pages < maxPages)

  return { count, truncated: Boolean(cursor) }
}

// ─── Segments & Lists ────────────────────────────────────────────────────

export interface KlaviyoSegment {
  readonly id: string
  readonly name: string
  readonly isActive: boolean
}

export const fetchKlaviyoSegments = async (apiKey: string): Promise<readonly KlaviyoSegment[]> => {
  const response = await fetch(`${API_BASE}/segments?page[size]=10`, { headers: authHeaders(apiKey) })
  if (!response.ok) return []

  const data = (await response.json()) as {
    readonly data?: readonly {
      readonly id: string
      readonly attributes?: { readonly name?: string; readonly is_active?: boolean }
    }[]
  }
  return (data.data ?? []).map((row) => ({
    id: row.id,
    name: row.attributes?.name ?? row.id,
    isActive: row.attributes?.is_active ?? false,
  }))
}

export interface KlaviyoList {
  readonly id: string
  readonly name: string
}

export const fetchKlaviyoLists = async (apiKey: string): Promise<readonly KlaviyoList[]> => {
  const response = await fetch(`${API_BASE}/lists?page[size]=10`, { headers: authHeaders(apiKey) })
  if (!response.ok) return []

  const data = (await response.json()) as {
    readonly data?: readonly { readonly id: string; readonly attributes?: { readonly name?: string } }[]
  }
  return (data.data ?? []).map((row) => ({ id: row.id, name: row.attributes?.name ?? row.id }))
}
