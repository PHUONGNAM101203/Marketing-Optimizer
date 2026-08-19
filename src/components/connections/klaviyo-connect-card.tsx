'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, KeyRound, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { ProviderMark } from '@/components/connections/provider-mark'
import { connectKlaviyo, type ConnectKlaviyoState } from '@/lib/actions/klaviyo-connection'

/* Hallmark · component: klaviyo-connect-card · theme: studied-DNA (Ink & Signal)
 *
 * Klaviyo KHÔNG thuộc OAuth family nào (`PROVIDER_FAMILIES`) — connect qua
 * private API key dán trực tiếp, nên nó cần thẻ + dialog RIÊNG thay vì đi
 * qua `ConnectPanel` (khối đó chỉ hiểu OAuth). Cùng vị trí với
 * `GtmPicker`/`GoogleAdsPicker`/`MetaAdsPicker` trên trang Kết nối.
 */

const INITIAL_STATE: ConnectKlaviyoState = { error: null, success: false }

export function KlaviyoConnectCard({ siteId }: { readonly siteId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ConnectKlaviyoState, FormData>(
    connectKlaviyo,
    INITIAL_STATE,
  )

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => setOpen(false), 800)
      return () => clearTimeout(timeout)
    }
  }, [state.success])

  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <ProviderMark provider="klaviyo" />
        <div className="min-w-0">
          <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">Klaviyo</p>
          <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            Campaign, flow, khách hàng, segment — dán private API key, không cần đăng nhập.
          </p>
        </div>
      </div>

      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="md">
            <KeyRound aria-hidden className="size-4" />
            Kết nối Klaviyo
          </Button>
        </DialogTrigger>

        <DialogContent
          title="Kết nối Klaviyo"
          description="Vào Klaviyo → Settings → API Keys → Create Private API Key (quyền đọc là đủ). Key được mã hoá trước khi lưu."
        >
          <form key={open ? 'open' : 'closed'} action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="siteId" value={siteId} />

            <FormField label="Private API key" htmlFor="klaviyo-api-key">
              <input
                id="klaviyo-api-key"
                name="apiKey"
                type="password"
                required
                autoComplete="off"
                placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className={`${inputClass} font-mono`}
              />
            </FormField>

            {state.error ? (
              <p className="flex items-center gap-1.5 text-[length:var(--text-sm)] text-[var(--color-negative)]">
                <TriangleAlert aria-hidden className="size-4 shrink-0" />
                {state.error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="md" disabled={pending} className="self-end">
              {state.success ? (
                <>
                  <Check aria-hidden className="size-4" />
                  Đã kết nối
                </>
              ) : (
                'Kết nối'
              )}
            </Button>
          </form>
        </DialogContent>
      </DialogRoot>
    </Card>
  )
}
