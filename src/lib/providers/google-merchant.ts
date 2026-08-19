import 'server-only'

/**
 * Google Merchant Center — Content API for Shopping v2.1.
 *
 * KHÁC hẳn GA4/GSC: giá trị của Merchant Center không phải một chỉ số chuỗi
 * thời gian (sessions, clicks…) mà là TRẠNG THÁI của một danh mục sản phẩm —
 * sản phẩm nào đang hiển thị trên Google, sản phẩm nào bị từ chối và VÌ SAO.
 * Nên file này phục vụ HAI việc khác nhau:
 *   1. Đếm nhanh (approved/disapproved/pending) — cho `metrics_daily.extra`,
 *      vẽ xu hướng số lượng theo ngày (adapter ở `google-merchant-metrics.ts`).
 *   2. Liệt kê CHI TIẾT từng sản phẩm kèm lý do bị từ chối — cho trang chi
 *      tiết kênh, đọc trực tiếp mỗi lần tải trang (không lưu, giống
 *      `google-explore.ts`) vì danh mục có thể đổi liên tục và rất lớn.
 *
 * Content API không có endpoint "đếm" — phải phân trang qua TOÀN BỘ
 * `productstatuses.list` để đếm chính xác. Với danh mục rất lớn (nhiều nghìn
 * SKU), việc này tốn thời gian — giới hạn số trang đọc (`maxPages`) và BÁO RÕ
 * khi bị cắt bớt (`truncated: true`) thay vì âm thầm hiện một con số thiếu.
 *
 * CHƯA ai chạy thử được với một tài khoản Merchant Center thật — hình dạng
 * response dưới đây bám theo tài liệu Content API v2.1 chính thức của Google,
 * nhưng cần verify khi có token thật, giống `google-ads.ts` trước đây.
 */

const API_VERSION = 'v2.1'
const PAGE_SIZE = 250

export type ProductApprovalStatus = 'approved' | 'disapproved' | 'pending'

export interface ProductIssue {
  readonly code: string
  readonly description: string
  readonly detail: string
  readonly resolution: string
}

export interface MerchantProductStatus {
  readonly productId: string
  readonly title: string
  readonly link: string | null
  readonly status: ProductApprovalStatus
  readonly issues: readonly ProductIssue[]
}

export interface MerchantProductCounts {
  readonly total: number
  readonly approved: number
  readonly disapproved: number
  readonly pending: number
  /** true nếu danh mục lớn hơn `maxPages × 250` sản phẩm — con số trên là
   * MỘT PHẦN, không phải toàn bộ. Không bao giờ âm thầm hiện thiếu. */
  readonly truncated: boolean
}

interface ContentApiIssue {
  readonly code?: string
  readonly description?: string
  readonly detail?: string
  readonly resolution?: string
  readonly servability?: string
}

interface ContentApiDestinationStatus {
  readonly destination?: string
  readonly approvedCountries?: readonly string[]
  readonly disapprovedCountries?: readonly string[]
  readonly pendingCountries?: readonly string[]
}

interface ContentApiProductStatus {
  readonly productId?: string
  readonly title?: string
  readonly link?: string
  readonly destinationStatuses?: readonly ContentApiDestinationStatus[]
  readonly itemLevelIssues?: readonly ContentApiIssue[]
}

interface ContentApiProductStatusesResponse {
  readonly resources?: readonly ContentApiProductStatus[]
  readonly nextPageToken?: string
}

/** Một issue với `servability: 'disapproved'` là đủ để cả sản phẩm bị coi là
 * từ chối — Google từ chối hiển thị sản phẩm nếu BẤT KỲ vấn đề nào ở mức đó,
 * kể cả khi các destination khác vẫn "approved". */
