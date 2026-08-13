'use client'

import { useActionState } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runSiteAuditAction, type RunAuditState } from '@/lib/actions/audit'
import type { AuditRunStatus } from '@/lib/domain/audit'

/* Hallmark · component: run-audit-button · theme: studied-DNA (Ink & Signal)
 *
 * Quét chạy NỀN (xem `lib/actions/audit.ts`) — action trả lời gần như ngay
 * lập tức, nên KHÔNG dùng `pending` cục bộ (từ `useActionState`) để biết còn
 * đang quét hay không, chỉ dùng được vài trăm mili-giây đầu. Trạng thái
 * "đang quét" phải đọc từ SERVER (`status` truyền vào từ trang, đọc lại từ
 * `audit_runs`) — đúng để hiện lại sau khi tải lại trang hay quay lại sau.
 */

const INITIAL_STATE: RunAuditState = { error: null, ok: false }

export function RunAuditButton({
  siteId,
  status,
  truncated,
}: {
  readonly siteId: string
  readonly status: AuditRunStatus | null
  readonly truncated: boolean
}) {
  const [state, formAction, pending] = useActionState<RunAuditState, FormData>(
    runSiteAuditAction,
    INITIAL_STATE,
  )

  const isRunning = status === 'running'
  // 'failed' bao gồm cả lượt bị tự nhận diện là "gián đoạn giữa chừng" (xem
  // data/audit.ts) — vẫn có thể còn tiến độ đã quét trước đó, nên "Quét tiếp"
  // đúng hơn "Quét lại" (ngụ ý bắt đầu từ đầu).
  const label = !status
    ? 'Quét toàn site'
    : isRunning
      ? 'Đang quét nền…'
      : status === 'completed' && !truncated
        ? 'Quét lại'
        : 'Quét tiếp'

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      <Button
        type="submit"
        variant={status ? 'secondary' : 'primary'}
        size="md"
        disabled={pending || isRunning}
        state={pending || isRunning ? 'loading' : 'idle'}
        loadingLabel={
          isRunning ? 'Đang quét nền… có thể rời trang, không bị gián đoạn' : 'Đang bắt đầu…'
        }
      >
        <RefreshCw aria-hidden className="size-4" />
        {label}
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
