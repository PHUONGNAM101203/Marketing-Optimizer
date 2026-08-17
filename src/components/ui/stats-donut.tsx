'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact, formatNumber, formatPercent } from '@/lib/format'

/** Ba token màu SẴN CÓ trong `tokens.css` (không phải slot `--color-series-N`
 * dành riêng cho provider, xem CLAUDE.md "không đổi/gán lại các slot đó") —
 * đủ tương phản để phân biệt tối đa 3 lát bánh, không cần thêm màu mới ngoài
 * hệ token hiện có. */
export const STATS_DONUT_COLOR_TOKENS = ['--color-signal', '--color-positive', '--color-caution'] as const

export interface StatsDonutSlice {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly colorToken: (typeof STATS_DONUT_COLOR_TOKENS)[number]
}

/* Hallmark · component: stats-donut · theme: studied-DNA (Ink & Signal)
 *
 * Nguyên tắc donut dùng chung cho MỌI widget "tổng quan tương tác" trên
 * dashboard kênh (Meta/TikTok/YouTube) — tách ra từ `meta-stats-summary.tsx`
 * (bản gốc, theo yêu cầu người dùng "dạng pie chart... hiện đại đặc sắc
 * hơn") để TikTok/YouTube dùng lại ĐÚNG một giao diện thay vì viết lại lần
 * hai. Nhận `slices` đã tổng hợp sẵn (mỗi platform tự cộng dồn theo field
 * riêng của nó trước khi gọi) thay vì một hình dạng dữ liệu cụ thể — donut
 * không cần biết "likes/comments/shares" hay "views" là gì.
 */
export function StatsDonut({
  slices,
  totalLabel,
  emptyTitle,
  emptyDescription,
}: {
  readonly slices: readonly StatsDonutSlice[]
  readonly totalLabel: string
  readonly emptyTitle: string
  readonly emptyDescription: string
}) {
  const grandTotal = slices.reduce((sum, slice) => sum + slice.value, 0)

  if (grandTotal === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <Card className="flex flex-col items-center gap-6 p-5 sm:flex-row">
      <div className="relative size-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 3 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={`var(${slice.colorToken})`} />
              ))}
            </Pie>
            <Tooltip content={<StatsDonutTooltip total={grandTotal} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <p
            data-numeric
            className="text-[length:var(--text-xl)] leading-[var(--leading-tight)] font-semibold text-[var(--color-ink)]"
          >
            {formatCompact(grandTotal)}
          </p>
          <p className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">{totalLabel}</p>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col gap-2.5">
        {slices.map((slice) => (
          <div key={slice.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: `var(${slice.colorToken})` }}
              />
              {slice.label}
            </span>
            <span data-numeric className="text-[length:var(--text-sm)] font-semibold text-[var(--color-ink)]">
              {formatNumber(slice.value)}
              <span className="ml-1.5 font-normal text-[var(--color-ink-3)]">
                {formatPercent(grandTotal > 0 ? slice.value / grandTotal : 0, 0)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function StatsDonutTooltip({
  active,
  payload,
  total,
}: {
  readonly active?: boolean
  readonly payload?: readonly { readonly payload: StatsDonutSlice }[]
  readonly total: number
}) {
  if (!active || !payload?.length) return null
  const slice = payload[0].payload

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 shadow-[0_8px_28px_-12px_rgb(0_0_0/0.18)]">
      <p className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: `var(${slice.colorToken})` }}
        />
        {slice.label}
      </p>
      <p data-numeric className="mt-0.5 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink)]">
        {formatNumber(slice.value)} · {formatPercent(total > 0 ? slice.value / total : 0, 0)}
      </p>
    </div>
  )
}
