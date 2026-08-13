import 'server-only'

/**
 * Số liệu cho trang Khám phá — LẤY TRỰC TIẾP từ API mỗi lần tải trang, KHÔNG
 * lưu vào `metrics_daily`. Khác bản chất với `google-metrics.ts`: đó là tổng
 * theo ngày dùng để vẽ xu hướng lâu dài, còn đây là truy vấn dạng phân rã
 * (top trang, top truy vấn…) — dữ liệu thăm dò tại chỗ, lưu lại chỉ tốn chỗ
 * mà không ai dùng lại.
 */

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

const runGa4Report = async (
  accessToken: string,
  property: string,
  params: { readonly startDate: string; readonly endDate: string },
  dimension: string,
  metric: string,
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
        limit: 10,
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

export const fetchGa4Explore = async (
  accessToken: string,
  property: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<Ga4Explore> => {
  const [pages, channels, devices] = await Promise.all([
    runGa4Report(accessToken, property, range, 'pagePath', 'screenPageViews'),
    runGa4Report(accessToken, property, range, 'sessionDefaultChannelGroup', 'sessions'),
    runGa4Report(accessToken, property, range, 'deviceCategory', 'sessions'),
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
        rowLimit: 10,
      }),
    },
  )
  if (!response.ok) return []

  const data = (await response.json()) as { rows?: readonly GscQueryRow[] }
  return data.rows ?? []
}

export const fetchGscExplore = async (
  accessToken: string,
  siteUrl: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<GscExplore> => {
  const [queries, pages, countries, devices] = await Promise.all([
    runGscQuery(accessToken, siteUrl, range, 'query'),
    runGscQuery(accessToken, siteUrl, range, 'page'),
    runGscQuery(accessToken, siteUrl, range, 'country'),
    runGscQuery(accessToken, siteUrl, range, 'device'),
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
  readonly topVideos: readonly { readonly title: string; readonly views: number }[]
}

export const fetchYoutubeExplore = async (
  accessToken: string,
  channelId: string,
  range: { readonly startDate: string; readonly endDate: string },
): Promise<YoutubeExplore> => {
  const reportUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  reportUrl.searchParams.set('ids', `channel==${channelId}`)
  reportUrl.searchParams.set('startDate', range.startDate)
  reportUrl.searchParams.set('endDate', range.endDate)
  reportUrl.searchParams.set('dimensions', 'video')
  reportUrl.searchParams.set('metrics', 'views')
  reportUrl.searchParams.set('sort', '-views')
  reportUrl.searchParams.set('maxResults', '10')

  const reportResponse = await fetch(reportUrl.toString(), { headers: authHeader(accessToken) })
  if (!reportResponse.ok) return { topVideos: [] }

  const reportData = (await reportResponse.json()) as {
    readonly rows?: readonly (readonly (string | number)[])[]
  }
  const rows = reportData.rows ?? []
  if (rows.length === 0) return { topVideos: [] }

  const videoIds = rows.map((row) => String(row[0]))
  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}`,
    { headers: authHeader(accessToken) },
  )
  const titleById = new Map<string, string>()
  if (videosResponse.ok) {
    const videosData = (await videosResponse.json()) as {
      readonly items?: readonly {
        readonly id?: string
        readonly snippet?: { readonly title?: string }
      }[]
    }
    for (const item of videosData.items ?? []) {
      if (item.id) titleById.set(item.id, item.snippet?.title ?? item.id)
    }
  }

  return {
    topVideos: rows.map((row) => {
      const id = String(row[0])
      return { title: titleById.get(id) ?? id, views: Number(row[1] ?? 0) }
    }),
  }
}
