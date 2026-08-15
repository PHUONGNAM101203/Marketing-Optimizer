import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Callout } from '@/components/ui/feedback'
import { NewPromptDialog } from '@/components/prompts/new-prompt-dialog'
import { PromptBoard } from '@/components/prompts/prompt-board'
import { getSite } from '@/lib/data/sites'
import { listPrompts } from '@/lib/data/prompts'
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

  const prompts = await listPrompts(site.id)
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
