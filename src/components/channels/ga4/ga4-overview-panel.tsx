'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Callout } from '@/components/ui/feedback'
import { ToggleChip } from '@/components/ui/toggle-chip'
import type { Ga4Overview, Ga4OverviewMetric } from '@/lib/providers/google-explore'
import { formatCompact, formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/format'

/* Hallmark · component: ga4-overview-panel · theme: studied-DNA (Ink & Signal)
 *
 * Tab "Chi tiết" của GA4 — người dùng cần theo dõi TẤT CẢ thông tin của một
 * nền tảng, không phải một tập con cố định ai đó chọn sẵn hộ họ. Bật sẵn cả
 * 17 chỉ số, cho tắt bớt bằng chip thay vì một ô tìm kiếm riêng — 17 mục vừa
 * đủ để lướt mắt chọn trực tiếp, không cần gõ tìm mới thấy.
 */

interface TileConfig {
  readonly key: Ga4OverviewMetric
  readonly label: string
  readonly format: (value: number | null, currency: string) => string
}

const formatDurationSec = (seconds: number | null): string => {
  if (seconds === null) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const remaining = total % 60
  return minutes > 0 ? `${minutes}p ${remaining}s` : `${remaining}s`
}

const formatDurationHours = (seconds: number | null): string => {
  if (seconds === null) return '—'
  const hours = seconds / 3600
  return hours >= 1
    ? `${formatNumber(hours, { maximumFractionDigits: 1 })} giờ`
    : formatDurationSec(seconds)
}

const TILES: readonly TileConfig[] = [
  { key: 'activeUsers', label: 'Người dùng', format: formatCompact },
  { key: 'totalUsers', label: 'Tổng người dùng', format: formatCompact },
  { key: 'newUsers', label: 'Người dùng mới', format: formatCompact },
  { key: 'sessions', label: 'Sessions', format: formatCompact },
  {
    key: 'sessionsPerUser',
    label: 'Sessions/người dùng',
    format: (v) => formatNumber(v, { maximumFractionDigits: 2 }),
  },
  { key: 'engagedSessions', label: 'Sessions có tương tác', format: formatCompact },
  { key: 'engagementRate', label: 'Tỷ lệ tương tác', format: (v) => formatPercent(v) },
  { key: 'averageSessionDuration', label: 'Thời lượng TB/session', format: formatDurationSec },
  { key: 'userEngagementDuration', label: 'Tổng thời gian tương tác', format: formatDurationHours },
  { key: 'screenPageViews', label: 'Lượt xem trang', format: formatCompact },
  {
    key: 'screenPageViewsPerSession',
    label: 'Lượt xem/session',
    format: (v) => formatNumber(v, { maximumFractionDigits: 2 }),
  },
  {
    key: 'screenPageViewsPerUser',
    label: 'Lượt xem/người dùng',
    format: (v) => formatNumber(v, { maximumFractionDigits: 2 }),
  },
  { key: 'eventCount', label: 'Số sự kiện', format: formatCompact },
  {
    key: 'eventCountPerUser',
    label: 'Sự kiện/người dùng',
    format: (v) => formatNumber(v, { maximumFractionDigits: 2 }),
  },
  { key: 'conversions', label: 'Chuyển đổi', format: (v) => formatNumber(v, { maximumFractionDigits: 1 }) },
  { key: 'bounceRate', label: 'Tỷ lệ thoát', format: (v) => formatPercent(v) },
  {
    key: 'totalRevenue',
    label: 'Doanh thu',
    format: (v, currency) => formatCurrencyCompact(v === null ? null : v * 1_000_000, currency),
  },
]

const ALL_METRIC_KEYS: readonly Ga4OverviewMetric[] = TILES.map((tile) => tile.key)

export function Ga4OverviewPanel({
  overview,
  error,
  currency,
}: {
  readonly overview: Ga4Overview | null
  readonly error: string | null
  readonly currency: string
}) {
  const [visibleMetrics, setVisibleMetrics] = useState<readonly Ga4OverviewMetric[]>(ALL_METRIC_KEYS)

  if (!overview) {
    return (
      <Callout
        tone="critical"
        icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
        title="Không lấy được số liệu tổng từ GA4"
      >
        <p className="rounded-[var(--radius-sm)] bg-[var(--color-paper-2)] p-2 font-mono text-[length:var(--text-2xs)] break-all text-[var(--color-ink-3)]">
          {error ?? 'Không rõ lý do — thử tải lại trang.'}
        </p>
      </Callout>
    )
  }

  const toggle = (key: Ga4OverviewMetric) =>
    setVisibleMetrics((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )

  const visibleTiles = TILES.filter((tile) => visibleMetrics.includes(tile.key))

  return (
    <div className="flex flex-col gap-4">
      <Card tone="inset" className="p-4">
        <p className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
          Chỉ số hiển thị
        </p>
        <div className="flex flex-wrap gap-2">
          {TILES.map((tile) => (
            <ToggleChip
              key={tile.key}
              label={tile.label}
              active={visibleMetrics.includes(tile.key)}
              onToggle={() => toggle(tile.key)}
            />
          ))}
        </div>
      </Card>

      {visibleTiles.length === 0 ? (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
          Chưa chọn chỉ số nào — bật ít nhất một cái ở trên.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleTiles.map((tile) => (
            <div
              key={tile.key}
              className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-4"
            >
              <p className="text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
                {tile.label}
              </p>
              <p
                data-numeric
                className="truncate text-[length:var(--text-2xl)] leading-[var(--leading-tight)] font-semibold text-[var(--color-ink)]"
              >
                {tile.format(overview[tile.key], currency)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
