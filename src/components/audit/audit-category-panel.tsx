import { Check, TriangleAlert, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { PageSpeedReport } from './pagespeed-report'
import type { AuditCategory, AuditFinding, PageSpeedResult } from '@/lib/domain/audit'
import { AUDIT_CATEGORY_DESCRIPTIONS, AUDIT_STATUS_LABELS } from '@/lib/domain/audit'

/* Hallmark · component: audit-category-panel · theme: studied-DNA (Ink & Signal)
 *
 * Điểm số 0-100 đặt CẠNH danh sách phát hiện, không thay thế nó — một con số
 * một mình không nói được "cần sửa gì", chỉ danh sách kèm cách khắc phục mới
 * đủ để hành động. Sắp xếp fail trước, warn giữa, pass cuối — vấn đề cần xử lý
 * luôn đứng đầu.
 */

const STATUS_ORDER: Readonly<Record<AuditFinding['status'], number>> = { fail: 0, warn: 1, pass: 2 }

const STATUS_TONE: Readonly<Record<AuditFinding['status'], 'positive' | 'negative' | 'caution'>> = {
  pass: 'positive',
  warn: 'caution',
  fail: 'negative',
}

const STATUS_ICON: Readonly<Record<AuditFinding['status'], typeof Check>> = {
  pass: Check,
  warn: TriangleAlert,
  fail: XCircle,
}

const scoreTone = (score: number | null): 'positive' | 'caution' | 'negative' | 'neutral' => {
  if (score === null) return 'neutral'
  if (score >= 80) return 'positive'
  if (score >= 50) return 'caution'
  return 'negative'
}

const scoreColorVar: Readonly<Record<ReturnType<typeof scoreTone>, string>> = {
  positive: 'var(--color-positive)',
  caution: 'var(--color-caution)',
  negative: 'var(--color-negative)',
  neutral: 'var(--color-ink-3)',
}

export function AuditCategoryPanel({
  category,
  score,
  findings,
  pagespeed,
  pageUrl,
}: {
  readonly category: AuditCategory
  readonly score: number | null
  readonly findings: readonly AuditFinding[]
  /** Chỉ hiện ở tab SEO — PageSpeed là chỉ số hiệu năng, không phải một
   * "finding" pass/warn/fail như các luật khác. */
  readonly pagespeed?: PageSpeedResult | null
  readonly pageUrl?: string
}) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="Chưa có dữ liệu"
        description="Bấm 'Quét toàn site' ở trên để chạy lượt kiểm tra đầu tiên."
      />
    )
  }

  const sorted = [...findings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const tone = scoreTone(score)

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex items-center gap-5 p-5">
        <div className="flex shrink-0 flex-col items-center justify-center">
          <p
            data-numeric
            className="text-[length:var(--text-3xl)] leading-none font-semibold tracking-[var(--tracking-tight)]"
            style={{ color: scoreColorVar[tone] }}
          >
            {score ?? '—'}
            <span className="text-[length:var(--text-base)] text-[var(--color-ink-3)]">/100</span>
          </p>
        </div>
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          {AUDIT_CATEGORY_DESCRIPTIONS[category]}
        </p>
      </Card>

      {category === 'seo' ? (
        <PageSpeedReport pagespeed={pagespeed ?? null} pageUrl={pageUrl ?? ''} />
      ) : null}

      <ul className="flex flex-col gap-2.5">
        {sorted.map((finding) => {
          const Icon = STATUS_ICON[finding.status]
          return (
            <li key={finding.id}>
              <Card className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <Icon
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0"
                      style={{ color: `var(--color-${finding.status === 'pass' ? 'positive' : finding.status === 'warn' ? 'caution' : 'negative'})` }}
                    />
                    <div>
                      <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
                        {finding.title}
                      </p>
                      <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                        {finding.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {finding.heuristic ? <Badge tone="outline">Phỏng đoán</Badge> : null}
                    <Badge tone={STATUS_TONE[finding.status]}>{AUDIT_STATUS_LABELS[finding.status]}</Badge>
                  </div>
                </div>

                {finding.evidence ? (
                  <p className="ml-6.5 text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
                    {finding.evidence}
                  </p>
                ) : null}

                {finding.fix ? (
                  <p className="ml-6.5 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)] px-2.5 py-1.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                    <span className="font-medium text-[var(--color-ink)]">Cách khắc phục: </span>
                    {finding.fix}
                  </p>
                ) : null}
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
