'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useState, useTransition } from 'react'
import { Calendar, Check, ChevronDown, GitCompare, Menu, Plus, RefreshCw, Search, X } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/badge'
import { DialogContent, DialogRoot } from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { SiteFavicon } from '@/components/brand/site-favicon'
import { useMobileNav } from '@/components/layout/mobile-nav-context'
import { resyncSiteAction, type ResyncState } from '@/lib/actions/sync'
import { parseCompareRangeParams, parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { DATE_RANGE_LABELS, type DateRangePreset, type Site } from '@/lib/domain/site'
import { formatDateRange, formatRelativeTime } from '@/lib/format'

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

// react-day-picker + date-fns chỉ cần khi mở dialog "Tuỳ chỉnh…" — tách
// khỏi bundle JS của Topbar (render trên MỌI trang) thay vì buộc mọi lượt tải
// trang đầu tiên phải tải cả thư viện lịch dù phần lớn người dùng chỉ bấm
// preset có sẵn.
const DatePickerField = dynamic(
  () => import('@/components/ui/date-picker-field').then((mod) => mod.DatePickerField),
  { ssr: false },
)

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
  const searchParams = useSearchParams()
  const preset = parseRangeParam(searchParams.get('range') ?? undefined)
  const customRange = parseCustomRangeParams(
    searchParams.get('from') ?? undefined,
    searchParams.get('to') ?? undefined,
  )
  const compareRange = parseCompareRangeParams(
    searchParams.get('compareFrom') ?? undefined,
    searchParams.get('compareTo') ?? undefined,
  )
  const { setOpen } = useMobileNav()

  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-[var(--topbar-h)] items-center gap-2 sm:gap-3',
        'border-b border-[var(--color-rule)] bg-[var(--color-paper)]/85 px-3 backdrop-blur sm:px-5',
        // Notch/Dynamic Island trên iOS landscape — no-op ở mọi nơi khác vì
        // `env(safe-area-inset-top)` = 0 khi không có vùng che (cần
        // `viewport-fit=cover` khai báo ở `app/layout.tsx`).
        'pt-[env(safe-area-inset-top)]',
      )}
    >
      {/* Thay `SideRail` trên mobile (ẩn dưới `lg:`, xem side-rail.tsx) — mở
          `MobileNavDrawer` cùng cấp, chia sẻ state qua `MobileNavProvider`. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mở menu điều hướng"
        className="shrink-0 lg:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden className="size-5" />
      </Button>

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

        <DateRangeMenu preset={preset} customRange={customRange} compareRange={compareRange} />

        {/* Chuyển vào chân `MobileNavDrawer` trên mobile — nhường chỗ cho
            SiteSwitcher/DateRangeMenu, hai control người dùng chạm thường
            xuyên hơn hẳn. Vẫn ở đây nguyên trạng từ `lg:` trở lên. */}
        <div className="hidden lg:flex lg:items-center lg:gap-2">
          <SyncAllButton siteId={site.id} />
          <ThemeToggle />
        </div>
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
        <Button variant="ghost" size="sm" className="min-w-0 max-w-[8rem] gap-1.5 sm:max-w-[11rem] lg:max-w-[14rem]">
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

