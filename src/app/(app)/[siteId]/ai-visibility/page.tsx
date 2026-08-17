import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileWarning, Sparkles } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { StatRow, StatTile } from '@/components/ui/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Callout, EmptyState } from '@/components/ui/feedback'
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroller,
} from '@/components/ui/table'
import { GenerateLlmsTxtButton } from '@/components/geo/generate-llms-txt-button'
import { LlmsTxtPreview } from '@/components/geo/llms-txt-preview'
import { AddTrackedPromptDialog } from '@/components/geo/add-tracked-prompt-dialog'
import { TrackedPromptCard } from '@/components/geo/tracked-prompt-card'
import { AddSuggestedPromptButton } from '@/components/geo/add-suggested-prompt-button'
import { getSite } from '@/lib/data/sites'
import { getLatestAuditRun } from '@/lib/data/audit'
import { listTrackedPrompts } from '@/lib/data/tracked-prompts'
import { getLatestCitationCheckByPrompt, countCitationChecks } from '@/lib/data/citation-checks'
import {
  CITABILITY_AXIS_LABELS,
  type CitabilityAxes,
  type PageCitabilityScore,
} from '@/lib/domain/geo'
import { formatNumber, formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'

export const metadata = { title: 'Hiện diện AI' }

export default async function AiVisibilityPage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>
}) {
  const { siteId } = await params
  const site = await getSite(siteId)
  if (!site) notFound()

  const [run, prompts] = await Promise.all([getLatestAuditRun(site.id), listTrackedPrompts(site.id)])
  const activePrompts = prompts.filter((prompt) => prompt.enabled)
  const [latestCheckByPrompt, citationCheckCount] = await Promise.all([
    getLatestCitationCheckByPrompt(prompts.map((prompt) => prompt.id)),
    countCitationChecks(site.id),
  ])
  const pageCitability = run?.pageCitability ?? []
  const averageCitability =
    pageCitability.length === 0
      ? null
      : Math.round(pageCitability.reduce((sum, page) => sum + page.overall, 0) / pageCitability.length)
  const worstPage =
    pageCitability.length === 0
      ? null
      : [...pageCitability].sort((a, b) => a.overall - b.overall)[0]

  const trackedTexts = new Set(prompts.map((prompt) => prompt.text))
  const suggestions = (run?.globalKeywordSuggestions ?? []).filter(
    (suggestion) => !trackedTexts.has(suggestion.text),
  )

  return (
    <PageShell>
      <PageHeader
        title="Hiện diện AI"
        description="SEO cũ hỏi trang xếp thứ mấy. Ở đây câu hỏi khác hẳn: khi có người hỏi ChatGPT hay Perplexity về lĩnh vực của bạn, thương hiệu có được nhắc tới không — và AI nói gì."
        action={<AddTrackedPromptDialog siteId={site.id} />}
      />

      <StatRow>
        <StatTile
          label="Điểm citability trung bình"
          value={averageCitability === null ? '—' : `${averageCitability}/100`}
          metric="conversionRate"
          deltaPct={null}
          footnote={
            pageCitability.length === 0
              ? 'Chưa có dữ liệu — chạy Kiểm tra SEO/GEO/AIO/AEO trước'
              : `Trung bình ${pageCitability.length} trang đã quét`
          }
        />
        <StatTile
          label="Câu hỏi đang theo dõi"
          value={formatNumber(activePrompts.length)}
          metric="clicks"
          deltaPct={null}
        />
        <StatTile
          label="Lượt kiểm tra trích dẫn"
          value={formatNumber(citationCheckCount)}
          metric="sessions"
          deltaPct={null}
        />
      </StatRow>

      {pageCitability.length === 0 ? (
        <Callout
          tone="signal"
          icon={<Sparkles aria-hidden className="size-5 text-[var(--color-signal)]" />}
          title="Chưa có điểm citability"
        >
          <p>
            Điểm citability tính từ chính lượt quét kỹ thuật SEO/GEO/AIO/AEO — chưa quét lần nào thì
            chưa có gì để hiện. Chạy quét ở trang{' '}
            <Link href={`/${site.id}/audit`} className="font-medium text-[var(--color-signal)] hover:underline">
              Kiểm tra SEO/GEO/AIO/AEO
            </Link>{' '}
            trước.
          </p>
        </Callout>
      ) : null}

      {!site.llmsTxtContent ? (
        <Callout
          tone="caution"
          icon={<FileWarning aria-hidden className="size-5 text-[var(--color-caution)]" />}
          title="Chưa có file llms.txt"
          action={<GenerateLlmsTxtButton siteId={site.id} label="Sinh llms.txt từ sitemap" />}
        >
          <p>
            Không có bản kê khai nào, nên agent đọc site phải tự suy cấu trúc từ HTML. Đây là việc
            rẻ nhất trong toàn bộ danh sách GEO — một file tĩnh, không đụng gì tới mã nguồn.
          </p>
        </Callout>
      ) : (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                llms.txt đã sinh
              </p>
              <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                {site.llmsTxtGeneratedAt
                  ? `Sinh ${formatRelativeTime(site.llmsTxtGeneratedAt, new Date())}`
                  : null}
              </p>
            </div>
            <GenerateLlmsTxtButton siteId={site.id} label="Sinh lại" />
          </div>
          <LlmsTxtPreview content={site.llmsTxtContent} domain={site.domain} />
        </Card>
      )}

      {suggestions.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHead
            label="Gợi ý"
            title="Câu hỏi gợi ý theo chủ đề"
            description={`AI sinh từ chủ đề site (lĩnh vực: ${run?.siteProfile?.category}) — câu hỏi/từ khoá được tìm kiếm nhiều nhất về chủ đề này trên toàn thế giới, không riêng site bạn. Chỉnh lại cho đúng giọng thương hiệu trước khi dùng.`}
          />
          <div className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <Card key={suggestion.text} className="flex items-center justify-between gap-3 p-3.5">
                <p className="text-[length:var(--text-sm)] text-[var(--color-ink)]">{suggestion.text}</p>
                <AddSuggestedPromptButton siteId={site.id} suggestion={suggestion} />
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionHead
          label="Câu hỏi"
          title="Câu hỏi đang theo dõi"
          description="Đây là đơn vị đo của GEO — tương đương 'từ khoá' của SEO cũ, nhưng chỉ có hai kết cục: được nhắc hoặc không."
        />

        {prompts.length === 0 ? (
          <EmptyState
            title="Chưa theo dõi câu hỏi nào"
            description="Thêm câu hỏi thật người dùng có thể hỏi AI khi tìm tới lĩnh vực của bạn."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {prompts.map((prompt) => (
              <TrackedPromptCard
                key={prompt.id}
                prompt={prompt}
                siteId={site.id}
                latestCheck={latestCheckByPrompt.get(prompt.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {pageCitability.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHead
            label="Trang"
            title="Điểm khả năng được trích dẫn"
            description="Sáu trục quyết định một mô hình có trích được trang hay không: nó có bóc tách được cấu trúc, có tin được nguồn, có tìm ra câu trả lời gọn để trích, và trang có tự khai mình là thực thể gì. Tính từ lượt quét kỹ thuật gần nhất."
          />

          <Card className="overflow-hidden">
            <TableScroller aria-label="Điểm citability từng trang">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Trang</TH>
                    <TH numeric>Tổng</TH>
                    {(Object.keys(CITABILITY_AXIS_LABELS) as (keyof CitabilityAxes)[]).map((axis) => (
                      <TH key={axis} numeric>
                        {CITABILITY_AXIS_LABELS[axis]}
                      </TH>
                    ))}
                    <TH numeric>Vấn đề</TH>
                  </TR>
                </THead>
                <TBody>
                  {pageCitability.map((page) => (
                    <TR key={page.id}>
                      <TD className="max-w-[20rem]">
                        <span className="block truncate font-medium" title={page.title}>
                          {page.title}
                        </span>
                        <span className="block truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                          {page.url}
                        </span>
                      </TD>
                      <TD numeric>
                        <ScoreChip score={page.overall} />
                      </TD>
                      {(Object.keys(CITABILITY_AXIS_LABELS) as (keyof CitabilityAxes)[]).map((axis) => (
                        <TD key={axis} numeric>
                          <span
                            className={cn(
                              page.axes[axis] < 40 && 'text-[var(--color-negative)]',
                              page.axes[axis] >= 75 && 'text-[var(--color-positive)]',
                            )}
                          >
                            {page.axes[axis]}
                          </span>
                        </TD>
                      ))}
                      <TD numeric>{page.issues.length}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableScroller>
          </Card>

          {worstPage ? <WorstPageDetail page={worstPage} /> : null}
        </section>
      ) : null}
    </PageShell>
  )
}

function ScoreChip({ score }: { readonly score: number }) {
  const tone = score >= 75 ? 'positive' : score >= 50 ? 'caution' : 'negative'
  return <Badge tone={tone}>{score}</Badge>
}

function WorstPageDetail({ page }: { readonly page: PageCitabilityScore }) {
  if (page.issues.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Trang thấp điểm nhất (<span className="text-[var(--color-ink)]">{page.title}</span>) vẫn
          không có vấn đề nào đáng nêu — điểm citability của site khá đồng đều.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title={`Cần sửa trước: ${page.title}`}
        description={`Điểm ${page.overall}/100 — thấp nhất trong các trang đã quét.`}
        ruled
      />
      <CardBody className="pt-4">
        <ul className="flex flex-col gap-3">
          {page.issues.map((issue, index) => (
            <li key={index} className="flex gap-3">
              <Badge
                tone={
                  issue.severity === 'high' ? 'negative' : issue.severity === 'medium' ? 'caution' : 'neutral'
                }
                className="mt-0.5 shrink-0"
              >
                {CITABILITY_AXIS_LABELS[issue.axis]}
              </Badge>
              <div className="min-w-0">
                <p className="text-[length:var(--text-sm)] text-[var(--color-ink)]">{issue.message}</p>
                <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                  <Sparkles aria-hidden className="mr-1 inline size-3.5 text-[var(--color-signal)]" />
                  {issue.fix}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
