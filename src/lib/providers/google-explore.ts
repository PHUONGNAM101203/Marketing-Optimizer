import 'server-only'

/**
 * Số liệu cho trang Khám phá — LẤY TRỰC TIẾP từ API mỗi lần tải trang, KHÔNG
 * lưu vào `metrics_daily`. Khác bản chất với `google-metrics.ts`: đó là tổng
 * theo ngày dùng để vẽ xu hướng lâu dài, còn đây là truy vấn dạng phân rã
 * (top trang, top truy vấn…) — dữ liệu thăm dò tại chỗ, lưu lại chỉ tốn chỗ
 * mà không ai dùng lại.
 */

import type { Ga4ExploreDimension } from '@/lib/domain/explore-dimension'
import {
  MAX_TOP_ALL_TIME,
  MIN_TRENDING_VIEWS,
  TRENDING_WINDOW_DAYS,
  type VideoGrowthSummary,
  type VideoSummary,
  type VideoTrendingResult,
} from './video-trending-types'

const authHeader = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` })

// ─── GA4 ────────────────────────────────────────────────────────────────────

export interface Ga4Explore {
  readonly topPages: readonly { readonly path: string; readonly views: number }[]
  readonly channels: readonly { readonly channel: string; readonly sessions: number }[]
  readonly devices: readonly { readonly device: string; readonly sessions: number }[]
  readonly countries: readonly { readonly country: string; readonly sessions: number }[]
}

interface Ga4RunReportResponse {
  readonly rows?: readonly {
    readonly dimensionValues?: readonly { readonly value?: string }[]
    readonly metricValues?: readonly { readonly value?: string }[]
  }[]
}

/** Gọi từ cả trang Khám phá (limit người dùng chọn được, 10-1000) lẫn trang
 * chi tiết kênh GA4 (luôn cố định — trang đó chưa có UI đổi số hàng). */
const DEFAULT_CHANNEL_DETAIL_ROW_LIMIT = 10

const runGa4Report = async (
  accessToken: string,
  property: string,
  params: { readonly startDate: string; readonly endDate: string },
  dimension: string,
  metric: string,
  limit: number,
): Promise<readonly { readonly label: string; readonly value: number }[]> => {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`,
    {
      method: 'POST',
      headers: { ...authHeader(accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
        dimensions: [{ name: dimension }],
        metrics: [{ name: metric }],
        orderBys: [{ metric: { metricName: metric }, desc: true }],
        limit,
      }),
    },
  )
  if (!response.ok) return []

  const data = (await response.json()) as Ga4RunReportResponse
  return (data.rows ?? [])
    .filter((row) => Boolean(row.dimensionValues?.[0]?.value))
    .map((row) => ({
      label: row.dimensionValues?.[0]?.value as string,
      value: Number(row.metricValues?.[0]?.value ?? 0),
    }))
}

/** `limit` — GA4 Data API cho `limit` tới hàng chục nghìn dòng một lượt gọi,
 * nên chuyển thẳng số người dùng chọn ở trang Khám phá (10-1000), không cần
 * kẹp lại. Mặc định `DEFAULT_CHANNEL_DETAIL_ROW_LIMIT` cho lượt gọi từ trang
 * chi tiết kênh (chưa có UI chọn số hàng ở đó). */
export const fetchGa4Explore = async (
  accessToken: string,
  property: string,
  range: { readonly startDate: string; readonly endDate: string },
  limit: number = DEFAULT_CHANNEL_DETAIL_ROW_LIMIT,
): Promise<Ga4Explore> => {
  const [pages, channels, devices, countries] = await Promise.all([
    runGa4Report(accessToken, property, range, 'pagePath', 'screenPageViews', limit),
    runGa4Report(accessToken, property, range, 'sessionDefaultChannelGroup', 'sessions', limit),
    runGa4Report(accessToken, property, range, 'deviceCategory', 'sessions', limit),
    runGa4Report(accessToken, property, range, 'country', 'sessions', limit),
  ])

  return {
    topPages: pages.map((row) => ({ path: row.label, views: row.value })),
    channels: channels.map((row) => ({ channel: row.label, sessions: row.value })),
    devices: devices.map((row) => ({ device: row.label, sessions: row.value })),
    countries: countries.map((row) => ({ country: row.label, sessions: row.value })),
  }
}

/** Bốn hạng mục drill-down GA4 hỗ trợ khi bấm vào một ô chỉ số ở tab "Chi
 * tiết" — ÁNH XẠ sang tên dimension THẬT của GA4 Data API. Dùng chung kiểu
 * `Ga4ExploreDimension` với trang Khám phá (đã mở rộng thêm 'country' ở
 * `explore-dimension.ts`), không tạo hai khái niệm "hạng mục GA4" khác nhau
 * trong cùng một app. */
const GA4_BREAKDOWN_DIMENSION_NAMES: Readonly<Record<Ga4ExploreDimension, string>> = {
  page: 'pagePath',
  channel: 'sessionDefaultChannelGroup',
  device: 'deviceCategory',
  country: 'country',
}

export interface Ga4MetricBreakdownRow {
  readonly label: string
  readonly value: number
}

