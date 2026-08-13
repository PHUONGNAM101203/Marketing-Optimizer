'use client'

import { useActionState } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createTrackedPromptAction,
  type TrackedPromptActionState,
} from '@/lib/actions/tracked-prompts'
import type { PromptSuggestion } from '@/lib/audit/prompt-suggestions'

const INITIAL_STATE: TrackedPromptActionState = { error: null, ok: false }

export function AddSuggestedPromptButton({
  siteId,
  suggestion,
}: {
  readonly siteId: string
  readonly suggestion: PromptSuggestion
}) {
  const [state, formAction, pending] = useActionState<TrackedPromptActionState, FormData>(
    createTrackedPromptAction,
    INITIAL_STATE,
  )

  if (state.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-positive)]">
        <Check aria-hidden className="size-3.5" />
        Đã thêm
      </span>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="text" value={suggestion.text} />
      <input type="hidden" name="intent" value={suggestion.intent} />
      <input type="hidden" name="cadence" value="weekly" />
      <input type="hidden" name="engines" value="chatgpt" />
      <input type="hidden" name="engines" value="perplexity" />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} title={state.error ?? undefined}>
        <Plus aria-hidden className="size-3.5" />
        Thêm
      </Button>
    </form>
  )
}
