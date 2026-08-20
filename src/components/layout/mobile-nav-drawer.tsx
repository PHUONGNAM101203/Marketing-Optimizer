'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { LogOut, Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { buildNavSections, isNavItemActive } from '@/lib/nav'
import { Button } from '@/components/ui/button'
import { SiteFavicon } from '@/components/brand/site-favicon'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { signOut } from '@/lib/actions/auth'
import { useMobileNav } from './mobile-nav-context'

/* Hallmark · component: mobile-nav-drawer · theme: studied-DNA (Ink & Signal)
 *
 * Thay thế `SideRail` dưới `lg:` — trượt từ trái thay vì cố nhồi rail 264px
 * cố định vào màn hẹp. Dùng thẳng `Dialog as DialogPrimitive` của Radix (không
 * qua `DialogRoot`/`DialogContent` dùng chung — hai component đó định vị GIỮA
 * màn hình, ở đây cần định vị SÁT TRÁI/full-height, hình dạng khác hẳn).
 *
 * Luôn hiện đầy đủ nhãn (không có chế độ "thu gọn còn icon" như `SideRail`
 * desktop) — một lớp phủ tạm thời không có lý do gì để tiết kiệm 190px chiều
 * rộng như rail cố định. `ThemeToggle` chuyển vào đây (không còn ở Topbar trên
 * mobile) để nhường chỗ cho `SiteSwitcher`/`DateRangeMenu` — đổi theme là thao
 * tác không thường xuyên, hợp lý nằm sâu một cấp trong menu trên màn hẹp.
 */
export function MobileNavDrawer({
  siteId,
  siteName,
  siteDomain,
  userName,
  userEmail,
}: {
  readonly siteId: string
  readonly siteName: string
  readonly siteDomain: string
  readonly userName: string
  readonly userEmail: string
}) {
  const pathname = usePathname()
  const sections = buildNavSections(siteId)
  const { open, setOpen } = useMobileNav()
  const close = () => setOpen(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--color-ink)]/50 lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col',
            'border-r border-[var(--color-rule)] bg-[var(--color-paper-2)]',
            'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
            'focus:outline-none lg:hidden',
          )}
        >
          <DialogPrimitive.Title className="sr-only">Điều hướng</DialogPrimitive.Title>

          <div className="flex items-center gap-2 px-4 pt-5 pb-4">
            <Link
              href={`/${siteId}/overview`}
              onClick={close}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-sm)]"
            >
              <SiteFavicon domain={siteDomain} className="size-6 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-[family-name:var(--font-display)] text-[length:var(--text-sm)] leading-tight font-bold text-[var(--color-ink)]">
                  {siteName}
                </span>
                <span className="mt-0.5 block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  {siteDomain}
                </span>
              </span>
            </Link>

            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Đóng menu" className="size-9 shrink-0">
                <X aria-hidden className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="px-4 pb-4">
            <Button asChild variant="primary" size="md" className="w-full" onClick={close}>
              <Link href={`/${siteId}/connections`}>
                <Plus aria-hidden className="size-4" />
                Kết nối nguồn
              </Link>
            </Button>
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
                  <p className="px-2 pb-1.5 text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
                    {section.label}
                  </p>
                ) : null}

                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = isNavItemActive(item, pathname)
                    const Icon = item.icon

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={close}
                          className={cn(
                            'flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2.5',
                            'text-[length:var(--text-sm)] whitespace-nowrap',
                            'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]',
                            active
                              ? 'bg-[var(--color-paper-3)] font-medium text-[var(--color-ink)]'
                              : 'text-[var(--color-ink-2)] hover:bg-[var(--color-paper-3)] hover:text-[var(--color-ink)]',
                          )}
                        >
                          <Icon
                            aria-hidden
                            className={cn(
                              'size-4 shrink-0',
                              active ? 'text-[var(--color-signal)]' : 'text-[var(--color-ink-3)]',
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2.5 border-t border-[var(--color-rule)] px-4 py-3">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[length:var(--text-xs)] font-semibold text-[var(--color-accent-ink)]"
            >
              {userName.charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[length:var(--text-xs)] font-medium text-[var(--color-ink)]">
                {userName}
              </p>
              <p className="truncate text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">{userEmail}</p>
            </div>

            <ThemeToggle />

            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Đăng xuất" className="size-9">
                <LogOut aria-hidden className="size-4" />
              </Button>
            </form>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
