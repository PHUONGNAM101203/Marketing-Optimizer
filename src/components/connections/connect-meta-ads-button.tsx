'use client'

import { useActionState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { connectMetaAdsAccount, type ConnectMetaAdsState } from '@/lib/actions/meta-ads'

const INITIAL_STATE: ConnectMetaAdsState = { error: null, success: false }

export function ConnectMetaAdsButton({
  siteId,
  adAccountId,
  accountName,
  alreadyConnected,
}: {
  readonly siteId: string
  readonly adAccountId: string
  readonly accountName: string
  readonly alreadyConnected: boolean
}) {
  const [state, formAction, pending] = useActionState<ConnectMetaAdsState, FormData>(
    connectMetaAdsAccount,
    INITIAL_STATE,
  )

  if (alreadyConnected || state.success) {
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
      <input type="hidden" name="adAccountId" value={adAccountId} />
      <input type="hidden" name="accountName" value={accountName} />
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
