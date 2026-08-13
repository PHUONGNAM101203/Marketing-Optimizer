'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* Hallmark · component: overview-tabs · theme: studied-DNA (Ink & Signal)
 *
 * Chia theo NHÀ CUNG CẤP (Google/Meta/TikTok riêng), không phải theo nền
 * tảng — dễ kiểm soát hơn khi một người quản lý nhiều tài khoản quảng cáo
 * cùng lúc. Chuyển tab bằng state cục bộ, không phải radio-input: mẫu
 * radio-tab dễ gây nhảy cuộn khi trình duyệt tự focus vào input được chọn.
 */
export interface OverviewTabItem {
  readonly id: string
  readonly label: string
}

export interface OverviewTabsProps {
  readonly tabs: readonly OverviewTabItem[]
  /** Một phần tử cho mỗi tab, đúng thứ tự với `tabs`. */
  readonly panels: readonly ReactNode[]
}

export function OverviewTabs({ tabs, panels }: OverviewTabsProps) {
  const [active, setActive] = useState(0)

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Nhà cung cấp"
        className="flex gap-1 overflow-x-auto border-b border-[var(--color-rule)]"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === index}
            onClick={() => setActive(index)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-4 py-2.5 whitespace-nowrap',
              'text-[length:var(--text-sm)] font-medium',
              'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
              active === index
                ? 'border-[var(--color-signal)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-3)] hover:text-[var(--color-ink)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {panels[active]}
    </div>
  )
}
