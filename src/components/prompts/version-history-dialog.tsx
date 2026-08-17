'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { Check, GitBranch, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { savePromptVersionAction } from '@/lib/actions/prompts'
import { formatDateTime } from '@/lib/format'
import type { PromptTemplate } from '@/lib/domain/prompt'

/* Hallmark · component: version-history-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Lịch sử bản không cần fetch riêng — `listPrompts` đã gộp sẵn toàn bộ
 * `versions` của prompt vào `PromptTemplate`. Form "Lưu bản mới" bên dưới là
 * chỗ duy nhất gọi `savePromptVersionAction`; `revalidatePath` trong action
 * đó tự làm mới danh sách khi dialog đóng lại.
 */
export function VersionHistoryDialog({
  prompt,
  siteId,
}: {
  readonly prompt: PromptTemplate
  readonly siteId: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const current = prompt.versions.find((version) => version.id === prompt.currentVersionId)

  // Đóng dialog theo cách nào cũng phải xoá `error`/`ok` cũ — không thì lần
  // mở lại sau vẫn còn hiện banner lỗi/thành công của lượt trước, dù chưa
  // submit gì ở lượt này.
  const resetAndClose = () => {
    setError(null)
    setOk(false)
    setOpen(false)
  }

  useEffect(() => {
    if (!ok) return
    const timeout = setTimeout(() => setOk(false), 1500)
    return () => clearTimeout(timeout)
  }, [ok])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const systemPrompt = String(formData.get('systemPrompt') ?? '')
    const userTemplate = String(formData.get('userTemplate') ?? '')
    const notesRaw = String(formData.get('notes') ?? '').trim()

    setError(null)
    startTransition(async () => {
      const result = await savePromptVersionAction({
        siteId,
        promptId: prompt.id,
        systemPrompt,
        userTemplate,
        notes: notesRaw.length > 0 ? notesRaw : null,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setOk(true)
    })
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <GitBranch aria-hidden className="size-3.5" />
          Xem {prompt.versions.length} phiên bản
        </Button>
      </DialogTrigger>

      <DialogContent
        title={`Phiên bản — ${prompt.name}`}
        description="Mỗi bản lưu là một mốc có thể so sánh — không sửa đè lên bản đang dùng."
        className="w-[min(680px,calc(100vw-2rem))]"
      >
        <ul className="mb-5 flex flex-col gap-2 border-b border-[var(--color-rule)] pb-5">
          {prompt.versions.map((version) => (
            <li key={version.id} className="flex flex-col gap-1 text-[length:var(--text-sm)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">v{version.version}</Badge>
                {version.id === prompt.currentVersionId ? (
                  <Badge tone="signal">Đang dùng</Badge>
                ) : null}
                <span className="text-[var(--color-ink-3)]">
                  {version.createdBy} · {formatDateTime(version.createdAt)}
                </span>
              </div>
              {version.notes ? (
                <p className="text-[var(--color-ink-2)]">{version.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
            Lưu bản mới
          </p>

          <FormField label="System prompt" htmlFor="version-system">
            <textarea
              id="version-system"
              name="systemPrompt"
              required
              rows={3}
              defaultValue={current?.systemPrompt}
              className={inputClass}
            />
          </FormField>

          <FormField label="User template" htmlFor="version-template" hint="Biến chèn bằng {{tên_biến}}.">
            <textarea
              id="version-template"
              name="userTemplate"
              required
              rows={5}
              defaultValue={current?.userTemplate}
              className={inputClass}
            />
          </FormField>

          <FormField label="Ghi chú (không bắt buộc)" htmlFor="version-notes" hint="Vì sao bản này khác bản trước.">
            <input id="version-notes" name="notes" className={inputClass} />
          </FormField>

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
              Đã lưu bản mới.
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
            Lưu làm bản mới
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
