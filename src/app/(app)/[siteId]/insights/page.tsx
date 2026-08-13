import { notFound } from 'next/navigation'
import { Bot, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { ProviderMark } from '@/components/connections/provider-mark'
import { getSite } from '@/lib/data/sites'
import { getRealInsights } from '@/lib/data/site-insights'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import {
  ACTION_KIND_LABELS,
  SEVERITY_LABELS,
  bySeverity,
  hasValidEvidence,
  type Insight,
  type InsightSeverity,
} from '@/lib/domain/insight'
import { formatDateRange, formatNumber, formatPercent } from '@/lib/format'

export const metadata = { title: 'Đề xuất' }

const SEVERITY_TONE: Readonly<
  Record<InsightSeverity, 'negative' | 'caution' | 'signal' | 'neutral'>
> = {
  critical: 'negative',
  warning: 'caution',
  opportunity: 'signal',
  info: 'neutral',
}

export default async function InsightsPage({
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
  const all = await getRealInsights(site.id, range)

  // Hàng rào chống bịa số: insight không truy được về hàng metric thật thì
  // KHÔNG hiển thị. Lọc ở đây, không phải ở chỗ sinh dữ liệu — vì nguồn sinh
  // sau này là mô hình ngôn ngữ, và mô hình thì không tự ràng buộc được.
  const shown = all.filter(hasValidEvidence).slice().sort(bySeverity)
  const suppressed = all.length - shown.length

  const critical = shown.filter((insight) => insight.severity === 'critical')

  return (
    <PageShell>
      <PageHeader
        title="Đề xuất"
        description="Những gì hệ thống phát hiện được trong dữ liệu, xếp theo mức độ cần xử lý. Mỗi đề xuất đều mở ra được bằng chứng."
        action={
          <Button variant="secondary" size="md">
            <SlidersHorizontal aria-hidden className="size-4" />
            Ngưỡng cảnh báo
          </Button>
        }
      />

      <DataGate
        siteId={site.id}
        title="Chưa có gì để phân tích"
        description="Đề xuất sinh ra từ số liệu thật của bạn. Không có dữ liệu thì mọi đề xuất chỉ là phỏng đoán — và chúng tôi không đoán."
      >

      <Callout
        tone="signal"
        icon={<ShieldCheck aria-hidden className="size-5 text-[var(--color-signal)]" />}
        title="Mọi con số ở đây đều truy ngược được"
      >
        <p>
          Đề xuất nào không gắn được với hàng dữ liệu thật sẽ bị chặn không hiển thị,
          kể cả khi AI sinh ra nó.{' '}
          {suppressed > 0
            ? `Lần chạy này có ${suppressed} đề xuất bị chặn.`
            : 'Lần chạy này không có đề xuất nào bị chặn.'}
        </p>
      </Callout>

      {critical.length > 0 ? (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          <strong className="text-[var(--color-negative)]">
            {critical.length} vấn đề nghiêm trọng
          </strong>{' '}
          đang làm sai lệch số liệu. Xử lý chúng trước khi ra quyết định ngân sách.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title="Chưa có đề xuất nào"
            description="Hệ thống chưa phát hiện bất thường nào trong khoảng thời gian đang chọn."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
      </DataGate>
    </PageShell>
  )
}

function InsightCard({ insight }: { readonly insight: Insight }) {
  return (
    <Card
      tone={insight.severity === 'critical' ? 'critical' : 'bordered'}
      className="p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[insight.severity]}>
              {SEVERITY_LABELS[insight.severity]}
            </Badge>
            {insight.source === 'ai' ? (
              <Badge tone="outline" icon={<Bot aria-hidden className="size-3" />}>
                AI
              </Badge>
            ) : (
              <Badge tone="outline">Theo luật</Badge>
            )}
            {insight.status === 'acknowledged' ? (
              <Badge tone="neutral">Đã ghi nhận</Badge>
            ) : null}
          </div>

          <h3 className="text-[length:var(--text-xl)] leading-[var(--leading-snug)] font-semibold text-[var(--color-ink)]">
            {insight.title}
          </h3>
          <p className="mt-1.5 max-w-prose text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            {insight.body}
          </p>
        </div>
      </div>

      {/* Bằng chứng luôn mở được, không giấu sau một cú nhấp thứ hai. */}
      <details className="group mt-4">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] text-[length:var(--text-xs)] font-medium text-[var(--color-signal)] marker:content-none">
          <span className="group-open:hidden">
            Xem {insight.evidence.length} bằng chứng
          </span>
          <span className="hidden group-open:inline">Thu gọn bằng chứng</span>
        </summary>

        <ul className="mt-3 flex flex-col gap-2 border-l-2 border-[var(--color-rule-strong)] pl-4">
          {insight.evidence.map((item, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <ProviderMark provider={item.provider} size="sm" />
              <span className="text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                {item.label}
                {item.entityName ? (
                  <span className="text-[var(--color-ink-3)]"> · {item.entityName}</span>
                ) : null}
              </span>
              <span
                data-numeric
                className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
              >
                {formatEvidenceValue(item.metric, item.value)}
              </span>
              {item.comparisonValue !== null ? (
                <span
                  data-numeric
                  className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]"
                >
                  (kỳ trước {formatEvidenceValue(item.metric, item.comparisonValue)})
                </span>
              ) : null}
              <span className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                {formatDateRange(item.dateRange.start, item.dateRange.end)}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {insight.recommendedAction ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--color-rule)] pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink)]">
              <span className="font-medium">
                {ACTION_KIND_LABELS[insight.recommendedAction.kind]}:
              </span>{' '}
              {insight.recommendedAction.summary}
            </p>
            {insight.estimatedImpact ? (
              <p className="mt-1 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                Ước tính {insight.estimatedImpact.metric}{' '}
                {formatPercent(insight.estimatedImpact.deltaPct)} · độ tin cậy{' '}
                {insight.estimatedImpact.confidence === 'high'
                  ? 'cao'
                  : insight.estimatedImpact.confidence === 'medium'
                    ? 'trung bình'
                    : 'thấp'}
              </p>
            ) : null}
          </div>

          {/* Không có nút "Áp dụng ngay". Hành động ghi luôn đi qua màn hình duyệt. */}
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm">
              Bỏ qua
            </Button>
            <Button variant="primary" size="sm">
              Đưa vào hàng chờ duyệt
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

/** Cùng một hàm định dạng cho mọi bằng chứng, chọn theo tên chỉ số. */
function formatEvidenceValue(metric: string, value: number): string {
  if (metric === 'ctr' || metric === 'citationRate') return formatPercent(value, 2)
  if (metric.endsWith('Micros')) return `${formatNumber(value / 1_000_000)} ₫`
  if (metric === 'averagePosition') return value.toFixed(1)
  return formatNumber(value)
}