/** Phân rã MỘT chỉ số cụ thể (bất kỳ trong 17 chỉ số của tab "Chi tiết") theo
 * MỘT hạng mục người dùng chọn — trả lỗi thật thay vì mảng rỗng khi API từ
 * chối (`runGa4Report` hiện tại nuốt lỗi thành `[]`, chấp nhận được cho
 * `fetchGa4Explore` vì 3-4 breakdown độc lập đã có test thật; ở đây người
 * dùng bấm CHỦ ĐỘNG để xem một phân rã cụ thể, im lặng trả rỗng sẽ trông y
 * hệt "trang này thật sự không có traffic" — phải phân biệt rõ). */
export const fetchGa4MetricBreakdown = async (
  accessToken: string,
  property: string,
  range: { readonly startDate: string; readonly endDate: string },
  metric: Ga4OverviewMetric,
  dimension: Ga4ExploreDimension,
  limit: number,
): Promise<{ readonly rows: readonly Ga4MetricBreakdownRow[] | null; readonly error: string | null }> => {
  const dimensionName = GA4_BREAKDOWN_DIMENSION_NAMES[dimension]
  let response: Response
  try {
    response = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      method: 'POST',
      headers: { ...authHeader(accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        dimensions: [{ name: dimensionName }],
        metrics: [{ name: metric }],
        orderBys: [{ metric: { metricName: metric }, desc: true }],
        limit,
      }),
    })
  } catch (error) {
    return {
      rows: null,
      error: `Lỗi mạng khi gọi GA4 runReport: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    return { rows: null, error: `HTTP ${response.status} ${response.statusText}: ${bodyText.slice(0, 400)}` }
  }

  const data = (await response.json()) as Ga4RunReportResponse
  return {
    rows: (data.rows ?? [])
      .filter((row) => Boolean(row.dimensionValues?.[0]?.value))
      .map((row) => ({
        label: row.dimensionValues?.[0]?.value as string,
        value: Number(row.metricValues?.[0]?.value ?? 0),
      })),
    error: null,
  }
}

/** Bộ chỉ số tổng cho tab "Chi tiết" của GA4 — MỌI metric tổng hợp cốt lõi mà
 * GA4 Data API cung cấp cho một property bất kỳ (Users/Sessions/Engagement/
 * Page views/Events/Conversions/Revenue), không phải bộ 3 chỉ số rút gọn của
 * `Ga4Explore` (vốn chỉ phục vụ 3 breakdown top-N). CỐ TÌNH chỉ dùng metric
 * "lõi" (core), không thêm metric riêng của Ecommerce/Publisher/Audience —
 * những nhóm đó có thể KHÔNG tương thích chung một lượt gọi `runReport`
 * không-dimension với nhóm lõi, dễ khiến CẢ yêu cầu lỗi 400 vì một metric lạ.
 * Một lượt gọi `runReport` DUY NHẤT, không có `dimensions` — GA4 coi đây là
 * một hàng "tổng" cho cả khoảng ngày, không phải phân rã theo ngày/trang. */
export const GA4_OVERVIEW_METRICS = [
  'activeUsers',
  'totalUsers',
  'newUsers',
  'sessions',
  'sessionsPerUser',
  'engagedSessions',
  'engagementRate',
  'averageSessionDuration',
  'userEngagementDuration',
  'screenPageViews',
  'screenPageViewsPerSession',
  'screenPageViewsPerUser',
  'eventCount',
  'eventCountPerUser',
  'conversions',
  'bounceRate',
  'totalRevenue',
] as const

export type Ga4OverviewMetric = (typeof GA4_OVERVIEW_METRICS)[number]

export type Ga4Overview = Readonly<Record<Ga4OverviewMetric, number | null>>

export interface Ga4OverviewOutcome {
  readonly overview: Ga4Overview | null
  /** Lý do THẬT khi `overview` null — HTTP lỗi kèm status/body thật, hay lỗi
   * mạng. KHÔNG được lặp lại lỗi "nuốt lý do thật" đã gặp ở PSI/GA4 Admin
   * API trong chính session sửa tính năng này — chính hàm này từng mắc lại
   * y hệt lỗi đó trước khi có `Ga4OverviewOutcome`. */
  readonly error: string | null
}

interface Ga4RunReportWithHeadersResponse {
  readonly metricHeaders?: readonly { readonly name?: string }[]
  readonly rows?: readonly { readonly metricValues?: readonly { readonly value?: string }[] }[]
}

/** GA4 Data API từ chối CẢ yêu cầu nếu quá 10 metric trong một `runReport`
 * không lồng report khác ("Requests are limited to 10 metrics within a
 * nested request" — lỗi thật, xác nhận từ log production khi 17 metric bị
 * gộp chung một lượt gọi). Chia `GA4_OVERVIEW_METRICS` thành các lô ≤10,
 * gọi song song, rồi ghép lại — vẫn MỘT vòng round-trip (Promise.all), không
 * phải tuần tự, và vẫn lấy được ĐỦ toàn bộ 17 metric như yêu cầu. */
const GA4_OVERVIEW_METRICS_PER_REQUEST = 10

const chunk = <T,>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

interface Ga4OverviewChunkOutcome {
  readonly values: Partial<Ga4Overview> | null
  readonly error: string | null
}

const runGa4OverviewChunk = async (
  accessToken: string,
  property: string,
  range: { readonly startDate: string; readonly endDate: string },
  metrics: readonly Ga4OverviewMetric[],
): Promise<Ga4OverviewChunkOutcome> => {
  let response: Response
  try {
    response = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      method: 'POST',
      headers: { ...authHeader(accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
        metrics: metrics.map((name) => ({ name })),
      }),
    })
  } catch (error) {
    const message = `Lỗi mạng khi gọi GA4 runReport tổng: ${error instanceof Error ? error.message : String(error)}`
    console.error(message)
    return { values: null, error: message }
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    const message = `GA4 runReport tổng trả HTTP ${response.status} ${response.statusText}: ${bodyText.slice(0, 400)}`
    console.error(message)
    return { values: null, error: message }
  }

  const data = (await response.json()) as Ga4RunReportWithHeadersResponse
  const row = data.rows?.[0]
  // Không có hàng nào nhưng response 200 hợp lệ — khoảng ngày thật sự không
  // có traffic, KHÔNG phải lỗi. Trả về toàn 0, không phải lỗi.
  if (!row) return { values: Object.fromEntries(metrics.map((metric) => [metric, 0])), error: null }

  // Đọc theo TÊN cột GA4 thật sự trả về (`metricHeaders`), không giả định
  // khớp đúng thứ tự đã yêu cầu — cùng lý do YouTube Analytics đã áp dụng ở
  // trên: một metric không hợp lệ cho property này có thể bị Google âm thầm
  // bỏ qua trong khi vẫn trả 200 cho các cột còn lại.
  const columnIndex = new Map((data.metricHeaders ?? []).map((column, index) => [column.name, index]))
  const valueOf = (metric: Ga4OverviewMetric): number | null => {
    const index = columnIndex.get(metric)
    return index === undefined ? null : Number(row.metricValues?.[index]?.value ?? 0)
  }

  return { values: Object.fromEntries(metrics.map((metric) => [metric, valueOf(metric)])), error: null }
}

export const fetchGa4Overview = async (
  accessToken: string,
  property: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<Ga4OverviewOutcome> => {
  const chunks = chunk(GA4_OVERVIEW_METRICS, GA4_OVERVIEW_METRICS_PER_REQUEST)
  const outcomes = await Promise.all(
    chunks.map((metrics) => runGa4OverviewChunk(accessToken, property, range, metrics)),
  )

  // Một lô lỗi thôi cũng đủ để coi cả bộ chỉ số là chưa lấy được — hiện nửa
  // vời (10/17 metric có số, 7 còn lại trống) dễ bị hiểu nhầm là dữ liệu
  // thật bằng 0, không phải "chưa tải được".
  const failed = outcomes.find((outcome) => outcome.error)
  if (failed) return { overview: null, error: failed.error }

  const overview = outcomes.reduce<Partial<Ga4Overview>>(
    (merged, outcome) => ({ ...merged, ...outcome.values }),
    {},
  )
  return { overview: overview as Ga4Overview, error: null }
}

// ─── Search Console ─────────────────────────────────────────────────────────

/** Mỗi hàng phân rã đều mang đủ 4 chỉ số GSC có — khác GA4 (nhiều chỉ số,
 * phải chunk từng đợt 10 vì giới hạn API), GSC luôn trả cả clicks/
 * impressions/ctr/position TRONG CÙNG một hàng bất kể hạng mục nào, nên
 * "lấy hết dữ liệu" ở đây là thêm HẠNG MỤC (searchType, searchAppearance —
 * hai dimension API hỗ trợ nhưng trước đây chưa dùng tới), không phải thêm
 * chỉ số. */
interface GscBreakdownRow {
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly position: number
}

export interface GscExplore {
  readonly topQueries: readonly (GscBreakdownRow & { readonly query: string })[]
  readonly topPages: readonly (GscBreakdownRow & { readonly page: string })[]
  readonly countries: readonly (GscBreakdownRow & { readonly country: string })[]
  readonly devices: readonly (GscBreakdownRow & { readonly device: string })[]
  /** `web`/`image`/`video`/`news`/`discover`/`googleNews` — dimension
   * `searchType` của Search Analytics API, trước đây chưa dùng. */
  readonly searchTypes: readonly (GscBreakdownRow & { readonly searchType: string })[]
  /** Định dạng kết quả rich result (AMP, sản phẩm, sự kiện…) — dimension
   * `searchAppearance`, trước đây chưa dùng. */
  readonly appearances: readonly (GscBreakdownRow & { readonly appearance: string })[]
}

export type GscOverview = GscBreakdownRow

export interface GscOverviewOutcome {
  readonly overview: GscOverview | null
  readonly error: string | null
}

interface GscQueryRow {
  readonly keys?: readonly string[]
  readonly clicks?: number
  readonly impressions?: number
  readonly position?: number
}

interface GscQueryOutcome {
  readonly rows: readonly GscQueryRow[]
  readonly error: string | null
}

/** `dimensions: []` (mảng rỗng) — Search Analytics API trả về ĐÚNG MỘT hàng
 * tổng cho toàn site, không có `keys`, dùng cho `fetchGscOverview`. */
const runGscQuery = async (
  accessToken: string,
  siteUrl: string,
  params: { readonly startDate: string; readonly endDate: string },
  dimensions: readonly string[],
  rowLimit: number,
): Promise<GscQueryOutcome> => {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { ...authHeader(accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions,
        rowLimit,
      }),
    },
  )
  if (!response.ok) {
    // Trước đây trả `[]` lặng lẽ khi lỗi — cùng lớp lỗi "nuốt lỗi API thật"
    // đã vá cho PSI/GA4 trong phiên này. Log ra console.error để đọc được
    // qua `vercel logs` thay vì Chi tiết chỉ hiện trống không rõ lý do.
    const bodyText = await response.text().catch(() => '')
    const error = `HTTP ${response.status} ${response.statusText}: ${bodyText.slice(0, 300)}`
    console.error(`GSC searchAnalytics.query lỗi (${siteUrl}, dimensions=${dimensions.join(',') || '(tổng)'}): ${error}`)
    return { rows: [], error }
  }

  try {
    const data = (await response.json()) as { rows?: readonly GscQueryRow[] }
    return { rows: data.rows ?? [], error: null }
  } catch (error) {
    const message = `GSC trả 200 nhưng JSON không đọc được: ${error instanceof Error ? error.message : String(error)}`
    console.error(message)
    return { rows: [], error: message }
  }
}

const toBreakdownRow = (row: GscQueryRow): GscBreakdownRow => ({
  clicks: row.clicks ?? 0,
  impressions: row.impressions ?? 0,
  ctr: (row.impressions ?? 0) > 0 ? (row.clicks ?? 0) / (row.impressions as number) : 0,
  position: row.position ?? 0,
})

/** `rowLimit` — Search Console API cho `rowLimit` tới 25.000, thoải mái
 * chuyển thẳng lựa chọn 10-1000 của trang Khám phá. Mặc định
 * `DEFAULT_CHANNEL_DETAIL_ROW_LIMIT` cho trang chi tiết kênh — tab "Tổng
 * quan" (không đổi) tự cắt xuống còn 10 dòng khi hiện, còn tab "Chi tiết"
 * dùng nguyên `rowLimit` truyền vào (xem `site-channel-detail.ts` truyền
 * 1000 riêng cho GSC). Lỗi từng hạng mục lỗi ĐỘC LẬP — một hạng mục lỗi
 * (đã log console.error ở `runGscQuery`) chỉ làm mảng đó rỗng, không kéo
 * các hạng mục khác theo, giữ đúng hành vi khoan dung đã có từ trước. */
export const fetchGscExplore = async (
  accessToken: string,
  siteUrl: string,
  range: { readonly startDate: string; readonly endDate: string },
  rowLimit: number = DEFAULT_CHANNEL_DETAIL_ROW_LIMIT,
): Promise<GscExplore> => {
  const [queries, pages, countries, devices, searchTypes, appearances] = await Promise.all([
    runGscQuery(accessToken, siteUrl, range, ['query'], rowLimit),
    runGscQuery(accessToken, siteUrl, range, ['page'], rowLimit),
    runGscQuery(accessToken, siteUrl, range, ['country'], rowLimit),
    runGscQuery(accessToken, siteUrl, range, ['device'], rowLimit),
    runGscQuery(accessToken, siteUrl, range, ['searchType'], rowLimit),
    runGscQuery(accessToken, siteUrl, range, ['searchAppearance'], rowLimit),
  ])

  return {
    topQueries: queries.rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ query: row.keys?.[0] as string, ...toBreakdownRow(row) })),
    topPages: pages.rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ page: row.keys?.[0] as string, ...toBreakdownRow(row) })),
    countries: countries.rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ country: row.keys?.[0] as string, ...toBreakdownRow(row) })),
    devices: devices.rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ device: row.keys?.[0] as string, ...toBreakdownRow(row) })),
    searchTypes: searchTypes.rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ searchType: row.keys?.[0] as string, ...toBreakdownRow(row) })),
    appearances: appearances.rows
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ appearance: row.keys?.[0] as string, ...toBreakdownRow(row) })),
  }
}

/** Tổng toàn site (không chia hạng mục) cho 4 ô số đầu tab "Chi tiết" —
 * cùng tinh thần `fetchGa4Overview`: LUÔN kèm lỗi thật khi `overview` null,
 * không đoán mò lý do. */
export const fetchGscOverview = async (
  accessToken: string,
  siteUrl: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<GscOverviewOutcome> => {
  const outcome = await runGscQuery(accessToken, siteUrl, range, [], 1)
  if (outcome.error) return { overview: null, error: outcome.error }
  const row = outcome.rows[0]
  return { overview: row ? toBreakdownRow(row) : { clicks: 0, impressions: 0, ctr: 0, position: 0 }, error: null }
}

// ─── Tag Manager ────────────────────────────────────────────────────────────

export interface GtmExplore {
  readonly workspaceName: string | null
  readonly tags: readonly { readonly name: string; readonly type: string }[]
  readonly triggers: readonly { readonly name: string; readonly type: string }[]
  readonly variables: readonly { readonly name: string; readonly type: string }[]
}

interface GtmEntity {
  readonly name?: string
  readonly type?: string
}

const listGtmEntities = async (
  accessToken: string,
  workspacePath: string,
  entity: 'tags' | 'triggers' | 'variables',
): Promise<readonly GtmEntity[]> => {
  const response = await fetch(
    `https://www.googleapis.com/tagmanager/v2/${workspacePath}/${entity}`,
    { headers: authHeader(accessToken) },
  )
  if (!response.ok) return []

  const data = (await response.json()) as Record<string, readonly GtmEntity[] | undefined>
  return data[entity] ?? []
}

