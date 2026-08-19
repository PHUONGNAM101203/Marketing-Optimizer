import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { ReportBuilder } from '@/components/explore/report-builder'
import { Button } from '@/components/ui/button'
import { getSite } from '@/lib/data/sites'
import { getRealExploreRows } from '@/lib/data/site-explore'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import {
  GA4_EXPLORE_DIMENSIONS,
  GA4_EXPLORE_DIMENSION_LABELS,
  GSC_EXPLORE_DIMENSIONS,
  GSC_EXPLORE_DIMENSION_LABELS,
  parseGa4ExploreDimensionParam,
  parseGscExploreDimensionParam,
  type Ga4ExploreDimension,
  type GscExploreDimension,
} from '@/lib/domain/explore-dimension'
import { EXPLORE_ROW_LIMITS, parseExploreRowLimitParam } from '@/lib/domain/explore-row-limit'
import { resolveDateRange } from '@/mock/dates'
import { formatDateRange } from '@/lib/format'

export const metadata = { title: 'Khám phá' }

export default async function ExplorePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly siteId: string }>
  readonly searchParams: Promise<{
    readonly range?: string
    readonly from?: string
    readonly to?: string
    readonly rowLimit?: string
    readonly ga4Dim?: string
    readonly gscDim?: string
  }>
}) {
  const { siteId } = await params
  const {
    range: rangeParam,
    from,
    to,
    rowLimit: rowLimitParam,
    ga4Dim: ga4DimParam,
    gscDim: gscDimParam,
  } = await searchParams
  const site = await getSite(siteId)
  if (!site) notFound()

  const range = resolveDateRange(
    parseRangeParam(rangeParam),
    new Date(),
    parseCustomRangeParams(from, to) ?? undefined,
  )
  const rowLimit = parseExploreRowLimitParam(rowLimitParam)
  const ga4Dimension = parseGa4ExploreDimensionParam(ga4DimParam)
  const gscDimension = parseGscExploreDimensionParam(gscDimParam)

  const rows = await getRealExploreRows(
    site.id,
    { startDate: range.start, endDate: range.end },
    rowLimit,
    ga4Dimension,
    gscDimension,
  )

  const groups = [...new Set(rows.map((row) => row.group))]

  // Giữ nguyên mọi lựa chọn khác khi đổi MỘT param — giống hệt `filterHref`
  // ở trang chi tiết kênh Merchant Center.
  const hrefWith = (overrides: {
    readonly rowLimit?: number
    readonly ga4Dim?: Ga4ExploreDimension
    readonly gscDim?: GscExploreDimension
  }) => {
    const params = new URLSearchParams()
    if (rangeParam) params.set('range', rangeParam)
    if (rangeParam === 'custom' && from) params.set('from', from)
    if (rangeParam === 'custom' && to) params.set('to', to)
    const limit = overrides.rowLimit ?? rowLimit
    if (limit !== 10) params.set('rowLimit', String(limit))
    const ga4Dim = overrides.ga4Dim ?? ga4Dimension
    if (ga4Dim !== 'page') params.set('ga4Dim', ga4Dim)
    const gscDim = overrides.gscDim ?? gscDimension
    if (gscDim !== 'query') params.set('gscDim', gscDim)
    const query = params.toString()
    return `/${site.id}/explore${query ? `?${query}` : ''}`
  }

  return (
    <PageShell>
      <PageHeader
        title="Khám phá"
        description="Gộp mọi kênh vào một bảng — bật/tắt từng kênh và từng chỉ số ở dưới. Đây là chỗ trả lời những câu mà từng dashboard riêng lẻ không trả lời được, ví dụ trang/truy vấn/video nào đang kéo traffic nhiều nhất trên toàn bộ nền tảng."
        meta={
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
            {formatDateRange(range.start, range.end)} · {rows.length} hạng mục
          </p>
        }
        action={
          <div className="flex items-center gap-1.5">
            <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">Số hàng</span>
            {EXPLORE_ROW_LIMITS.map((limit) => (
              <Button
                key={limit}
                asChild
                variant={rowLimit === limit ? 'primary' : 'secondary'}
                size="sm"
              >
                <Link href={hrefWith({ rowLimit: limit })}>{limit}</Link>
              </Button>
            ))}
          </div>
        }
      />

      {groups.includes('GA4') || groups.includes('Search Console') ? (
        <div className="-mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {groups.includes('GA4') ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">GA4 theo</span>
              {GA4_EXPLORE_DIMENSIONS.map((dimension) => (
                <Button
                  key={dimension}
                  asChild
                  variant={ga4Dimension === dimension ? 'primary' : 'secondary'}
                  size="sm"
                >
                  <Link href={hrefWith({ ga4Dim: dimension })}>
                    {GA4_EXPLORE_DIMENSION_LABELS[dimension]}
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}

          {groups.includes('Search Console') ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                Search Console theo
              </span>
              {GSC_EXPLORE_DIMENSIONS.map((dimension) => (
                <Button
                  key={dimension}
                  asChild
                  variant={gscDimension === dimension ? 'primary' : 'secondary'}
                  size="sm"
                >
                  <Link href={hrefWith({ gscDim: dimension })}>
                    {GSC_EXPLORE_DIMENSION_LABELS[dimension]}
                  </Link>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <DataGate
        siteId={site.id}
        title="Chưa có dữ liệu để khám phá"
        description="Bảng chéo kênh cần ít nhất một kết nối có số liệu thật."
      >
        <ReportBuilder rows={rows} groups={groups} currency={site.currency} />
      </DataGate>
    </PageShell>
  )
}
