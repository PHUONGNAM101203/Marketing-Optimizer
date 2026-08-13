'use client'

import { useSyncExternalStore } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import {
  THEME_LABELS,
  THEME_MODES,
  applyTheme,
  readStoredTheme,
  storeTheme,
  type ThemeMode,
} from '@/lib/theme'

/* Hallmark · component: theme-toggle · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Nút bấm hiện icon mặt trời/mặt trăng theo giao diện ĐANG HIỂN THỊ THẬT SỰ,
 * không phải icon "Monitor" trung tính cho chế độ mặc định "Theo hệ thống" —
 * icon máy tính không nói lên được đây là nút đổi sáng/tối, người dùng lướt
 * qua sẽ không nhận ra nó bấm được. Icon Monitor chỉ còn xuất hiện bên trong
 * danh sách, làm nhãn cho lựa chọn "Theo hệ thống".
 */

type Appearance = 'light' | 'dark'

const APPEARANCE_ICON: Readonly<Record<Appearance, LucideIcon>> = { light: Sun, dark: Moon }
const MODE_ICON: Readonly<Record<ThemeMode, LucideIcon>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const getAppearance = (): Appearance => {
  const mode = readStoredTheme()
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Server không biết hệ điều hành đang sáng hay tối. Trả về giá trị cố định
// cho lần render đầu — useSyncExternalStore tự sửa lại đúng ngay sau khi
// client mount, đây chính là việc hook này được thiết kế để làm, không báo
// lỗi lệch hydrate như setState thủ công trong useEffect từng làm.
const getServerAppearance = (): Appearance => 'light'
const getServerMode = (): ThemeMode => 'system'

const subscribeToAppearance = (onChange: () => void) => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function ThemeToggle() {
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  )
  const mode = useSyncExternalStore(subscribeToAppearance, readStoredTheme, getServerMode)

  const choose = (next: ThemeMode) => {
    storeTheme(next)
    applyTheme(next)
  }

  const Icon = APPEARANCE_ICON[appearance]

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Đổi giao diện — đang ${appearance === 'dark' ? 'tối' : 'sáng'}`}
        >
          <Icon aria-hidden className="size-4" />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[11rem] rounded-[var(--radius-lg)] p-1',
            'border border-[var(--color-rule)] bg-[var(--color-paper)]',
            'shadow-[0_8px_28px_-12px_rgb(0_0_0/0.18)]',
          )}
        >
          {THEME_MODES.map((option) => {
            const OptionIcon = MODE_ICON[option]

            return (
              <DropdownMenu.Item
                key={option}
                onSelect={() => choose(option)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
                  'text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none',
                  'data-[highlighted]:bg-[var(--color-paper-3)]',
                )}
              >
                <OptionIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-[var(--color-ink-3)]"
                />
                <span className="flex-1">{THEME_LABELS[option]}</span>
                <Check
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0',
                    option === mode ? 'text-[var(--color-signal)]' : 'text-transparent',
                  )}
                />
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
