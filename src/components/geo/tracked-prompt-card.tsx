import { Check, Trash2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  deleteTrackedPromptAction,
  toggleTrackedPromptAction,
} from '@/lib/actions/tracked-prompts'
import { CitationCheckButton } from './citation-check-button'
import { AI_ENGINE_LABELS, PROMPT_INTENT_LABELS, type CitationCheck, type TrackedPrompt } from '@/lib/domain/geo'
import { formatRelativeTime } from '@/lib/format'

/**
 * `latestCheck` là lượt kiểm tra GẦN NHẤT trên MỘT engine — site chỉ cấu
 * hình được một provider AI tại một thời điểm (`site_ai_keys`), nên dù
 * `prompt.engines` liệt kê nhiều engine mong muốn, lượt kiểm tra thật sự
 * chạy được luôn giới hạn ở đúng engine site đang kết nối (xem docblock
 * `runCitationCheckAction`). `null` = chưa từng kiểm tra.
 */
export function TrackedPromptCard({
  prompt,
  siteId,
  latestCheck,
}: {
  readonly prompt: TrackedPrompt
  readonly siteId: string
  readonly latestCheck: CitationCheck | null
}) {
  return (
    <Card className="p-5" tone={prompt.enabled ? 'bordered' : 'inset'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--text-base)] font-medium text-[var(--color-ink)]">
            &ldquo;{prompt.text}&rdquo;
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="outline">{PROMPT_INTENT_LABELS[prompt.intent]}</Badge>
            <Badge tone="neutral">{prompt.cadence === 'daily' ? 'Hằng ngày' : 'Hằng tuần'}</Badge>
            {prompt.engines.map((engine) => (
              <Badge key={engine} tone="neutral">
                {AI_ENGINE_LABELS[engine]}
              </Badge>
            ))}
            {!prompt.enabled ? <Badge tone="neutral">Đã tắt</Badge> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <form action={toggleTrackedPromptAction}>
            <input type="hidden" name="promptId" value={prompt.id} />
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="enabled" value={prompt.enabled ? 'false' : 'true'} />
            <SubmitButton variant="secondary" size="sm">
              {prompt.enabled ? 'Tắt' : 'Bật'}
            </SubmitButton>
          </form>
          <form action={deleteTrackedPromptAction}>
            <input type="hidden" name="promptId" value={prompt.id} />
            <input type="hidden" name="siteId" value={siteId} />
            <SubmitButton variant="ghost" size="icon" aria-label="Xoá câu hỏi">
              <Trash2 aria-hidden className="size-3.5 text-[var(--color-negative)]" />
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--color-rule)] pt-4">
        {latestCheck ? (
          <div className="flex items-start gap-2.5">
            {latestCheck.cited ? (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]" />
            ) : (
              <X aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-ink-3)]" />
            )}
            <div>
              <p className="text-[length:var(--text-sm)] text-[var(--color-ink)]">
                {latestCheck.cited ? 'Được nhắc tới' : 'Chưa được nhắc tới'} trên{' '}
                {AI_ENGINE_LABELS[latestCheck.engine]} · {formatRelativeTime(latestCheck.checkedAt, new Date())}
              </p>
              {latestCheck.excerpt ? (
                <p className="mt-0.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  &ldquo;{latestCheck.excerpt}&rdquo;
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">Chưa có lượt kiểm tra nào.</p>
        )}
        <CitationCheckButton siteId={siteId} promptId={prompt.id} promptText={prompt.text} />
      </div>
    </Card>
  )
}
