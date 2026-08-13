import { Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  deleteTrackedPromptAction,
  toggleTrackedPromptAction,
} from '@/lib/actions/tracked-prompts'
import { AI_ENGINE_LABELS, PROMPT_INTENT_LABELS, type TrackedPrompt } from '@/lib/domain/geo'

/**
 * Chưa nối API kiểm tra trích dẫn thật (xem callout ở trang chính) — thẻ này
 * chỉ hiện câu hỏi đã lưu THẬT và trạng thái bật/tắt, KHÔNG bịa số liệu
 * "đã được nhắc mấy lần" khi chưa có lượt kiểm tra nào thật sự chạy.
 */
export function TrackedPromptCard({
  prompt,
  siteId,
}: {
  readonly prompt: TrackedPrompt
  readonly siteId: string
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
            <Button type="submit" variant="secondary" size="sm">
              {prompt.enabled ? 'Tắt' : 'Bật'}
            </Button>
          </form>
          <form action={deleteTrackedPromptAction}>
            <input type="hidden" name="promptId" value={prompt.id} />
            <input type="hidden" name="siteId" value={siteId} />
            <Button type="submit" variant="ghost" size="icon" aria-label="Xoá câu hỏi">
              <Trash2 aria-hidden className="size-3.5 text-[var(--color-negative)]" />
            </Button>
          </form>
        </div>
      </div>

      <p className="mt-4 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
        Chưa có lượt kiểm tra nào — cần kết nối API AI để tự động hỏi và đọc câu trả lời.
      </p>
    </Card>
  )
}
