'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState } from 'react'
import { Check, ChevronDown, Plus, RefreshCw, Search } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { SiteFavicon } from '@/components/brand/site-favicon'
import { resyncSiteAction, type ResyncState } from '@/lib/actions/sync'
import { parseRangeParam } from '@/lib/domain/date-range-param'
import { DATE_RANGE_LABELS, type DateRangePreset, type Site } from '@/lib/domain/site'
import { formatRelativeTime } from '@/lib/format'

/* Hallmark · component: topbar · theme: studied-DNA (Ink & Signal)
 *
 * Topbar mang NGỮ CẢNH, không mang điều hướng: đang xem site nào, khoảng ngày
 * nào, dữ liệu mới tới đâu. Bản gốc để tab điều hướng ở đây, cạnh tranh trực
 * tiếp với side rail — đó là lý do IA của nó rối.
 *
 * Preset khoảng ngày đọc trực tiếp từ `?range=` qua `useSearchParams` — không
 * nhận qua prop từ layout, vì layout.tsx không có quyền truy cập searchParams
 * của page con trong App Router. Đổi preset = điều hướng, để mỗi trang con tự
 * đọc lại `?range=` khi render lại phía server.
 */

const DATE_PRESETS: readonly DateRangePreset[] = [
  'today',
  'last-7',
  'last-28',
  'last-90',
  'this-month',
  'last-month',
]

export interface TopbarProps {
  readonly site: Site
  readonly sites: readonly Site[]
  readonly lastSyncedAt: string | null
  readonly hasConnections: boolean
  /** Truyền vào để render ổn định giữa server và client. */
  readonly now: Date
}

export function Topbar({ site, sites, lastSyncedAt, hasConnections, now }: TopbarProps) {
  const preset = parseRangeParam(useSearchParams().get('range') ?? undefined)
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-[var(--topbar-h)] items-center gap-3',
        'border-b border-[var(--color-rule)] bg-[var(--color-paper)]/85 px-5 backdrop-blur',
      )}
    >
      <SiteSwitcher site={site} sites={sites} />

      <div className="relative hidden min-w-0 flex-1 md:block">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--color-ink-3)]"
        />
        <input
          type="search"
          placeholder="Tìm chiến dịch, trang, truy vấn…"
          aria-label="Tìm kiếm"
          className={cn(
            'h-9 w-full max-w-md rounded-[var(--radius-md)] pl-9',
            'border border-[var(--color-rule)] bg-[var(--color-paper-2)]',
            'text-[length:var(--text-sm)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          )}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Chỉ báo đồng bộ phải nói đúng ba trạng thái khác nhau. Trước đây nó
            hiện "Đồng bộ 8 giờ trước" cho cả Site vừa tạo chưa nối gì — một
            câu nói dối nhỏ nhưng làm hỏng lòng tin vào mọi con số còn lại. */}
        {!hasConnections ? (
          <Link
            href={`/${site.id}/connections`}
            className="hidden items-center gap-1.5 rounded-[var(--radius-full)] border border-[var(--color-caution)]/30 bg-[var(--color-caution-soft)] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-caution)] lg:inline-flex"
          >
            <StatusDot tone="caution" />
            Chưa kết nối nguồn nào
          </Link>
        ) : (
          <span className="hidden items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)] lg:inline-flex">
            <StatusDot tone={lastSyncedAt ? 'positive' : 'signal'} />
            {lastSyncedAt
              ? `Đồng bộ ${formatRelativeTime(lastSyncedAt, now)}`
              : 'Đang đồng bộ lần đầu…'}
          </span>
        )}

        <DateRangeMenu preset={preset} />

        <SyncAllButton siteId={site.id} />

        <ThemeToggle />
      </div>
    </header>
  )
}

