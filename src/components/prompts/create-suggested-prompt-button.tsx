'use client'

import { useState, useTransition } from 'react'
import { Check, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createPromptAction } from '@/lib/actions/prompts'
import type { PromptTemplateSuggestion } from '@/lib/audit/prompt-template-suggestions'

/**
 * "Tạo prompt này" — gọi thẳng `createPromptAction` với nội dung suggestion
 * đã có sẵn (system prompt/user template/biến), không mở dialog "Prompt mới"
 * rồi bắt người dùng gõ lại — đúng ý "bấm là có sẵn khung, không phải nghĩ
 * từ đầu". Cùng pattern gọi trực tiếp (không qua FormData) như
 * `NewPromptDialog`, vì `createPromptAction` nhận object phẳng.
 */
export function CreateSuggestedPromptButton({
  siteId,
  suggestion,
}: {
  readonly siteId: string
  readonly suggestion: PromptTemplateSuggestion
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const handleCreate = () => {
    setError(null)
    startTransition(async () => {
      const result = await createPromptAction({
        siteId,
        name: suggestion.name,
        description: suggestion.description,
        category: suggestion.category,
        tags: [],
        variables: suggestion.variables,
        systemPrompt: suggestion.systemPrompt,
        userTemplate: suggestion.userTemplate,
      })

      if (result.error) {
        setError(result.error)
        return
      }
      setOk(true)
    })
  }

  if (ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-positive)]">
        <Check aria-hidden className="size-3.5" />
        Đã tạo
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        state={pending ? 'loading' : 'idle'}
        loadingLabel="Đang tạo…"
        onClick={handleCreate}
      >
        <Plus aria-hidden className="size-3.5" />
        Tạo prompt này
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
