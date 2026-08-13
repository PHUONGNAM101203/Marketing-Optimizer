'use client'

import { useActionState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { syncConnectionAction, type SyncConnectionState } from '@/lib/actions/sync'

const INITIAL_STATE: SyncConnectionState = { error: null, ok: false }

export function RefreshConnectionButton({
  connectionId,
}: {
  readonly connectionId: string
}) {
  const [state, formAction, pending] = useActionState<SyncConnectionState, FormData>(
    syncConnectionAction,
    INITIAL_STATE,
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="connectionId" value={connectionId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={state.error ?? undefined}
        title={state.error ?? undefined}
      >
        <RefreshCw aria-hidden className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
        Làm mới
      </Button>
    </form>
  )
}
