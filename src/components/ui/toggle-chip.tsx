'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

/* Hallmark · component: toggle-chip · theme: studied-DNA (Ink & Signal)
 *
 * Tách ra từ `explore/report-builder.tsx` (chỉ số/kênh bật-tắt) để dùng lại
 * cho GA4 Overview (chọn chỉ số hiển thị) — cùng một hành vi "bật/tắt một
 * lựa chọn trong danh sách", không cần hai định nghĩa giống hệt nhau.
 */
export function ToggleChip({
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
