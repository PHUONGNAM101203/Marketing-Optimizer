'use client'

import { useEffect, useRef, type HTMLAttributes, type ReactNode, type ThHTMLAttributes, type TdHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: table · theme: studied-DNA (Ink & Signal)
 *
 * Bảng là chỗ "relief rule" của dataviz được thực thi: ba slot màu trong bảng
 * màu biểu đồ nằm dưới ngưỡng tương phản 3:1, nên MỌI biểu đồ trong app phải
 * có bảng đi kèm hoặc nhãn trực tiếp. Bảng không phải phần phụ — nó là điều
 * kiện để dùng bảng màu đó một cách hợp lệ.
 *
 * Bảng luôn cuộn ngang trong hộp của chính nó. Trang không bao giờ được cuộn
 * ngang theo.
 */

/** Lăn chuột dọc (chuột thường, không phải trackpad) không tự cuộn ngang một
 * vùng CHỈ tràn ngang — trình duyệt mặc định bỏ qua, người dùng buộc phải
 * kéo thanh cuộn bằng tay. Bắt sự kiện `wheel` GỐC (không dùng prop `onWheel`
 * của React — handler đó được gắn passive theo mặc định từ React 17,
 * `preventDefault()` bên trong bị bỏ qua kèm cảnh báo console, không chặn
 * được cuộn dọc mặc định của trang) để tự đổi `deltaY` thành `scrollLeft`,
 * ÁP DỤNG CHUNG cho mọi bảng dùng `TableScroller` trong app (Khám phá, GA4
 * Chi tiết, AI Visibility…) chỉ bằng một chỗ sửa. */
export function TableScroller({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleWheel = (event: WheelEvent) => {
      // Chỉ can thiệp khi vùng THẬT SỰ tràn ngang và đây là cử chỉ lăn dọc
      // (không phải vuốt ngang trackpad — deltaX đã lớn hơn thì để mặc định
      // trình duyệt tự xử lý, không giành lại).
      if (el.scrollWidth <= el.clientWidth) return
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <div
      ref={ref}
      // tabIndex để người dùng bàn phím cuộn được vùng tràn — không có nó,
      // bảng rộng thành nội dung không thể tới bằng bàn phím.
      tabIndex={0}
      role="region"
      className={cn(
        'w-full overflow-x-auto',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
        className,
      )}
      {...props}
    />
  )
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn('w-full border-collapse text-[length:var(--text-sm)]', className)}
      {...props}
    />
  )
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('border-b border-[var(--color-rule-strong)]', className)}
      {...props}
    />
  )
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--color-rule)] last:border-b-0',
        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
        'hover:bg-[var(--color-paper-2)]',
        className,
      )}
      {...props}
    />
  )
}

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Cột số căn phải — mắt so sánh số theo cột phải, không phải cột trái. */
  readonly numeric?: boolean
}

export function TH({ numeric = false, className, ...props }: THProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 font-medium whitespace-nowrap',
        'text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  )
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  readonly numeric?: boolean
}

export function TD({ numeric = false, className, ...props }: TDProps) {
  return (
    <td
      data-numeric={numeric ? '' : undefined}
      className={cn(
        'px-3 py-3 text-[var(--color-ink)]',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  )
}

/** Ô tên có chấm màu series đi kèm — nối bảng với biểu đồ. */
export function SeriesCell({
  colorToken,
  children,
}: {
  readonly colorToken: string
  readonly children: ReactNode
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-[var(--radius-xs)]"
        style={{ background: `var(${colorToken})` }}
      />
      <span className="truncate">{children}</span>
    </span>
  )
}
