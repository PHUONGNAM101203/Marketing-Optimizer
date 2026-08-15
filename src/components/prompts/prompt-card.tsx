import { AlertTriangle, GitBranch } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TestRunDialog } from '@/components/prompts/test-run-dialog'
import { VersionHistoryDialog } from '@/components/prompts/version-history-dialog'
import {
  PROMPT_CATEGORY_LABELS,
  VARIABLE_SOURCE_LABELS,
  findUndeclaredVariables,
  type PromptRun,
  type PromptTemplate,
} from '@/lib/domain/prompt'
import { formatRelativeTime } from '@/lib/format'

/* Hallmark · component: prompt-card · theme: studied-DNA (Ink & Signal)
 *
 * Không tự đánh dấu 'use client' — component này chỉ được render từ
 * `PromptBoard` ('use client'), nên đã nằm trong cây client mà không cần
 * ranh giới riêng. Hai nút hành động là hai dialog client tự quản lý trạng
 * thái mở/đóng của chính chúng.
 */
export function PromptCard({
  prompt,
  siteId,
  range,
  now,
  onRunComplete,
}: {
  readonly prompt: PromptTemplate
  readonly siteId: string
  readonly range: { readonly start: string; readonly end: string }
  readonly now: Date
  readonly onRunComplete: (run: PromptRun) => void
}) {
  const current = prompt.versions.find((version) => version.id === prompt.currentVersionId)

  // Biến xuất hiện trong template nhưng chưa khai báo — lỗi thầm lặng kinh điển:
  // prompt chạy được, chỗ đó chỉ đơn giản là rỗng.
  const undeclared = current
    ? findUndeclaredVariables(current.userTemplate, prompt.variables)
    : []

  return (
    <Card>
      <CardHeader
        title={prompt.name}
        description={prompt.description}
        action={
          <div className="flex items-center gap-2">
            <Badge tone="outline" icon={<GitBranch aria-hidden className="size-3" />}>
              v{current?.version ?? '?'}
            </Badge>
            <Badge tone="neutral">{PROMPT_CATEGORY_LABELS[prompt.category]}</Badge>
          </div>
        }
        ruled
      />

      <CardBody className="pt-4">
        {undeclared.length > 0 ? (
          <p className="mb-3 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-caution-soft)] p-2.5 text-[length:var(--text-sm)] text-[var(--color-ink)]">
            <AlertTriangle
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-[var(--color-caution)]"
            />
            Biến chưa khai báo: {undeclared.map((name) => `{{${name}}}`).join(', ')} — sẽ
            render thành chuỗi rỗng khi chạy.
          </p>
        ) : null}

        <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-rule)] bg-[var(--color-paper-inset)] p-3 text-[length:var(--text-xs)] leading-relaxed whitespace-pre-wrap text-[var(--color-ink-2)]">
          {current?.userTemplate}
        </pre>

        <div className="mt-4">
          <p className="mb-2 text-[length:var(--text-2xs)] tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Biến
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {prompt.variables.map((variable) => (
              <li key={variable.name}>
                <Badge
                  tone={
                    variable.source === 'metric' || variable.source === 'entity'
                      ? 'positive'
                      : variable.source === 'site'
                        ? 'signal'
                        : 'outline'
                  }
                  title={variable.description}
                >
                  {`{{${variable.name}}}`} · {VARIABLE_SOURCE_LABELS[variable.source]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-rule)] pt-4">
          <TestRunDialog
            prompt={prompt}
            siteId={siteId}
            range={range}
            onRunComplete={onRunComplete}
          />
          <VersionHistoryDialog prompt={prompt} siteId={siteId} />
          <span className="ml-auto text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            Sửa {formatRelativeTime(prompt.updatedAt, now)} · {current?.createdBy}
          </span>
        </div>
      </CardBody>
    </Card>
  )
}