function SiteSwitcher({
  site,
  sites,
}: {
  readonly site: Site
  readonly sites: readonly Site[]
}) {
  return (
    // modal={false}: đây là menu ĐIỀU HƯỚNG (mỗi item là một <Link>), không
    // phải hộp thoại thật. Ở chế độ modal mặc định, Radix tự khoá scroll và
    // aria-hide toàn bộ sidebar/nội dung ngoài menu lúc mở, rồi gỡ ra khi
    // đóng — bấm vào một site vừa điều hướng route [siteId] VỪA kích hoạt
    // đóng menu trong cùng một sự kiện, hai việc đó đua nhau, có lúc bước gỡ
    // khoá không kịp chạy trước khi cây trang cũ bị thay, để lại sidebar
    // trông như trống/đen. modal={false} bỏ hẳn lớp khoá đó — không cần cho
    // một menu điều hướng đơn giản.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="max-w-[14rem] gap-1.5">
          <span className="truncate">{site.name}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[16rem] rounded-[var(--radius-lg)] p-1',
            'border border-[var(--color-rule)] bg-[var(--color-paper)]',
            'shadow-[0_8px_28px_-12px_rgb(0_0_0/0.18)]',
          )}
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Website
          </DropdownMenu.Label>

          {sites.map((option) => (
            <DropdownMenu.Item key={option.id} asChild>
              <Link
                href={`/${option.id}/overview`}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
                  'text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none',
                  'data-[highlighted]:bg-[var(--color-paper-3)]',
                )}
              >
                <Check
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0',
                    option.id === site.id
                      ? 'text-[var(--color-signal)]'
                      : 'text-transparent',
                  )}
                />
                <SiteFavicon domain={option.domain} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                <span className="shrink-0 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
                  {option.domain}
                </span>
              </Link>
            </DropdownMenu.Item>
          ))}

          <div className="my-1 border-t border-[var(--color-rule)]" />

          <DropdownMenu.Item asChild>
            <Link
              href="/onboarding"
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
                'text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] outline-none',
                'data-[highlighted]:bg-[var(--color-paper-3)]',
              )}
            >
              <Plus aria-hidden className="size-3.5 shrink-0" />
              Thêm website
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function DateRangeMenu({ preset }: { readonly preset: DateRangePreset }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const choose = (next: DateRangePreset) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', next)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5">
          {DATE_RANGE_LABELS[preset]}
          <ChevronDown aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'z-50 min-w-[12rem] rounded-[var(--radius-lg)] p-1',
            'border border-[var(--color-rule)] bg-[var(--color-paper)]',
            'shadow-[0_8px_28px_-12px_rgb(0_0_0/0.18)]',
          )}
        >
          {DATE_PRESETS.map((option) => (
            <DropdownMenu.Item
              key={option}
              onSelect={() => choose(option)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
                'text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none',
                'data-[highlighted]:bg-[var(--color-paper-3)]',
              )}
            >
              <Check
                aria-hidden
                className={cn(
                  'size-3.5 shrink-0',
                  option === preset ? 'text-[var(--color-signal)]' : 'text-transparent',
                )}
              />
              {DATE_RANGE_LABELS[option]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const RESYNC_INITIAL_STATE: ResyncState = { error: null, synced: 0, removed: 0 }

/**
 * "Đồng bộ lại" đồng bộ THẬT: kéo lại số liệu của mọi connection, và gỡ
 * những connection không còn khớp domain của Site này — trường hợp một tài
 * khoản Google quản lý nhiều website và một kết nối cũ lỡ gắn nhầm tài sản
 * của website khác.
 */
// `null` khi không có gì đáng báo (0 đồng bộ, 0 gỡ, không lỗi) — im lặng
// còn hơn một thông báo không mang thông tin gì, đứng chình ình cho tới lần
// bấm tiếp theo và dễ đè lên các trạng thái khác ở góc trên cùng.
function describeResync(state: ResyncState): string | null {
  if (state.error) return state.error
  if (state.removed > 0) {
    return `Đã đồng bộ ${state.synced} — gỡ ${state.removed} kết nối sai website.`
  }
  if (state.synced > 0) return `Đã đồng bộ ${state.synced} kết nối.`
  return null
}

function SyncAllButton({ siteId }: { readonly siteId: string }) {
  const [state, formAction, pending] = useActionState<ResyncState, FormData>(
    resyncSiteAction,
    RESYNC_INITIAL_STATE,
  )
  // Suy trực tiếp từ `state` lúc render — không echo qua state cục bộ rồi tự
  // hẹn giờ ẩn bằng effect. Thông báo đứng yên tới lượt đồng bộ tiếp theo,
  // đủ dùng cho một nút bấm không thường xuyên.
  const message = pending || state === RESYNC_INITIAL_STATE ? null : describeResync(state)

  return (
    <form action={formAction} className="relative">
      <input type="hidden" name="siteId" value={siteId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label="Đồng bộ lại toàn bộ"
        disabled={pending}
      >
        <RefreshCw aria-hidden className={cn('size-4', pending && 'animate-spin')} />
      </Button>

      {message ? (
        <div
          role="status"
          className={cn(
            'absolute top-full right-0 z-50 mt-2 w-max max-w-64 rounded-[var(--radius-md)]',
            'border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2',
            'text-[length:var(--text-xs)] text-[var(--color-ink)]',
            'shadow-[0_8px_28px_-12px_rgb(0_0_0/0.18)]',
          )}
        >
          {message}
        </div>
      ) : null}
    </form>
  )
}
