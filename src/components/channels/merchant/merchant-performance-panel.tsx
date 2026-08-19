'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { StatRow, StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Callout } from '@/components/ui/feedback'
import { TBody, TD, TH, THead, TR, Table, TableScroller } from '@/components/ui/table'
import { formatCompact, formatPercent } from '@/lib/format'
import type { MerchantProductPerformance } from '@/lib/providers/google-merchant'

/* Hallmark · component: merchant-performance-panel · theme: studied-DNA (Ink & Signal)
 *
 * Tab "Hiệu suất" của Merchant Center — mảnh dữ liệu THẬT còn thiếu so với
 * GA4/GSC: trước đây trang chi tiết Merchant Center chỉ có TRẠNG THÁI duyệt
 * sản phẩm (approved/disapproved/pending), không có số liệu hiệu suất
 * (clicks/impressions/ctr/conversions) — xem `fetchMerchantPerformanceReport`
 * (Reports API, MCQL). Panel này KHÔNG thay thế phần trạng thái đã có
 * (`MerchantCenterSection`), chỉ bổ sung góc nhìn còn thiếu.
 */

const PAGE_SIZE = 50

export interface MerchantPerformancePanelProps {
  readonly rows: readonly MerchantProductPerformance[]
  readonly truncated: boolean
  readonly error: string | null
}

export function MerchantPerformancePanel({ rows, truncated, error }: MerchantPerformancePanelProps) {
  const [page, setPage] = useState(1)

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          clicks: sum.clicks + row.clicks,
          impressions: sum.impressions + row.impressions,
          conversions: sum.conversions + row.conversions,
        }),
        { clicks: 0, impressions: 0, conversions: 0 },
      ),
    [rows],
  )
  const totalCtr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Callout tone="critical" title="Không lấy được số liệu hiệu suất">
          <p className="font-mono text-[length:var(--text-xs)] break-all">{error}</p>
        </Callout>
      ) : null}

      {!error && rows.length === 0 ? (
        <Callout tone="signal" title="Chưa có số liệu hiệu suất">
          <p>
            Tài khoản Merchant Center có thể chưa đủ khối lượng dữ liệu để Google sinh báo cáo hiệu
            suất, hoặc chưa có lượt hiển thị/nhấp nào trong khoảng ngày này — không phải lỗi.
          </p>
        </Callout>
      ) : null}

      {rows.length > 0 ? (
        <>
          <StatRow>
            <StatTile label="Lượt nhấp" value={formatCompact(totals.clicks)} metric="clicks" deltaPct={null} />
            <StatTile
              label="Lượt hiển thị"
              value={formatCompact(totals.impressions)}
              metric="impressions"
              deltaPct={null}
            />
            <StatTile label="CTR" value={formatPercent(totalCtr, 2)} metric="ctr" deltaPct={null} />
            <StatTile
              label="Chuyển đổi"
              value={formatCompact(totals.conversions)}
              metric="conversions"
              deltaPct={null}
            />
          </StatRow>

          {truncated ? (
            <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              Danh mục lớn hơn số sản phẩm đọc được ở đây — số tổng trên chỉ tính trên phần đã đọc,
              không phải toàn bộ tài khoản.
            </p>
          ) : null}

          <Card className="overflow-hidden">
            <TableScroller aria-label="Hiệu suất theo sản phẩm">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Sản phẩm</TH>
                    <TH numeric>Lượt nhấp</TH>
                    <TH numeric>Hiển thị</TH>
                    <TH numeric>CTR</TH>
                    <TH numeric>Chuyển đổi</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedRows.map((row) => (
                    <TR key={row.productId}>
                      <TD className="max-w-[24rem]">
                        <span className="block truncate" title={row.title}>
                          {row.title}
                        </span>
                      </TD>
                      <TD numeric>{formatCompact(row.clicks)}</TD>
                      <TD numeric>{formatCompact(row.impressions)}</TD>
                      <TD numeric>{formatPercent(row.ctr, 2)}</TD>
                      <TD numeric>{formatCompact(row.conversions)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroller>

            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] px-4 py-3">
                <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  <Badge tone="outline">{rows.length} sản phẩm</Badge>
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
        </>
      ) : null}
    </div>
  )
}