/** GTM không có "báo cáo" — nó có CẤU HÌNH. Khám phá ở đây là liệt kê
 * tag/trigger/variable đang publish, không phải một con số theo thời gian. */
export const fetchGtmExplore = async (
  accessToken: string,
  containerPath: string,
): Promise<GtmExplore> => {
  const workspacesResponse = await fetch(
    `https://www.googleapis.com/tagmanager/v2/${containerPath}/workspaces`,
    { headers: authHeader(accessToken) },
  )
  if (!workspacesResponse.ok) {
    return { workspaceName: null, tags: [], triggers: [], variables: [] }
  }

  const workspacesData = (await workspacesResponse.json()) as {
    workspace?: readonly { readonly path?: string; readonly name?: string }[]
  }
  const workspace = workspacesData.workspace?.[0]
  if (!workspace?.path) return { workspaceName: null, tags: [], triggers: [], variables: [] }

  const [tags, triggers, variables] = await Promise.all([
    listGtmEntities(accessToken, workspace.path, 'tags'),
    listGtmEntities(accessToken, workspace.path, 'triggers'),
    listGtmEntities(accessToken, workspace.path, 'variables'),
  ])

  const toRow = (entity: GtmEntity) => ({
    name: entity.name ?? '—',
    type: entity.type ?? '—',
  })

  return {
    workspaceName: workspace.name ?? null,
    tags: tags.map(toRow),
    triggers: triggers.map(toRow),
    variables: variables.map(toRow),
  }
}

