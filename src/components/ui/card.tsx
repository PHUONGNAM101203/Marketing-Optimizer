import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: card · theme: studied-DNA (Ink & Signal)
 *
 * Bản Stitch tham chiếu bọc MỌI thứ trong thẻ trắng bo tròn trên nền xám, nên
 * không có phân cấp nào ngoài kích thước. Ở đây thẻ có ba mức: `plain` không
 * viền (mặc định cho khối chỉ cần khoảng cách), `bordered` có hairline, `inset`
 * chìm xuống. Phần lớn khối trên trang nên dùng `plain`.
 */

type CardTone = 'plain' | 'bordered' | 'inset' | 'critical' | 'signal'

const TONE_CLASS: Readonly<Record<CardTone, string>> = {
  plain: 'bg-transparent',
  bordered:
    'bg-[var(--color-paper)] border border-[var(--color-rule)] rounded-[var(--radius-lg)]',
  inset:
    'bg-[var(--color-paper-inset)] border border-[var(--color-rule)] rounded-[var(--radius-lg)]',
  critical:
    'bg-[var(--color-negative-soft)] border border-[var(--color-negative)]/25 rounded-[var(--radius-lg)]',
  signal:
    'bg-[var(--color-signal-soft)] border border-[var(--color-signal)]/20 rounded-[var(--radius-lg)]',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone?: CardTone
}

export function Card({ tone = 'bordered', className, ...props }: CardProps) {
  return <section className={cn(TONE_CLASS[tone], className)} {...props} />
}

// `title` của HTMLAttributes là string (thuộc tính tooltip của DOM) — ở đây nó
// là nội dung React, nên phải loại ra trước khi mở rộng.
export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly action?: ReactNode
  /** Đường kẻ ngăn cách — mặc định không có, bật khi thân là bảng hoặc danh sách. */
  readonly ruled?: boolean
}

export function CardHeader({
  title,
  description,
  action,
  ruled = false,
  className,
  ...props
}: CardHeaderProps) {
  return (
    <header
      className={cn(
        // `flex-wrap`: `action` (nhiều nút/badge, `shrink-0`) rơi xuống HÀNG
        // RIÊNG khi không đủ chỗ cạnh `title` — không có nó, hàng này ép
        // tràn viewport ở 320-375px thay vì xuống dòng (vd. header có badge +
        // select + 2 nút của trang Kế hoạch). Cùng cách `PageHeader` đã làm.
        'flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-4',
        ruled && 'border-b border-[var(--color-rule)]',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h3 className="text-[length:var(--text-xl)] leading-[var(--leading-snug)] font-semibold text-[var(--color-ink)]">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      className={cn(
        'flex items-center justify-between gap-3 border-t border-[var(--color-rule)] px-5 py-3',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Tiêu đề mục — luôn xếp DỌC (nhãn trên, tiêu đề dưới cùng cột).
 * Kiểu nhãn-trái / tiêu-đề-phải là dấu hiệu editorial templated dễ nhận nhất
 * và bị Hallmark cấm thẳng.
 */
export interface SectionHeadProps {
  readonly label?: string
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
  readonly className?: string
}

export function SectionHead({
  label,
  title,
  description,
  action,
  className,
}: SectionHeadProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {label ? (
          <p className="mb-1.5 text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            {label}
          </p>
        ) : null}
        <h2 className="text-[length:var(--text-2xl)] leading-[var(--leading-snug)] font-semibold text-[var(--color-ink)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-prose text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
