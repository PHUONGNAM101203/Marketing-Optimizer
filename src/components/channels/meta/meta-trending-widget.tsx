'use client'

import { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact, formatNumber } from '@/lib/format'
import {
  hasEnoughHistory,
  type ContentGrowthSummary,
  type ContentTrendingWindows,
} from '@/lib/providers/content-trending-types'

const WINDOW_LABELS: Readonly<Record<keyof ContentTrendingWindows, string>> = {
  week: 'Tuần',
  month: 'Tháng',
  year: 'Năm',
}

const WINDOW_KEYS = Object.keys(WINDOW_LABELS) as readonly (keyof ContentTrendingWindows)[]

/* Hallmark · component: meta-trending-widget · theme: studied-DNA (Ink & Signal)
 *
 * Cùng thiết kế `TiktokTrendingWidget` (không tái dùng file đó — khác kiểu
 * dữ liệu, xem spec), đổi "views" thành TỔNG ENGAGEMENT (likes/reactions +
 * comments + shares) — Facebook/Instagram không có số liệu lượt xem cho bài
 * đăng, xem `content-trending-types.ts`.
 */
export function MetaTrendingWidget({
  trendingFast,
  earliestSnapshotAt,
}: {
  readonly trendingFast: ContentTrendingWindows
  readonly earliestSnapshotAt: string | null
}) {
  const [activeWindow, setActiveWindow] = useState<keyof ContentTrendingWindows>('week')

  // Backend không tự loại bài đăng đứng yên/giảm — yêu cầu gốc là "thay đổi
  // đáng tích cực", nên lọc ở đây, cùng TiktokTrendingWidget.
  const positiveEntries = trendingFast[activeWindow]
    .filter((entry) => (entry.growthPct ?? 0) > 0)
    .slice(0, 5)

  const enoughHistory = hasEnoughHistory(earliestSnapshotAt, activeWindow)

  return (
    <Card>
      <CardHeader
        title="Bài đăng có xu hướng tăng nhanh"
        action={
          <div className="flex gap-1">
            {WINDOW_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant={activeWindow === key ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveWindow(key)}
              >
                {WINDOW_LABELS[key]}
              </Button>
            ))}
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {positiveEntries.length === 0 ? (
          <EmptyState
            title={enoughHistory ? 'Chưa có bài đăng tăng trưởng tích cực' : 'Đang tích lũy dữ liệu'}
            description={
              enoughHistory
                ? `Chưa có bài đăng nào tăng trưởng tích cực trong ${WINDOW_LABELS[activeWindow].toLowerCase()} này.`
                : `Kết nối chưa đủ lịch sử cho khung ${WINDOW_LABELS[activeWindow].toLowerCase()} — quay lại sau khi đồng bộ thêm.`
            }
          />
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--color-rule)]">
            {positiveEntries.map((entry, index) => (
              <TrendingRow key={index} rank={index + 1} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}

function TrendingRow({ rank, entry }: { readonly rank: number; readonly entry: ContentGrowthSummary }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        data-numeric
        className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
      >
        {rank}
      </span>
      {entry.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.thumbnailUrl}
          alt=""
          className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
      )}
      <p className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]" title={entry.title}>
        {entry.title}
      </p>
      <div className="flex shrink-0 flex-col items-end">
        <span data-numeric className="text-[length:var(--text-sm)] font-semibold text-[var(--color-positive)]">
          +{formatNumber(Math.round((entry.growthPct ?? 0) * 100))}%
        </span>
        <span data-numeric className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
          +{formatCompact(entry.growthDelta)} tương tác
        </span>
      </div>
    </li>
  )
}
