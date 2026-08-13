import type { ReactNode } from 'react'
import Link from 'next/link'
import { Lock, Plug } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'

/**
 * Khoá mờ khi Site chưa có kết nối nào.
 *
 * HAI NGUYÊN TẮC không được phá:
 *
 * 1. NÓI RÕ ĐÂY LÀ HÌNH MINH HOẠ. Làm mờ số liệu giả rồi để người dùng đoán là
 *    tệ hơn không hiện gì — họ sẽ tưởng đó là số của mình đang tải. Nhãn "Xem
 *    trước · dữ liệu minh hoạ" nằm ngay trên khoá, không giấu.
 *
 * 2. LÀM MỜ ĐỦ ĐỂ KHÔNG ĐỌC ĐƯỢC SỐ. Blur 7px trở lên. Mờ nhẹ để "vẫn thấy
 *    được chút chút" chính là chỗ hiểu nhầm sinh ra.
 *
 * Phần bị khoá cũng bị gỡ khỏi luồng bàn phím và khỏi trình đọc màn hình —
 * người dùng bàn phím không được tab vào một cái bảng mà mắt họ không thấy.
 */

export interface LockedPreviewProps {
  readonly siteId: string
  readonly title: string
  readonly description: string
  /** Nội dung minh hoạ nằm dưới lớp mờ. */
  readonly children: ReactNode
  readonly className?: string
}

export function LockedPreview({
  siteId,
  title,
  description,
  children,
  className,
}: LockedPreviewProps) {
  return (
    <div className={cn('relative isolate', className)}>
      <div
        aria-hidden
        // `inert` gỡ toàn bộ cây con khỏi tab order và khỏi accessibility tree.
        inert
        className="pointer-events-none select-none blur-[7px] saturate-[0.55] opacity-45"
      >
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
        <div
          className="w-full max-w-md rounded-[calc(var(--radius-lg)+2px)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-6 text-center"
          style={{ boxShadow: 'var(--shadow-lift)' }}
        >
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-caution-soft)] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-caution)]">
            <Lock aria-hidden className="size-3" />
            Xem trước · dữ liệu minh hoạ
          </span>

          <h3 className="text-[length:var(--text-xl)] leading-[var(--leading-snug)] font-semibold text-[var(--color-ink)]">
            {title}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            {description}
          </p>

          <Button asChild variant="primary" size="md" className="mt-5">
            <Link href={`/${siteId}/connections`}>
              <Plug aria-hidden className="size-4" />
              Kết nối nguồn dữ liệu
            </Link>
          </Button>

          <p className="mt-3 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            Một lần cấp quyền Google là có ngay Analytics, Search Console, Tag Manager
            và YouTube.
          </p>
        </div>
      </div>
    </div>
  )
}
