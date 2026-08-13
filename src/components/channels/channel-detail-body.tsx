import Link from 'next/link'
import { AlertTriangle, Info, Settings2 } from 'lucide-react'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { TrendChart, type TrendPoint } from '@/components/charts/trend-chart'
import { Pagination } from '@/components/ui/pagination'
import type { ChannelDetail } from '@/lib/data/site-channel-detail'
import type { ChannelDailyPoint } from '@/lib/data/site-channels'
import type { ProductApprovalStatus } from '@/lib/providers/google-merchant'
import type { DateRangePreset } from '@/lib/domain/site'
import type { ProviderId } from '@/lib/domain/providers'
import { formatCompact, formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/format'
import { microsToUnits } from '@/lib/metrics/types'

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
  provider,
  rangeParam,
  productFilter,
  page,
}: {
  readonly detail: ChannelDetail
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly preset: DateRangePreset
  readonly currency: string
  /** Năm cái dưới đây chỉ Merchant Center dùng — để dựng link filter trạng
   * thái/phân trang mà vẫn giữ nguyên khoảng ngày đang chọn. */
  readonly siteId?: string
  readonly provider?: ProviderId
  readonly rangeParam?: string
  readonly productFilter?: ProductApprovalStatus
  readonly page?: number
}) {
  switch (detail.kind) {
    case 'ga4':
      return (
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
          <BreakdownSection
            label="Video"
            title="Video xem nhiều nhất"
            rows={detail.data.topVideos.map((row) => ({
              dimension: row.title,
              cells: [formatCompact(row.views)],
            }))}
            columns={['Lượt xem']}
          />
        </div>
      )

    case 'merchant-center':
      return (
        <MerchantCenterSection
          detail={detail}
          dailySeries={dailySeries}
          siteId={siteId as string}
          provider={provider as ProviderId}
          rangeParam={rangeParam}
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

    case 'instagram':
      return (
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
          <BreakdownSection
            label="Bài đăng"
            title="Bài đăng có tương tác cao nhất"
            rows={detail.data.topPosts.map((row) => ({
              dimension: row.caption,
              cells: [formatCompact(row.engagement)],
            }))}
            columns={['Tương tác']}
          />
        </div>
      )

    case 'facebook':
      return (
        <div className="flex flex-col gap-6">
          <TrendCard
            title="Lượt hiển thị Page theo ngày"
            data={dailySeries.map((point) => ({
              date: point.date,
              impressions: point.extra.impressions ?? 0,
            }))}
            metricKey="impressions"
            label="Lượt hiển thị"
          />
          <BreakdownSection
            label="Bài đăng"
            title="Bài đăng có tương tác cao nhất"
            rows={detail.data.topPosts.map((row) => ({
              dimension: row.message,
              cells: [formatCompact(row.engagement)],
            }))}
            columns={['Tương tác']}
          />
        </div>
      )

    case 'tiktok': {
      const latest = dailySeries.length > 0 ? dailySeries[dailySeries.length - 1] : null
      const latestExtra = latest?.extra ?? {}
      return (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            <MerchantStat label="Follower" value={latestExtra.followerCount ?? 0} />
            <MerchantStat label="Lượt thích" value={latestExtra.likesCount ?? 0} />
            <MerchantStat label="Số video" value={latestExtra.videoCount ?? 0} />
          </div>

          {dailySeries.length > 0 ? (
            <Card>
              <CardHeader
                title="Follower theo lần đồng bộ"
                description="TikTok Display API không có báo cáo lịch sử theo ngày — mỗi điểm là trạng thái tài khoản TẠI lần đồng bộ đó, không phải phát sinh trong ngày."
              />
              <CardBody>
                <TrendChart
                  data={dailySeries.map((point) => ({
                    date: point.date,
                    follower: point.extra.followerCount ?? 0,
                  }))}
                  series={[{ key: 'follower', label: 'Follower', colorToken: '--color-signal', kind: 'line' }]}
                  format="number"
                />
              </CardBody>
            </Card>
          ) : null}

          <BreakdownSection
            label="Video"
            title="Video xem nhiều nhất"
            rows={detail.data.topVideos.map((row) => ({
              dimension: row.title,
              cells: [formatCompact(row.views)],
            }))}
            columns={['Lượt xem']}
          />
        </div>
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
  productFilter,
  page,
}: {
  readonly detail: Extract<ChannelDetail, { readonly kind: 'merchant-center' }>
  readonly dailySeries: readonly ChannelDailyPoint[]
  readonly siteId: string
  readonly provider: ProviderId
  readonly rangeParam?: string
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
    if (status) params.set('status', status)
    const query = params.toString()
    return `/${siteId}/channels/${provider}${query ? `?${query}` : ''}`
  }

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams()
    if (rangeParam) params.set('range', rangeParam)
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
