import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/* Hallmark · component: pagination · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled
 *
 * Điều hướng bằng link (không phải state phía client) — trang chi tiết kênh
 * là Server Component, giữ trang hiện tại trong URL để có thể chia sẻ/tải
 * lại đúng trang đang xem, giống bộ lọc trạng thái ở cùng trang.
 */
export interface PaginationProps {
  readonly page: number
  readonly totalPages: number
  readonly totalItems: number
  readonly pageSize: number
  readonly hrefFor: (page: number) => string
}

export function Pagination({ page, totalPages, totalItems, pageSize, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null

  const rangeStart = (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-rule)] px-4 py-3">
      <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
        {rangeStart}–{rangeEnd} trên {totalItems} · Trang {page}/{totalPages}
      </p>

      <div className="flex items-center gap-2">
        {page <= 1 ? (
          <Button variant="secondary" size="sm" disabled>
            <ChevronLeft aria-hidden className="size-3.5" />
            Trước
          </Button>
        ) : (
          <Button asChild variant="secondary" size="sm">
            <Link href={hrefFor(page - 1)}>
              <ChevronLeft aria-hidden className="size-3.5" />
              Trước
            </Link>
          </Button>
        )}

        {page >= totalPages ? (
          <Button variant="secondary" size="sm" disabled>
            Sau
            <ChevronRight aria-hidden className="size-3.5" />
          </Button>
        ) : (
          <Button asChild variant="secondary" size="sm">
            <Link href={hrefFor(page + 1)}>
              Sau
              <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
