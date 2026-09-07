'use client'

import { useActionState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { restoreConnectionAction } from '@/lib/actions/connections'

/* Hallmark · component: restore-connection-button · theme: studied-DNA (Ink & Signal)
 *
 * Không hỏi lại trước khi khôi phục — khác hẳn nút Ngắt kết nối. Khôi phục là
 * hành động ĐẢO NGƯỢC ĐƯỢC và không mất gì; bắt xác nhận một việc vô hại chỉ
 * làm người dùng chai lì với hộp thoại xác nhận, rồi bấm bừa ở đúng chỗ nguy
 * hiểm thật.
 */
export function RestoreConnectionButton({ connectionId }: { readonly connectionId: string }) {
  const [state, formAction, pending] = useActionState(restoreConnectionAction, {
    error: null,
    done: false,
  })

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="connectionId" value={connectionId} />
      <Button type="submit" variant="secondary" size="sm" state={pending ? 'loading' : 'idle'}>
        <RotateCcw aria-hidden className="size-3.5" />
        Khôi phục
      </Button>
      {state.error ? (
        <p className="text-[length:var(--text-2xs)] text-[var(--color-negative)]">{state.error}</p>
      ) : null}
    </form>
  )
}