// ─── YouTube ────────────────────────────────────────────────────────────────

export interface YoutubeExplore {
  readonly topVideos: readonly {
    readonly externalVideoId: string
    readonly title: string
    readonly thumbnailUrl: string | null
    readonly views: number
    readonly likes: number
    readonly comments: number
    /** `null` khi Analytics API không trả cột này cho tài khoản — KHÔNG suy
     * ra 0, vì 0 lượt chia sẻ thật và "không đọc được" là hai việc khác nhau
     * (xem UI: cột chỉ hiện khi ít nhất một video có giá trị khác null). */
    readonly shares: number | null
    /** ISO 8601, từ `snippet.publishedAt` — `null` nếu lượt gọi `videos.list`
     * lấy metadata thất bại (không chặn phần còn lại, xem `metaById`). */
    readonly createdAt: string | null
  }[]
  /** `null` = tải thành công (danh sách có thể rỗng — kênh chưa đăng video
   * trong khoảng ngày đã chọn, hoàn toàn bình thường). Khác `null` = request
   * thất bại thật — phân biệt rõ với "chưa có video nào" để không hiện nhầm
   * cùng một ô trống cho hai tình huống khác hẳn nhau. */
  readonly fetchError: string | null
}

/** 4 metric cùng dimension `video`, cùng một lệnh gọi — CHƯA verify với tài
 * khoản thật là `shares` có luôn được trả về hay không (khác `views`, vốn đã
 * chạy thật). Nếu Analytics API từ chối cả yêu cầu vì `shares` không hợp lệ
 * cho loại báo cáo video, bỏ nó khỏi mảng này khi có log lỗi thật để xác nhận. */
