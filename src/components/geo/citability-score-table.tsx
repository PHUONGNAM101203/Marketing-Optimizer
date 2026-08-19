'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { cn } from '@/lib/cn'
import { CITABILITY_AXIS_LABELS, type CitabilityAxes, type PageCitabilityScore } from '@/lib/domain/geo'

/** Site nhiều trang có thể có hàng trăm dòng — đổ hết xuống một bảng dài vô
 * tận vừa nặng DOM vừa khó dò. Toàn bộ danh sách đã có sẵn từ props (một lần
 * quét audit duy nhất, không có "tải thêm" gọi lại server), nên phân trang
 * xử lý HOÀN TOÀN ở client, giống đúng cách `ReportBuilder` (trang Khám phá)
 * đã làm cho tình huống tương tự. */
const PAGE_SIZE = 50

export interface CitabilityScoreTableProps {
  readonly pages: readonly PageCitabilityScore[]
}

export function CitabilityScoreTable({ pages }: CitabilityScoreTableProps) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(pages.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(
    () => pages.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [pages, currentPage],
  )

  return (
    <Card className="overflow-hidden">
      <TableScroller aria-label="Điểm citability từng trang">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Trang</TH>
              <TH numeric>Tổng</TH>
              {(Object.keys(CITABILITY_AXIS_LABELS) as (keyof CitabilityAxes)[]).map((axis) => (
                <TH key={axis} numeric>
                  {CITABILITY_AXIS_LABELS[axis]}
                </TH>
              ))}
              <TH numeric>Vấn đề</TH>
            </TR>
          </THead>
          <TBody>
            {pagedRows.map((row) => (
              <TR key={row.id}>
                <TD className="max-w-[20rem]">
                  <span className="block truncate font-medium" title={row.title}>
                    {row.title}
                  </span>
                  <span className="block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                    {row.url}
                  </span>
                </TD>
                <TD numeric>
                  <ScoreChip score={row.overall} />
                </TD>
                {(Object.keys(CITABILITY_AXIS_LABELS) as (keyof CitabilityAxes)[]).map((axis) => (
                  <TD key={axis} numeric>
                    <span
                      className={cn(
                        row.axes[axis] < 40 && 'text-[var(--color-negative)]',
                        row.axes[axis] >= 75 && 'text-[var(--color-positive)]',
                      )}
                    >
                      {row.axes[axis]}
                    </span>
                  </TD>
                ))}
                <TD numeric>{row.issues.length}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableScroller>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] px-4 py-3">
          <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            <Badge tone="outline">{pages.length} trang</Badge>
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
    </Card>
  )
}

function ScoreChip({ score }: { readonly score: number }) {
  const tone = score >= 75 ? 'positive' : score >= 50 ? 'caution' : 'negative'
  return <Badge tone={tone}>{score}</Badge>
}
