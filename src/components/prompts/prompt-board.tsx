'use client'

import { useState } from 'react'
import { Card, SectionHead } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { PromptCard } from '@/components/prompts/prompt-card'
import { RatingStars } from '@/components/prompts/rating-stars'
import type { PromptRun, PromptTemplate } from '@/lib/domain/prompt'
import { formatNumber, formatRelativeTime } from '@/lib/format'

/* Hallmark · component: prompt-board · theme: studied-DNA (Ink & Signal)
 *
 * "Lượt chạy gần đây" không đọc từ một bảng — không có `listPromptRuns` cho
 * TOÀN site (chỉ có `recordPromptRun`/`ratePromptRun` theo từng lượt), nên
 * danh sách này là lịch sử CHẠY TRONG PHIÊN LÀM VIỆC hiện tại, gom lại từ
 * mọi `TestRunDialog` bên dưới qua `onRunComplete`. Tải lại trang thì rỗng
 * lại — đúng với những gì có thật, không giả vờ có một nguồn đọc-lại-được.
 */
export function PromptBoard({
  prompts,
  siteId,
  range,
  nowIso,
}: {
  readonly prompts: readonly PromptTemplate[]
  readonly siteId: string
  readonly range: { readonly start: string; readonly end: string }
  readonly nowIso: string
}) {
  const now = new Date(nowIso)
  const [runs, setRuns] = useState<readonly PromptRun[]>([])

  const handleRunComplete = (run: PromptRun) => {
    setRuns((previous) => [run, ...previous])
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {prompts.map((prompt) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            siteId={siteId}
            range={range}
            now={now}
            onRunComplete={handleRunComplete}
          />
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <SectionHead
          label="Chạy thử"
          title="Lượt chạy gần đây"
          description="So bản mới với bản cũ trước khi đổi bản đang dùng — chỉ gồm lượt chạy trong phiên này."
        />

        <Card>
          {runs.length === 0 ? (
            <EmptyState
              title="Chưa có lượt chạy thử nào"
              description="Bấm 'Chạy thử' ở một prompt bên trên — kết quả sẽ hiện ở đây."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-rule)]">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="outline">{run.versionId.split('-').at(-1)}</Badge>
                    <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                      {run.model}
                    </span>
                    <RatingStars runId={run.id} rating={run.rating} />
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
                    {run.ranBy} · {formatRelativeTime(run.ranAt, now)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  )
}
