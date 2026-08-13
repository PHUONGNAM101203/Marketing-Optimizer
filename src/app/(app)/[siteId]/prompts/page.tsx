import { notFound } from 'next/navigation'
import { AlertTriangle, GitBranch, Plus, Star } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/feedback'
import { getSite } from '@/lib/data/sites'
import { MOCK_PROMPT_RUNS, promptsOfSite } from '@/mock/prompts'
import { MOCK_TODAY } from '@/mock/dates'
import {
  PROMPT_CATEGORY_LABELS,
  VARIABLE_SOURCE_LABELS,
  findUndeclaredVariables,
  type PromptTemplate,
} from '@/lib/domain/prompt'
import { formatNumber, formatRelativeTime } from '@/lib/format'

export const metadata = { title: 'Prompt Studio' }

export default async function PromptsPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params
  const site = await getSite(siteId)
  if (!site) notFound()

  const prompts = promptsOfSite(site.id)
  const totalVersions = prompts.reduce((sum, prompt) => sum + prompt.versions.length, 0)

  return (
    <PageShell>
      <PageHeader
        title="Prompt Studio"
        description="Mọi tác vụ AI trong app lấy prompt từ đây. Không có prompt nào nằm rải rác trong mã nguồn — vì prompt là thứ cần sửa nhiều nhất và cần biết ai sửa, sửa lúc nào."
        meta={
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
            {prompts.length} prompt · {totalVersions} phiên bản
          </p>
        }
        action={
          <Button variant="primary" size="md">
            <Plus aria-hidden className="size-4" />
            Prompt mới
          </Button>
        }
      />

      <DataGate
        siteId={site.id}
        title="Prompt chưa có dữ liệu để điền"
        description="Biến nguồn `metric` và `entity` lấy thẳng từ số liệu Site. Chưa kết nối thì chúng rỗng."
      >

      <Callout
        tone="signal"
        title="Biến nguồn `metric` và `entity` được điền tự động"
      >
        <p>
          Số liệu đưa vào prompt lấy thẳng từ dữ liệu Site, không do mô hình tự nghĩ ra.
          Đây là hàng rào chống bịa số ở tầng prompt — mô hình không phải đoán con số
          nào, vì số đã nằm sẵn trong ngữ cảnh.
        </p>
      </Callout>

      <div className="flex flex-col gap-3">
        {prompts.map((prompt) => (
          <PromptCard key={prompt.id} prompt={prompt} now={MOCK_TODAY} />
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <SectionHead
          label="Chạy thử"
          title="Lượt chạy gần đây"
          description="So bản mới với bản cũ trước khi đổi bản đang dùng."
        />

        <Card>
          <ul className="divide-y divide-[var(--color-rule)]">
            {MOCK_PROMPT_RUNS.map((run) => (
              <li key={run.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="outline">{run.versionId.split('-').at(-1)}</Badge>
                  <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                    {run.model}
                  </span>
                  {run.rating !== null ? (
                    <span className="inline-flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_unused, index) => (
                        <Star
                          key={index}
                          aria-hidden
                          className={
                            index < run.rating!
                              ? 'size-3 fill-[var(--color-caution)] text-[var(--color-caution)]'
                              : 'size-3 text-[var(--color-ink-3)]'
                          }
                        />
                      ))}
                      <span className="sr-only">Chấm {run.rating} trên 5</span>
                    </span>
                  ) : null}
                  <span
                    data-numeric
                    className="ml-auto text-[length:var(--text-xs)] text-[var(--color-ink-3)]"
                  >
                    {formatNumber(run.tokensIn)} vào · {formatNumber(run.tokensOut)} ra ·{' '}
                    {formatNumber(run.latencyMs)} ms
                  </span>
                </div>

                <p className="max-w-prose text-[length:var(--text-sm)] whitespace-pre-line text-[var(--color-ink-2)]">
                  {run.output}
                </p>

                <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                  {run.ranBy} · {formatRelativeTime(run.ranAt, MOCK_TODAY)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </section>
      </DataGate>
    </PageShell>
  )
}

function PromptCard({
  prompt,
  now,
}: {
  readonly prompt: PromptTemplate
  readonly now: Date
}) {
  const current = prompt.versions.find(
    (version) => version.id === prompt.currentVersionId,
  )

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
          <Button variant="secondary" size="sm">
            Chạy thử
          </Button>
          <Button variant="ghost" size="sm">
            Xem {prompt.versions.length} phiên bản
          </Button>
          <span className="ml-auto text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
            Sửa {formatRelativeTime(prompt.updatedAt, now)} · {current?.createdBy}
          </span>
        </div>
      </CardBody>
    </Card>
  )
}
