'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { buildNavSections, isNavItemActive } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { SiteFavicon } from '@/components/brand/site-favicon'
import { signOut } from '@/lib/actions/auth'
import {
  applySidebarCollapsed,
  getServerSidebarCollapsed,
  readStoredSidebarCollapsed,
  storeSidebarCollapsed,
  subscribeSidebarCollapsed,
} from '@/lib/sidebar'

/* Hallmark · nav archetype: N3 side-rail · theme: studied-DNA (Ink & Signal)
 *
 * Một chi tiết của bản gốc đáng giữ: thanh chỉ báo active ép sát MÉP PHẢI của
 * rail, không phải mép trái. Nó nối trực quan mục đang chọn với canvas bên
 * phải, và là thứ duy nhất trong bản Stitch có gu riêng.
 *
 * Phần còn lại đổi: rail hẹp lại 48px, nền ăn theo paper thay vì xám lạnh,
 * và active state dùng mực + nền chìm thay vì pill xanh.
 */

export interface SideRailProps {
  readonly siteId: string
  readonly siteName: string
  readonly siteDomain: string
  readonly userName: string
  readonly userEmail: string
}

export function SideRail({
  siteId,
  siteName,
  siteDomain,
  userName,
  userEmail,
}: SideRailProps) {
  const pathname = usePathname()
  const sections = buildNavSections(siteId)
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    readStoredSidebarCollapsed,
    getServerSidebarCollapsed,
  )

  const toggleCollapsed = () => {
    const next = !collapsed
    storeSidebarCollapsed(next)
    applySidebarCollapsed(next)
  }

  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        // Hiện ở MỌI bề rộng. Dưới `lg:` CSS ép rail về dạng thu gọn 72px
        // (xem `.rail-when-*` và `--rail-w` trong globals.css) — 18% một màn
        // 390px, đủ chỗ cho dải icon điều hướng luôn hiển thị. Bản trước ẩn
        // hẳn rail dưới `lg:` vì rail MỞ RỘNG chiếm 264px = 82% màn 320px;
        // lý do đó chỉ đúng cho trạng thái mở rộng, và đã vứt nhầm cả trạng
        // thái thu gọn vốn dùng tốt trên điện thoại.
        // `MobileNavDrawer` + hamburger vẫn giữ, cho khi cần nhãn đầy đủ.
        'flex h-dvh w-[var(--rail-w)] shrink-0 flex-col',
        'border-r border-[var(--color-rule)] bg-[var(--color-paper-2)]',
        'sticky top-0',
        'transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]',
      )}
    >
      <div
        className="flex items-center gap-2 px-4 pt-5 pb-4 [justify-content:var(--rail-item-justify)]"
      >
        <Link
          href={`/${siteId}/overview`}
          className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-sm)] [flex:var(--rail-brand-flex)]"
        >
          <SiteFavicon domain={siteDomain} className="size-6 shrink-0" />
          <span className="rail-when-expanded">
            <span className="min-w-0">
              <span className="block truncate font-[family-name:var(--font-display)] text-[length:var(--text-sm)] leading-tight font-bold text-[var(--color-ink)]">
                {siteName}
              </span>
              <span className="mt-0.5 block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                {siteDomain}
              </span>
            </span>
          </span>
        </Link>

        {/* Thu gọn/mở rộng — chỉ hiện khi mở rộng (đủ chỗ), ở dạng thu gọn
            bấm lại được qua chính nút này khi nó co xuống còn icon (xem dưới
            khối "Kết nối nguồn"), tránh chiếm thêm một hàng riêng làm rail
            thu gọn cao hơn cần thiết. */}
        <span className="rail-when-expanded">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Thu gọn sidebar"
            className="size-7 shrink-0"
            onClick={toggleCollapsed}
          >
            <PanelLeftClose aria-hidden className="size-4" />
          </Button>
        </span>
      </div>

      <div className="px-4 pb-4">
        <div className="rail-when-collapsed">
          {/* Nút mở rộng chỉ có nghĩa từ `lg:` trở lên — dưới đó CSS ép thu
              gọn nên bấm vào sẽ không thấy gì đổi. Thay bằng lối tắt "Kết nối
              nguồn" dạng icon, giữ đúng chức năng của ô này ở bản mở rộng. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mở rộng sidebar"
            title="Mở rộng sidebar"
            className="hidden w-full lg:inline-flex"
            onClick={toggleCollapsed}
          >
            <PanelLeftOpen aria-hidden className="size-4" />
          </Button>

          <Button asChild variant="ghost" size="icon" className="w-full lg:hidden">
            <Link href={`/${siteId}/connections`} aria-label="Kết nối nguồn" title="Kết nối nguồn">
              <Plus aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="rail-when-expanded">
          <Button asChild variant="primary" size="md" className="w-full">
            <Link href={`/${siteId}/connections`}>
              <Plus aria-hidden className="size-4" />
              Kết nối nguồn
            </Link>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {sections.map((section, index) => (
          <div
            key={section.label ?? `section-${index}`}
            className={cn(
              'px-3',
              section.label ? 'pt-4' : 'mt-4 border-t border-[var(--color-rule)] pt-4',
            )}
          >
            {section.label ? (
              <p className="rail-when-expanded-block px-2 pb-1.5 text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
                {section.label}
              </p>
            ) : null}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(item, pathname)
                const Icon = item.icon

                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5',
                        'text-[length:var(--text-sm)] whitespace-nowrap',
                        'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                        '[justify-content:var(--rail-item-justify)]',
                        active
                          ? 'bg-[var(--color-paper-3)] font-medium text-[var(--color-ink)]'
                          : 'text-[var(--color-ink-2)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]',
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn(
                          'size-4 shrink-0',
                          active
                            ? 'text-[var(--color-signal)]'
                            : 'text-[var(--color-ink-3)]',
                        )}
                      />
                      <span className="rail-when-expanded">
                        <span className="truncate">{item.label}</span>
                      </span>
                    </Link>

                    {/* Chỉ báo ép mép phải của rail — chi tiết giữ lại từ bản gốc. */}
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute top-1/2 -right-3 h-5 w-[3px] -translate-y-1/2 rounded-l-full bg-[var(--color-signal)]"
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div
        className={cn(
          'flex items-center gap-2.5 border-t border-[var(--color-rule)] px-4 py-3',
          // Hàng ngang (avatar + nút đăng xuất cạnh nhau) khi thu gọn khiến
          // `justify-center` canh giữa CẢ CẶP thay vì riêng avatar — avatar
          // bị lệch trái so với các icon điều hướng phía trên (mỗi icon đó
          // tự canh giữa một mình). Xếp DỌC khi thu gọn để avatar VÀ nút đăng
          // xuất đều tự canh giữa riêng, khớp trục với icon điều hướng.
          '[flex-direction:var(--rail-footer-direction)] [justify-content:var(--rail-footer-justify)]',
        )}
      >
        <span
          aria-hidden
          title={collapsed ? `${userName} · ${userEmail}` : undefined}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[length:var(--text-2xs)] font-semibold text-[var(--color-accent-ink)]"
        >
          {userName.charAt(0).toUpperCase()}
        </span>

        <div className="rail-when-expanded">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[length:var(--text-xs)] font-medium text-[var(--color-ink)]">
              {userName}
            </p>
            <p className="truncate text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
              {userEmail}
            </p>
          </div>
        </div>

        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Đăng xuất"
            title={collapsed ? 'Đăng xuất' : undefined}
            className="size-7"
          >
            <LogOut aria-hidden className="size-3.5" />
          </Button>
        </form>
      </div>
    </nav>
  )
}
