import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Dùng chung cho mọi form trong app — tách ra sau khi thấy cùng một cặp
 * label+input lặp lại nguyên văn ở auth-form, oauth-app-setup, edit-site. */
export const inputClass = cn(
  'h-11 w-full rounded-[var(--radius-md)] px-3.5',
  'border border-[var(--color-rule-strong)] bg-[var(--color-paper)]',
  'text-[length:var(--text-base)] text-[var(--color-ink)]',
  'placeholder:text-[var(--color-ink-3)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
)

export interface FormFieldProps {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: string
  readonly children: ReactNode
}

export function FormField({ label, htmlFor, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">{hint}</p>
      ) : null}
    </div>
  )
}
