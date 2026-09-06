import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { ChannelCard } from '@/components/channels/channel-card'
import { LiveChannelCard } from '@/components/channels/live-channel-card'
import { getSite } from '@/lib/data/sites'
import { getLatestAuditRun } from '@/lib/data/audit'
import { getChannelSummaries, type ChannelSummary } from '@/lib/data/site-channels'
import { PageSpeedReport } from '@/components/audit/pagespeed-report'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import { PROVIDERS, type ProviderId } from '@/lib/domain/providers'

/** Những nền tảng mà số liệu thẻ phải lấy trực tiếp từ API lúc render, không
 * đọc được từ `metrics_daily` — xem `channel-live-extras.ts`. Chỉ nhóm này cần
 * ranh giới chờ riêng; chín kênh còn lại đọc database và có ngay. */
const LIVE_PROVIDERS = new Set<ProviderId>(['klaviyo', 'facebook', 'instagram'])

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
    getChannelSummaries(site.id, range, { skipLive: true }),
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
          {PROVIDERS.map((provider) => {
            const summary = summaries.get(provider) as ChannelSummary
            // Kênh đọc từ database thì vẽ thẳng — không có gì để chờ.
            if (!LIVE_PROVIDERS.has(provider)) {
              return (
                <ChannelCard
                  key={provider}
                  siteId={site.id}
                  provider={provider}
                  summary={summary}
                  currency={site.currency}
                />
              )
            }
            // Kênh phải hỏi API của nền tảng thì có ranh giới chờ RIÊNG: nó
            // chậm cũng không giữ chín thẻ còn lại.
            return (
              <Suspense
                key={provider}
                fallback={
                  <ChannelCard
                    siteId={site.id}
                    provider={provider}
                    summary={summary}
                    currency={site.currency}
                    pending
                  />
                }
              >
                <LiveChannelCard
                  siteId={site.id}
                  provider={provider}
                  start={range.start}
                  end={range.end}
                  currency={site.currency}
                />
              </Suspense>
            )
          })}
        </div>
      </DataGate>
    </PageShell>
  )
}
