'use client'

import { useActionState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  confirmPendingGoogleConnectionAction,
  dismissPendingGoogleConnectionAction,
  type ConfirmPendingGoogleConnectionState,
  type DismissPendingGoogleConnectionState,
} from '@/lib/actions/pending-google-connections'

const CONFIRM_INITIAL_STATE: ConfirmPendingGoogleConnectionState = { error: null, success: false }
const DISMISS_INITIAL_STATE: DismissPendingGoogleConnectionState = { error: null, done: false }

/** Một hàng ứng viên — "Kết nối" (ghi thật + đồng bộ) hoặc "Bỏ qua" (chỉ xoá
 * gợi ý). Hai action độc lập, không dùng chung state — bấm cái này không
 * được khoá luôn nút kia. */
export function PendingGoogleConnectionRow({ pendingId }: { readonly pendingId: string }) {
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmPendingGoogleConnectionAction,
    CONFIRM_INITIAL_STATE,
  )
  const [dismissState, dismissAction, dismissPending] = useActionState(
    dismissPendingGoogleConnectionAction,
    DISMISS_INITIAL_STATE,
  )

  if (confirmState.success || dismissState.done) return null

  return (
    <div className="flex shrink-0 items-center gap-2">
      <form action={dismissAction}>
        <input type="hidden" name="pendingId" value={pendingId} />
        <Button type="submit" variant="ghost" size="sm" state={dismissPending ? 'loading' : 'idle'}>
          <X aria-hidden className="size-3.5" />
          Bỏ qua
        </Button>
      </form>
      <form action={confirmAction} className="flex items-center gap-2">
        <input type="hidden" name="pendingId" value={pendingId} />
        <Button type="submit" variant="secondary" size="sm" state={confirmPending ? 'loading' : 'idle'}>
          <Check aria-hidden className="size-3.5" />
          Kết nối
        </Button>
        {confirmState.error ? (
          <span role="alert" className="text-[length:var(--text-xs)] text-[var(--color-negative)]">
            {confirmState.error}
          </span>
        ) : null}
      </form>
    </div>
  )
}
