'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: tabs · theme: studied-DNA (Ink & Signal)
 *
 * Biến thể URL-driven của `OverviewTabs` — khác `OverviewTabs` (state
 * `useState` thuần, không sống sót qua reload/chia sẻ link) ở chỗ tab vẫn
 * phản ánh trên URL để bookmark/chia sẻ được. NHƯNG chuyển tab KHÔNG được
 * điều hướng Next.js thật — cả hai panel đã render sẵn trong `panel` prop từ
 * lần tải trang đầu, nên bấm tab chỉ đổi state cục bộ + `history.pushState`
 * (không qua router), tránh chạy lại toàn bộ Server Component tree (gọi lại
 * TikTok API + RPC snapshot) chỉ để hiện lại dữ liệu trình duyệt đã có.
 * `<Link href>` vẫn giữ nguyên để copy-link/mở tab mới/no-JS vẫn đúng — chỉ
 * click chuột trái thường mới bị chặn `preventDefault` và xử lý cục bộ.
 */
export interface UrlTabItem {
  readonly id: string
  readonly label: string
  readonly panel: ReactNode
}

export function UrlTabs({
  tabs,
  paramName = 'tab',
  ariaLabel,
}: {
  readonly tabs: readonly UrlTabItem[]
  readonly paramName?: string
  readonly ariaLabel: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Chỉ đọc `searchParams` MỘT LẦN lúc khởi tạo — sau đó state cục bộ là
  // nguồn sự thật duy nhất cho tab đang active, để re-render do component
  // cha gây ra (không liên quan đến việc click tab) không ghi đè lựa chọn
  // của người dùng.
  const [activeId, setActiveId] = useState<string>(() => searchParams.get(paramName) ?? tabs[0]!.id)
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!

  const hrefFor = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramName, tabId)
    return `${pathname}?${params.toString()}`
  }

  const handleClick = (tabId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Click có modifier (mở tab mới, v.v.) hoặc không phải chuột trái —
    // để `<Link>` xử lý native, không can thiệp.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    setActiveId(tabId)
    window.history.pushState(null, '', hrefFor(tabId))
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-rule)]"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            role="tab"
            aria-selected={active.id === tab.id}
            scroll={false}
            onClick={handleClick(tab.id)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-4 py-2.5 whitespace-nowrap',
              'text-[length:var(--text-sm)] font-medium',
              'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
              active.id === tab.id
                ? 'border-[var(--color-signal)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-3)] hover:text-[var(--color-ink)]',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {active.panel}
    </div>
  )
}
