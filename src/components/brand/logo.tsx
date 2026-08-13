import { cn } from '@/lib/cn'

/**
 * Dấu nhận diện.
 *
 * Hình là một lập luận, không phải trang trí: ba dòng dữ liệu đi vào từ bên
 * trái, hội tụ về MỘT điểm, rồi đi ra thành một tín hiệu duy nhất. Đó đúng là
 * việc sản phẩm này làm — gộp tám nền tảng rời rạc thành một con số đọc được.
 *
 * Dùng `currentColor` nên tự đổi theo sáng/tối mà không cần bản thứ hai, và
 * đọc được ở 16px lẫn 200px. Không đổ bóng, không gradient — cùng ngôn ngữ
 * Ink & Signal với phần còn lại.
 */

export interface MarkProps {
  readonly className?: string
  /** Điểm hội tụ tô màu signal thay vì màu mực. */
  readonly accent?: boolean
  readonly title?: string
}

export function Mark({ className, accent = true, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('size-6', className)}
    >
      {title ? <title>{title}</title> : null}

      <g
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* ba dòng vào */}
        <path d="M2.75 5.25C7.5 5.25 9.6 8.2 13.3 10.9" opacity={0.55} />
        <path d="M2.75 12H13.6" opacity={0.8} />
        <path d="M2.75 18.75C7.5 18.75 9.6 15.8 13.3 13.1" opacity={0.55} />
        {/* một tín hiệu ra */}
        <path d="M18.4 12H21.25" />
      </g>

      {/* điểm hội tụ — thứ duy nhất được tô đặc */}
      <circle
        cx={16}
        cy={12}
        r={2.35}
        fill={accent ? 'var(--color-signal)' : 'currentColor'}
      />
    </svg>
  )
}

export interface WordmarkProps {
  readonly className?: string
  readonly size?: 'sm' | 'md' | 'lg'
  /** Dòng phụ dưới tên, ví dụ tên miền của Site đang mở. */
  readonly subtitle?: string
}

const SIZE_CLASS = {
  sm: { mark: 'size-5', text: 'text-[length:var(--text-sm)]' },
  md: { mark: 'size-6', text: 'text-[length:var(--text-base)]' },
  lg: { mark: 'size-8', text: 'text-[length:var(--text-xl)]' },
} as const

export function Wordmark({ className, size = 'md', subtitle }: WordmarkProps) {
  const sizes = SIZE_CLASS[size]

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Mark className={cn(sizes.mark, 'shrink-0 text-[var(--color-ink)]')} />
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate font-[family-name:var(--font-display)] font-bold',
            'tracking-[var(--tracking-tight)] text-[var(--color-ink)]',
            sizes.text,
          )}
        >
          Confluence
        </span>
        {subtitle ? (
          <span className="block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
  )
}
