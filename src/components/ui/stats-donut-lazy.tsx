'use client'

import dynamic from 'next/dynamic'
import type { StatsDonutProps } from './stats-donut'

/** Cùng lý do `trend-chart-lazy.tsx` — `StatsDonut` kéo theo `recharts`,
 * dùng từ Server Component (Meta/Video stats summary), `ssr: false` phải
 * khai ở một file 'use client' riêng. */
export const StatsDonut = dynamic<StatsDonutProps>(
  () => import('./stats-donut').then((mod) => mod.StatsDonut),
  {
    ssr: false,
    loading: () => (
      <div className="h-[220px] w-full animate-pulse rounded-[var(--radius-md)] bg-[var(--color-paper-3)]" />
    ),
  },
)
