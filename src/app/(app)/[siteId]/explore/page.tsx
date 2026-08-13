import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { ReportBuilder } from '@/components/explore/report-builder'
import { getSite } from '@/lib/data/sites'
import { getRealExploreRows } from '@/lib/data/site-explore'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import { formatDateRange } from '@/lib/format'

export const metadata = { title: 'Khám phá' }

export default async function ExplorePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly siteId: string }>
  readonly searchParams: Promise<{ readonly range?: string; readonly from?: string; readonly to?: string }>
}) {
  const { siteId } = await params
  const { range: rangeParam, from, to } = await searchParams
  const site = await getSite(siteId)
  if (!site) notFound()

  const range = resolveDateRange(
    parseRangeParam(rangeParam),
    new Date(),
    parseCustomRangeParams(from, to) ?? undefined,
  )

  const rows = await getRealExploreRows(site.id, {
    startDate: range.start,
    endDate: range.end,
  })

  const groups = [...new Set(rows.map((row) => row.group))]

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
      />

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
