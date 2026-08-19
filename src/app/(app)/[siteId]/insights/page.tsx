import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { Card } from '@/components/ui/card'
import { Callout, EmptyState } from '@/components/ui/feedback'
import { AlertThresholdsDialog } from '@/components/insights/alert-thresholds-dialog'
import { InsightCard } from '@/components/insights/insight-card'
import { getSite } from '@/lib/data/sites'
import { getInsightActionMap, getRealInsights, thresholdsFromSite } from '@/lib/data/site-insights'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import { bySeverity, hasValidEvidence } from '@/lib/domain/insight'

export const metadata = { title: 'Đề xuất' }

export default async function InsightsPage({
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
  const thresholds = thresholdsFromSite(site)
  const [all, actionMap] = await Promise.all([
    getRealInsights(site.id, range, thresholds),
    getInsightActionMap(site.id),
  ])

  // Hàng rào chống bịa số: insight không truy được về hàng metric thật thì
  // KHÔNG hiển thị. Lọc ở đây, không phải ở chỗ sinh dữ liệu — vì nguồn sinh
  // sau này là mô hình ngôn ngữ, và mô hình thì không tự ràng buộc được.
  const withEvidence = all.filter(hasValidEvidence).slice().sort(bySeverity)
  const suppressed = all.length - withEvidence.length

  // "Bỏ qua" ẩn khỏi danh sách chính nhưng vẫn giữ lại được để khôi phục —
  // KHÔNG xoá khỏi kết quả tính toán, chỉ tách ra một khu riêng.
  const dismissed = withEvidence.filter((insight) => actionMap.get(insight.id) === 'dismissed')
  const shown = withEvidence.filter((insight) => actionMap.get(insight.id) !== 'dismissed')
  const critical = shown.filter((insight) => insight.severity === 'critical')

  return (
    <PageShell>
      <PageHeader
        title="Đề xuất"
        description="Những gì hệ thống phát hiện được trong dữ liệu, xếp theo mức độ cần xử lý. Mỗi đề xuất đều mở ra được bằng chứng."
        action={
          <AlertThresholdsDialog
            siteId={site.id}
            current={thresholds}
            isDefault={{
              dropThresholdPct: site.insightDropThresholdPct === null,
              criticalDropThresholdPct: site.insightCriticalDropThresholdPct === null,
              staleSyncHours: site.insightStaleSyncHours === null,
            }}
          />
        }
      />

      <DataGate
        siteId={site.id}
        title="Chưa có gì để phân tích"
        description="Đề xuất sinh ra từ số liệu thật của bạn. Không có dữ liệu thì mọi đề xuất chỉ là phỏng đoán — và chúng tôi không đoán."
      >
        <Callout
          tone="signal"
          icon={<ShieldCheck aria-hidden className="size-5 text-[var(--color-signal)]" />}
          title="Mọi con số ở đây đều truy ngược được"
        >
          <p>
            Đề xuất nào không gắn được với hàng dữ liệu thật sẽ bị chặn không hiển thị,
            kể cả khi AI sinh ra nó.{' '}
            {suppressed > 0
              ? `Lần chạy này có ${suppressed} đề xuất bị chặn.`
              : 'Lần chạy này không có đề xuất nào bị chặn.'}
          </p>
        </Callout>

        {critical.length > 0 ? (
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            <strong className="text-[var(--color-negative)]">{critical.length} vấn đề nghiêm trọng</strong>{' '}
            đang làm sai lệch số liệu. Xử lý chúng trước khi ra quyết định ngân sách.
          </p>
        ) : null}

        {shown.length === 0 ? (
          <Card>
            <EmptyState
              title="Chưa có đề xuất nào"
              description="Hệ thống chưa phát hiện bất thường nào trong khoảng thời gian đang chọn."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((insight) => (
              <InsightCard
                key={insight.id}
                siteId={site.id}
                insight={insight}
                triageStatus={actionMap.get(insight.id) ?? null}
              />
            ))}
          </div>
        )}

        {dismissed.length > 0 ? (
          <details className="group">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-ink-2)] marker:content-none hover:text-[var(--color-ink)]">
              <span className="group-open:hidden">Xem {dismissed.length} đề xuất đã bỏ qua</span>
              <span className="hidden group-open:inline">Thu gọn đề xuất đã bỏ qua</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {dismissed.map((insight) => (
                <InsightCard
                  key={insight.id}
                  siteId={site.id}
                  insight={insight}
                  triageStatus={actionMap.get(insight.id) ?? null}
                />
              ))}
            </div>
          </details>
        ) : null}
      </DataGate>
    </PageShell>
  )
}
