'use client'

import { useState, useTransition } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { approvePendingActionAction, rejectPendingActionAction } from '@/lib/actions/agents'

type Decision = 'approved' | 'rejected'

/* Hallmark · component: approval-actions · theme: studied-DNA (Ink & Signal)
 *
 * "Duyệt" KHÔNG gọi nền tảng ngoài — nó chỉ đánh dấu quyết định trên hàng
 * `pending_actions` (xem `decidePendingAction`). Việc GHI thật sang Google
 * Ads/Meta/... là một module thực thi riêng, chưa tồn tại. Vì vậy nhãn nút và
 * badge sau khi duyệt phải nói đúng "chờ triển khai", không được ngụ ý là đã
 * áp dụng — nói sai ở đây tức là hứa hẹn một hành vi hệ thống chưa làm.
 */
export function ApprovalActions({
  siteId,
  actionId,
}: {
  readonly siteId: string
  readonly actionId: string
}) {
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<Decision | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [error, setError] = useState<string | null>(null)

  const decide = (next: Decision) => {
    setError(null)
    setBusy(next)
    startTransition(async () => {
      try {
        if (next === 'approved') {
          await approvePendingActionAction(siteId, actionId)
        } else {
          await rejectPendingActionAction(siteId, actionId)
        }
        setDecision(next)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không lưu được quyết định.')
      } finally {
        setBusy(null)
      }
    })
  }

  if (decision === 'approved') {
    return (
      <Badge tone="positive" icon={<Check aria-hidden className="size-3" />}>
        Đã duyệt · chờ triển khai ghi thật
      </Badge>
    )
  }

  if (decision === 'rejected') {
    return (
      <Badge tone="neutral" icon={<X aria-hidden className="size-3" />}>
        Đã từ chối
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="primary"
        size="md"
        state={busy === 'approved' ? 'loading' : 'idle'}
        loadingLabel="Đang duyệt…"
        disabled={isPending}
        onClick={() => decide('approved')}
      >
        Duyệt
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="md"
        state={busy === 'rejected' ? 'loading' : 'idle'}
        loadingLabel="Đang từ chối…"
        disabled={isPending}
        onClick={() => decide('rejected')}
      >
        Từ chối
      </Button>
      {error ? (
        <span
          role="alert"
          className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-negative)]"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </span>
      ) : null}
    </div>
  )
}
