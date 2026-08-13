'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateLlmsTxtAction, type GenerateLlmsTxtState } from '@/lib/actions/llms-txt'

const INITIAL_STATE: GenerateLlmsTxtState = { error: null, ok: false }

export function GenerateLlmsTxtButton({ siteId, label }: { readonly siteId: string; readonly label: string }) {
  const [state, formAction, pending] = useActionState<GenerateLlmsTxtState, FormData>(
    generateLlmsTxtAction,
    INITIAL_STATE,
  )

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="siteId" value={siteId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
        state={pending ? 'loading' : 'idle'}
        loadingLabel="Đang quét site…"
      >
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
