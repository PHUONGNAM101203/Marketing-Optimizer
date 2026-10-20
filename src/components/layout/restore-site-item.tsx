'use client'

import { useActionState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { restoreSiteAction } from '@/lib/actions/site'

/* Hallmark · component: restore-site-item · theme: studied-DNA (Ink & Signal)
 *
 * Lối khôi phục website nằm TRONG trình chọn website, không phải trang Cài
 * đặt. Lý do cụ thể: trang Cài đặt thuộc về chính website đã xoá, mà website
 * đã xoá thì không mở được nữa — một nút hoàn tác không bấm tới được thì không
 * phải hoàn tác.
 */
export function RestoreSiteItem({
  siteId,
  name,
  domain,
}: {
  readonly siteId: string
  readonly name: string
  readonly domain: string
}) {
  const [state, formAction, pending] = useActionState(restoreSiteAction, { error: null })

  return (
    <form action={formAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5',
          'text-left text-[length:var(--text-sm)] text-[var(--color-ink-2)] outline-none',
          'hover:bg-[var(--color-paper-3)] disabled:opacity-60',
        )}
      >
        <RotateCcw aria-hidden className="size-3.5 shrink-0 text-[var(--color-ink-3)]" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
          {pending ? 'đang khôi phục…' : domain}
        </span>
      </button>
      {state.error ? (
        <p className="px-2 pb-1 text-[length:var(--text-2xs)] text-[var(--color-negative)]">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
