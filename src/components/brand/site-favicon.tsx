import { Mark } from '@/components/brand/logo'
import { ImageWithFallback } from '@/components/ui/image-with-fallback'
import { cn } from '@/lib/cn'

/**
 * Icon của chính website đang quản lý — không phải logo app.
 *
 * Chỗ hiện tên Site (rail, site switcher) nên nhận ra ngay là site NÀO, đặc
 * biệt khi một người quản lý nhiều website: logo app lặp lại ở mọi nơi không
 * giúp phân biệt, favicon thật thì có.
 *
 * Dùng dịch vụ favicon công khai của Google thay vì tự tải HTML của site đó
 * về server — tự fetch HTML của URL người dùng nhập là mở cửa cho SSRF.
 *
 * Ảnh 32px từ domain ngoài — cấu hình next/image cho một icon nhỏ không đáng
 * công sức.
 */
export interface SiteFaviconProps {
  readonly domain: string
  readonly className?: string
}

export function SiteFavicon({ domain, className }: SiteFaviconProps) {
  return (
    <ImageWithFallback
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      className={cn('rounded-[4px] ring-1 ring-[var(--color-rule)]', className)}
      fallback={<Mark className={cn(className, 'text-[var(--color-ink)]')} />}
    />
  )
}
