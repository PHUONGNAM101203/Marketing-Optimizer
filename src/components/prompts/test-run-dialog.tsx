'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { Check, PlayCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { testRunPromptAction } from '@/lib/actions/prompts'
import type { PromptRun, PromptTemplate } from '@/lib/domain/prompt'
import { Textarea } from '@/components/ui/textarea'

/* Hallmark · component: test-run-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Biến nguồn `manual` là biến duy nhất cần người dùng gõ tay ở đây — `site`/
 * `metric`/`entity` được `testRunPromptAction` tự điền từ dữ liệu Site
 * (xem `lib/prompts/resolve-variables.ts`), nên form này chỉ hỏi đúng phần
 * mô hình không thể tự biết.
 */
export function TestRunDialog({
  prompt,
  siteId,
  range,
  onRunComplete,
}: {
  readonly prompt: PromptTemplate
  readonly siteId: string
  readonly range: { readonly start: string; readonly end: string }
  readonly onRunComplete: (run: PromptRun) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const current = prompt.versions.find((version) => version.id === prompt.currentVersionId)
  const manualVariables = prompt.variables.filter((variable) => variable.source === 'manual')

  useEffect(() => {
    if (!ok) return
    const timeout = setTimeout(() => {
      setOpen(false)
      setOk(false)
    }, 900)
    return () => clearTimeout(timeout)
  }, [ok])

  if (!current) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const manualInputs: Record<string, string> = {}
    for (const variable of manualVariables) {
      manualInputs[variable.name] = String(formData.get(variable.name) ?? '')
    }

    setError(null)
    startTransition(async () => {
      const result = await testRunPromptAction({
        siteId,
        promptId: prompt.id,
        versionId: current.id,
        systemPrompt: current.systemPrompt,
        userTemplate: current.userTemplate,
        variables: prompt.variables,
        range,
        manualInputs,
      })

      if (result.error || !result.run) {
        setError(result.error ?? 'Không chạy được — thử lại.')
        return
      }

      onRunComplete(result.run)
      setOk(true)
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <PlayCircle aria-hidden className="size-4" />
          Chạy thử
        </Button>
      </DialogTrigger>

      <DialogContent
        title={`Chạy thử — ${prompt.name}`}
        description={
          manualVariables.length > 0
            ? 'Điền các biến nhập tay bên dưới. Biến từ Site/số liệu/thực thể được tự động điền.'
            : 'Mọi biến của prompt này lấy tự động từ dữ liệu Site — không cần nhập gì thêm.'
        }
      >
        <form key={open ? 'open' : 'closed'} onSubmit={handleSubmit} className="flex flex-col gap-4">
          {manualVariables.map((variable) => (
            <FormField
              key={variable.name}
              label={`${variable.label}${variable.required ? '' : ' (không bắt buộc)'}`}
              htmlFor={`manual-${variable.name}`}
              hint={variable.description}
            >
              <Textarea
                id={`manual-${variable.name}`}
                name={variable.name}
                required={variable.required}
                rows={3}
                defaultValue={variable.defaultValue ?? ''}
                className={inputClass}
              />
            </FormField>
          ))}

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
              Đã chạy xong — xem kết quả ở &ldquo;Lượt chạy gần đây&rdquo;.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            state={pending ? 'loading' : 'idle'}
            loadingLabel="Đang gọi Claude…"
            className="w-full"
          >
            Chạy
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
