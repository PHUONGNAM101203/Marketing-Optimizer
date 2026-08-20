'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/cn'
import { EMPTY, formatCompact, formatDate, formatNumber, formatPercent } from '@/lib/format'

/* Hallmark · component: trend-chart · dataviz: reference palette
 *
 * Ba quy tắc của dataviz được thực thi ở đây, không phải tuỳ chọn:
 *
 * 1. MỘT TRỤC. Không bao giờ hai thang y. Muốn so chi phí với chuyển đổi thì
 *    dùng hai biểu đồ, không phải hai trục — trục kép làm hai đường cắt nhau ở
 *    chỗ vô nghĩa và người đọc luôn hiểu sai.
 * 2. TRỤC Y CÓ NHÃN. Bản Stitch tham chiếu vẽ biểu đồ doanh thu không có nhãn
 *    trục nào — đẹp, và không đọc được.
 * 3. LEGEND LUÔN CÓ khi từ 2 chuỗi trở lên. Ba slot màu trong bảng màu nằm dưới
 *    ngưỡng tương phản 3:1, nên nhãn là điều kiện bắt buộc để dùng chúng.
 */

export interface TrendSeries {
  readonly key: string
  readonly label: string
  readonly colorToken: string
  readonly kind?: 'line' | 'area'
}

export interface TrendPoint {
  readonly date: string
  readonly [key: string]: string | number | null
}

/**
 * Định dạng truyền bằng KHOÁ, không bằng hàm.
 * Server Component không truyền được function sang Client Component — hàm
 * không serialize qua ranh giới RSC. Khoá thì được, và nó cũng khiến số trên
 * trục, trong tooltip và trong bảng chắc chắn dùng chung một cách định dạng.
 */
export type ValueFormat = 'compact' | 'currency' | 'percent' | 'number'

export interface TrendChartProps {
  readonly data: readonly TrendPoint[]
  readonly series: readonly TrendSeries[]
  readonly format?: ValueFormat
  /** Bắt buộc khi `format` là 'currency'. Ký hiệu hiển thị sau con số. */
  readonly currencySymbol?: string
  readonly height?: number
  readonly className?: string
}

const buildFormatter = (
  format: ValueFormat,
  currencySymbol: string,
): ((value: number | null) => string) => {
  switch (format) {
    case 'currency':
      return (value) =>
        value === null ? EMPTY : `${formatCompact(value)} ${currencySymbol}`
    case 'percent':
      return (value) => formatPercent(value)
    case 'number':
      return (value) => formatNumber(value)
    default:
      return (value) => formatCompact(value)
  }
}

export function TrendChart({
  data,
  series,
  format = 'compact',
  currencySymbol = '₫',
  height = 260,
  className,
}: TrendChartProps) {
  const formatValue = buildFormatter(format, currencySymbol)

  if (data.length === 0 || series.length === 0) return null

  return (
    <figure className={cn('m-0', className)}>
      {series.length >= 2 ? (
        <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((entry) => (
            <span
              key={entry.key}
              className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[var(--radius-xs)]"
                style={{ background: `var(${entry.colorToken})` }}
              />
              {entry.label}
            </span>
          ))}
        </figcaption>
      ) : null}

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data as TrendPoint[]}
            // top/right nới hơn bản gốc (4/8px) — chừa chỗ cho tooltip hover
            // (không portal, chỉ là div nằm trong luồng) khi nó đẩy lên gần
            // mép trên ở biến thể `compact` (140px), và cho activeDot/nhãn
            // trục cuối cùng không dính sát mép phải ở chart hẹp trên mobile.
            margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
          >
            <defs>
              {series
                .filter((entry) => entry.kind === 'area')
                .map((entry) => (
                  <linearGradient
                    key={entry.key}
                    id={`fill-${entry.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={`var(${entry.colorToken})`}
                      stopOpacity={0.16}
                    />
                    <stop
                      offset="100%"
                      stopColor={`var(${entry.colorToken})`}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
            </defs>

            {/* Lưới lùi hẳn về sau: chỉ kẻ ngang, không kẻ dọc. */}
            <CartesianGrid
              vertical={false}
              stroke="var(--color-chart-grid)"
              strokeDasharray="0"
            />

            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-rule)' }}
              tick={{ fill: 'var(--color-ink-3)', fontSize: 12 }}
              minTickGap={28}
              dy={6}
            />

            <YAxis
              tickFormatter={(value: number) => formatValue(value)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-3)', fontSize: 12 }}
              width={72}
            />

            <Tooltip
              cursor={{ stroke: 'var(--color-rule-strong)', strokeWidth: 1 }}
              content={<TrendTooltip series={series} formatValue={formatValue} />}
            />

            {series.map((entry) =>
              entry.kind === 'area' ? (
                <Area
                  key={entry.key}
                  type="monotone"
                  dataKey={entry.key}
                  stroke={`var(${entry.colorToken})`}
                  strokeWidth={2}
                  fill={`url(#fill-${entry.key})`}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-paper)' }}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={entry.key}
                  type="monotone"
                  dataKey={entry.key}
                  stroke={`var(${entry.colorToken})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-paper)' }}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

interface TooltipPayloadEntry {
  readonly dataKey?: string | number
  readonly value?: number | null
}

function TrendTooltip({
  active,
  label,
  payload,
  series,
  formatValue,
}: {
  readonly active?: boolean
  readonly label?: string
  readonly payload?: readonly TooltipPayloadEntry[]
  readonly series: readonly TrendSeries[]
  readonly formatValue: (value: number | null) => string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div
      className={cn(
        'max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-[var(--color-rule)]',
        'bg-[var(--color-paper)] px-3 py-2',
        'shadow-[0_8px_28px_-12px_rgb(0_0_0/0.18)]',
      )}
    >
      <p className="mb-1.5 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
        {formatDate(label ?? null, {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
        })}
      </p>
      <ul className="space-y-1">
        {payload.map((entry) => {
          const definition = series.find((item) => item.key === entry.dataKey)
          if (!definition) return null

          return (
            <li
              key={definition.key}
              className="flex items-center gap-3 text-[length:var(--text-xs)]"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[var(--radius-xs)]"
                style={{ background: `var(${definition.colorToken})` }}
              />
              <span className="flex-1 text-[var(--color-ink-2)]">
                {definition.label}
              </span>
              <span data-numeric className="font-medium text-[var(--color-ink)]">
                {formatValue(entry.value ?? null)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
