'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Callout } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { ToggleChip } from '@/components/ui/toggle-chip'
import {
  DEFAULT_GA4_EXPLORE_DIMENSION,
  GA4_EXPLORE_DIMENSIONS,
  GA4_EXPLORE_DIMENSION_LABELS,
  type Ga4ExploreDimension,
} from '@/lib/domain/explore-dimension'
import { fetchGa4MetricBreakdownAction, type Ga4MetricBreakdownState } from '@/lib/actions/ga4-metric-breakdown'
import type { Ga4Overview, Ga4OverviewMetric } from '@/lib/providers/google-explore'
import { formatCompact, formatCurrencyCompact, formatNumber, formatPercent } from '@/lib/format'

/* Hallmark · component: ga4-overview-panel · theme: studied-DNA (Ink & Signal)
 *
 * Tab "Chi tiết" của GA4 — người dùng cần theo dõi TẤT CẢ thông tin của một
 * nền tảng, không phải một tập con cố định ai đó chọn sẵn hộ họ. Bật sẵn cả
 * 17 chỉ số, cho tắt bớt bằng chip thay vì một ô tìm kiếm riêng — 17 mục vừa
 * đủ để lướt mắt chọn trực tiếp, không cần gõ tìm mới thấy.
 *
 * Bấm vào MỘT ô là drill xuống — xem chỉ số đó phân rã theo Trang/Kênh/Thiết
 * bị/Quốc gia, tới 1000 hàng, có phân trang. Đây là "chi tiết của chi tiết"
 * người dùng yêu cầu: tổng số ở ô chỉ nói ĐƯỢC BAO NHIÊU, drill-down nói RÕ
 * TỪ ĐÂU. Chỉ MỘT ô mở cùng lúc (accordion) — mở nhiều ô một lúc dễ biến
 * trang thành một mớ bảng dài không ai đọc hết.
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

const BREAKDOWN_PAGE_SIZE = 50

export function Ga4OverviewPanel({
  overview,
  error,
  currency,
  connectionId,
  siteId,
  startDate,
  endDate,
}: {
  readonly overview: Ga4Overview | null
  readonly error: string | null
  readonly currency: string
  readonly connectionId: string
  readonly siteId: string
  readonly startDate: string
  readonly endDate: string
}) {
  const [visibleMetrics, setVisibleMetrics] = useState<readonly Ga4OverviewMetric[]>(ALL_METRIC_KEYS)
  const [expandedMetric, setExpandedMetric] = useState<Ga4OverviewMetric | null>(null)
  const [breakdownDimension, setBreakdownDimension] =
    useState<Ga4ExploreDimension>(DEFAULT_GA4_EXPLORE_DIMENSION)
  const [breakdownState, setBreakdownState] = useState<Ga4MetricBreakdownState | null>(null)
  const [breakdownPage, setBreakdownPage] = useState(1)
  const [pending, startTransition] = useTransition()

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

  const loadBreakdown = (metric: Ga4OverviewMetric, dimension: Ga4ExploreDimension) => {
    setBreakdownState(null)
    startTransition(async () => {
      const result = await fetchGa4MetricBreakdownAction({
        connectionId,
        siteId,
        metric,
        dimension,
        startDate,
        endDate,
      })
      setBreakdownState(result)
    })
  }

  const toggleMetricVisibility = (key: Ga4OverviewMetric) =>
    setVisibleMetrics((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    )

  const openTile = (metric: Ga4OverviewMetric) => {
    if (expandedMetric === metric) {
      setExpandedMetric(null)
      return
    }
    setExpandedMetric(metric)
    setBreakdownPage(1)
    loadBreakdown(metric, breakdownDimension)
  }

  const changeBreakdownDimension = (dimension: Ga4ExploreDimension) => {
    setBreakdownDimension(dimension)
    setBreakdownPage(1)
    if (expandedMetric) loadBreakdown(expandedMetric, dimension)
  }

  const visibleTiles = TILES.filter((tile) => visibleMetrics.includes(tile.key))
  const expandedTile = TILES.find((tile) => tile.key === expandedMetric) ?? null

  const breakdownRows = breakdownState?.rows ?? []
  const breakdownTotalPages = Math.max(1, Math.ceil(breakdownRows.length / BREAKDOWN_PAGE_SIZE))
  const breakdownCurrentPage = Math.min(breakdownPage, breakdownTotalPages)
  const pagedBreakdownRows = breakdownRows.slice(
    (breakdownCurrentPage - 1) * BREAKDOWN_PAGE_SIZE,
    breakdownCurrentPage * BREAKDOWN_PAGE_SIZE,
  )

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
              onToggle={() => toggleMetricVisibility(tile.key)}
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
            <button
              key={tile.key}
              type="button"
              onClick={() => openTile(tile.key)}
              aria-expanded={expandedMetric === tile.key}
              className={cn(
                'flex flex-col gap-1.5 rounded-[var(--radius-lg)] border p-4 text-left',
                'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
                expandedMetric === tile.key
                  ? 'border-[var(--color-accent)] bg-[var(--color-paper)]'
                  : 'border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-rule-strong)]',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
                  {tile.label}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0 text-[var(--color-ink-3)] transition-transform duration-[var(--dur-fast)]',
                    expandedMetric === tile.key ? 'rotate-180' : '',
                  )}
                />
              </span>
              <span
                data-numeric
                className="truncate text-[length:var(--text-2xl)] leading-[var(--leading-tight)] font-semibold text-[var(--color-ink)]"
              >
                {tile.format(overview[tile.key], currency)}
              </span>
            </button>
          ))}
        </div>
      )}

      {expandedTile ? (
        <Card tone="inset" className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              {expandedTile.label} theo
            </p>
            <div className="flex flex-wrap gap-2">
              {GA4_EXPLORE_DIMENSIONS.map((dimension) => (
                <ToggleChip
                  key={dimension}
                  label={GA4_EXPLORE_DIMENSION_LABELS[dimension]}
                  active={breakdownDimension === dimension}
                  onToggle={() => changeBreakdownDimension(dimension)}
                />
              ))}
            </div>
          </div>

          {pending ? (
            <p className="py-6 text-center text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
              Đang tải…
            </p>
          ) : breakdownState?.error ? (
            <Callout
              tone="critical"
              icon={<AlertTriangle aria-hidden className="size-5 text-[var(--color-negative)]" />}
              title="Không lấy được phân rã từ GA4"
            >
              <p className="rounded-[var(--radius-sm)] bg-[var(--color-paper-2)] p-2 font-mono text-[length:var(--text-2xs)] break-all text-[var(--color-ink-3)]">
                {breakdownState.error}
              </p>
            </Callout>
          ) : breakdownRows.length === 0 ? (
            <p className="py-6 text-center text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
              Không có dữ liệu cho khoảng ngày này.
            </p>
          ) : (
            <>
              <TableScroller aria-label={`${expandedTile.label} theo ${GA4_EXPLORE_DIMENSION_LABELS[breakdownDimension]}`}>
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>{GA4_EXPLORE_DIMENSION_LABELS[breakdownDimension]}</TH>
                      <TH numeric>{expandedTile.label}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pagedBreakdownRows.map((row) => (
                      <TR key={row.label}>
                        <TD className="max-w-[24rem]">
                          <span className="block truncate" title={row.label}>
                            {row.label}
                          </span>
                        </TD>
                        <TD numeric>{expandedTile.format(row.value, currency)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableScroller>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge tone="outline">{breakdownRows.length} dòng</Badge>
                {breakdownTotalPages > 1 ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBreakdownPage((current) => Math.max(1, current - 1))}
                      disabled={breakdownCurrentPage === 1}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-rule-strong)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
                    >
                      Trước
                    </button>
                    <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                      Trang {breakdownCurrentPage}/{breakdownTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBreakdownPage((current) => Math.min(breakdownTotalPages, current + 1))}
                      disabled={breakdownCurrentPage === breakdownTotalPages}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-rule-strong)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
                    >
                      Sau
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </Card>
      ) : null}
    </div>
  )
}