const VIDEO_METRICS = ['views', 'likes', 'comments', 'shares'] as const

/** `maxResults` — chuyển thẳng lựa chọn của trang Khám phá, KHÔNG kẹp lại:
 * YouTube Analytics API chưa từng thấy tài liệu nào ghi trần cụ thể thấp hơn
 * cho kiểu báo cáo này; nếu Google từ chối một `maxResults` quá lớn, nhánh
 * `!reportResponse.ok` bên dưới đã bắt và trả `fetchError` rõ ràng cho người
 * dùng thấy — không cần đoán trước một trần "an toàn" tuỳ tiện. */
export const fetchYoutubeExplore = async (
  accessToken: string,
  channelId: string,
  range: { readonly startDate: string; readonly endDate: string },
  maxResults: number = DEFAULT_CHANNEL_DETAIL_ROW_LIMIT,
): Promise<YoutubeExplore> => {
  const reportUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  reportUrl.searchParams.set('ids', `channel==${channelId}`)
  reportUrl.searchParams.set('startDate', range.startDate)
  reportUrl.searchParams.set('endDate', range.endDate)
  reportUrl.searchParams.set('dimensions', 'video')
  reportUrl.searchParams.set('metrics', VIDEO_METRICS.join(','))
  reportUrl.searchParams.set('sort', '-views')
  reportUrl.searchParams.set('maxResults', String(maxResults))

  const reportResponse = await fetch(reportUrl.toString(), { headers: authHeader(accessToken) })
  if (!reportResponse.ok) {
    const errorBody = await reportResponse.text()
    return { topVideos: [], fetchError: `YouTube Analytics trả lỗi HTTP ${reportResponse.status}: ${errorBody.slice(0, 200)}` }
  }

  const reportData = (await reportResponse.json()) as {
    readonly columnHeaders?: readonly { readonly name?: string }[]
    readonly rows?: readonly (readonly (string | number)[])[]
  }
  const rows = reportData.rows ?? []
  if (rows.length === 0) return { topVideos: [], fetchError: null }

  // Đọc vị trí cột theo `columnHeaders` Google TRẢ VỀ, không giả định khớp
  // đúng thứ tự đã yêu cầu ở `metrics` — an toàn hơn nếu API bỏ qua một
  // metric không hỗ trợ (vd. `shares`) mà vẫn trả 200 cho các cột còn lại.
  const columnIndex = new Map(
    (reportData.columnHeaders ?? []).map((column, index) => [column.name, index]),
  )
  const valueAt = (row: readonly (string | number)[], metric: string): number | null => {
    const index = columnIndex.get(metric)
    return index === undefined ? null : Number(row[index] ?? 0)
  }

  const videoIds = rows.map((row) => String(row[0]))
  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}`,
    { headers: authHeader(accessToken) },
  )
  interface VideoMeta {
    readonly title: string
    readonly thumbnailUrl: string | null
    readonly publishedAt: string | null
  }
  const metaById = new Map<string, VideoMeta>()
  if (videosResponse.ok) {
    const videosData = (await videosResponse.json()) as {
      readonly items?: readonly {
        readonly id?: string
        readonly snippet?: {
          readonly title?: string
          readonly publishedAt?: string
          readonly thumbnails?: {
            readonly medium?: { readonly url?: string }
            readonly default?: { readonly url?: string }
          }
        }
      }[]
    }
    for (const item of videosData.items ?? []) {
      if (!item.id) continue
      metaById.set(item.id, {
        title: item.snippet?.title ?? item.id,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
        publishedAt: item.snippet?.publishedAt ?? null,
      })
    }
  }

  return {
    topVideos: rows.map((row) => {
      const id = String(row[0])
      const meta = metaById.get(id)
      return {
        externalVideoId: id,
        title: meta?.title ?? id,
        thumbnailUrl: meta?.thumbnailUrl ?? null,
        views: valueAt(row, 'views') ?? 0,
        likes: valueAt(row, 'likes') ?? 0,
        comments: valueAt(row, 'comments') ?? 0,
        shares: valueAt(row, 'shares'),
        createdAt: meta?.publishedAt ?? null,
      }
    }),
    fetchError: null,
  }
}

// ─── YouTube — trending/top-all-time ───────────────────────────────────────

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)
const daysAgo = (days: number): string => toIsoDate(new Date(Date.now() - days * 86_400_000))

const YOUTUBE_ALL_METRICS = ['views', 'likes', 'comments', 'shares'] as const
// Trần trên số video lấy về mỗi lượt gọi — tài khoản có hàng nghìn video vẫn
// chỉ tốn 2 lượt gọi report tổng cộng cho toàn bộ tính năng này (khác
// `fetchAllTiktokVideos`, nơi TikTok bắt buộc phải phân trang vì không có
// cách sort/lọc theo server).
const MAX_TRENDING_VIDEOS = 200

interface YoutubeReportRow {
  readonly columnHeaders?: readonly { readonly name?: string }[]
  readonly rows?: readonly (readonly (string | number)[])[]
}

type YoutubeVideoMeta = { readonly title: string; readonly thumbnailUrl: string | null }

/** `videos.list` chỉ nhận tối đa 50 ID mỗi request — giới hạn cứng của
 * YouTube Data API v3, trong khi `MAX_TRENDING_VIDEOS` (200) vượt xa mức đó.
 * Nhét thẳng >50 ID vào một URL thì tốt nhất chỉ 50 ID đầu được xử lý, xấu
 * nhất API trả lỗi cho cả request. */
const YOUTUBE_VIDEOS_LIST_BATCH_SIZE = 50

const chunkIds = (ids: readonly string[], size: number): string[][] => {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}

const fetchYoutubeMetaBatch = async (
  accessToken: string,
  batchIds: readonly string[],
): Promise<Map<string, YoutubeVideoMeta>> => {
  const metaById = new Map<string, YoutubeVideoMeta>()
  try {
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${batchIds.join(',')}`,
      { headers: authHeader(accessToken) },
    )
    if (!videosResponse.ok) {
      console.error(`Không đọc được videos.list của YouTube: HTTP ${videosResponse.status}`)
      return metaById
    }

    const videosData = (await videosResponse.json()) as {
      readonly items?: readonly {
        readonly id?: string
        readonly snippet?: {
          readonly title?: string
          readonly thumbnails?: {
            readonly medium?: { readonly url?: string }
            readonly default?: { readonly url?: string }
          }
        }
      }[]
    }
    for (const item of videosData.items ?? []) {
      if (!item.id) continue
      metaById.set(item.id, {
        title: item.snippet?.title ?? item.id,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      })
    }
  } catch (error) {
    // Lỗi mạng (fetch throw) hoặc JSON hỏng — coi lô này như không lấy
    // được, không để crash lan ra toàn bộ `getYoutubeVideoTrending`. Video
    // trong lô sẽ fallback về hiển thị ID thô ở nơi gọi.
    console.error(
      `Không đọc được videos.list của YouTube: ${error instanceof Error ? error.message : String(error)}`,
    )
    return metaById
  }
  return metaById
}

