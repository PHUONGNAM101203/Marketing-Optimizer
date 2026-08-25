import { Card, SectionHead } from '@/components/ui/card'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { formatCompact, formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/format'
import { compare } from '@/lib/metrics/derive'
import {
  channelComparisonMetrics,
  type ComparisonFormatter,
} from '@/lib/domain/channel-comparison-metrics'
import type { ChannelSummary } from '@/lib/data/site-channels'
import { SNAPSHOT_PROVIDERS, type ProviderId } from '@/lib/domain/providers'
import { Callout } from '@/components/ui/feedback'

/* Hallmark · component: channel-comparison-panel · theme: studied-DNA (Ink & Signal)
 *
 * Trước đây bật "So sánh với…" ở topbar chỉ đổi được badge trên đầu trang —
 * KHÔNG trang chi tiết kênh nào thật sự hiển thị số liệu hai khoảng ngày
 * cạnh nhau để đối chiếu (chỉ tab Tổng hợp ở trang Tổng quan có). Panel này
 * lấp đúng chỗ trống đó: MỘT bảng 2 cột (khoảng hiện tại / khoảng so sánh) +
 * cột chênh lệch, tái dùng `ChannelSummary` đã có sẵn ở `getChannelSummaries`
 * (gọi thêm một lần với khoảng so sánh, xem `channels/[provider]/page.tsx`)
 * — không cần logic riêng theo nền tảng ở tầng data, chỉ khác NHÃN/chỉ số
 * hiển thị theo `channelComparisonMetrics`.
 */
const format = (value: number | null, formatter: ComparisonFormatter, currency: string): string => {
  switch (formatter) {
    case 'currency':
      return formatCurrencyCompact(value, currency)
    case 'percent':
      return formatPercent(value, 2)
    case 'number':
      return formatNumber(value)
    default:
      return formatCompact(value)
  }
}

const formatDeltaPct = (deltaPct: number | null): string => {
  if (deltaPct === null) return '—'
  const sign = deltaPct > 0 ? '+' : ''
  return `${sign}${formatPercent(deltaPct, 1)}`
}

export function ChannelComparisonPanel({
  provider,
  summary,
  compareSummary,
  currency,
  currentLabel,
  compareLabel,
}: {
  readonly provider: ProviderId
  readonly summary: ChannelSummary
  readonly compareSummary: ChannelSummary
  readonly currency: string
  readonly currentLabel: string
  readonly compareLabel: string
}) {
  const metrics = channelComparisonMetrics(provider)
  if (metrics.length === 0) return null

  // Nền tảng snapshot KHÔNG nạp được lịch sử: API của chúng không có báo cáo
  // theo ngày trong quá khứ, chỉ trả trạng thái hiện tại (xem
  // `SNAPSHOT_PROVIDERS`). Số liệu vì vậy chỉ tồn tại từ ngày app bắt đầu tự
  // chụp snapshot, và mọi khoảng trước đó ra 0 — trông y hệt "hiệu suất bằng
  // 0" trong khi thực chất là không có dữ liệu. Các nền tảng khác đã được nạp
  // lùi một năm nên không gặp cảnh này.
  const isSnapshotProvider = SNAPSHOT_PROVIDERS.has(provider)
  const compareIsEmpty = metrics.every((metric) => (metric.getValue(compareSummary) ?? 0) === 0)

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        label="So sánh"
        title="Đối chiếu hai khoảng ngày"
        description="Cạnh nhau để biết chênh lệch bao nhiêu, không phải chỉ một con số % rời rạc."
      />
      {isSnapshotProvider && compareIsEmpty ? (
        <Callout tone="caution" title={`${compareLabel} không có dữ liệu`}>
          Nền tảng này không cung cấp báo cáo lịch sử — API chỉ trả về trạng thái tại thời điểm
          hỏi, nên không thể lấy lùi số liệu của quá khứ như GA4 hay Search Console. Số liệu chỉ có
          từ ngày kênh được kết nối và app bắt đầu tự ghi lại hằng ngày. Số 0 dưới đây là do thiếu
          dữ liệu, không phải hiệu suất bằng 0.
        </Callout>
      ) : null}

      <Card className="overflow-hidden">
        <TableScroller aria-label="So sánh hai khoảng ngày">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Chỉ số</TH>
                <TH numeric>{currentLabel}</TH>
                <TH numeric>{compareLabel}</TH>
                <TH numeric>Chênh lệch</TH>
              </TR>
            </THead>
            <TBody>
              {metrics.map((metric) => {
                const currentValue = metric.getValue(summary)
                const compareValue = metric.getValue(compareSummary)
                // `summary.currency` — CHỈ Klaviyo set field này (tài khoản
                // Klaviyo có `preferred_currency` riêng, khác `site.currency`
                // — xem `ChannelSummary.currency` ở `site-channels.ts`). Mọi
                // provider khác `null`, tự rơi về `currency` chung của trang.
                const rowCurrency = summary.currency ?? currency
                const deltaPct = compare(currentValue, compareValue).deltaPct
                return (
                  <TR key={metric.key}>
                    <TD>{metric.label}</TD>
                    <TD numeric>{format(currentValue, metric.formatter, rowCurrency)}</TD>
                    <TD numeric>{format(compareValue, metric.formatter, rowCurrency)}</TD>
                    <TD numeric className="text-[var(--color-ink-2)]">
                      {formatDeltaPct(deltaPct)}
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
