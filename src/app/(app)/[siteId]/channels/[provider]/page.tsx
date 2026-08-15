import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plug } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/feedback'
import { ProviderMark } from '@/components/connections/provider-mark'
import { ChannelAvatar } from '@/components/channels/channel-avatar'
import { ChannelDetailBody } from '@/components/channels/channel-detail-body'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { TiktokChannelHeader } from '@/components/channels/tiktok/tiktok-channel-header'
import { MetaChannelHeader } from '@/components/channels/meta/meta-channel-header'
import { getSite } from '@/lib/data/sites'
import { getChannelDetail } from '@/lib/data/site-channel-detail'
import { getChannelDailySeries, getChannelSummaries } from '@/lib/data/site-channels'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import { PROVIDER_META, isProviderId } from '@/lib/domain/providers'
import { formatDateRange } from '@/lib/format'

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly provider: string }>
}) {
  const { provider } = await params
  return {
    title: isProviderId(provider) ? PROVIDER_META[provider].label : 'Kênh',
  }
}

const PRODUCT_STATUS_FILTERS = ['approved', 'disapproved', 'pending'] as const
type ProductStatusFilterParam = (typeof PRODUCT_STATUS_FILTERS)[number]

const isProductStatusFilter = (value: string): value is ProductStatusFilterParam =>
  (PRODUCT_STATUS_FILTERS as readonly string[]).includes(value)

export default async function ChannelDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly siteId: string; readonly provider: string }>
  readonly searchParams: Promise<{
    readonly range?: string
    readonly from?: string
    readonly to?: string
    readonly status?: string
    readonly page?: string
  }>
}) {
  const { siteId, provider } = await params
  const { range: rangeParam, from, to, status: statusParam, page: pageParam } = await searchParams
  const site = await getSite(siteId)
  if (!site || !isProviderId(provider)) notFound()

  const meta = PROVIDER_META[provider]
  const range = resolveDateRange(
    parseRangeParam(rangeParam),
    new Date(),
    parseCustomRangeParams(from, to) ?? undefined,
  )
  const productFilter = statusParam && isProductStatusFilter(statusParam) ? statusParam : undefined
  const page = Math.max(1, Number(pageParam) || 1)

  const [summaries, detail, dailySeries] = await Promise.all([
    getChannelSummaries(site.id, range),
    getChannelDetail(
      site.id,
      provider,
      { startDate: range.start, endDate: range.end },
      productFilter,
    ),
    getChannelDailySeries(site.id, provider, { start: range.start, end: range.end }),
  ])
  const summary = summaries.get(provider)

  return (
    <PageShell>
      {provider === 'tiktok' && detail && detail.kind === 'tiktok' ? (
        <TiktokChannelHeader
          siteId={site.id}
          detail={detail}
          dailySeries={dailySeries}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
        />
      ) : (provider === 'facebook' || provider === 'instagram') &&
        detail &&
        (detail.kind === 'facebook' || detail.kind === 'instagram') ? (
        <MetaChannelHeader
          siteId={site.id}
          detail={detail}
          dailySeries={dailySeries}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
        />
      ) : (
        <div>
          <Link
            href={`/${site.id}/channels`}
            className="mb-3 inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-[length:var(--text-sm)] text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Tất cả kênh
          </Link>

          <PageHeader
            title={meta.label}
            description={
              detail && detail.kind !== 'unsupported' ? (
                <span className="flex items-center gap-2.5">
                  <ChannelAvatar avatarUrl={detail.avatarUrl} provider={provider} size="sm" />
                  {detail.accountName}
                </span>
              ) : (
                'Chưa liên kết tài khoản'
              )
            }
            action={
              detail && detail.kind !== 'unsupported' ? (
                <ExternalChannelLink
                  provider={provider}
                  externalAccountId={detail.externalAccountId}
                  variant="secondary"
                  size="md"
                />
              ) : null
            }
            meta={
              <div className="flex flex-wrap items-center gap-2">
                <ProviderMark provider={provider} size="sm" />
                <span className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
                  {formatDateRange(range.start, range.end)}
                </span>
                {summary?.connected ? <Badge tone="positive">Đã kết nối</Badge> : null}
              </div>
            }
          />
        </div>
      )}

      {!summary?.connected ? (
        <EmptyState
          title={`Chưa kết nối ${meta.label}`}
          description="Kết nối nền tảng này để xem chi tiết thật thay vì trang trống."
          action={
            <Button asChild variant="primary" size="md">
              <Link href={`/${site.id}/connections`}>
                <Plug aria-hidden className="size-4" />
                Kết nối nguồn dữ liệu
              </Link>
            </Button>
          }
        />
      ) : detail === null ? (
        <EmptyState
          title="Đang đồng bộ lần đầu…"
          description="Chi tiết sẽ hiện ra ngay khi đồng bộ xong, thường trong vài phút."
        />
      ) : (
        <ChannelDetailBody
          detail={detail}
          dailySeries={dailySeries}
          preset={range.preset}
          currency={site.currency}
          siteId={site.id}
          provider={provider}
          rangeParam={rangeParam}
          fromParam={from}
          toParam={to}
          productFilter={productFilter}
          page={page}
        />
      )}
    </PageShell>
  )
}