const fetchYoutubeMetaById = async (
  accessToken: string,
  videoIds: readonly string[],
): Promise<Map<string, YoutubeVideoMeta>> => {
  const metaById = new Map<string, YoutubeVideoMeta>()
  if (videoIds.length === 0) return metaById

  const batches = await Promise.all(
    chunkIds(videoIds, YOUTUBE_VIDEOS_LIST_BATCH_SIZE).map((batchIds) =>
      fetchYoutubeMetaBatch(accessToken, batchIds),
    ),
  )
  for (const batch of batches) {
    for (const [id, meta] of batch) metaById.set(id, meta)
  }
  return metaById
}

/**
 * Tổng số liệu ALL-TIME (10 năm trở lại — YouTube Analytics trả 0 hàng cho
 * khoảng trước ngày kênh tạo, không lỗi, nên dùng mốc cố định đủ xa thay vì
 * phải tra ngày tạo kênh) cho từng video — dùng cho `topAllTime`, và làm mốc
 * "cộng dồn tại đầu cửa sổ" để tính % tăng trưởng trong
 * `getYoutubeVideoTrending` (cùng công thức TikTok dùng trên snapshot cộng
 * dồn — xem `startViews` bên dưới), vì chuỗi views-theo-ngày ở
 * `fetchYoutubeDailyViews` chỉ có views, không có 3 chỉ số kia.
 */
