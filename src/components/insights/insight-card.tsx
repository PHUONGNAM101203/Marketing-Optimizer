'use client'

import { useState, useTransition } from 'react'
import { Bot, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProviderMark } from '@/components/connections/provider-mark'
import { clearInsightAction, setInsightAction } from '@/lib/actions/insights'
import {
  ACTION_KIND_LABELS,
  SEVERITY_LABELS,
  type Insight,
  type InsightSeverity,
} from '@/lib/domain/insight'
import { formatDateRange, formatNumber, formatPercent } from '@/lib/format'

/* Hallmark · component: insight-card · theme: studied-DNA (Ink & Signal)
 *
 * "Bỏ qua"/"Đưa vào hàng chờ duyệt" là thao tác TRIAGE trên chính insight
 * (ẩn nó đi / gắn cờ theo dõi) — KHÔNG phải thực thi `recommendedAction`.
 * Vì vậy hai nút này hiện cho MỌI insight, không chỉ khi có
 * `recommendedAction` (trước đây lồng trong điều kiện đó nên chưa từng hiện
 * ra, vì chưa generator nào gán `recommendedAction` khác null). Thực thi
 * hành động ghi ra nền tảng ngoài là việc của module Agents + cổng duyệt,
 * chưa tồn tại — không giả vờ có ở đây.
 */

const SEVERITY_TONE: Readonly<Record<InsightSeverity, 'negative' | 'caution' | 'signal' | 'neutral'>> = {
  critical: 'negative',
  warning: 'caution',
  opportunity: 'signal',
  info: 'neutral',
}

export interface InsightCardProps {
  readonly siteId: string
  readonly insight: Insight
  /** `null` = chưa thao tác gì (mặc định). Đọc từ `insight_actions`, xem
   * `getInsightActionMap`. */
  readonly triageStatus: 'dismissed' | 'acknowledged' | null
}

export function InsightCard({ siteId, insight, triageStatus }: InsightCardProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const triage = (action: 'dismissed' | 'acknowledged') => {
    setError(null)
    startTransition(async () => {
      const result = await setInsightAction({ siteId, insightId: insight.id, action })
      if (result.error) setError(result.error)
    })
  }

  const restore = () => {
    setError(null)
    startTransition(async () => {
      const result = await clearInsightAction({ siteId, insightId: insight.id })
      if (result.error) setError(result.error)
    })
  }

  return (
    <Card tone={insight.severity === 'critical' ? 'critical' : 'bordered'} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[insight.severity]}>{SEVERITY_LABELS[insight.severity]}</Badge>
            {insight.source === 'ai' ? (
              <Badge tone="outline" icon={<Bot aria-hidden className="size-3" />}>
                AI
              </Badge>
            ) : (
              <Badge tone="outline">Theo luật</Badge>
            )}
            {triageStatus === 'acknowledged' ? <Badge tone="neutral">Đã ghi nhận</Badge> : null}
            {triageStatus === 'dismissed' ? <Badge tone="neutral">Đã bỏ qua</Badge> : null}
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
          <span className="group-open:hidden">Xem {insight.evidence.length} bằng chứng</span>
          <span className="hidden group-open:inline">Thu gọn bằng chứng</span>
        </summary>

        <ul className="mt-3 flex flex-col gap-2 border-l-2 border-[var(--color-rule-strong)] pl-4">
          {insight.evidence.map((item, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <ProviderMark provider={item.provider} size="sm" />
              <span className="text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                {item.label}
                {item.entityName ? <span className="text-[var(--color-ink-3)]"> · {item.entityName}</span> : null}
              </span>
              <span data-numeric className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                {formatEvidenceValue(item.metric, item.value)}
              </span>
              {item.comparisonValue !== null ? (
                <span data-numeric className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
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
        <div className="mt-4 border-t border-[var(--color-rule)] pt-4">
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink)]">
            <span className="font-medium">{ACTION_KIND_LABELS[insight.recommendedAction.kind]}:</span>{' '}
            {insight.recommendedAction.summary}
          </p>
          {insight.estimatedImpact ? (
            <p className="mt-1 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              Ước tính {insight.estimatedImpact.metric} {formatPercent(insight.estimatedImpact.deltaPct)} · độ
              tin cậy{' '}
              {insight.estimatedImpact.confidence === 'high'
                ? 'cao'
                : insight.estimatedImpact.confidence === 'medium'
                  ? 'trung bình'
                  : 'thấp'}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] pt-4">
        {error ? <p className="text-[length:var(--text-xs)] text-[var(--color-negative)]">{error}</p> : <span />}

        {/* Không có nút "Áp dụng ngay" — đây là triage (bỏ qua/theo dõi),
            không phải thực thi. Hành động ghi ra nền tảng ngoài luôn đi qua
            màn hình duyệt riêng (module Agents), chưa tồn tại. */}
        {triageStatus ? (
          <Button variant="ghost" size="sm" onClick={restore} disabled={pending}>
            <RotateCcw aria-hidden className="size-3.5" />
            Khôi phục
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => triage('dismissed')} disabled={pending}>
              Bỏ qua
            </Button>
            <Button variant="primary" size="sm" onClick={() => triage('acknowledged')} disabled={pending}>
              Đưa vào hàng chờ duyệt
            </Button>
          </div>
        )}
      </div>
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
