import { Card, SectionHead } from '@/components/ui/card'
import { Callout } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { formatNumber, formatPercent } from '@/lib/format'
import { compare } from '@/lib/metrics/derive'
import type { RealMetricsSummary } from '@/lib/data/site-metrics'

/* Hallmark · component: overview-comparison-panel · theme: studied-DNA (Ink & Signal)
 *
 * Bản gộp-toàn-site của `ChannelComparisonPanel`. Hai component không dùng
 * chung được vì nguồn khác nhau: bản kia nhận `ChannelSummary` của MỘT nền
 * tảng và lấy danh sách chỉ số theo `channelComparisonMetrics(provider)`, còn
 * ở đây là `RealMetricsSummary` — số đã cộng gộp GA4 + Search Console cho cả
 * site, với đúng năm chỉ số dùng chung.
 *
 * Cố tình CHỈ hiện số liệu THẬT. Khối chi phí/ROAS/CPA trên trang Tổng quan
 * vẫn là dữ liệu mẫu và đang bị khoá mờ; đưa chúng vào một bảng so sánh —
 * nơi người dùng chủ động vào để đối chiếu hai khoảng — là mời người ta rút
 * kết luận từ số bịa.
 */

const METRICS = [
  { key: 'sessions', label: 'Phiên (GA4)' },
  { key: 'users', label: 'Người dùng (GA4)' },
  { key: 'conversions', label: 'Chuyển đổi (GA4)' },
  { key: 'clicks', label: 'Lượt nhấp (Search Console)' },
  { key: 'impressions', label: 'Lượt hiển thị (Search Console)' },
] as const

const formatDeltaPct = (deltaPct: number | null): string => {
  if (deltaPct === null) return '—'
  const sign = deltaPct > 0 ? '+' : ''
  return `${sign}${formatPercent(deltaPct, 1)}`
}

/** Mọi chỉ số bằng 0 = khoảng đó KHÔNG có hàng nào trong `metrics_daily`,
 * không phải hiệu suất bằng 0. Hai trường hợp này nhìn y hệt nhau trên bảng,
 * mà kết luận thì ngược nhau hoàn toàn — và trường hợp đầu rất dễ gặp: đồng
 * bộ chỉ giữ 30 ngày cuốn chiếu (`SYNC_WINDOW_DAYS` trong `sync-connection.ts`),
 * nên chọn "cùng kỳ năm ngoái" là chắc chắn rỗng. Phải nói thẳng ra. */
const isEmpty = (summary: RealMetricsSummary): boolean =>
  Object.values(summary.totals).every((value) => value === 0)

export function OverviewComparisonPanel({
  a,
  b,
  aLabel,
  bLabel,
}: {
  readonly a: RealMetricsSummary
  readonly b: RealMetricsSummary
  readonly aLabel: string
  readonly bLabel: string
}) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        label="So sánh"
        title="Đối chiếu hai khoảng ngày"
        description="Hai khoảng bạn chọn trong “So sánh với…”, độc lập với khoảng ngày đang xem ở trên."
      />
      {isEmpty(a) || isEmpty(b) ? (
        <Callout tone="caution" title="Một kỳ không có dữ liệu">
          {isEmpty(a) && isEmpty(b)
            ? 'Cả hai khoảng đều chưa có số liệu nào.'
            : `${isEmpty(a) ? aLabel : bLabel} chưa có số liệu nào.`}{' '}
          Số 0 dưới đây là do thiếu dữ liệu chứ không phải hiệu suất bằng 0 — đồng bộ chỉ giữ 30
          ngày gần nhất, nên các khoảng xa hơn thế sẽ rỗng.
        </Callout>
      ) : null}

      <Card className="overflow-hidden">
        <TableScroller aria-label="So sánh hai khoảng ngày">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Chỉ số</TH>
                <TH numeric>{aLabel}</TH>
                <TH numeric>{bLabel}</TH>
                <TH numeric>Chênh lệch</TH>
              </TR>
            </THead>
            <TBody>
              {METRICS.map((metric) => {
                const aValue = a.totals[metric.key]
                const bValue = b.totals[metric.key]
                return (
                  <TR key={metric.key}>
                    <TD>{metric.label}</TD>
                    <TD numeric>{formatNumber(aValue)}</TD>
                    <TD numeric>{formatNumber(bValue)}</TD>
                    <TD numeric className="text-[var(--color-ink-2)]">
                      {formatDeltaPct(compare(aValue, bValue).deltaPct)}
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableScroller>
      </Card>
    </section>
  )
}
