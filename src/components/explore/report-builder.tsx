'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { ToggleChip } from '@/components/ui/toggle-chip'
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroller,
} from '@/components/ui/table'
import {
  formatCompact,
  formatCurrencyCompact,
  formatMultiplier,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import { colorTokenOf } from '@/mock/metrics'
import type { ExploreSource } from '@/lib/data/site-explore'
import {
  DEFAULT_GA4_EXPLORE_DIMENSION,
  DEFAULT_GSC_EXPLORE_DIMENSION,
  GA4_EXPLORE_DIMENSIONS,
  GA4_EXPLORE_DIMENSION_LABELS,
  GSC_EXPLORE_DIMENSIONS,
  GSC_EXPLORE_DIMENSION_LABELS,
  type Ga4ExploreDimension,
  type GscExploreDimension,
} from '@/lib/domain/explore-dimension'
import {
  DEFAULT_EXPLORE_ROW_LIMIT,
  EXPLORE_ROW_LIMITS,
  type ExploreRowLimit,
} from '@/lib/domain/explore-row-limit'

/* Trình dựng báo cáo.
 *
 * TẤT CẢ bộ lọc (số hàng, hạng mục GA4/GSC, kênh, chỉ số, sắp xếp, trang) xử
 * lý HOÀN TOÀN ở client bằng `useState`/`useMemo` — không một cú bấm nào gọi
 * lại server. `source` đã mang sẵn TOÀN BỘ breakdown (tới 1000 dòng mỗi
 * nền tảng, mọi hạng mục) từ một lượt fetch DUY NHẤT lúc tải trang (xem
 * `getExploreSource` trong `site-explore.ts`) — đổi số hàng/hạng mục chỉ là
 * cắt lại đúng mảng đã có sẵn trong bộ nhớ, không phải gọi GA4/GSC/YouTube
 * thêm lần nào. Trước đây mỗi lượt đổi là một điều hướng Link mới → gọi lại
 * API thật, chậm rõ rệt vì phải chờ Google trả lời.
 */

export interface ReportRow {
  readonly key: string
  readonly dimension: string
  readonly group: string
  readonly colorToken: string
  readonly impressions: number | null
  readonly clicks: number | null
  readonly costMicros: number | null
  readonly conversions: number | null
  readonly ctr: number | null
  readonly cpaMicros: number | null
  readonly roas: number | null
}

type MetricKey = Exclude<keyof ReportRow, 'key' | 'dimension' | 'group' | 'colorToken'>

type Formatter = 'compact' | 'number' | 'currency' | 'percent' | 'multiplier'

interface MetricColumn {
  readonly key: MetricKey
  readonly label: string
  readonly formatter: Formatter
}

const COLUMNS: readonly MetricColumn[] = [
  { key: 'impressions', label: 'Hiển thị', formatter: 'compact' },
  { key: 'clicks', label: 'Lượt nhấp', formatter: 'compact' },
  { key: 'ctr', label: 'CTR', formatter: 'percent' },
  { key: 'costMicros', label: 'Chi phí', formatter: 'currency' },
  { key: 'conversions', label: 'Chuyển đổi', formatter: 'number' },
  { key: 'cpaMicros', label: 'CPA', formatter: 'currency' },
  { key: 'roas', label: 'ROAS', formatter: 'multiplier' },
]

const DEFAULT_METRICS: readonly MetricKey[] = [
  'impressions',
  'clicks',
  'ctr',
  'costMicros',
  'conversions',
  'cpaMicros',
  'roas',
]

/** `impressions` đứng thay cho "lượt xem/sessions" của GA4/YouTube — không
 * có cột riêng cho views trong `ReportRow` (schema đó vốn dành cho ads), và
 * "được nhìn thấy bao nhiêu lần" là đúng bản chất impressions diễn tả. */
const buildExploreRows = (
  source: ExploreSource,
  rowLimit: number,
  ga4Dimension: Ga4ExploreDimension,
  gscDimension: GscExploreDimension,
): readonly ReportRow[] => {
  const rows: ReportRow[] = []

  if (source.ga4) {
    const ga4Rows: readonly { readonly label: string; readonly value: number }[] =
      ga4Dimension === 'channel'
        ? source.ga4.channels.map((row) => ({ label: row.channel, value: row.sessions }))
        : ga4Dimension === 'device'
          ? source.ga4.devices.map((row) => ({ label: row.device, value: row.sessions }))
          : source.ga4.topPages.map((row) => ({ label: row.path, value: row.views }))
    rows.push(
      ...ga4Rows.slice(0, rowLimit).map(
        (row): ReportRow => ({
          key: `ga4:${ga4Dimension}:${row.label}`,
          dimension: row.label,
          group: 'GA4',
          colorToken: colorTokenOf('ga4'),
          impressions: row.value,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
        }),
      ),
    )
  }

  if (source.gsc) {
    // Chỉ Truy vấn/Trang có sẵn impressions+CTR — Quốc gia/Thiết bị của
    // Search Console chỉ trả về clicks (xem `GscExplore` trong
    // `google-explore.ts`), nên hai cột kia hợp lệ là `null`, không phải
    // thiếu sót.
    const gscRows: readonly {
      readonly label: string
      readonly clicks: number
      readonly impressions: number | null
    }[] =
      gscDimension === 'page'
        ? source.gsc.topPages.map((row) => ({ label: row.page, clicks: row.clicks, impressions: row.impressions }))
        : gscDimension === 'country'
          ? source.gsc.countries.map((row) => ({ label: row.country, clicks: row.clicks, impressions: null }))
          : gscDimension === 'device'
            ? source.gsc.devices.map((row) => ({ label: row.device, clicks: row.clicks, impressions: null }))
            : source.gsc.topQueries.map((row) => ({ label: row.query, clicks: row.clicks, impressions: row.impressions }))
    rows.push(
      ...gscRows.slice(0, rowLimit).map(
        (row): ReportRow => ({
          key: `gsc:${gscDimension}:${row.label}`,
          dimension: row.label,
          group: 'Search Console',
          colorToken: colorTokenOf('gsc'),
          impressions: row.impressions,
          clicks: row.clicks,
          costMicros: null,
          conversions: null,
          ctr: row.impressions && row.impressions > 0 ? row.clicks / row.impressions : null,
          cpaMicros: null,
          roas: null,
        }),
      ),
    )
  }

  if (source.youtube) {
    rows.push(
      ...source.youtube.topVideos.slice(0, rowLimit).map(
        (video): ReportRow => ({
          key: `youtube:${video.title}`,
          dimension: video.title,
          group: 'YouTube',
          colorToken: colorTokenOf('youtube'),
          impressions: video.views,
          clicks: null,
          costMicros: null,
          conversions: null,
          ctr: null,
          cpaMicros: null,
          roas: null,
        }),
      ),
    )
  }

  return rows
}

export interface ReportBuilderProps {
  readonly source: ExploreSource
  readonly currency: string
}

// Số hàng chọn được (10-1000) là số hàng CẮT RA từ dữ liệu đã fetch sẵn —
// hiển thị vẫn phân trang cố định 50 hàng/trang, không đổ hết 1000 hàng
// xuống một bảng dài vô tận.
const PAGE_SIZE = 50

export function ReportBuilder({ source, currency }: ReportBuilderProps) {
  const groups = useMemo(() => {
    const list: string[] = []
    if (source.ga4) list.push('GA4')
    if (source.gsc) list.push('Search Console')
    if (source.youtube) list.push('YouTube')
    return list
  }, [source])

  const [rowLimit, setRowLimit] = useState<ExploreRowLimit>(DEFAULT_EXPLORE_ROW_LIMIT)
  const [ga4Dimension, setGa4Dimension] = useState<Ga4ExploreDimension>(DEFAULT_GA4_EXPLORE_DIMENSION)
  const [gscDimension, setGscDimension] = useState<GscExploreDimension>(DEFAULT_GSC_EXPLORE_DIMENSION)
  const [selectedMetrics, setSelectedMetrics] =
    useState<readonly MetricKey[]>(DEFAULT_METRICS)
  const [activeGroups, setActiveGroups] = useState<readonly string[]>(groups)
  const [sortBy, setSortBy] = useState<MetricKey>('costMicros')
  const [page, setPage] = useState(1)

  const rows = useMemo(
    () => buildExploreRows(source, rowLimit, ga4Dimension, gscDimension),
    [source, rowLimit, ga4Dimension, gscDimension],
  )

  const visibleColumns = COLUMNS.filter((column) =>
    selectedMetrics.includes(column.key),
  )

  const visibleRows = useMemo(
    () =>
      rows
        .filter((row) => activeGroups.includes(row.group))
        .slice()
        .sort((a, b) => (b[sortBy] ?? -Infinity) - (a[sortBy] ?? -Infinity)),
    [rows, activeGroups, sortBy],
  )

  // Kẹp lại thay vì reset bằng `useEffect` — đổi bộ lọc/sắp xếp/số hàng làm
  // tập kết quả ngắn đi có thể khiến trang đang xem vượt quá tổng số trang
  // mới; kẹp về trang cuối còn hợp lệ, giống hệt cách `currentPage` ở phần
  // Merchant Center (`channel-detail-body.tsx`) tự xử lý cùng tình huống.
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value]

  const format = (value: number | null, formatter: Formatter): string => {
    switch (formatter) {
      case 'currency':
        return formatCurrencyCompact(value, currency)
      case 'percent':
        return formatPercent(value, 2)
      case 'multiplier':
        return formatMultiplier(value)
      case 'number':
        return formatNumber(value)
      default:
        return formatCompact(value)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card tone="inset" className="p-5">
        <fieldset className="mb-5">
          <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Số hàng mỗi nền tảng
          </legend>
          <div className="flex flex-wrap gap-2">
            {EXPLORE_ROW_LIMITS.map((limit) => (
              <ToggleChip
                key={limit}
                label={String(limit)}
                active={rowLimit === limit}
                onToggle={() => setRowLimit(limit)}
              />
            ))}
          </div>
        </fieldset>

        {source.ga4 ? (
          <fieldset className="mb-5">
            <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              GA4 theo
            </legend>
            <div className="flex flex-wrap gap-2">
              {GA4_EXPLORE_DIMENSIONS.map((dimension) => (
                <ToggleChip
                  key={dimension}
                  label={GA4_EXPLORE_DIMENSION_LABELS[dimension]}
                  active={ga4Dimension === dimension}
                  onToggle={() => setGa4Dimension(dimension)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        {source.gsc ? (
          <fieldset className="mb-5">
            <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
              Search Console theo
            </legend>
            <div className="flex flex-wrap gap-2">
              {GSC_EXPLORE_DIMENSIONS.map((dimension) => (
                <ToggleChip
                  key={dimension}
                  label={GSC_EXPLORE_DIMENSION_LABELS[dimension]}
                  active={gscDimension === dimension}
                  onToggle={() => setGscDimension(dimension)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="mb-5">
          <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Kênh
          </legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <ToggleChip
                key={group}
                label={group}
                active={activeGroups.includes(group)}
                onToggle={() => setActiveGroups(toggle(activeGroups, group))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Chỉ số
          </legend>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((column) => (
              <ToggleChip
                key={column.key}
                label={column.label}
                active={selectedMetrics.includes(column.key)}
                onToggle={() =>
                  setSelectedMetrics(toggle(selectedMetrics, column.key))
                }
              />
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="overflow-hidden">
        {visibleRows.length === 0 || visibleColumns.length === 0 ? (
          <EmptyState
            title="Chưa chọn gì để hiển thị"
            description="Bật ít nhất một kênh và một chỉ số ở trên."
          />
        ) : (
          <TableScroller aria-label="Kết quả báo cáo">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Hạng mục</TH>
                  <TH>Kênh</TH>
                  {visibleColumns.map((column) => (
                    <TH key={column.key} numeric>
                      <button
                        type="button"
                        onClick={() => setSortBy(column.key)}
                        className={cn(
                          'rounded-[var(--radius-xs)] uppercase',
                          'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                          sortBy === column.key
                            ? 'text-[var(--color-signal)]'
                            : 'hover:text-[var(--color-ink)]',
                        )}
                      >
                        {column.label}
                        {sortBy === column.key ? ' ↓' : ''}
                      </button>
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {pagedRows.map((row) => (
                  <TR key={row.key}>
                    <TD className="max-w-[20rem]">
                      <span className="block truncate" title={row.dimension}>
                        {row.dimension}
                      </span>
                    </TD>
                    <TD>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-[var(--radius-xs)]"
                          style={{ background: `var(${row.colorToken})` }}
                        />
                        <span className="truncate">{row.group}</span>
                      </span>
                    </TD>
                    {visibleColumns.map((column) => (
                      <TD key={column.key} numeric>
                        {format(row[column.key], column.formatter)}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableScroller>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          <Badge tone="outline">{visibleRows.length} dòng</Badge>{' '}
          <span className="ml-2">
            Bấm vào tiêu đề cột số để đổi cột sắp xếp.
          </span>
        </p>

        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
              className="rounded-[var(--radius-sm)] border border-[var(--color-rule-strong)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
            >
              Trước
            </button>
            <span className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              Trang {currentPage}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
              className="rounded-[var(--radius-sm)] border border-[var(--color-rule-strong)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:text-[var(--color-ink)] disabled:pointer-events-none disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
