import Link from 'next/link'
import { ArrowRight, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { InlineLocked } from '@/components/connections/inline-locked'
import { ProviderMark } from '@/components/connections/provider-mark'
import { TrendChart } from '@/components/charts/trend-chart'
import { channelChartMetric } from '@/lib/domain/channel-metric'
import { PROVIDER_META, type ProviderId } from '@/lib/domain/providers'
import { formatNumber } from '@/lib/format'
import type { ChannelDailyPoint } from '@/lib/data/site-channels'

/**
 * Một kênh = một thẻ có biểu đồ xu hướng ĐÚNG chỉ số của nó (xem
 * `channelChartMetric`) + nút dẫn thẳng tới trang chi tiết kênh. Dùng ở CẢ
 * hai nơi tại trang Tổng quan: các tab Google/Meta/TikTok (bản đầy đủ, mỗi
 * kênh một thẻ full-width) và tab Tổng hợp (bản `compact`, lưới nhỏ nhiều
 * cột) — khác `ChannelCard` ở trang Kênh vốn chỉ hiện SỐ, không hiện XU
 * HƯỚNG theo thời gian, nên không lặp lại thông tin.
 */
export function ChannelTrendCard({
  siteId,
  provider,
  connected,
  hasData,
  series,
  compact = false,
}: {
  readonly siteId: string
  readonly provider: ProviderId
  readonly connected: boolean
  readonly hasData: boolean
  readonly series: readonly ChannelDailyPoint[]
  readonly compact?: boolean
}) {
  const metric = channelChartMetric(provider)
  const detailHref = `/${siteId}/channels/${provider}`

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 pb-0">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderMark provider={provider} size="sm" />
          <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
            {PROVIDER_META[provider].label}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={detailHref}>
            Chi tiết
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="flex-1 p-4 pt-3">
        {!connected ? (
          <InlineLocked siteId={siteId} label="Chưa kết nối">
            <TrendPlaceholder compact={compact} />
          </InlineLocked>
        ) : metric === null ? (
          <ConfigOnlyState provider={provider} latestPoint={series[series.length - 1]} />
        ) : !hasData || series.length === 0 ? (
          <EmptyState
            title="Đang đồng bộ…"
            description="Chưa có đủ dữ liệu trong khoảng ngày này."
            className="py-6"
          />
        ) : (
          <TrendChart
            data={series.map((point) => ({ date: point.date, value: metric.getValue(point) }))}
            series={[
              {
                key: 'value',
                label: metric.label,
                colorToken: PROVIDER_META[provider].colorToken,
                kind: compact ? 'area' : 'line',
              },
            ]}
            format={metric.format === 'currency' ? 'currency' : 'compact'}
            currencySymbol={metric.format === 'currency' ? '₫' : undefined}
            height={compact ? 140 : 220}
          />
        )}
      </div>
    </Card>
  )
}

function TrendPlaceholder({ compact }: { readonly compact: boolean }) {
  return <div style={{ height: compact ? 140 : 220 }} />
}

/** GTM/Merchant Center không có chỉ số theo ngày (xem `channelChartMetric`)
 * — trang chi tiết kênh đã có UI riêng đúng bản chất của từng cái. GTM chỉ
 * còn là dòng chữ (thẻ = cấu hình, không có "trạng thái" để đếm), nhưng
 * Merchant Center thì CÓ — approved/disapproved/pending là con số thật lấy
 * từ lần đồng bộ gần nhất (`extra` snapshot, xem `google-merchant-metrics.ts`)
 * nên hiện ngay 3 số đó thay vì một dòng chữ chung chung không nói lên gì. */
function ConfigOnlyState({
  provider,
  latestPoint,
}: {
  readonly provider: ProviderId
  readonly latestPoint: ChannelDailyPoint | undefined
}) {
  if (provider === 'merchant-center' && latestPoint) {
    return <MerchantQuickStats extra={latestPoint.extra} />
  }

  const text =
    provider === 'gtm'
      ? 'Cấu hình thẻ — không phải số liệu theo ngày'
      : 'Đang đồng bộ… chưa có dữ liệu danh mục sản phẩm'

  return (
    <div className="flex items-center gap-2 py-8 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
      <Settings2 aria-hidden className="size-4 shrink-0" />
      {text}
    </div>
  )
}

function MerchantQuickStats({ extra }: { readonly extra: Readonly<Record<string, number>> }) {
  const approved = extra.approvedProducts ?? 0
  const disapproved = extra.disapprovedProducts ?? 0
  const pending = extra.pendingProducts ?? 0
  const isApproximate = (extra.countIsApproximate ?? 0) > 0

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="grid grid-cols-3 gap-2">
        <QuickStat label="Đã duyệt" value={approved} tone="positive" />
        <QuickStat label="Bị từ chối" value={disapproved} tone="negative" />
        <QuickStat label="Chờ duyệt" value={pending} tone="caution" />
      </div>
      {isApproximate ? (
        <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
          ≈ tính trên một phần danh mục (giới hạn để đồng bộ không quá lâu)
        </p>
      ) : null}
    </div>
  )
}

function QuickStat({
  label,
  value,
  tone,
}: {
  readonly label: string
  readonly value: number
  readonly tone: 'positive' | 'negative' | 'caution'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-[var(--color-positive)]'
      : tone === 'negative'
        ? 'text-[var(--color-negative)]'
        : 'text-[var(--color-caution)]'

  return (
    <div className="flex flex-col items-center gap-0.5 rounded-[var(--radius-md)] bg-[var(--color-paper-2)] px-2 py-2.5 text-center">
      <p data-numeric className={`text-[length:var(--text-lg)] leading-none font-semibold ${toneClass}`}>
        {formatNumber(value)}
      </p>
      <p className="text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
        {label}
      </p>
    </div>
  )
}
