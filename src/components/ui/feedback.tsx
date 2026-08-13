import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: feedback (empty · skeleton · callout) · Ink & Signal
 *
 * Bản Stitch tham chiếu để lại một hộp viền đứt ghi "Chart Visualization Area" —
 * placeholder chưa hoàn thiện lọt vào bản thiết kế. Trạng thái rỗng là một
 * trạng thái thật, phải được thiết kế: nó nói vì sao rỗng và làm gì tiếp theo.
 */

export interface EmptyStateProps {
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
  readonly icon?: ReactNode
  readonly className?: string
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? <div className="text-[var(--color-ink-3)]">{icon}</div> : null}
      <div className="max-w-sm">
        <p className="text-[length:var(--text-base)] font-medium text-[var(--color-ink)]">
          {title}
        </p>
        <p className="mt-1.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          {description}
        </p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/**
 * Khối tải. Dùng opacity chứ không dùng shimmer chạy ngang — shimmer là một
 * trong những dấu hiệu giao diện sinh tự động dễ nhận nhất, và nó nhấp nháy
 * liên tục trong tầm nhìn ngoại vi suốt thời gian chờ.
 */
export function Skeleton({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]',
        className,
      )}
    />
  )
}

export type CalloutTone = 'signal' | 'critical' | 'caution' | 'positive'

const CALLOUT_CLASS: Readonly<Record<CalloutTone, string>> = {
  signal:
    'bg-[var(--color-signal-soft)] border-[var(--color-signal)]/20 text-[var(--color-ink)]',
  critical:
    'bg-[var(--color-negative-soft)] border-[var(--color-negative)]/25 text-[var(--color-ink)]',
  caution:
    'bg-[var(--color-caution-soft)] border-[var(--color-caution)]/25 text-[var(--color-ink)]',
  positive:
    'bg-[var(--color-positive-soft)] border-[var(--color-positive)]/25 text-[var(--color-ink)]',
}

export interface CalloutProps {
  readonly tone?: CalloutTone
  readonly icon?: ReactNode
  readonly title: string
  readonly children?: ReactNode
  readonly action?: ReactNode
  readonly className?: string
}

export function Callout({
  tone = 'signal',
  icon,
  title,
  children,
  action,
  className,
}: CalloutProps) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[var(--radius-lg)] border p-4',
        CALLOUT_CLASS[tone],
        className,
      )}
    >
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--text-sm)] font-semibold">{title}</p>
        {children ? (
          <div className="mt-1 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  )
}
