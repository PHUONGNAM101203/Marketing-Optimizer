'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { StatRow, StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { ToggleChip } from '@/components/ui/toggle-chip'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { formatCompact, formatPercent } from '@/lib/format'
import type { GscExplore, GscOverview } from '@/lib/providers/google-explore'

/* Hallmark · component: gsc-overview-panel · theme: studied-DNA (Ink & Signal)
 *
 * Tab "Chi tiết" của Search Console — cùng tinh thần `Ga4OverviewPanel`
 * nhưng khác cách "lấy hết dữ liệu": GA4 có 17 chỉ số cần chọn lọc hiển thị,
 * còn GSC chỉ có 4 chỉ số CỐ ĐỊNH (clicks/impressions/ctr/position) đi kèm
 * MỌI hạng mục — nên phần "đầy đủ" ở đây là mở rộng SỐ HẠNG MỤC (6, gồm 2
 * hạng mục mới `searchType`/`searchAppearance` trước đây chưa khai thác),
 * không phải chọn cột. `data` đã fetch sẵn tới 1000 dòng/hạng mục từ
 * `site-channel-detail.ts` — đổi hạng mục hay trang chỉ cắt lại mảng đã có,
 * không gọi lại GSC.
 */

const PAGE_SIZE = 50

const DIMENSION_OPTIONS = [
  { id: 'query', label: 'Truy vấn' },
  { id: 'page', label: 'Trang' },
  { id: 'country', label: 'Quốc gia' },
  { id: 'device', label: 'Thiết bị' },
  { id: 'searchType', label: 'Loại tìm kiếm' },
  { id: 'appearance', label: 'Loại hiển thị' },
] as const
type DimensionId = (typeof DIMENSION_OPTIONS)[number]['id']

interface Row {
  readonly label: string
  readonly clicks: number
  readonly impressions: number
  readonly ctr: number
  readonly position: number
}

const rowsFor = (data: GscExplore, dimension: DimensionId): readonly Row[] => {
  switch (dimension) {
    case 'query':
      return data.topQueries.map((row) => ({ label: row.query, ...row }))
    case 'page':
      return data.topPages.map((row) => ({ label: row.page, ...row }))
    case 'country':
      return data.countries.map((row) => ({ label: row.country, ...row }))
    case 'device':
      return data.devices.map((row) => ({ label: row.device, ...row }))
    case 'searchType':
      return data.searchTypes.map((row) => ({ label: row.searchType, ...row }))
    case 'appearance':
      return data.appearances.map((row) => ({ label: row.appearance, ...row }))
  }
}

export interface GscOverviewPanelProps {
  readonly data: GscExplore
  readonly overview: GscOverview | null
  readonly overviewError: string | null
}

export function GscOverviewPanel({ data, overview, overviewError }: GscOverviewPanelProps) {
  const [dimension, setDimension] = useState<DimensionId>('query')
  const [page, setPage] = useState(1)

  const rows = useMemo(() => rowsFor(data, dimension), [data, dimension])
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const activeLabel = DIMENSION_OPTIONS.find((option) => option.id === dimension)?.label ?? ''

  return (
    <div className="flex flex-col gap-5">
      {overviewError ? (
        <Callout tone="critical" title="Không lấy được số liệu tổng">
          <p className="font-mono text-[length:var(--text-xs)] break-all">{overviewError}</p>
        </Callout>
      ) : null}

      {overview ? (
        <StatRow>
          <StatTile label="Lượt nhấp" value={formatCompact(overview.clicks)} metric="clicks" deltaPct={null} />
          <StatTile
            label="Lượt hiển thị"
            value={formatCompact(overview.impressions)}
            metric="impressions"
            deltaPct={null}
          />
          <StatTile label="CTR" value={formatPercent(overview.ctr, 2)} metric="ctr" deltaPct={null} />
          <StatTile
            label="Vị trí trung bình"
            value={overview.position.toFixed(1)}
            metric="ctr"
            deltaPct={null}
          />
        </StatRow>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
          Hạng mục
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIMENSION_OPTIONS.map((option) => (
            <ToggleChip
              key={option.id}
              label={option.label}
              active={dimension === option.id}
              onToggle={() => {
                setDimension(option.id)
                setPage(1)
              }}
            />
          ))}
        </div>
      </fieldset>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu" description="Chưa có gì để hiện trong khoảng ngày này." />
        ) : (
          <>
            <TableScroller aria-label={`Chi tiết Search Console theo ${activeLabel}`}>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>{activeLabel}</TH>
                    <TH numeric>Lượt nhấp</TH>
                    <TH numeric>Hiển thị</TH>
                    <TH numeric>CTR</TH>
                    <TH numeric>Vị trí</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedRows.map((row, index) => (
                    <TR key={`${row.label}-${index}`}>
                      <TD className="max-w-[24rem]">
                        <span className="block truncate" title={row.label}>
                          {row.label}
                        </span>
                      </TD>
                      <TD numeric>{formatCompact(row.clicks)}</TD>
                      <TD numeric>{formatCompact(row.impressions)}</TD>
                      <TD numeric>{formatPercent(row.ctr, 2)}</TD>
                      <TD numeric>{row.position.toFixed(1)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroller>

            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] px-4 py-3">
                <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  <Badge tone="outline">{rows.length} dòng</Badge>
                </p>
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
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}
