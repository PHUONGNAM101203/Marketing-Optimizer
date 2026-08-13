'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
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

/* Trình dựng báo cáo.
 *
 * Cột được chọn ở phía client, còn dữ liệu đã tính sẵn ở server — nên không có
 * hàm nào phải vượt ranh giới RSC. Đây cũng là lý do `format` ở đây là một
 * KHOÁ chứ không phải hàm.
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

export interface ReportBuilderProps {
  readonly rows: readonly ReportRow[]
  readonly groups: readonly string[]
  readonly currency: string
}

export function ReportBuilder({ rows, groups, currency }: ReportBuilderProps) {
  const [selectedMetrics, setSelectedMetrics] =
    useState<readonly MetricKey[]>(DEFAULT_METRICS)
  const [activeGroups, setActiveGroups] = useState<readonly string[]>(groups)
  const [sortBy, setSortBy] = useState<MetricKey>('costMicros')

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
                {visibleRows.map((row) => (
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

      <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
        <Badge tone="outline">{visibleRows.length} dòng</Badge>{' '}
        <span className="ml-2">
          Bấm vào tiêu đề cột số để đổi cột sắp xếp.
        </span>
      </p>
    </div>
  )
}

function ToggleChip({
  label,
  active,
  onToggle,
}: {
  readonly label: string
  readonly active: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-3 py-1.5',
        'text-[length:var(--text-xs)] font-medium whitespace-nowrap',
        'border transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
          : 'border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]',
      )}
    >
      {active ? <Check aria-hidden className="size-3" /> : null}
      {label}
    </button>
  )
}
