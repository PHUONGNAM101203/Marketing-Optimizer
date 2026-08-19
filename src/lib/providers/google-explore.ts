import 'server-only'

/**
 * Số liệu cho trang Khám phá — LẤY TRỰC TIẾP từ API mỗi lần tải trang, KHÔNG
 * lưu vào `metrics_daily`. Khác bản chất với `google-metrics.ts`: đó là tổng
 * theo ngày dùng để vẽ xu hướng lâu dài, còn đây là truy vấn dạng phân rã
 * (top trang, top truy vấn…) — dữ liệu thăm dò tại chỗ, lưu lại chỉ tốn chỗ
 * mà không ai dùng lại.
 */

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
  const [pages, channels, devices] = await Promise.all([
    runGa4Report(accessToken, property, range, 'pagePath', 'screenPageViews', limit),
    runGa4Report(accessToken, property, range, 'sessionDefaultChannelGroup', 'sessions', limit),
    runGa4Report(accessToken, property, range, 'deviceCategory', 'sessions', limit),
  ])

  return {
    topPages: pages.map((row) => ({ path: row.label, views: row.value })),
    channels: channels.map((row) => ({ channel: row.label, sessions: row.value })),
    devices: devices.map((row) => ({ device: row.label, sessions: row.value })),
  }
}

// ─── Search Console ─────────────────────────────────────────────────────────

export interface GscExplore {
  readonly topQueries: readonly {
    readonly query: string
    readonly clicks: number
    readonly impressions: number
    readonly ctr: number
    readonly position: number
  }[]
  readonly topPages: readonly {
    readonly page: string
    readonly clicks: number
    readonly impressions: number
    readonly ctr: number
  }[]
  readonly countries: readonly { readonly country: string; readonly clicks: number }[]
  readonly devices: readonly { readonly device: string; readonly clicks: number }[]
}

interface GscQueryRow {
  readonly keys?: readonly string[]
  readonly clicks?: number
  readonly impressions?: number
  readonly position?: number
}

const runGscQuery = async (
  accessToken: string,
  siteUrl: string,
  params: { readonly startDate: string; readonly endDate: string },
  dimension: string,
  rowLimit: number,
): Promise<readonly GscQueryRow[]> => {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { ...authHeader(accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: [dimension],
        rowLimit,
      }),
    },
  )
  if (!response.ok) return []

  const data = (await response.json()) as { rows?: readonly GscQueryRow[] }
  return data.rows ?? []
}

/** `rowLimit` — Search Console API cho `rowLimit` tới 25.000, thoải mái
 * chuyển thẳng lựa chọn 10-1000 của trang Khám phá. Mặc định
 * `DEFAULT_CHANNEL_DETAIL_ROW_LIMIT` cho trang chi tiết kênh. */
export const fetchGscExplore = async (
  accessToken: string,
  siteUrl: string,
  range: { readonly startDate: string; readonly endDate: string },
  rowLimit: number = DEFAULT_CHANNEL_DETAIL_ROW_LIMIT,
): Promise<GscExplore> => {
  const [queries, pages, countries, devices] = await Promise.all([
    runGscQuery(accessToken, siteUrl, range, 'query', rowLimit),
    runGscQuery(accessToken, siteUrl, range, 'page', rowLimit),
    runGscQuery(accessToken, siteUrl, range, 'country', rowLimit),
    runGscQuery(accessToken, siteUrl, range, 'device', rowLimit),
  ])

  return {
    topQueries: queries
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({
        query: row.keys?.[0] as string,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: (row.impressions ?? 0) > 0 ? (row.clicks ?? 0) / (row.impressions as number) : 0,
        position: row.position ?? 0,
      })),
    topPages: pages
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({
        page: row.keys?.[0] as string,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: (row.impressions ?? 0) > 0 ? (row.clicks ?? 0) / (row.impressions as number) : 0,
      })),
    countries: countries
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ country: row.keys?.[0] as string, clicks: row.clicks ?? 0 })),
    devices: devices
      .filter((row) => Boolean(row.keys?.[0]))
      .map((row) => ({ device: row.keys?.[0] as string, clicks: row.clicks ?? 0 })),
  }
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
