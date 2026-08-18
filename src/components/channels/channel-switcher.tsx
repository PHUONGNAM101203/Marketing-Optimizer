'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import type { ChannelConnectionOption } from '@/lib/data/site-channel-detail'
import type { ProviderId } from '@/lib/domain/providers'

/* Hallmark · component: channel-switcher · theme: studied-DNA (Ink & Signal)
 *
 * Chỉ render khi Site có >1 connection cùng provider (vd. hai Page Facebook,
 * hai kênh YouTube) — trường hợp phổ biến nhất vẫn chỉ có 1 connection, không
 * thêm dropdown thừa cho ai không cần. Hình dạng mượn `SiteSwitcher`
 * (topbar.tsx): dropdown, avatar + tên mỗi dòng, dấu `Check` cho dòng đang
 * chọn. Cơ chế chuyển đổi mượn `DateRangeMenu` (topbar.tsx): kênh đang chọn
 * sống trên `?connection=`, không phải `useState` — đúng quy ước CLAUDE.md
 * "filter/view state thuộc searchParams". `router.push` bọc `useTransition`
 * để nút trigger tự hiện trạng thái loading, không chớp trắng trang khi
 * server re-render.
 */
export function ChannelSwitcher({
  provider,
  connections,
  activeConnectionId,
}: {
  readonly provider: ProviderId
  readonly connections: readonly ChannelConnectionOption[]
  readonly activeConnectionId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  if (connections.length <= 1) return null

  const active = connections.find((option) => option.id === activeConnectionId) ?? connections[0]

  const choose = (connectionId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('connection', connectionId)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm" className="max-w-[16rem] gap-1.5" state={isPending ? 'loading' : 'idle'}>
          <ChannelAvatar avatarUrl={active.avatarUrl} provider={provider} size="sm" className="size-4" />
          <span className="truncate">{active.accountName}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[16rem] rounded-[var(--radius-lg)] border border-[var(--color-rule)] bg-[var(--color-paper)] p-1 shadow-[var(--shadow-md)]"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[length:var(--text-2xs)] font-medium tracking-wide text-[var(--color-ink-3)] uppercase">
            Kênh đã kết nối
          </DropdownMenu.Label>
          {connections.map((option) => (
            <DropdownMenu.Item
              key={option.id}
              onSelect={() => choose(option.id)}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-[length:var(--text-sm)] outline-none data-[highlighted]:bg-[var(--color-paper-3)]"
            >
              <Check
                aria-hidden
                className={`size-4 shrink-0 ${option.id === active.id ? 'text-[var(--color-signal)]' : 'text-transparent'}`}
              />
              <ChannelAvatar avatarUrl={option.avatarUrl} provider={provider} size="sm" className="size-5" />
              <span className="min-w-0 flex-1 truncate">{option.accountName}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
