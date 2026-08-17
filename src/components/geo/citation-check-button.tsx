'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runCitationCheckAction, type CitationCheckState } from '@/lib/actions/citation-checks'

const INITIAL_STATE: CitationCheckState = { error: null, cited: null }

/* Hallmark · component: citation-check-button · theme: studied-DNA (Ink & Signal)
 *
 * Gọi API AI thật (vài giây) — dùng `useActionState` để có `pending` thật sự
 * hữu ích (khác `RunAuditButton`, nơi action trả lời gần như ngay lập tức vì
 * chạy nền qua `after()`; ở đây action ĐỢI thẳng phản hồi model trước khi
 * trả về, nên pending phản ánh đúng thời gian chờ thật).
 */
export function CitationCheckButton({
  siteId,
  promptId,
  promptText,
}: {
  readonly siteId: string
  readonly promptId: string
  readonly promptText: string
}) {
  const [state, formAction, pending] = useActionState<CitationCheckState, FormData>(
    runCitationCheckAction,
    INITIAL_STATE,
  )

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="promptId" value={promptId} />
      <input type="hidden" name="promptText" value={promptText} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
        state={pending ? 'loading' : 'idle'}
        loadingLabel="Đang hỏi AI…"
      >
        Kiểm tra ngay
      </Button>
      {state.error ? (
        <span
          role="alert"
          className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-negative)]"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
