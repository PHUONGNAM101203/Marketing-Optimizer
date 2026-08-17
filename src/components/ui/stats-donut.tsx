'use client'

import { useEffect, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact, formatNumber, formatPercent } from '@/lib/format'
import { STATS_DONUT_COLOR_TOKENS, type StatsDonutSlice } from '@/components/ui/stats-donut-tokens'

export type { StatsDonutSlice }

/**
 * `tokens.css` khai màu bằng `oklch(...)` — trình duyệt tự vẽ đúng khi
 * `var(--token)` nằm trong CSS thường (className/style bình thường), nhưng
 * recharts xử lý `fill` của `<Cell>` qua bộ phân tích màu JS nội bộ (tính
 * lát đang active/hover, dựng chú giải…) mà KHÔNG hiểu cú pháp `var()` lẫn
 * `oklch()` — phân tích thất bại thì nó âm thầm rơi về đen, đúng triệu
 * chứng "donut đen hết" dù bảng màu và token vẫn đúng.
 *
 * Khắc bằng canvas: nhờ CHÍNH TRÌNH DUYỆT (luôn hiểu oklch/var) phân giải
 * màu ra rồi đọc lại từng pixel — kết quả là chuỗi `rgba(...)` thuần, thư
 * viện màu nào cũng đọc được, không phụ thuộc oklch có được hỗ trợ ở tầng
 * nào hay không.
 */
const resolveCssColorToRgba = (cssColor: string): string | null => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
}

/** Đọc lại 3 token màu mỗi khi theme đổi (`data-theme` hoặc
 * `prefers-color-scheme` hệ thống) — tokens.css định nghĩa lại cả 3 giá trị
 * cho dark mode, đọc một lần lúc mount thôi sẽ đứng yên ở màu sai nếu người
 * dùng đổi theme mà không tải lại trang. */
const useResolvedDonutColors = (): Readonly<Record<string, string>> => {
  const [resolved, setResolved] = useState<Readonly<Record<string, string>>>({})

  useEffect(() => {
    const resolveAll = () => {
      const computed = getComputedStyle(document.documentElement)
      const next: Record<string, string> = {}
      for (const token of STATS_DONUT_COLOR_TOKENS) {
        const raw = computed.getPropertyValue(token).trim()
        if (!raw) continue
        const rgba = resolveCssColorToRgba(raw)
        if (rgba) next[token] = rgba
      }
      setResolved(next)
    }

    resolveAll()

    const observer = new MutationObserver(resolveAll)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', resolveAll)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', resolveAll)
    }
  }, [])

  return resolved
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
export interface StatsDonutProps {
  readonly slices: readonly StatsDonutSlice[]
  readonly totalLabel: string
  readonly emptyTitle: string
  readonly emptyDescription: string
}

export function StatsDonut({ slices, totalLabel, emptyTitle, emptyDescription }: StatsDonutProps) {
  const resolvedColors = useResolvedDonutColors()
  const fillFor = (token: string): string => resolvedColors[token] ?? `var(${token})`

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
                <Cell key={slice.key} fill={fillFor(slice.colorToken)} />
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
                style={{ background: fillFor(slice.colorToken) }}
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
