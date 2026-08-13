'use client'

import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { Check, Loader2, TriangleAlert } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: button · genre: modern-minimal · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass
 *
 * Hành động chính là MỰC, không phải màu. Đó là toàn bộ luận điểm của hướng
 * Ink & Signal: khi thứ đậm nhất trên màn hình là mực đen, một màu chromatic
 * duy nhất mới đủ chỗ để thật sự có nghĩa. Bản Stitch tham chiếu dùng xanh cho
 * mọi nút, nên không nút nào nổi hơn nút nào.
 */

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2',
    // Nhãn nút không bao giờ được xuống hai dòng — vỡ ở màn hình hẹp.
    'whitespace-nowrap',
    'font-medium',
    'transition-[background-color,color,border-color,opacity,transform]',
    'duration-[var(--dur-fast)] ease-[var(--ease-out)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2',
    'focus-visible:outline-[var(--color-focus)]',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-[var(--color-accent)] text-[var(--color-accent-ink)]',
          'hover:bg-[var(--color-accent-hover)]',
        ],
        secondary: [
          'bg-[var(--color-paper)] text-[var(--color-ink)]',
          'border border-[var(--color-rule-strong)]',
          'hover:bg-[var(--color-paper-3)]',
        ],
        ghost: [
          'bg-transparent text-[var(--color-ink-2)]',
          'hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]',
        ],
        signal: [
          'bg-[var(--color-signal)] text-[var(--color-signal-ink)]',
          'hover:bg-[var(--color-signal-hover)]',
        ],
        danger: [
          'bg-[var(--color-negative)] text-[var(--color-ink-inverse)]',
          'hover:opacity-90',
        ],
      },
      size: {
        sm: 'h-8 rounded-[var(--radius-sm)] px-3 text-[length:var(--text-xs)]',
        md: 'h-9 rounded-[var(--radius-md)] px-4 text-[length:var(--text-sm)]',
        lg: 'h-11 rounded-[var(--radius-md)] px-5 text-[length:var(--text-base)]',
        icon: 'size-9 rounded-[var(--radius-md)]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonState = 'idle' | 'loading' | 'error' | 'success'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly asChild?: boolean
  readonly state?: ButtonState
  /** Nhãn thay thế khi đang tải — mặc định giữ nguyên nhãn gốc. */
  readonly loadingLabel?: ReactNode
}

const STATE_ICON: Readonly<Record<Exclude<ButtonState, 'idle'>, ReactNode>> = {
  loading: <Loader2 aria-hidden className="size-4 animate-spin" />,
  error: <TriangleAlert aria-hidden className="size-4" />,
  success: <Check aria-hidden className="size-4" />,
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    state = 'idle',
    loadingLabel,
    children,
    disabled,
    ...props
  },
  ref,
) {
  const isLoading = state === 'loading'

  // `Slot` yêu cầu ĐÚNG một element con. Nhánh icon trạng thái render ra `false`
  // khi state là 'idle', và `false` vẫn tính là một child — nên phải tách hẳn
  // nhánh asChild thay vì render có điều kiện bên trong.
  if (asChild) {
    return (
      <Slot.Root
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      ref={ref}
      // aria-busy để trình đọc màn hình biết, aria-disabled để nút vẫn nhận
      // focus khi loading — mất focus giữa chừng làm người dùng bàn phím lạc chỗ.
      aria-busy={isLoading || undefined}
      aria-disabled={disabled || isLoading || undefined}
      data-state={state}
      disabled={disabled || isLoading}
      className={cn(
        buttonVariants({ variant, size }),
        state === 'error' && 'text-[var(--color-negative)]',
        state === 'success' && 'text-[var(--color-positive)]',
        className,
      )}
      {...props}
    >
      {state !== 'idle' && STATE_ICON[state]}
      {isLoading && loadingLabel ? loadingLabel : children}
    </button>
  )
})

export { buttonVariants }
