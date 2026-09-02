'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Check, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { createPromptAction } from '@/lib/actions/prompts'
import { Textarea } from '@/components/ui/textarea'
import {
  PROMPT_CATEGORY_LABELS,
  VARIABLE_SOURCE_LABELS,
  type PromptCategory,
  type PromptVariable,
  type PromptVariableSource,
} from '@/lib/domain/prompt'

const EMPTY_VARIABLE: PromptVariable = {
  name: '',
  label: '',
  source: 'manual',
  required: true,
  defaultValue: null,
  description: '',
}

/* Hallmark · component: new-prompt-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Khai báo biến ở ĐÂY (không suy ra từ template) — cùng nguyên tắc với
 * `resolveVariables`: registry biến `metric`/`entity` hữu hạn và tường minh,
 * không đoán ngầm tên biến nào khớp nguồn nào.
 */
export function NewPromptDialog({ siteId }: { readonly siteId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [variables, setVariables] = useState<readonly PromptVariable[]>([])

  const resetAndClose = () => {
    setVariables([])
    setError(null)
    setOk(false)
    setOpen(false)
  }

  const updateVariable = (index: number, patch: Partial<PromptVariable>) => {
    setVariables((prev) => prev.map((variable, i) => (i === index ? { ...variable, ...patch } : variable)))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const category = String(formData.get('category') ?? 'analysis') as PromptCategory
    const tags = String(formData.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    const systemPrompt = String(formData.get('systemPrompt') ?? '')
    const userTemplate = String(formData.get('userTemplate') ?? '')

    const cleanedVariables = variables
      .map((variable) => ({ ...variable, name: variable.name.trim(), label: variable.label.trim() }))
      .filter((variable) => variable.name.length > 0)

    setError(null)
    startTransition(async () => {
      const result = await createPromptAction({
        siteId,
        name,
        description,
        category,
        tags,
        variables: cleanedVariables,
        systemPrompt,
        userTemplate,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setOk(true)
      setTimeout(resetAndClose, 800)
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Plus aria-hidden className="size-4" />
          Prompt mới
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Prompt mới"
        description="Biến khai báo ở đây phải khớp tên dùng trong template ({{tên_biến}}) — biến chưa khai báo sẽ bị chặn khi lưu."
        className="w-[min(680px,calc(100vw-2rem))]"
      >
        <form key={open ? 'open' : 'closed'} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Tên prompt" htmlFor="new-prompt-name">
            <input id="new-prompt-name" name="name" required className={inputClass} />
          </FormField>

          <FormField label="Mô tả" htmlFor="new-prompt-description">
            <input id="new-prompt-description" name="description" required className={inputClass} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Nhóm" htmlFor="new-prompt-category">
              <select id="new-prompt-category" name="category" required defaultValue="analysis" className={inputClass}>
                {Object.entries(PROMPT_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Tags" htmlFor="new-prompt-tags" hint="Cách nhau bằng dấu phẩy.">
              <input id="new-prompt-tags" name="tags" className={inputClass} />
            </FormField>
          </div>

          <FormField label="System prompt" htmlFor="new-prompt-system">
            <Textarea id="new-prompt-system" name="systemPrompt" required rows={3} className={inputClass} />
          </FormField>

          <FormField label="User template" htmlFor="new-prompt-template" hint="Biến chèn bằng {{tên_biến}}.">
            <Textarea id="new-prompt-template" name="userTemplate" required rows={4} className={inputClass} />
          </FormField>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 flex w-full items-center justify-between text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              Biến
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setVariables((prev) => [...prev, EMPTY_VARIABLE])}
              >
                <Plus aria-hidden className="size-3.5" />
                Thêm biến
              </Button>
            </legend>

            {variables.length === 0 ? (
              <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                Chưa có biến nào — thêm nếu template dùng {'{{tên_biến}}'}.
              </p>
            ) : null}

            {variables.map((variable, index) => (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule)] p-3"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Tên biến"
                    placeholder="tên_biến"
                    value={variable.name}
                    onChange={(event) => updateVariable(index, { name: event.target.value })}
                    className={inputClass}
                  />
                  <input
                    aria-label="Nhãn hiển thị"
                    placeholder="Nhãn hiển thị"
                    value={variable.label}
                    onChange={(event) => updateVariable(index, { label: event.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                  <select
                    aria-label="Nguồn dữ liệu"
                    value={variable.source}
                    onChange={(event) =>
                      updateVariable(index, { source: event.target.value as PromptVariableSource })
                    }
                    className={inputClass}
                  >
                    {Object.entries(VARIABLE_SOURCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <label className="flex items-center gap-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                    <input
                      type="checkbox"
                      checked={variable.required}
                      onChange={(event) => updateVariable(index, { required: event.target.checked })}
                      className="size-3.5 accent-[var(--color-accent)]"
                    />
                    Bắt buộc
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Xoá biến"
                    onClick={() => setVariables((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>

                <input
                  aria-label="Mô tả biến"
                  placeholder="Mô tả — biến này lấy từ đâu, dùng để làm gì"
                  value={variable.description}
                  onChange={(event) => updateVariable(index, { description: event.target.value })}
                  className={inputClass}
                />
              </div>
            ))}
          </fieldset>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
              {error}
            </p>
          ) : null}

          {ok ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã tạo prompt.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            state={pending ? 'loading' : 'idle'}
            loadingLabel="Đang tạo…"
            className="w-full"
          >
            Tạo prompt
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
