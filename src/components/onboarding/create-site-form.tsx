'use client'

import { useActionState } from 'react'
import { ArrowRight, Globe, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { createSite, type CreateSiteState } from '@/lib/actions/site'

export function CreateSiteForm() {
  const [state, formAction, pending] = useActionState<CreateSiteState, FormData>(
    createSite,
    { error: null },
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Globe
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[var(--color-ink-3)]"
          />
          <input
            type="text"
            name="url"
            required
            autoFocus
            // `type="text"` chứ không phải `type="url"`: validation sẵn có của
            // trình duyệt bắt buộc phải gõ "https://", trong khi hầu như không
            // ai gõ như vậy. Server tự thêm giao thức khi thiếu.
            inputMode="url"
            placeholder="website-cua-ban.vn"
            aria-label="Địa chỉ website"
            aria-invalid={state.error ? true : undefined}
            className={cn(
              'h-12 w-full rounded-[var(--radius-md)] pl-10',
              'border border-[var(--color-rule-strong)] bg-[var(--color-paper)]',
              'text-[length:var(--text-base)] text-[var(--color-ink)]',
              'placeholder:text-[var(--color-ink-3)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
            )}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          state={pending ? 'loading' : 'idle'}
          loadingLabel="Đang tạo…"
          className="shrink-0"
        >
          Tiếp tục
          {!pending ? <ArrowRight aria-hidden className="size-4" /> : null}
        </Button>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
        >
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]"
          />
          {state.error}
        </p>
      ) : (
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
          Chưa cần cấp quyền gì. Bước tiếp theo mới chọn tài khoản để kết nối.
        </p>
      )}
    </form>
  )
}
