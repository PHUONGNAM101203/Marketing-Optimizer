import type { ReactNode } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Khoá mờ một MẢNH nhỏ (một ô KPI, một biểu đồ) — không phải cả trang.
 *
 * Dùng khi Site đã có kết nối thật (trang không còn trống), nhưng mảnh cụ thể
 * này cần một LOẠI nguồn khác chưa có — vd. chi phí quảng cáo, khi Site chỉ
 * mới nối GA4/Search Console. Nhẹ hơn `LockedPreview`: không có thẻ CTA to,
 * chỉ một huy hiệu nhỏ đủ nói "cần thêm nguồn" mà không lặp lại lời chào mời
 * đã có ở khoá toàn trang.
 */
export interface InlineLockedProps {
  readonly siteId: string
  readonly label: string
  readonly children: ReactNode
  readonly className?: string
}

export function InlineLocked({ siteId, label, children, className }: InlineLockedProps) {
  return (
    <div className={cn('relative isolate', className)}>
      <div
        aria-hidden
        inert
        className="pointer-events-none select-none blur-[7px] saturate-[0.55] opacity-45"
      >
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center p-3">
        <Link
          href={`/${siteId}/connections`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[var(--radius-full)]',
            'border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-1.5',
            'text-[length:var(--text-xs)] font-medium text-[var(--color-ink-2)]',
            'hover:text-[var(--color-ink)]',
          )}
          style={{ boxShadow: 'var(--shadow-lift)' }}
        >
          <Lock aria-hidden className="size-3" />
          {label}
        </Link>
      </div>
    </div>
  )
}
