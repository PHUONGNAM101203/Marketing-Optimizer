import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { ChannelCard } from '@/components/channels/channel-card'
import { getSite } from '@/lib/data/sites'
import { getLatestAuditRun } from '@/lib/data/audit'
import { getChannelSummaries, type ChannelSummary } from '@/lib/data/site-channels'
import { PageSpeedReport } from '@/components/audit/pagespeed-report'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import { PROVIDERS } from '@/lib/domain/providers'

export const metadata = { title: 'Kênh' }

export default async function ChannelsPage({
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
  const [summaries, auditRun] = await Promise.all([
    getChannelSummaries(site.id, range),
    getLatestAuditRun(site.id),
  ])

  return (
    <PageShell>
      <PageHeader
        title="Kênh"
        description="Mỗi nền tảng có chỉ số riêng đáng quan tâm. Thẻ dưới đây hiện đúng thứ nền tảng đó đo được, không ép mọi kênh vào cùng một khuôn."
      />

      {auditRun ? <PageSpeedReport pagespeed={auditRun.pagespeed} pageUrl={site.url} /> : null}

      <DataGate
        siteId={site.id}
        title="Chưa có kênh nào"
        description="Mỗi nền tảng bạn kết nối sẽ xuất hiện ở đây kèm chỉ số riêng của nó."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((provider) => (
            <ChannelCard
              key={provider}
              siteId={site.id}
              provider={provider}
              summary={summaries.get(provider) as ChannelSummary}
              currency={site.currency}
            />
          ))}
        </div>
      </DataGate>
    </PageShell>
  )
}
