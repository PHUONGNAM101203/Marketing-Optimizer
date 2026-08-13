import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: page-header · theme: studied-DNA (Ink & Signal)
 *
 * Tiêu đề trang xuống một nấc so với bản gốc (52px → 44px). Ở 52px với chữ đậm
 * 800, dấu tiếng Việt chồng tầng (ữ, ộ, ế) bắt đầu chạm cạnh dòng trên. Đây
 * chính là chỗ font phổ thông vỡ và là lý do chọn Be Vietnam Pro.
 */

export interface PageHeaderProps {
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
  readonly meta?: ReactNode
  readonly className?: string
}

export function PageHeader({
  title,
  description,
  action,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[length:var(--text-display)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-[length:var(--text-base)] text-[var(--color-ink-2)]">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

/** Vùng nội dung chuẩn của mọi trang — giữ nhịp dọc nhất quán. */
export function PageShell({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[var(--canvas-max)] px-6 py-7',
        'flex flex-col gap-8',
        className,
      )}
    >
      {children}
    </div>
  )
}