const fetchYoutubeAllTimeMetrics = async (
  accessToken: string,
  channelId: string,
): Promise<Map<string, VideoSummary>> => {
  const reportUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  reportUrl.searchParams.set('ids', `channel==${channelId}`)
  reportUrl.searchParams.set('startDate', daysAgo(3650))
  reportUrl.searchParams.set('endDate', toIsoDate(new Date()))
  reportUrl.searchParams.set('dimensions', 'video')
  reportUrl.searchParams.set('metrics', YOUTUBE_ALL_METRICS.join(','))
  reportUrl.searchParams.set('sort', '-views')
  reportUrl.searchParams.set('maxResults', String(MAX_TRENDING_VIDEOS))

  let reportData: YoutubeReportRow
  try {
    const reportResponse = await fetch(reportUrl.toString(), { headers: authHeader(accessToken) })
    if (!reportResponse.ok) {
      console.error(`Không đọc được báo cáo all-time của YouTube: HTTP ${reportResponse.status}`)
      return new Map()
    }
    reportData = (await reportResponse.json()) as YoutubeReportRow
  } catch (error) {
    // Lỗi mạng (fetch throw, vd. timeout/DNS) hoặc JSON hỏng — coi như
    // không lấy được số liệu, để `getYoutubeVideoTrending` render phần
    // trending rỗng thay vì crash cả trang chi tiết kênh.
    console.error(
      `Không đọc được báo cáo all-time của YouTube: ${error instanceof Error ? error.message : String(error)}`,
    )
    return new Map()
  }

  const rows = reportData.rows ?? []
  if (rows.length === 0) return new Map()

  const columnIndex = new Map(
    (reportData.columnHeaders ?? []).map((column, index) => [column.name, index]),
  )
  const valueAt = (row: readonly (string | number)[], metric: string): number | null => {
    const index = columnIndex.get(metric)
    return index === undefined ? null : Number(row[index] ?? 0)
  }

  const metaById = await fetchYoutubeMetaById(accessToken, rows.map((row) => String(row[0])))

  const result = new Map<string, VideoSummary>()
  for (const row of rows) {
    const id = String(row[0])
    const meta = metaById.get(id)
    result.set(id, {
      externalVideoId: id,
      title: meta?.title ?? id,
      thumbnailUrl: meta?.thumbnailUrl ?? null,
      views: valueAt(row, 'views') ?? 0,
      likes: valueAt(row, 'likes') ?? 0,
      comments: valueAt(row, 'comments') ?? 0,
      shares: valueAt(row, 'shares'),
    })
  }
  return result
}

/**
 * Chuỗi views-theo-ngày của từng video trong 365 ngày gần nhất — MỘT lượt
 * gọi duy nhất (`dimensions=video,day`), dùng để tính cả 3 cửa sổ tuần/
 * tháng/năm bằng cách cộng dồn theo mốc ngày, thay vì gọi report riêng cho
 * mỗi cửa sổ (sẽ tốn 6 lượt gọi thay vì 1).
 *
 * CHƯA ai chạy thử được với tài khoản YouTube thật — tổ hợp
 * `dimensions=video,day` cho nhiều video cùng lúc, và mức `maxResults` hợp
 * lý cho tổ hợp đó, bám theo tài liệu YouTube Analytics API công khai
 * (8/2026) chứ chưa verify bằng token thật. Nếu API từ chối tổ hợp dimension
 * này hoặc trả lỗi vì `maxResults`, cần verify và chỉnh lại khi có token thật.
 */
