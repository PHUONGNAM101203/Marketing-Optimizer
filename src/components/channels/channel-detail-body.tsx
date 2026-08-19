import Link from 'next/link'
import { AlertTriangle, Eye, Heart, Info, MessageCircle, Settings2, Share2 } from 'lucide-react'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { TrendChart, type TrendPoint } from '@/components/charts/trend-chart-lazy'
import { Pagination } from '@/components/ui/pagination'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import type { ChannelDailyPoint } from '@/lib/data/site-channels'
import type { ProductApprovalStatus } from '@/lib/providers/google-merchant'
import { DATE_RANGE_LABELS, type DateRangePreset } from '@/lib/domain/site'
import type { ProviderId } from '@/lib/domain/providers'
import { formatCompact, formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/format'
import { microsToUnits } from '@/lib/metrics/types'
import { UrlTabs } from '@/components/ui/tabs'
import { Ga4OverviewPanel } from '@/components/channels/ga4/ga4-overview-panel'
import { TiktokVideoGrid } from '@/components/channels/tiktok/tiktok-video-grid'
import { TiktokDashboard } from '@/components/channels/tiktok/tiktok-dashboard'
import { YoutubeDashboard } from '@/components/channels/youtube/youtube-dashboard'
import { MetaPostList, type MetaPostItem } from '@/components/channels/meta/meta-post-list'
import { MetaDashboard, type MetaPostStats } from '@/components/channels/meta/meta-dashboard'
import { buildMetaPostMetrics } from '@/components/channels/meta/meta-post-metrics'

/**
 * Thân trang chi tiết kênh — MỖI nền tảng một hình dạng khác hẳn, cố tình
 * không gộp chung một bảng "universal": GA4 có trang/nguồn/thiết bị, Search
 * Console có truy vấn/vị trí, GTM có tag/trigger/variable (không có số liệu
 * theo thời gian nào cả), YouTube có video. Ép chúng vào cùng một khuôn cột
 * là đúng lỗi Kênh cũ mắc phải.
 *
 * Mỗi biểu đồ xu hướng chỉ MỘT chỉ số — hai chỉ số khác thang (vd. sessions
 * và chi phí) chung một trục là lỗi biểu đồ kinh điển, giữ kỷ luật đó kể cả
 * khi hai chỉ số cùng là "lượt đếm" như sessions/conversions.
 */
export function ChannelDetailBody({
  detail,
  dailySeries,
  preset,
  currency,
  siteId,
  startDate,
  endDate,
  provider,
  rangeParam,
  fromParam,
  toParam,
  productFilter,
  page,
}: {
  readonly detail: ChannelDetail
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly preset: DateRangePreset
  readonly currency: string
  /** `siteId` dùng cho cả Merchant Center (dựng link filter trạng thái/phân
   * trang) lẫn GA4 (drill-down chỉ số ở `Ga4OverviewPanel`, gọi thẳng một
   * Server Action tự kiểm quyền theo `siteId`). `startDate`/`endDate` (ISO,
   * khớp `range.start`/`range.end` ở trang cha) chỉ GA4 dùng — truyền
   * nguyên khoảng ngày đang chọn cho lượt gọi drill-down thay vì suy lại từ
   * `preset`. */
  readonly siteId?: string
  readonly startDate?: string
  readonly endDate?: string
  readonly provider?: ProviderId
  readonly rangeParam?: string
  /** Chỉ có giá trị khi `rangeParam === 'custom'` — xem `parseCustomRangeParams`. */
  readonly fromParam?: string
  readonly toParam?: string
  readonly productFilter?: ProductApprovalStatus
  readonly page?: number
}) {
  switch (detail.kind) {
    case 'ga4': {
      const breakdown = (
        <div className="flex flex-col gap-6">
          {preset === 'today' ? <ProcessingDelayNote days="24–48 giờ" /> : null}
          <TrendCard
            title="Sessions theo ngày"
            data={dailySeries.map((point) => ({ date: point.date, sessions: point.sessions }))}
            metricKey="sessions"
            label="Sessions"
          />
          <BreakdownSection
            label="Trang"
            title="Trang được xem nhiều nhất"
            rows={detail.data.topPages.map((row) => ({
              dimension: row.path,
              cells: [formatCompact(row.views)],
            }))}
            columns={['Lượt xem']}
          />
          <BreakdownSection
            label="Nguồn"
            title="Traffic theo kênh"
            rows={detail.data.channels.map((row) => ({
              dimension: row.channel,
              cells: [formatCompact(row.sessions)],
            }))}
            columns={['Sessions']}
          />
          <BreakdownSection
            label="Thiết bị"
            title="Traffic theo thiết bị"
            rows={detail.data.devices.map((row) => ({
              dimension: row.device,
              cells: [formatCompact(row.sessions)],
            }))}
            columns={['Sessions']}
          />
        </div>
      )

      // Luôn hiện cả hai tab — kể cả khi lượt gọi tổng lỗi (`overview` null),
      // tab "Chi tiết" tự hiện lý do lỗi thật thay vì biến mất lặng lẽ (xem
      // `Ga4OverviewPanel`). Ẩn hẳn tab từng khiến lỗi 400 của riêng lượt gọi
      // tổng không ai biết đã xảy ra.
      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            { id: 'overview', label: 'Tổng quan', panel: breakdown },
            {
              id: 'detail',
              label: 'Chi tiết',
              panel: (
                <Ga4OverviewPanel
                  overview={detail.overview}
                  error={detail.overviewError}
                  currency={currency}
                  connectionId={detail.connectionId}
                  siteId={siteId ?? ''}
                  startDate={startDate ?? ''}
                  endDate={endDate ?? ''}
                />
              ),
            },
          ]}
        />
      )
    }

    case 'gsc':
      return (
        <div className="flex flex-col gap-6">
          {preset === 'today' ? <ProcessingDelayNote days="2–3 ngày" /> : null}
          <TrendCard
            title="Lượt nhấp tự nhiên theo ngày"
            data={dailySeries.map((point) => ({ date: point.date, clicks: point.clicks }))}
            metricKey="clicks"
            label="Lượt nhấp"
          />
          <BreakdownSection
            label="Truy vấn"
            title="Truy vấn tìm kiếm hàng đầu"
            rows={detail.data.topQueries.map((row) => ({
              dimension: row.query,
              cells: [
                formatCompact(row.clicks),
                formatCompact(row.impressions),
                formatPercent(row.ctr, 2),
                row.position.toFixed(1),
              ],
            }))}
            columns={['Lượt nhấp', 'Hiển thị', 'CTR', 'Vị trí TB']}
          />
          <BreakdownSection
            label="Trang"
            title="Trang được tìm thấy nhiều nhất"
            rows={detail.data.topPages.map((row) => ({
              dimension: row.page,
              cells: [
                formatCompact(row.clicks),
                formatCompact(row.impressions),
                formatPercent(row.ctr, 2),
              ],
            }))}
            columns={['Lượt nhấp', 'Hiển thị', 'CTR']}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <BreakdownSection
              label="Quốc gia"
              title="Theo quốc gia"
              rows={detail.data.countries.map((row) => ({
                dimension: row.country,
                cells: [formatCompact(row.clicks)],
              }))}
              columns={['Lượt nhấp']}
            />
            <BreakdownSection
              label="Thiết bị"
              title="Theo thiết bị"
              rows={detail.data.devices.map((row) => ({
                dimension: row.device,
                cells: [formatCompact(row.clicks)],
              }))}
              columns={['Lượt nhấp']}
            />
          </div>
        </div>
      )

    case 'youtube':
      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <VideoCardGrid
                  label="Video"
                  title="Video xem nhiều nhất"
                  emptyDescription="Chưa có video nào trong khoảng ngày này."
                  fetchError={detail.data.fetchError}
                  videos={detail.data.topVideos.map((row) => ({
                    title: row.title,
                    thumbnailUrl: row.thumbnailUrl,
                    views: row.views,
                    likes: row.likes,
                    comments: row.comments,
                    shares: row.shares,
                  }))}
                />
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <div className="flex flex-col gap-6">
                  <TrendCard
                    title="Lượt xem theo ngày"
                    data={dailySeries.map((point) => ({
                      date: point.date,
                      views: point.extra.views ?? 0,
                    }))}
                    metricKey="views"
                    label="Lượt xem"
                  />
                  <YoutubeDashboard
                    topVideosInRange={detail.data.topVideos}
                    trending={detail.trending}
                    rangeLabel={DATE_RANGE_LABELS[preset]}
                  />
                </div>
              ),
            },
          ]}
        />
      )

    case 'merchant-center':
      return (
        <MerchantCenterSection
          detail={detail}
          dailySeries={dailySeries}
          siteId={siteId as string}
          provider={provider as ProviderId}
          rangeParam={rangeParam}
          fromParam={fromParam}
          toParam={toParam}
          productFilter={productFilter}
          page={page ?? 1}
        />
      )

    case 'google-ads':
    case 'meta-ads':
      return (
        <div className="flex flex-col gap-6">
          <TrendCard
            title="Chi phí theo ngày"
            data={dailySeries.map((point) => ({
              date: point.date,
              cost: microsToUnits(point.costMicros),
            }))}
            metricKey="cost"
            label="Chi phí"
            format="currency"
          />
          <BreakdownSection
            label="Chiến dịch"
            title="Chiến dịch theo chi phí"
            rows={detail.data.campaigns.map((row) => ({
              dimension: row.name,
              cells: [
                formatCurrencyCompact(row.costMicros, currency),
                formatCompact(row.clicks),
                formatNumber(row.conversions),
              ],
            }))}
            columns={['Chi phí', 'Lượt nhấp', 'Chuyển đổi']}
          />
        </div>
      )

    case 'instagram': {
      // Instagram không có field chia sẻ cho media (`shares: null` cố định,
      // xem `content-trending-types.ts`) — `buildMetaPostMetrics` tự bỏ mục
      // Chia sẻ khi nhận `null`, không hiện "0" giả.
      const postsInRange: readonly MetaPostStats[] = detail.data.topPosts.map((post) => ({
        title: post.caption,
        thumbnailUrl: post.thumbnailUrl,
        createdAt: post.createdAt,
        permalinkUrl: post.permalinkUrl,
        likes: post.likes,
        comments: post.comments,
        shares: null,
      }))
      const overviewPosts: readonly MetaPostItem[] = postsInRange.map((post) => ({
        title: post.title,
        thumbnailUrl: post.thumbnailUrl,
        createdAt: post.createdAt,
        permalinkUrl: post.permalinkUrl,
        metrics: buildMetaPostMetrics(post.likes, post.comments, post.shares),
      }))

      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <MetaPostList
                  posts={overviewPosts}
                  fetchError={detail.data.fetchError}
                  emptyDescription="Chưa có bài đăng công khai trong khoảng ngày này."
                />
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <div className="flex flex-col gap-6">
                  <TrendCard
                    title="Reach theo ngày"
                    data={dailySeries.map((point) => ({
                      date: point.date,
                      reach: point.extra.reach ?? 0,
                    }))}
                    metricKey="reach"
                    label="Reach"
                  />
                  <MetaDashboard
                    postsInRange={postsInRange}
                    trending={detail.trending}
                    rangeLabel={DATE_RANGE_LABELS[preset]}
                    showShares={postsInRange.some((post) => post.shares !== null)}
                    fetchError={detail.data.fetchError}
                  />
                </div>
              ),
            },
          ]}
        />
      )
    }

    case 'facebook': {
      const postsInRange: readonly MetaPostStats[] = detail.data.topPosts.map((post) => ({
        title: post.message,
        thumbnailUrl: post.thumbnailUrl,
        createdAt: post.createdAt,
        permalinkUrl: post.permalinkUrl,
        likes: post.reactions,
        comments: post.comments,
        shares: post.shares,
      }))
      const overviewPosts: readonly MetaPostItem[] = postsInRange.map((post) => ({
        title: post.title,
        thumbnailUrl: post.thumbnailUrl,
        createdAt: post.createdAt,
        permalinkUrl: post.permalinkUrl,
        metrics: buildMetaPostMetrics(post.likes, post.comments, post.shares),
      }))

      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <MetaPostList
                  posts={overviewPosts}
                  fetchError={detail.data.fetchError}
                  emptyDescription="Chưa có bài đăng công khai trong khoảng ngày này."
                />
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <div className="flex flex-col gap-6">
                  {/* `page_impressions` rồi `page_engaged_users` đều bị Meta
                      khai tử — chỉ còn `page_post_engagements` request được
                      ở cấp Page, xem `facebook-metrics.ts`. */}
                  <TrendCard
                    title="Tương tác bài viết Page theo ngày"
                    data={dailySeries.map((point) => ({
                      date: point.date,
                      postEngagements: point.extra.postEngagements ?? 0,
                    }))}
                    metricKey="postEngagements"
                    label="Tương tác bài viết"
                  />
                  <MetaDashboard
                    postsInRange={postsInRange}
                    trending={detail.trending}
                    rangeLabel={DATE_RANGE_LABELS[preset]}
                    showShares={postsInRange.some((post) => post.shares !== null)}
                    fetchError={detail.data.fetchError}
                  />
                </div>
              ),
            },
          ]}
        />
      )
    }

    case 'tiktok': {
      // Follower-theo-lần-đồng-bộ trước đây nằm ở tab Tổng quan — bỏ theo
      // yêu cầu người dùng (8/2026): follower đã có sẵn ở header, và tab
      // Tổng quan giờ chỉ tập trung việc duyệt video, không lặp lại số liệu.
      return (
        <UrlTabs
          ariaLabel="Chế độ xem"
          tabs={[
            {
              id: 'overview',
              label: 'Tổng quan',
              panel: (
                <div className="flex flex-col gap-6">
                  <TiktokVideoGrid videos={detail.data.topVideos} fetchError={detail.data.fetchError} />
                </div>
              ),
            },
            {
              id: 'dashboard',
              label: 'Dashboard',
              panel: (
                <TiktokDashboard
                  rangeStats={detail.rangeStats}
                  trending={detail.trending}
                  rangeLabel={DATE_RANGE_LABELS[preset]}
                />
              ),
            },
          ]}
        />
      )
    }

    case 'gtm':
      return (
        <div className="flex flex-col gap-6">
          <Card className="flex items-center gap-3 p-5">
            <Settings2 aria-hidden className="size-5 shrink-0 text-[var(--color-ink-3)]" />
            <div>
              <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                {detail.data.workspaceName ?? 'Workspace mặc định'}
              </p>
              <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                Tag Manager không đo lưu lượng — đây là cấu hình đang publish, không phải số liệu
                theo thời gian.
              </p>
            </div>
          </Card>
          <EntityListSection title="Tags" entities={detail.data.tags} />
          <EntityListSection title="Triggers" entities={detail.data.triggers} />
          <EntityListSection title="Variables" entities={detail.data.variables} />
        </div>
      )

    case 'unsupported':
      return (
        <EmptyState
          title="Chưa xem được chi tiết"
          description="Kết nối tồn tại nhưng token không dùng được — thử bấm Làm mới ở trang Kết nối."
        />
      )
  }
}

