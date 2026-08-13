import 'server-only'

/**
 * Google Ads API — KHÁC HẲN mọi adapter Google khác trong file này về một
 * điểm: mọi request đều cần thêm header `developer-token`, một mã Google cấp
 * thủ công cho một tài khoản MCC, độc lập với Client ID/Secret OAuth.
 *
 * CHƯA nối vào `listAccounts`/`syncConnection` — không có developer token
 * thật để verify thì code này chỉ đúng về hình thức, chưa ai chạy thử được.
 * Nối vào luồng tự động là việc của lượt sau, sau khi có token thật để kiểm.
 * Gọi trực tiếp các hàm dưới đây một khi `site_oauth_apps.developer_token_enc`
 * có giá trị.
 */

// Google Ads API sunset các phiên bản cũ định kỳ (~1 năm/phiên bản) — v18 đã
// bị gỡ (404 generic của Google, không phải lỗi JSON từ Ads API), gây lỗi
// "Error 404 (Not Found)!!1" y hệt lỗi HTML robot.png quen thuộc. Đã dò trực
// tiếp bằng request không kèm token (thiếu token thì API THẬT trả 401 JSON,
// version không tồn tại thì gateway trả 404 HTML — phân biệt được hai loại
// lỗi mà không cần token thật): v19 trở xuống đã sunset, v20–v25 còn hoạt
// động, v26 trở lên chưa mở. Chọn v25 (mới nhất còn hoạt động tại thời điểm
// kiểm tra 2026-08-13) — cần dò lại định kỳ vì Google tiếp tục sunset dần.
const API_VERSION = 'v25'

export interface GoogleAdsAccount {
  readonly customerId: string
  readonly descriptiveName: string
}

interface GoogleAdsErrorDetail {
  readonly errorCode?: Readonly<Record<string, string>>
  readonly message?: string
}

interface GoogleAdsErrorBody {
  readonly error?: {
    readonly status?: string
    readonly message?: string
    readonly details?: readonly {
      readonly errors?: readonly GoogleAdsErrorDetail[]
    }[]
  }
}

/**
 * Bọc lỗi HTTP thành lỗi Google Ads THẬT — không đoán nguyên nhân từ mã
 * trạng thái. 403 có thể là thiếu quyền OAuth `adwords`, HOẶC Developer
 * Token còn ở mức "Test" (chỉ gọi được tài khoản test, không phải tài khoản
 * thật), HOẶC nhiều lý do khác — mỗi lý do có `googleErrorCode` riêng trong
 * phần thân JSON mà HTTP status không nói lên được. Đoán mù rồi hiện sai
 * nguyên nhân còn tệ hơn không hiện gì.
 */
export class GoogleAdsApiError extends Error {
  readonly status: number
  readonly googleErrorCode: string | null
  readonly googleMessage: string

  constructor(status: number, rawBody: string) {
    let googleErrorCode: string | null = null
    let googleMessage = rawBody

    try {
      const parsed = JSON.parse(rawBody) as GoogleAdsErrorBody
      googleMessage = parsed.error?.message ?? rawBody
      const detail = parsed.error?.details?.[0]?.errors?.[0]
      const codeEntry = detail?.errorCode ? Object.values(detail.errorCode)[0] : undefined
      googleErrorCode = codeEntry ?? null
      if (detail?.message) googleMessage = detail.message
    } catch {
      // Không phải JSON (vd. lỗi mạng, HTML từ proxy) — giữ nguyên rawBody.
    }

    super(googleMessage)
    this.status = status
    this.googleErrorCode = googleErrorCode
    this.googleMessage = googleMessage
  }
}

/** Google Ads không cho biết một customer ID có tồn tại/truy cập được hay
 * không nếu thiếu developer-token — endpoint này luôn cần header đó. */
export const listAccessibleGoogleAdsAccounts = async (
  accessToken: string,
  developerToken: string,
): Promise<readonly GoogleAdsAccount[]> => {
  const listResponse = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
      },
    },
  )
  if (!listResponse.ok) {
    throw new GoogleAdsApiError(listResponse.status, await listResponse.text())
  }

  const listData = (await listResponse.json()) as { resourceNames?: readonly string[] }
  const customerIds = (listData.resourceNames ?? [])
    .map((name) => name.split('/')[1])
    .filter((id): id is string => Boolean(id))

  const accounts = await Promise.all(
    customerIds.map(async (customerId) => {
      const name = await fetchCustomerDescriptiveName(accessToken, developerToken, customerId)
      return name ? { customerId, descriptiveName: name } : null
    }),
  )

  return accounts.filter((account): account is GoogleAdsAccount => account !== null)
}

const fetchCustomerDescriptiveName = async (
  accessToken: string,
  developerToken: string,
  customerId: string,
): Promise<string | null> => {
  const rows = await runGoogleAdsQuery(accessToken, developerToken, customerId, {
    query: 'SELECT customer.descriptive_name FROM customer LIMIT 1',
  })
  const name = rows[0]?.customer?.descriptiveName
  return typeof name === 'string' ? name : null
}

export interface GoogleAdsCampaignMetricRow {
  readonly date: string
  readonly campaignName: string
  readonly impressions: number
  readonly clicks: number
  readonly costMicros: number
  readonly conversions: number
  readonly conversionValueMicros: number
}

/**
 * GAQL (Google Ads Query Language) — không phải REST filter thường, là một
 * ngôn ngữ truy vấn riêng của Google Ads. `searchStream` trả về nhiều "batch",
 * mỗi batch có mảng `results` riêng — phải gộp lại, không phải một mảng duy
 * nhất như các API REST khác trong file này.
 */
export const fetchGoogleAdsCampaignMetrics = async (
  accessToken: string,
  developerToken: string,
  customerId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<readonly GoogleAdsCampaignMetricRow[]> => {
  const query = `
    SELECT
      segments.date,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'
  `.trim()

  const rows = await runGoogleAdsQuery(accessToken, developerToken, customerId, { query })

  return rows.map((row) => ({
    date: String(row.segments?.date ?? ''),
    campaignName: String(row.campaign?.name ?? ''),
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    costMicros: Number(row.metrics?.costMicros ?? 0),
    conversions: Number(row.metrics?.conversions ?? 0),
    conversionValueMicros: Math.round(Number(row.metrics?.conversionsValue ?? 0) * 1_000_000),
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hình dạng GAQL row đổi theo từng truy vấn, không đáng một kiểu generic riêng cho một hàm nội bộ.
type GaqlRow = Record<string, any>

const runGoogleAdsQuery = async (
  accessToken: string,
  developerToken: string,
  customerId: string,
  body: { readonly query: string },
): Promise<readonly GaqlRow[]> => {
  const response = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  if (!response.ok) return []

  // searchStream trả về một MẢNG các batch: [{ results: [...] }, { results: [...] }, ...]
  const batches = (await response.json()) as readonly { readonly results?: readonly GaqlRow[] }[]
  return batches.flatMap((batch) => batch.results ?? [])
}