const classifyStatus = (row: ContentApiProductStatus): ProductApprovalStatus => {
  const hasDisapprovedIssue = (row.itemLevelIssues ?? []).some(
    (issue) => issue.servability === 'disapproved',
  )
  if (hasDisapprovedIssue) return 'disapproved'

  const hasApprovedDestination = (row.destinationStatuses ?? []).some(
    (destination) => (destination.approvedCountries?.length ?? 0) > 0,
  )
  if (hasApprovedDestination) return 'approved'

  return 'pending'
}

const toIssues = (row: ContentApiProductStatus): readonly ProductIssue[] =>
  (row.itemLevelIssues ?? [])
    .filter((issue) => issue.servability === 'disapproved')
    .map((issue) => ({
      code: issue.code ?? 'unknown',
      description: issue.description ?? 'Không rõ nguyên nhân — xem chi tiết trong Merchant Center.',
      detail: issue.detail ?? '',
      resolution: issue.resolution ?? '',
    }))

const fetchProductStatusPage = async (
  accessToken: string,
  merchantId: string,
  pageToken: string | undefined,
): Promise<ContentApiProductStatusesResponse | null> => {
  const url = new URL(
    `https://shoppingcontent.googleapis.com/content/${API_VERSION}/${merchantId}/productstatuses`,
  )
  url.searchParams.set('maxResults', String(PAGE_SIZE))
  if (pageToken) url.searchParams.set('pageToken', pageToken)

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null

  return (await response.json()) as ContentApiProductStatusesResponse
}

/** Phân trang qua `productstatuses.list`, dừng ở `maxPages` để không treo
 * trang chờ một danh mục hàng chục nghìn SKU. */
const fetchAllProductStatuses = async (
  accessToken: string,
  merchantId: string,
  maxPages: number,
): Promise<{ readonly rows: readonly ContentApiProductStatus[]; readonly truncated: boolean }> => {
  const rows: ContentApiProductStatus[] = []
  let pageToken: string | undefined
  let pages = 0

  do {
    const page = await fetchProductStatusPage(accessToken, merchantId, pageToken)
    if (!page) break
    rows.push(...(page.resources ?? []))
    pageToken = page.nextPageToken
    pages += 1
  } while (pageToken && pages < maxPages)

  return { rows, truncated: Boolean(pageToken) }
}

/** Đếm nhanh — dùng cho snapshot hằng ngày (`google-merchant-metrics.ts`).
 * Trần cao hơn (`maxPages=20` ≈ 5.000 sản phẩm) vì chạy nền qua cron, không
 * chặn ai chờ trang tải. */
export const countMerchantCenterProducts = async (
  accessToken: string,
  merchantId: string,
): Promise<MerchantProductCounts> => {
  const { rows, truncated } = await fetchAllProductStatuses(accessToken, merchantId, 20)

  let approved = 0
  let disapproved = 0
  let pending = 0
  for (const row of rows) {
    const status = classifyStatus(row)
    if (status === 'approved') approved += 1
    else if (status === 'disapproved') disapproved += 1
    else pending += 1
  }

  return { total: rows.length, approved, disapproved, pending, truncated }
}

/** Danh sách chi tiết — dùng cho trang chi tiết kênh, tải đồng bộ theo
 * request nên trần thấp hơn (`maxPages=3` ≈ 750 sản phẩm). */
export const fetchMerchantCenterProducts = async (
  accessToken: string,
  merchantId: string,
  filter?: ProductApprovalStatus,
): Promise<{ readonly products: readonly MerchantProductStatus[]; readonly truncated: boolean }> => {
  const { rows, truncated } = await fetchAllProductStatuses(accessToken, merchantId, 3)

  const products = rows
    .filter((row) => Boolean(row.productId))
    .map(
      (row): MerchantProductStatus => ({
        productId: row.productId as string,
        title: row.title ?? row.productId ?? '—',
        link: row.link ?? null,
        status: classifyStatus(row),
        issues: toIssues(row),
      }),
    )
    .filter((product) => !filter || product.status === filter)

  return { products, truncated }
}

