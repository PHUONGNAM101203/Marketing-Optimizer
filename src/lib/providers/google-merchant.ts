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
