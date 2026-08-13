'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectGtmContainer, type ConnectGtmContainerState } from '@/lib/actions/gtm'

const INITIAL_STATE: ConnectGtmContainerState = { error: null, success: false }

export function ConnectGtmButton({
  siteId,
  containerPath,
  name,
}: {
  readonly siteId: string
  readonly containerPath: string
  readonly name: string
}) {
  const [state, formAction, pending] = useActionState<ConnectGtmContainerState, FormData>(
    connectGtmContainer,
    INITIAL_STATE,
  )

  if (state.success) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-positive)]">
        <Check aria-hidden className="size-3.5" />
        Đã kết nối
      </span>
    )
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="containerPath" value={containerPath} />
      <input type="hidden" name="name" value={name} />
      <Button type="submit" variant="secondary" size="sm" state={pending ? 'loading' : 'idle'}>
        Kết nối
      </Button>
      {state.error ? (
        <span
          role="alert"
          className="inline-flex items-center gap-1 text-[length:var(--text-xs)] text-[var(--color-negative)]"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