function DateRangeMenu({
  preset,
  customRange,
  compareRange,
}: {
  readonly preset: DateRangePreset
  readonly customRange: { readonly start: string; readonly end: string } | null
  /** Kỳ so sánh người dùng tự chọn, khác kỳ trước tự động — xem
   * `parseCompareRangeParams`. Áp dụng độc lập với `preset`/`customRange`,
   * không bị xoá khi đổi preset chính (người dùng có thể muốn giữ nguyên
   * một kỳ so sánh cố định trong lúc thử nhiều preset chính khác nhau). */
  readonly compareRange: { readonly start: string; readonly end: string } | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [customDialogOpen, setCustomDialogOpen] = useState(false)
  const [from, setFrom] = useState(customRange?.start ?? '')
  const [to, setTo] = useState(customRange?.end ?? '')
  const [compareDialogOpen, setCompareDialogOpen] = useState(false)
  const [compareFrom, setCompareFrom] = useState(compareRange?.start ?? '')
  const [compareTo, setCompareTo] = useState(compareRange?.end ?? '')
  // Đổi khoảng ngày = điều hướng, đợi cả trang render lại phía server. Không
  // bọc trong transition thì nút bấm không đổi trạng thái gì cho tới khi
  // trang mới xong hẳn — CẢM GIÁC như bấm không ăn. `isPending` cho nút biết
  // để tự hiện spinner ngay lập tức.
  const [isPending, startTransition] = useTransition()

  const choose = (next: DateRangePreset) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', next)
    params.delete('from')
    params.delete('to')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const applyCustom = () => {
    if (!from || !to || from > to) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', 'custom')
    params.set('from', from)
    params.set('to', to)
    setCustomDialogOpen(false)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const applyCompare = () => {
    if (!compareFrom || !compareTo || compareFrom > compareTo) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('compareFrom', compareFrom)
    params.set('compareTo', compareTo)
    setCompareDialogOpen(false)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const clearCompare = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('compareFrom')
    params.delete('compareTo')
    setCompareFrom('')
    setCompareTo('')
    setCompareDialogOpen(false)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const triggerLabel =
    preset === 'custom' && customRange
      ? formatDateRange(customRange.start, customRange.end)
      : DATE_RANGE_LABELS[preset]

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            state={isPending ? 'loading' : 'idle'}
            aria-label={`Khoảng ngày: ${triggerLabel}`}
          >
            {/* Chỉ icon dưới `sm:` — nhãn preset ("7 ngày qua"…) cùng
                SiteSwitcher/hamburger không đủ chỗ trên 320-375px, xem audit
                mobile. `aria-label` bù lại tên đầy đủ cho screen reader. */}
            <Calendar aria-hidden className="size-3.5 sm:hidden" />
            <span className="hidden sm:inline">{triggerLabel}</span>
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

            <div className="my-1 border-t border-[var(--color-rule)]" />

            {/* Mở Dialog riêng thay vì điều hướng ngay — cần 2 ngày (từ/đến)
                trước khi có một khoảng ngày hợp lệ để chuyển tới, khác các
                preset ở trên chỉ cần một lượt bấm. */}
            <DropdownMenu.Item
              onSelect={(event) => {
                event.preventDefault()
                setCustomDialogOpen(true)
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
                'text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none',
                'data-[highlighted]:bg-[var(--color-paper-3)]',
              )}
            >
              <Calendar
                aria-hidden
                className={cn(
                  'size-3.5 shrink-0',
                  preset === 'custom' ? 'text-[var(--color-signal)]' : 'text-[var(--color-ink-3)]',
                )}
              />
              Tuỳ chỉnh…
            </DropdownMenu.Item>

            {/* So sánh áp dụng ĐỘC LẬP với preset chính — mọi kênh (Tổng
                quan, và về sau các trang khác) đọc `previousStart`/
                `previousEnd` từ `resolveDateRange` để tính delta, không
                quan tâm preset chính là gì, nên đặt lựa chọn này ngay trong
                cùng menu thay vì phải mở lại "Tuỳ chỉnh…". */}
            <DropdownMenu.Item
              onSelect={(event) => {
                event.preventDefault()
                setCompareDialogOpen(true)
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
                'text-[length:var(--text-sm)] text-[var(--color-ink)] outline-none',
                'data-[highlighted]:bg-[var(--color-paper-3)]',
              )}
            >
              <GitCompare
                aria-hidden
                className={cn('size-3.5 shrink-0', compareRange ? 'text-[var(--color-signal)]' : 'text-[var(--color-ink-3)]')}
              />
              {compareRange ? 'Đổi kỳ so sánh…' : 'So sánh với…'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {compareRange ? (
        <button
          type="button"
          onClick={clearCompare}
          className={cn(
            'hidden items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1 lg:inline-flex',
            'border border-[var(--color-signal)]/30 bg-[var(--color-signal-soft)]',
            'text-[length:var(--text-2xs)] font-medium text-[var(--color-signal)]',
          )}
          title="Bỏ kỳ so sánh"
        >
          <GitCompare aria-hidden className="size-3" />
          So với {formatDateRange(compareRange.start, compareRange.end)}
          <X aria-hidden className="size-3" />
        </button>
      ) : null}

      <DialogRoot open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent
          title="Chọn kỳ so sánh"
          description="Mặc định app tự so với kỳ liền trước cùng độ dài — chọn ở đây nếu muốn so với một khoảng ngày khác, ví dụ cùng kỳ năm ngoái."
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                  Từ ngày
                </label>
                <DatePickerField
                  name="compareFrom"
                  defaultValue={compareFrom}
                  onValueChange={setCompareFrom}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                  Đến ngày
                </label>
                <DatePickerField
                  name="compareTo"
                  defaultValue={compareTo}
                  minDate={compareFrom || undefined}
                  onValueChange={setCompareTo}
                />
              </div>
            </div>

            {compareFrom && compareTo && compareFrom > compareTo ? (
              <p className="text-[length:var(--text-xs)] text-[var(--color-negative)]">
                Ngày kết thúc phải sau ngày bắt đầu.
              </p>
            ) : null}

            <div className="flex gap-2">
              {compareRange ? (
                <Button type="button" variant="secondary" size="md" className="flex-1" onClick={clearCompare}>
                  Bỏ so sánh
                </Button>
              ) : null}
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={!compareFrom || !compareTo || compareFrom > compareTo}
                onClick={applyCompare}
              >
                Áp dụng
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent
          title="Chọn khoảng ngày tuỳ chỉnh"
          description="Chọn đúng khoảng ngày bạn biết có dữ liệu — ví dụ ngày đăng video thay vì phỏng đoán theo preset có sẵn."
        >
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                  Từ ngày
                </label>
                <DatePickerField
                  name="from"
                  defaultValue={from}
                  onValueChange={setFrom}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                  Đến ngày
                </label>
                <DatePickerField
                  name="to"
                  defaultValue={to}
                  minDate={from || undefined}
                  onValueChange={setTo}
                />
              </div>
            </div>

            {from && to && from > to ? (
              <p className="text-[length:var(--text-xs)] text-[var(--color-negative)]">
                Ngày kết thúc phải sau ngày bắt đầu.
              </p>
            ) : null}

            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full"
              disabled={!from || !to || from > to}
              onClick={applyCustom}
            >
              Áp dụng
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

const RESYNC_INITIAL_STATE: ResyncState = { error: null, started: false }

/**
 * "Đồng bộ lại" đồng bộ THẬT: kéo lại số liệu của mọi connection, và gỡ
 * những connection không còn khớp domain của Site này — trường hợp một tài
 * khoản Google quản lý nhiều website và một kết nối cũ lỡ gắn nhầm tài sản
 * của website khác. Việc đồng bộ thật chạy NỀN qua `after()` (xem
 * `lib/actions/sync.ts`) — action trả lời gần như ngay lập tức nên không còn
 * biết số `synced`/`removed` LÚC BẤM, chỉ báo "đã bắt đầu"; số liệu thật tự
 * hiện qua chỉ báo "Đồng bộ … trước" ở topbar khi tải lại/điều hướng tiếp.
 */
// `null` khi không có gì đáng báo (chưa bấm lần nào, không lỗi) — im lặng
// còn hơn một thông báo không mang thông tin gì, đứng chình ình cho tới lần
// bấm tiếp theo và dễ đè lên các trạng thái khác ở góc trên cùng.
function describeResync(state: ResyncState): string | null {
  if (state.error) return state.error
  if (state.started) return 'Đang đồng bộ nền — bạn có thể tiếp tục thao tác khác, số liệu sẽ tự cập nhật khi xong.'
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
