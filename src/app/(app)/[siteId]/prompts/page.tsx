import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Card, SectionHead } from '@/components/ui/card'
import { Callout } from '@/components/ui/feedback'
import { NewPromptDialog } from '@/components/prompts/new-prompt-dialog'
import { PromptBoard } from '@/components/prompts/prompt-board'
import { CreateSuggestedPromptButton } from '@/components/prompts/create-suggested-prompt-button'
import { getSite } from '@/lib/data/sites'
import { listPrompts } from '@/lib/data/prompts'
import { getLatestAuditRun } from '@/lib/data/audit'
import { PROMPT_CATEGORY_LABELS } from '@/lib/domain/prompt'
import { resolveDateRange } from '@/mock/dates'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'

export const metadata = { title: 'Prompt Studio' }

export default async function PromptsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly siteId: string }>
  readonly searchParams: Promise<{ readonly range?: string; readonly from?: string; readonly to?: string }>
}) {
  const { siteId } = await params
  const { range: rangeParam, from, to } = await searchParams
  const site = await getSite(siteId)
  if (!site) notFound()

  const range = resolveDateRange(
    parseRangeParam(rangeParam),
    new Date(),
    parseCustomRangeParams(from, to) ?? undefined,
  )

  const [prompts, auditRun] = await Promise.all([listPrompts(site.id), getLatestAuditRun(site.id)])
  const totalVersions = prompts.reduce((sum, prompt) => sum + prompt.versions.length, 0)

  const existingNames = new Set(prompts.map((prompt) => prompt.name))
  const promptSuggestionSource = auditRun?.promptTemplateSuggestions.source ?? 'template'
  const promptSuggestions = (auditRun?.promptTemplateSuggestions.templates ?? []).filter(
    (suggestion) => !existingNames.has(suggestion.name),
  )

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
        action={<NewPromptDialog siteId={site.id} />}
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

      {promptSuggestions.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHead
            label="Gợi ý"
            title="Prompt mẫu theo chủ đề"
            description={
              promptSuggestionSource === 'ai'
                ? `AI sinh dùng được ngay, bám sát sản phẩm/dịch vụ site (lĩnh vực: ${auditRun?.siteProfile?.category}) — bấm "Tạo prompt này" là có sẵn, sửa lại tuỳ ý.`
                : `Mẫu chung theo lĩnh vực (${auditRun?.siteProfile?.category}) — chưa bám sát đúng sản phẩm/dịch vụ cụ thể của site.`
            }
          />
          {promptSuggestionSource === 'template' ? (
            <Callout tone="signal" icon={<Sparkles aria-hidden className="size-5 text-[var(--color-signal)]" />} title="Đang hiện gợi ý mẫu, chưa phải AI thật">
              <p>
                Site chưa cấu hình AI provider. Vào{' '}
                <Link href={`/${site.id}/settings`} className="font-medium text-[var(--color-signal)] hover:underline">
                  Cài đặt
                </Link>{' '}
                kết nối một provider AI, rồi quét lại{' '}
                <Link href={`/${site.id}/audit`} className="font-medium text-[var(--color-signal)] hover:underline">
                  Kiểm tra SEO/GEO/AIO/AEO
                </Link>{' '}
                để có prompt mẫu bám đúng sản phẩm/dịch vụ site.
              </p>
            </Callout>
          ) : null}
          <div className="flex flex-col gap-2">
            {promptSuggestions.map((suggestion) => (
              <Card key={suggestion.name} className="flex items-start justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                    {suggestion.name}
                    <span className="ml-2 text-[length:var(--text-2xs)] font-normal text-[var(--color-ink-3)]">
                      {PROMPT_CATEGORY_LABELS[suggestion.category]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                    {suggestion.description}
                  </p>
                </div>
                <CreateSuggestedPromptButton siteId={site.id} suggestion={suggestion} />
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <PromptBoard
        prompts={prompts}
        siteId={site.id}
        range={{ start: range.start, end: range.end }}
        nowIso={new Date().toISOString()}
      />
      </DataGate>
    </PageShell>
  )
}
