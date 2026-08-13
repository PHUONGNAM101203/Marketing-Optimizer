'use client'

import type { ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/* Hallmark · component: dialog · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 */

export const DialogRoot = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger

export interface DialogContentProps {
  readonly title: string
  readonly description?: string
  readonly children: ReactNode
  readonly className?: string
}

export function DialogContent({ title, description, children, className }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-40 bg-[var(--color-ink)]/50"
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[min(560px,calc(100vw-2rem))]',
          '-translate-x-1/2 -translate-y-1/2',
          'max-h-[85vh] overflow-y-auto rounded-[var(--radius-lg)]',
          'border border-[var(--color-rule)] bg-[var(--color-paper)]',
          'shadow-[var(--shadow-lift)] focus:outline-none',
          'p-6',
          className,
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[length:var(--text-lg)] font-semibold text-[var(--color-ink)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>

          <DialogPrimitive.Close
            aria-label="Đóng"
            className={cn(
              'shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-ink-3)]',
              'hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
            )}
          >
            <X aria-hidden className="size-4" />
          </DialogPrimitive.Close>
        </div>

        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
