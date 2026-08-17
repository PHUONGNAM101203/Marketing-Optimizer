'use client'

import dynamic from 'next/dynamic'
import type { TrendChartProps } from './trend-chart'

/**
 * `TrendChart` kéo theo `recharts` (~380 KB chunk đã đo thật, 8/2026) —
 * mọi nơi dùng nó đều là Server Component (Overview, chi tiết kênh), nên
 * `dynamic(..., { ssr: false })` PHẢI đặt trong một file 'use client' riêng
 * như thế này rồi cho Server Component import LẠI từ đây — Next.js không
 * cho phép `ssr: false` khai trực tiếp bên trong Server Component. Tách chunk
 * này ra khỏi phần JS bắt buộc cho lần vẽ đầu, tải sau khi trang đã tương tác
 * được thay vì chặn tới lúc xong.
 */
export const TrendChart = dynamic<TrendChartProps>(
  () => import('./trend-chart').then((mod) => mod.TrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--color-paper-3)]" />
    ),
  },
)

export type { TrendSeries, TrendPoint, ValueFormat } from './trend-chart'
