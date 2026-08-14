'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: tabs · theme: studied-DNA (Ink & Signal)
 *
 * Biến thể URL-driven của `OverviewTabs` — state cục bộ (`useState`) không
 * sống sót qua reload/chia sẻ link. Dùng component này khi tab cần bookmark
 * được (trang chi tiết kênh); dùng `OverviewTabs` khi tab chỉ là điều hướng
 * tạm trong phiên xem hiện tại.
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
  const activeId = searchParams.get(paramName)
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!

  const hrefFor = (tabId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(paramName, tabId)
    return `${pathname}?${params.toString()}`
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
