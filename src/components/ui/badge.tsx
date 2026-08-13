import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: badge · theme: studied-DNA (Ink & Signal)
 *
 * Badge trạng thái luôn đi kèm CHỮ, không bao giờ chỉ có màu — người mù màu
 * chiếm ~8% nam giới, và màu đơn độc thì không đọc được khi in hay ở chế độ
 * tương phản cao.
 */

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 whitespace-nowrap',
    'font-medium leading-none',
    'rounded-[var(--radius-full)] px-2 py-1',
    'text-[length:var(--text-2xs)]',
  ],
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--color-paper-3)] text-[var(--color-ink-2)]',
        outline:
          'bg-transparent text-[var(--color-ink-2)] border border-[var(--color-rule-strong)]',
        positive: 'bg-[var(--color-positive-soft)] text-[var(--color-positive)]',
        negative: 'bg-[var(--color-negative-soft)] text-[var(--color-negative)]',
        caution: 'bg-[var(--color-caution-soft)] text-[var(--color-caution)]',
        signal: 'bg-[var(--color-signal-soft)] text-[var(--color-signal)]',
        ink: 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  readonly icon?: ReactNode
}

export function Badge({ tone, icon, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}

/**
 * Chấm trạng thái — luôn phải có nhãn chữ đi kèm ở cấp gọi.
 * Component này cố tình KHÔNG tự render nhãn, để chỗ gọi phải nghĩ về nó.
 */
export function StatusDot({
  tone,
  className,
}: {
  readonly tone: 'positive' | 'negative' | 'caution' | 'neutral' | 'signal'
  readonly className?: string
}) {
  const color = {
    positive: 'bg-[var(--color-positive)]',
    negative: 'bg-[var(--color-negative)]',
    caution: 'bg-[var(--color-caution)]',
    neutral: 'bg-[var(--color-ink-3)]',
    signal: 'bg-[var(--color-signal)]',
  }[tone]

  return <span aria-hidden className={cn('size-1.5 rounded-full', color, className)} />
}
