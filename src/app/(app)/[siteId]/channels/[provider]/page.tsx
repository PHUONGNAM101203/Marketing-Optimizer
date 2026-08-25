import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
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
import { ChannelSwitcher } from '@/components/channels/channel-switcher'
import { ChannelComparisonPanel } from '@/components/channels/channel-comparison-panel'
import { channelConnectionCookieName } from '@/lib/domain/channel-connection-cookie'
import { getSite } from '@/lib/data/sites'
import { getChannelDetail, listChannelConnections } from '@/lib/data/site-channel-detail'
import {
  getChannelDailySeries,
  getChannelSummaries,
  snapshotUpperBound,
} from '@/lib/data/site-channels'
import { aggregateVideosPostedInRange, getTiktokVideosPostedInRange } from '@/lib/data/video-trending'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { parseComparisonParams } from '@/lib/domain/comparison-param'
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
    readonly cmpAFrom?: string
    readonly cmpATo?: string
    readonly cmpBFrom?: string
    readonly cmpBTo?: string
    readonly status?: string
    readonly page?: string
    readonly connection?: string
  }>
}) {
  const { siteId, provider } = await params
  const {
    range: rangeParam,
    from,
    to,
    cmpAFrom,
    cmpATo,
    cmpBFrom,
    cmpBTo,
    status: statusParam,
    page: pageParam,
    connection: connectionParam,
  } = await searchParams
  const site = await getSite(siteId)
  if (!site || !isProviderId(provider)) notFound()

  const meta = PROVIDER_META[provider]
  const range = resolveDateRange(
    parseRangeParam(rangeParam),
    new Date(),
    parseCustomRangeParams(from, to) ?? undefined,
  )
  // So sánh ĐỘC LẬP với `range` ở trên — hai khoảng do người dùng chọn thẳng
  // trong dialog "So sánh với…", không vế nào lấy từ topbar.
  const comparison = parseComparisonParams({ cmpAFrom, cmpATo, cmpBFrom, cmpBTo })
  const productFilter = statusParam && isProductStatusFilter(statusParam) ? statusParam : undefined
  const page = Math.max(1, Number(pageParam) || 1)

  const [summaries, comparisonSummaries, connections] = await Promise.all([
    getChannelSummaries(site.id, range),
    // Hai kỳ so sánh đi qua ĐÚNG MỘT hàm với đúng một chữ ký — điều kiện để
    // hai cột trong bảng không bao giờ lệch nhau vì đường lấy dữ liệu khác
    // nhau. Không fetch gì khi người dùng chưa bật so sánh.
    comparison
      ? Promise.all([
          getChannelSummaries(site.id, comparison.a),
          getChannelSummaries(site.id, comparison.b),
        ])
      : Promise.resolve(null),
    listChannelConnections(site.id, provider),
  ])
  const summary = summaries.get(provider)

  // `?connection=` chỉ đáng tin khi đúng là một trong các connection THẬT của
  // provider này — id lạ/đã bị xoá thì coi như không có param. Không có/không
  // hợp lệ → thử cookie đã nhớ từ lượt chọn trước (`ChannelSwitcher`, xem
  // `rememberChannelConnection`) — cùng điều kiện hợp lệ (phải khớp một
  // connection thật, tránh cookie cũ trỏ tới connection đã xoá). Vẫn không có
  // gì hợp lệ thì để `getChannelDetail`/`getChannelDailySeries` tự rơi về kênh
  // kết nối ĐẦU TIÊN (xem `site-channel-detail.ts`). `?connection=` trên URL
  // LUÔN thắng cookie — một link chia sẻ phải hiện đúng kênh trong link, bất
  // kể người xem đã từng chọn kênh nào khác trước đó.
  const rememberedConnectionId = (await cookies()).get(channelConnectionCookieName(site.id, provider))?.value
  const validatedConnectionId = connections.some((option) => option.id === connectionParam)
    ? connectionParam
    : connections.some((option) => option.id === rememberedConnectionId)
      ? rememberedConnectionId
      : undefined

  const [detail, dailySeries] = await Promise.all([
    getChannelDetail(
      site.id,
      provider,
      { startDate: range.start, endDate: range.end },
      productFilter,
      validatedConnectionId,
    ),
    getChannelDailySeries(site.id, provider, { start: range.start, end: range.end }, validatedConnectionId),
  ])

  const activeConnectionId = detail && detail.kind !== 'unsupported' ? detail.connectionId : connections[0]?.id

  // Hai cột của bảng so sánh, lấy từ hai kỳ độc lập ở trên.
  const comparisonA = comparisonSummaries?.[0].get(provider)
  const comparisonB = comparisonSummaries?.[1].get(provider)

  // TikTok cần một bước nữa. `ChannelSummary.extra.followerCount`/
  // `likesCount`/`videoCount` là SNAPSHOT TRẠNG THÁI của cả tài khoản, không
  // phải số của riêng khoảng — hai kỳ trỏ về đúng một dòng snapshot là bảng
  // so ra 0% giả.
  //
  // Gộp theo NGÀY ĐĂNG chứ không phải theo tăng trưởng giữa hai snapshot:
  // TikTok không có báo cáo lịch sử nên tăng trưởng-trong-khoảng chỉ tồn tại
  // từ 13/8/2026 (ngày app bắt đầu tự chụp), mọi khoảng trước đó ra 0. Chỉ số
  // cộng dồn từng video thì TikTok trả đủ và mỗi video có `posted_at` thật,
  // nên cách này dùng được cho MỌI khoảng — xa tới video cũ nhất tài khoản
  // còn giữ. Đánh đổi (tổng cộng dồn TỚI NAY của một lứa, không phải hiệu
  // suất TRONG khoảng) được nói rõ ngay trên bảng.
  //
  // Hai lời gọi viết giống hệt nhau, chỉ khác `comparison.a`/`comparison.b` —
  // cùng lý do như mọi chỗ khác trong lượt so sánh này.
  let comparisonSummaryA = comparisonA
  let comparisonSummaryB = comparisonB
  if (
    provider === 'tiktok' &&
    comparison &&
    detail &&
    detail.kind === 'tiktok' &&
    comparisonA &&
    comparisonB
  ) {
    const [postedA, postedB] = await Promise.all([
      getTiktokVideosPostedInRange(detail.connectionId, {
        startDate: comparison.a.start,
        endDate: snapshotUpperBound(comparison.a.end),
      }),
      getTiktokVideosPostedInRange(detail.connectionId, {
        startDate: comparison.b.start,
        endDate: snapshotUpperBound(comparison.b.end),
      }),
    ])
    comparisonSummaryA = {
      ...comparisonA,
      extra: { ...comparisonA.extra, ...aggregateVideosPostedInRange(postedA) },
    }
    comparisonSummaryB = {
      ...comparisonB,
      extra: { ...comparisonB.extra, ...aggregateVideosPostedInRange(postedB) },
    }
  }

  const channelSwitcher =
    connections.length > 1 && activeConnectionId ? (
      <ChannelSwitcher
        siteId={site.id}
        provider={provider}
        connections={connections}
        activeConnectionId={activeConnectionId}
      />
    ) : null

  return (
    <PageShell>
      {provider === 'tiktok' && detail && detail.kind === 'tiktok' ? (
        <TiktokChannelHeader
          siteId={site.id}
          detail={detail}
          accountExtra={summary?.extra ?? {}}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
          channelSwitcher={channelSwitcher}
        />
      ) : (provider === 'facebook' || provider === 'instagram') &&
        detail &&
        (detail.kind === 'facebook' || detail.kind === 'instagram') ? (
        <MetaChannelHeader
          siteId={site.id}
          detail={detail}
          connected={summary?.connected ?? false}
          dateRangeLabel={formatDateRange(range.start, range.end)}
          channelSwitcher={channelSwitcher}
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
                <div className="flex items-center gap-2">
                  {channelSwitcher}
                  <ExternalChannelLink
                    provider={provider}
                    externalAccountId={detail.externalAccountId}
                    variant="secondary"
                    size="md"
                  />
                </div>
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

      {comparison && summary?.connected && comparisonSummaryA && comparisonSummaryB ? (
        <ChannelComparisonPanel
          provider={provider}
          summary={comparisonSummaryA}
          compareSummary={comparisonSummaryB}
          currency={site.currency}
          currentLabel={formatDateRange(comparison.a.start, comparison.a.end)}
          compareLabel={formatDateRange(comparison.b.start, comparison.b.end)}
        />
      ) : null}

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
          startDate={range.start}
          endDate={range.end}
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
