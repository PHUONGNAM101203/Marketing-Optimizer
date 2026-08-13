'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import {
  createTrackedPromptAction,
  type TrackedPromptActionState,
} from '@/lib/actions/tracked-prompts'
import { AI_ENGINE_LABELS, AI_ENGINES, PROMPT_INTENT_LABELS } from '@/lib/domain/geo'

const INITIAL_STATE: TrackedPromptActionState = { error: null, ok: false }

export function AddTrackedPromptDialog({ siteId }: { readonly siteId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<TrackedPromptActionState, FormData>(
    createTrackedPromptAction,
    INITIAL_STATE,
  )

  useEffect(() => {
    if (state.ok) {
      const timeout = setTimeout(() => setOpen(false), 800)
      return () => clearTimeout(timeout)
    }
  }, [state.ok])

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Plus aria-hidden className="size-4" />
          Thêm câu hỏi theo dõi
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Thêm câu hỏi theo dõi"
        description="Câu hỏi thật người dùng có thể hỏi ChatGPT/Perplexity khi tìm tới lĩnh vực của bạn — không phải từ khoá, mà là một câu hỏi trọn vẹn."
      >
        <form key={open ? 'open' : 'closed'} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="siteId" value={siteId} />

          <FormField label="Câu hỏi" htmlFor="prompt-text">
            <textarea
              id="prompt-text"
              name="text"
              required
              rows={2}
              placeholder="Vd: Nội thất phòng khách phong cách tối giản nên chọn thương hiệu nào?"
              className={inputClass}
            />
          </FormField>

          <FormField label="Mục đích" htmlFor="prompt-intent">
            <select id="prompt-intent" name="intent" required defaultValue="informational" className={inputClass}>
              {Object.entries(PROMPT_INTENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Tần suất kiểm tra" htmlFor="prompt-cadence">
            <select id="prompt-cadence" name="cadence" required defaultValue="weekly" className={inputClass}>
              <option value="daily">Hằng ngày</option>
              <option value="weekly">Hằng tuần</option>
            </select>
          </FormField>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              Engine theo dõi
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {AI_ENGINES.map((engine) => (
                <label
                  key={engine}
                  className="flex items-center gap-2 text-[length:var(--text-sm)] text-[var(--color-ink-2)]"
                >
                  <input
                    type="checkbox"
                    name="engines"
                    value={engine}
                    defaultChecked={engine === 'chatgpt' || engine === 'perplexity'}
                    className="size-3.5 accent-[var(--color-accent)]"
                  />
                  {AI_ENGINE_LABELS[engine]}
                </label>
              ))}
            </div>
          </fieldset>

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
              {state.error}
            </p>
          ) : null}

          {state.ok ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã thêm.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            state={pending ? 'loading' : 'idle'}
            loadingLabel="Đang lưu…"
            className="w-full"
          >
            Thêm câu hỏi
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