const fetchYoutubeDailyViews = async (
  accessToken: string,
  channelId: string,
): Promise<Map<string, Map<string, number>>> => {
  const reportUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  reportUrl.searchParams.set('ids', `channel==${channelId}`)
  reportUrl.searchParams.set('startDate', daysAgo(365))
  reportUrl.searchParams.set('endDate', toIsoDate(new Date()))
  reportUrl.searchParams.set('dimensions', 'video,day')
  reportUrl.searchParams.set('metrics', 'views')
  // Số cố định thay cho `MAX_TRENDING_VIDEOS * 366` (73,200 — phép nhân
  // trần-video-lấy-về với số ngày, không phải trần thật của API) — 10000
  // vẫn chỉ là một mức phỏng đoán ít phi thực tế hơn, chưa verify (xem ghi
  // chú "CHƯA ai chạy thử" ở trên).
  reportUrl.searchParams.set('maxResults', '10000')
  // Bắt buộc có `sort`: hàng ở đây là cặp (video, ngày), 10000 hàng chỉ đủ cho
  // ~27 video trong một năm, nên báo cáo GẦN NHƯ CHẮC CHẮN bị cắt. Không có
  // `sort` thì phần nào sống sót là không xác định → `trendingFast` thành kết
  // quả một phần, thay đổi ngẫu nhiên giữa các lần tải. Chọn `-day` (mới nhất
  // trước) chứ không phải `-views`: phần bị cắt khi đó là những ngày CŨ NHẤT,
  // đều nhau cho mọi video — cửa sổ tuần/tháng vẫn đủ hàng cho cả kênh lớn, và
  // không video nào bị loại sạch khỏi kết quả. `-views` thì ngược lại: giữ vài
  // ngày đỉnh của video lớn và xoá trắng chuỗi của video nhỏ — đúng nhóm video
  // mà "tăng nhanh" cần nhất.
  reportUrl.searchParams.set('sort', '-day')

  let reportData: YoutubeReportRow
  try {
    const reportResponse = await fetch(reportUrl.toString(), { headers: authHeader(accessToken) })
    if (!reportResponse.ok) {
      console.error(`Không đọc được báo cáo views-theo-ngày của YouTube: HTTP ${reportResponse.status}`)
      return new Map()
    }
    reportData = (await reportResponse.json()) as YoutubeReportRow
  } catch (error) {
    // Lỗi mạng (fetch throw) hoặc JSON hỏng — coi như không lấy được chuỗi
    // views-theo-ngày, để phần trending render rỗng thay vì crash cả trang.
    console.error(
      `Không đọc được báo cáo views-theo-ngày của YouTube: ${error instanceof Error ? error.message : String(error)}`,
    )
    return new Map()
  }

  const rows = reportData.rows ?? []
  const columnIndex = new Map(
    (reportData.columnHeaders ?? []).map((column, index) => [column.name, index]),
  )
  const videoIndex = columnIndex.get('video')
  const dayIndex = columnIndex.get('day')
  const viewsIndex = columnIndex.get('views')
  if (videoIndex === undefined || dayIndex === undefined || viewsIndex === undefined) {
    return new Map()
  }

  const byVideo = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const videoId = String(row[videoIndex])
    const day = String(row[dayIndex])
    const views = Number(row[viewsIndex] ?? 0)
    const days = byVideo.get(videoId) ?? new Map<string, number>()
    days.set(day, views)
    byVideo.set(videoId, days)
  }
  return byVideo
}

const TRENDING_WINDOW_KEYS = ['week', 'month', 'year'] as const

/**
 * "Top mọi thời gian" và "tăng nhanh" (tuần/tháng/năm) cho YouTube — gọi
 * thẳng YouTube Analytics API (2 lượt gọi report tổng cộng), không lưu
 * snapshot riêng (khác TikTok, xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 * % tăng trưởng = views trong cửa sổ / views cộng dồn TRƯỚC cửa sổ đó
 * (`allTime.views - growthDelta`) — cùng công thức TikTok dùng trên
 * snapshot cộng dồn, chỉ khác cách lấy dữ liệu nguồn.
 */
export const getYoutubeVideoTrending = async (
  accessToken: string,
  channelId: string,
): Promise<VideoTrendingResult> => {
  const [allTime, dailyViews] = await Promise.all([
    fetchYoutubeAllTimeMetrics(accessToken, channelId),
    fetchYoutubeDailyViews(accessToken, channelId),
  ])

  const topAllTime = [...allTime.values()].sort((a, b) => b.views - a.views).slice(0, MAX_TOP_ALL_TIME)

  // Ngày sớm/muộn nhất THỰC SỰ có trong chuỗi views-theo-ngày — không suy từ
  // độ dài cửa sổ đã yêu cầu (366 ngày), vì kênh có thể trẻ hơn, report có
  // thể bị cắt bớt ngày cũ do vượt `maxResults`, hoặc fetch đã lỗi (Map
  // rỗng). `latestSnapshotAt` thường trễ vài ngày so với hôm nay — YouTube
  // Analytics có độ trễ báo cáo, không phải lỗi. `null` cả hai khi rỗng.
  let earliestSnapshotAt: string | null = null
  let latestSnapshotAt: string | null = null
  for (const days of dailyViews.values()) {
    for (const date of days.keys()) {
      if (earliestSnapshotAt === null || date < earliestSnapshotAt) earliestSnapshotAt = date
      if (latestSnapshotAt === null || date > latestSnapshotAt) latestSnapshotAt = date
    }
  }

  // Tính MỘT LẦN MỖI REQUEST (không phải hằng số module) — tiến trình server
  // sống lâu, hằng số module sẽ đóng băng ngày "hôm nay" ở lần import đầu
  // tiên và sai dần cho mọi request sau đó.
  const recentDates = Array.from({ length: 365 }, (_, i) => daysAgo(i))
  const sumRecentViews = (days: ReadonlyMap<string, number>, windowDays: number): number => {
    let total = 0
    for (let i = 0; i < windowDays; i += 1) total += days.get(recentDates[i]!) ?? 0
    return total
  }

  const trendingFast = { week: [] as VideoGrowthSummary[], month: [] as VideoGrowthSummary[], year: [] as VideoGrowthSummary[] }
  for (const [videoId, days] of dailyViews) {
    const meta = allTime.get(videoId)
    if (!meta) continue

    for (const windowKey of TRENDING_WINDOW_KEYS) {
      const growthDelta = sumRecentViews(days, TRENDING_WINDOW_DAYS[windowKey])
      const startViews = meta.views - growthDelta
      if (startViews < MIN_TRENDING_VIEWS) continue

      trendingFast[windowKey].push({ ...meta, growthDelta, growthPct: growthDelta / startViews })
    }
  }
  for (const windowKey of TRENDING_WINDOW_KEYS) {
    trendingFast[windowKey].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
  }

  return { topAllTime, trendingFast, earliestSnapshotAt, latestSnapshotAt }
}
