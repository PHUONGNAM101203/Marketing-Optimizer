'use client'

import { useState } from 'react'
import { Mark } from '@/components/brand/logo'
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
 */
export interface SiteFaviconProps {
  readonly domain: string
  readonly className?: string
}

export function SiteFavicon({ domain, className }: SiteFaviconProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return <Mark className={cn(className, 'text-[var(--color-ink)]')} />
  }

  return (
    // Ảnh 32px từ domain ngoài — cấu hình next/image cho một icon nhỏ không đáng công sức.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      aria-hidden
      className={cn('rounded-[4px] ring-1 ring-[var(--color-rule)]', className)}
      onError={() => setFailed(true)}
    />
  )
}