const PRODUCT_STATUS_LABELS: Readonly<Record<ProductApprovalStatus, string>> = {
  approved: 'Đã duyệt',
  disapproved: 'Bị từ chối',
  pending: 'Đang chờ duyệt',
}

const PRODUCT_STATUS_TONE: Readonly<
  Record<ProductApprovalStatus, 'positive' | 'negative' | 'caution'>
> = {
  approved: 'positive',
  disapproved: 'negative',
  pending: 'caution',
}

/**
 * Merchant Center khác mọi kênh khác trong file này: giá trị của nó không
 * phải một con số theo thời gian mà là TRẠNG THÁI DUYỆT của từng sản phẩm.
 * Bố cục: snapshot mới nhất (từ `metrics_daily.extra`, không phải cộng dồn —
 * cộng dồn nhiều ngày snapshot lại là cộng sai) → xu hướng số lượng theo
 * ngày → bộ lọc trạng thái → bảng sản phẩm kèm lý do bị từ chối chi tiết.
 */
const PRODUCTS_PER_PAGE = 50

function MerchantCenterSection({
  detail,
  dailySeries,
  siteId,
  provider,
  rangeParam,
  fromParam,
  toParam,
  productFilter,
  page,
}: {
  readonly detail: Extract<ChannelDetail, { readonly kind: 'merchant-center' }>
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly siteId: string
  readonly provider: ProviderId
  readonly rangeParam?: string
  readonly fromParam?: string
  readonly toParam?: string
  readonly productFilter?: ProductApprovalStatus
  readonly page: number
}) {
  const latest = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null
  const latestExtra = latest?.extra ?? {}
  const isApproximate = (latestExtra.countIsApproximate ?? 0) > 0

  // Đổi bộ lọc trạng thái thì luôn quay về trang 1 — tập kết quả đã đổi,
  // giữ nguyên số trang cũ dễ nhảy ra ngoài phạm vi.
  const filterHref = (status: ProductApprovalStatus | null) => {
    const params = new URLSearchParams()
    if (rangeParam) params.set('range', rangeParam)
    if (rangeParam === 'custom' && fromParam) params.set('from', fromParam)
    if (rangeParam === 'custom' && toParam) params.set('to', toParam)
    if (status) params.set('status', status)
    const query = params.toString()
    return `/${siteId}/channels/${provider}${query ? `?${query}` : ''}`
  }

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams()
    if (rangeParam) params.set('range', rangeParam)
    if (rangeParam === 'custom' && fromParam) params.set('from', fromParam)
    if (rangeParam === 'custom' && toParam) params.set('to', toParam)
    if (productFilter) params.set('status', productFilter)
    if (targetPage > 1) params.set('page', String(targetPage))
    const query = params.toString()
    return `/${siteId}/channels/${provider}${query ? `?${query}` : ''}`
  }

  const totalProducts = detail.data.products.length
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const pageProducts = detail.data.products.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  )

  return (
    <div className="flex flex-col gap-6">
      {isApproximate ? (
        <Callout
          tone="caution"
          icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-caution)]" />}
          title="Danh mục lớn hơn số đọc được mỗi lần đồng bộ"
        >
          <p>
            Số liệu dưới đây tính trên một phần danh mục (giới hạn để đồng bộ không quá
            lâu) — số thật có thể cao hơn.
          </p>
        </Callout>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MerchantStat label="Tổng sản phẩm" value={latestExtra.totalProducts ?? 0} />
        <MerchantStat
          label="Đã duyệt"
          value={latestExtra.approvedProducts ?? 0}
          tone="positive"
        />
        <MerchantStat
          label="Bị từ chối"
          value={latestExtra.disapprovedProducts ?? 0}
          tone="negative"
        />
        <MerchantStat label="Đang chờ duyệt" value={latestExtra.pendingProducts ?? 0} tone="caution" />
      </div>

      {dailySeries.length > 0 ? (
        <Card>
          <CardHeader
            title="Số lượng sản phẩm theo ngày"
            description="Mỗi điểm là một lần đồng bộ — Merchant Center không có báo cáo lịch sử, nên xu hướng chỉ dựng được từ ngày bắt đầu kết nối."
          />
          <CardBody>
            <TrendChart
              data={dailySeries.map((point) => ({
                date: point.date,
                approved: point.extra.approvedProducts ?? 0,
                disapproved: point.extra.disapprovedProducts ?? 0,
                pending: point.extra.pendingProducts ?? 0,
              }))}
              series={[
                { key: 'approved', label: 'Đã duyệt', colorToken: '--color-positive', kind: 'line' },
                {
                  key: 'disapproved',
                  label: 'Bị từ chối',
                  colorToken: '--color-negative',
                  kind: 'line',
                },
                { key: 'pending', label: 'Đang chờ duyệt', colorToken: '--color-caution', kind: 'line' },
              ]}
              format="number"
            />
          </CardBody>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead
            label="Sản phẩm"
            title="Danh mục sản phẩm"
            description="Sản phẩm bị từ chối luôn kèm lý do chi tiết — mở ra để xem chính xác cần sửa gì."
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant={!productFilter ? 'primary' : 'secondary'} size="sm">
              <Link href={filterHref(null)}>Tất cả</Link>
            </Button>
            {(['approved', 'disapproved', 'pending'] as const).map((status) => (
              <Button
                key={status}
                asChild
                variant={productFilter === status ? 'primary' : 'secondary'}
                size="sm"
              >
                <Link href={filterHref(status)}>{PRODUCT_STATUS_LABELS[status]}</Link>
              </Button>
            ))}
          </div>
        </div>

        {detail.data.truncated ? (
          <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            Đang hiện một phần danh mục — thu hẹp bộ lọc để dễ tìm đúng sản phẩm hơn.
          </p>
        ) : null}

        <Card className="overflow-hidden">
          {totalProducts === 0 ? (
            <EmptyState
              title="Không có sản phẩm nào"
              description="Chưa có sản phẩm nào khớp bộ lọc đang chọn."
            />
          ) : (
            <TableScroller aria-label="Danh mục sản phẩm">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Sản phẩm</TH>
                    <TH>Trạng thái</TH>
                    <TH>Lý do (nếu bị từ chối)</TH>
                  </TR>
                </THead>
                <TBody>
                  {pageProducts.map((product) => (
                    <TR key={product.productId}>
                      <TD className="max-w-[20rem]">
                        {product.link ? (
                          <a
                            href={product.link}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-[var(--color-signal)] hover:underline"
                            title={product.title}
                          >
                            {product.title}
                          </a>
                        ) : (
                          <span className="block truncate" title={product.title}>
                            {product.title}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={PRODUCT_STATUS_TONE[product.status]}>
                          {PRODUCT_STATUS_LABELS[product.status]}
                        </Badge>
                      </TD>
                      <TD className="max-w-[28rem]">
                        {product.issues.length === 0 ? (
                          <span className="text-[var(--color-ink-3)]">—</span>
                        ) : (
                          <details className="group">
                            <summary className="inline-flex cursor-pointer items-center gap-1 text-[length:var(--text-xs)] font-medium text-[var(--color-signal)] marker:content-none">
                              <span className="group-open:hidden">
                                Xem {product.issues.length} lý do
                              </span>
                              <span className="hidden group-open:inline">Thu gọn</span>
                            </summary>
                            <ul className="mt-2 flex flex-col gap-2 border-l-2 border-[var(--color-rule-strong)] pl-3">
                              {product.issues.map((issue, index) => (
                                <li key={`${product.productId}-${index}`} className="text-[length:var(--text-xs)]">
                                  <p className="font-medium text-[var(--color-ink)]">
                                    {issue.description}
                                  </p>
                                  {issue.detail ? (
                                    <p className="mt-0.5 text-[var(--color-ink-2)]">{issue.detail}</p>
                                  ) : null}
                                  {issue.resolution ? (
                                    <p className="mt-0.5 text-[var(--color-ink-3)]">
                                      Cách xử lý: {issue.resolution}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroller>
          )}
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalProducts}
            pageSize={PRODUCTS_PER_PAGE}
            hrefFor={pageHref}
          />
        </Card>
      </section>
    </div>
  )
}

function MerchantStat({
  label,
  value,
  tone,
}: {
  readonly label: string
  readonly value: number
  readonly tone?: 'positive' | 'negative' | 'caution'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-[var(--color-positive)]'
      : tone === 'negative'
        ? 'text-[var(--color-negative)]'
        : tone === 'caution'
          ? 'text-[var(--color-caution)]'
          : 'text-[var(--color-ink)]'

  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
        {label}
      </p>
      <p
        data-numeric
        className={`text-[length:var(--text-2xl)] leading-[var(--leading-tight)] font-semibold tracking-[var(--tracking-tight)] ${toneClass}`}
      >
        {formatNumber(value)}
      </p>
    </Card>
  )
}

interface VideoCardData {
  readonly title: string
  readonly thumbnailUrl?: string | null
  readonly views: number
  readonly likes: number
  readonly comments: number
  /** `null` khi nền tảng không trả được chỉ số này cho tài khoản (khác 0
   * thật) — cả YouTube lẫn TikTok đều có thể rơi vào trường hợp này. */
  readonly shares: number | null
}

/**
 * Lưới thẻ video — dùng cho YouTube và TikTok, hai nền tảng có nội dung dạng
 * video với đủ 4 chỉ số tương tác (view/like/comment/share). KHÔNG dùng
 * `BreakdownSection` (bảng) ở đây vì nội dung video xứng đáng một ảnh bìa để
 * nhận diện — một dòng bảng chỉ có tên không đủ để biết đang nói về clip nào.
 */
function VideoCardGrid({
  label,
  title,
  videos,
  fetchError,
  emptyDescription,
}: {
  readonly label: string
  readonly title: string
  readonly videos: readonly VideoCardData[]
  /** Khác `null` = request lấy video thất bại thật — phải nói rõ, không
   * được lẫn với "chưa có video nào" (trạng thái bình thường). */
  readonly fetchError: string | null
  readonly emptyDescription: string
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label={label} title={title} />
      {fetchError ? (
        <Callout
          tone="critical"
          icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
          title="Không lấy được danh sách video"
        >
          <p>{fetchError}</p>
        </Callout>
      ) : videos.length === 0 ? (
        <EmptyState title="Chưa có video" description={emptyDescription} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video, index) => (
            <Card key={index} className="flex flex-col overflow-hidden p-0">
              {video.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-[var(--color-paper-3)]">
                  <Eye aria-hidden className="size-6 text-[var(--color-ink-3)]" />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-3 p-4">
                <p
                  className="line-clamp-2 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
                  title={video.title}
                >
                  {video.title}
                </p>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <VideoStat icon={Eye} label="Lượt xem" value={formatCompact(video.views)} />
                  <VideoStat icon={Heart} label="Lượt thích" value={formatCompact(video.likes)} />
                  <VideoStat
                    icon={MessageCircle}
                    label="Bình luận"
                    value={formatCompact(video.comments)}
                  />
                  <VideoStat
                    icon={Share2}
                    label="Chia sẻ"
                    value={video.shares === null ? '—' : formatCompact(video.shares)}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function VideoStat({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: typeof Eye
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
      <Icon aria-hidden className="size-3.5 shrink-0 text-[var(--color-ink-3)]" />
      <span data-numeric className="font-medium text-[var(--color-ink)]">
        {value}
      </span>
      <span className="text-[var(--color-ink-3)]">{label}</span>
    </div>
  )
}

function BreakdownSection({
  label,
  title,
  columns,
  rows,
}: {
  readonly label: string
  readonly title: string
  readonly columns: readonly string[]
  readonly rows: readonly { readonly dimension: string; readonly cells: readonly string[] }[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label={label} title={title} />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu" description="Chưa có gì để hiện trong khoảng ngày này." />
        ) : (
          <TableScroller aria-label={title}>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{label}</TH>
                  {columns.map((column) => (
                    <TH key={column} numeric>
                      {column}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.dimension}>
                    <TD className="max-w-[24rem]">
                      <span className="block truncate" title={row.dimension}>
                        {row.dimension}
                      </span>
                    </TD>
                    {row.cells.map((cell, index) => (
                      <TD key={`${row.dimension}-${index}`} numeric>
                        {cell}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>
    </section>
  )
}

function EntityListSection({
  title,
  entities,
}: {
  readonly title: string
  readonly entities: readonly { readonly name: string; readonly type: string }[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <CardHeader title={title} description={`${entities.length} mục`} />
      {entities.length === 0 ? (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">Chưa có mục nào.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entities.map((entity) => (
            <Badge key={`${entity.type}-${entity.name}`} tone="outline">
              {entity.name}
              <span className="ml-1.5 text-[var(--color-ink-3)]">· {entity.type}</span>
            </Badge>
          ))}
        </div>
      )}
    </section>
  )
}

function TrendCard({
  title,
  data,
  metricKey,
  label,
  format = 'number',
}: {
  readonly title: string
  readonly data: readonly TrendPoint[]
  readonly metricKey: string
  readonly label: string
  readonly format?: 'number' | 'currency'
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {data.length === 0 ? (
          <EmptyState
            title="Chưa có dữ liệu"
            description="Chưa đủ lịch sử trong khoảng ngày này — thử mở rộng khoảng ngày ở trên."
          />
        ) : (
          <TrendChart
            data={data}
            series={[
              { key: metricKey, label, colorToken: '--color-signal', kind: 'area' },
            ]}
            format={format}
            currencySymbol={format === 'currency' ? '₫' : undefined}
          />
        )}
      </CardBody>
    </Card>
  )
}

/**
 * "Hôm nay" luôn trống với GA4/Search Console — KHÔNG PHẢI lỗi đồng bộ. Cả
 * hai xử lý dữ liệu có độ trễ (Google tự công bố, không phải giới hạn của
 * app này): Search Console trễ 2-3 ngày, GA4 trễ khoảng 24-48 giờ cho báo
 * cáo đầy đủ. Đồng bộ lại bao nhiêu lần cũng không thể lấy được dữ liệu
 * Google chưa xử lý xong — nói rõ ra thay vì để trống trông như hỏng.
 */
function ProcessingDelayNote({ days }: { readonly days: string }) {
  return (
    <Callout
      tone="signal"
      icon={<Info aria-hidden className="size-5 text-[var(--color-signal)]" />}
      title={`"Hôm nay" thường trống — Google xử lý dữ liệu trễ ${days}`}
    >
      <p>Không phải lỗi đồng bộ. Chọn &quot;7 ngày qua&quot; trở lên để thấy số liệu đầy đủ.</p>
    </Callout>
  )
}