// ─── Reports API (hiệu suất thật, khác trạng thái duyệt ở trên) ────────────

export interface MerchantProductPerformance {
  readonly productId: string
  readonly title: string
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly conversions: number
}

export interface MerchantPerformanceOutcome {
  readonly rows: readonly MerchantProductPerformance[]
  readonly truncated: boolean
  readonly error: string | null
}

interface ReportsSearchRow {
  readonly productView?: { readonly id?: string; readonly title?: string }
  readonly metrics?: { readonly clicks?: string; readonly impressions?: string; readonly conversions?: string }
}

interface ReportsSearchResponse {
  readonly results?: readonly ReportsSearchRow[]
  readonly nextPageToken?: string
}

const REPORTS_PAGE_SIZE = 500

/** `reports.search` (MCQL) — số liệu HIỆU SUẤT thật (clicks/impressions/
 * ctr/conversions theo từng sản phẩm), khác hẳn `productstatuses.list` ở
 * trên vốn chỉ là trạng thái duyệt. Đây là mảnh còn thiếu để Merchant Center
 * có số liệu tương đương GA4/GSC (cả hai đều là "hiệu suất", không chỉ
 * "trạng thái").
 *
 * CHƯA ai chạy thử với tài khoản Merchant Center thật có bật Reporting —
 * cú pháp MCQL bám theo tài liệu Content API v2.1 chính thức
 * (`ProductPerformanceView`), cần verify khi có token thật. Một tài khoản
 * nhỏ/mới có thể trả về rỗng vì chưa đủ khối lượng dữ liệu Google yêu cầu
 * cho báo cáo — không phải lỗi của lượt gọi này, khác với lỗi HTTP thật.
 * `PriceCompetitivenessProductView`/`BestSellersProductClusterView` là hai
 * view khác đáng thêm sau — không đưa vào lần này để tránh mở rộng phạm vi
 * quá xa cho một bản chưa verify được với dữ liệu thật. */
export const fetchMerchantPerformanceReport = async (
  accessToken: string,
  merchantId: string,
  range: { readonly startDate: string; readonly endDate: string },
  maxPages = 3,
): Promise<MerchantPerformanceOutcome> => {
  const query =
    'SELECT product_view.id, product_view.title, metrics.clicks, metrics.impressions, metrics.conversions ' +
    'FROM ProductPerformanceView ' +
    `WHERE segments.date BETWEEN '${range.startDate}' AND '${range.endDate}' ` +
    'ORDER BY metrics.clicks DESC'

  const rows: MerchantProductPerformance[] = []
  let pageToken: string | undefined
  let pages = 0
  let error: string | null = null

  do {
    const response = await fetch(
      `https://shoppingcontent.googleapis.com/content/${API_VERSION}/${merchantId}/reports/search`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query, pageSize: REPORTS_PAGE_SIZE, pageToken }),
      },
    )
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      error = `HTTP ${response.status} ${response.statusText}: ${bodyText.slice(0, 300)}`
      console.error(`Merchant Center reports.search lỗi (${merchantId}): ${error}`)
      break
    }

    let data: ReportsSearchResponse
    try {
      data = (await response.json()) as ReportsSearchResponse
    } catch (parseError) {
      error = `Merchant Center reports.search trả 200 nhưng JSON không đọc được: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      console.error(error)
      break
    }

    for (const row of data.results ?? []) {
      const id = row.productView?.id
      if (!id) continue
      const clicks = Number(row.metrics?.clicks ?? 0)
      const impressions = Number(row.metrics?.impressions ?? 0)
      rows.push({
        productId: id,
        title: row.productView?.title ?? id,
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        conversions: Number(row.metrics?.conversions ?? 0),
      })
    }
    pageToken = data.nextPageToken
    pages += 1
  } while (pageToken && pages < maxPages)

  return { rows, truncated: Boolean(pageToken), error }
}
