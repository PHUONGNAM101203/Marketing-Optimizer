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
  // Kiểm tra CẢ HAI kỳ. Bản đầu chỉ nhìn `compareSummary` (kỳ B) — nhưng kỳ
  // rỗng thường là kỳ CŨ HƠN, mà người dùng hay đặt kỳ cũ ở cột A. Đúng
  // trường hợp đã gặp: A = tháng 7 rỗng, B = tháng 8 có số, cảnh báo không
  // hiện dù đó chính là lúc cần nó nhất.
  const isEmpty = (candidate: ChannelSummary): boolean =>
    metrics.every((metric) => (metric.getValue(candidate) ?? 0) === 0)
  const emptyLabels = [
    isEmpty(summary) ? currentLabel : null,
    isEmpty(compareSummary) ? compareLabel : null,
  ].filter((label): label is string => label !== null)

  // Hai cột GIỐNG HỆT nhau ở provider snapshot = cả hai kỳ đang đọc về cùng
  // một dòng snapshot (khoảng chọn không chứa snapshot nào nên rơi về bản mới
  // nhất — xem `getChannelSummaries`). Chênh lệch 0% khi đó là ảo, không phải
  // "không đổi". Trước đây trường hợp này hiện 0 vs 0, giờ hiện số thật giống
  // nhau — dễ tin nhầm hơn, nên phải nói ra.
  const identicalColumns =
    !isEmpty(summary) &&
    metrics.every((metric) => metric.getValue(summary) === metric.getValue(compareSummary))

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        label="So sánh"
        title="Đối chiếu hai khoảng ngày"
        description="Cạnh nhau để biết chênh lệch bao nhiêu, không phải chỉ một con số % rời rạc."
      />
      {provider === 'tiktok' ? (
        <Callout tone="signal" title="Đọc bảng này thế nào">
          TikTok không có báo cáo lịch sử theo ngày, nên không thể biết một video kiếm được bao
          nhiêu lượt xem riêng trong một khoảng đã qua. Thay vào đó bảng gộp theo NGÀY ĐĂNG: mỗi
          cột là các video đăng trong khoảng đó, kèm chỉ số cộng dồn của chúng tính tới hôm nay.
          Lưu ý khoảng cũ hơn đã có nhiều thời gian tích luỹ hơn — so “Video đăng trong kỳ” và số
          trung bình mỗi video sẽ công bằng hơn so tổng thô.
        </Callout>
      ) : isSnapshotProvider && identicalColumns ? (
        <Callout tone="caution" title="Hai cột đang đọc cùng một mốc">
          Nền tảng này không có báo cáo lịch sử, và không khoảng nào trong hai khoảng bạn chọn có
          bản ghi riêng — cả hai đang hiển thị cùng một trạng thái mới nhất. Chênh lệch 0% ở đây là
          do thiếu dữ liệu, không phải vì số không đổi.
        </Callout>
      ) : isSnapshotProvider && emptyLabels.length > 0 ? (
        <Callout tone="caution" title={`${emptyLabels.join(' và ')} không có dữ liệu`}>
          Nền tảng này không cung cấp báo cáo lịch sử — API chỉ trả về trạng thái tại thời điểm
          hỏi. Số liệu chỉ có từ ngày kênh được kết nối và app bắt đầu tự ghi lại hằng ngày. Số 0
          dưới đây là do thiếu dữ liệu, không phải hiệu suất bằng 0.
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
