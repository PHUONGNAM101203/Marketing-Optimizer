import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { DataGate } from '@/components/connections/data-gate'
import { InlineLocked } from '@/components/connections/inline-locked'
import { OverviewTabs } from '@/components/overview/overview-tabs'
import { StatRow, StatTile } from '@/components/ui/stat-tile'
import { Card, CardBody, CardHeader, SectionHead } from '@/components/ui/card'
import { TrendChart, type TrendPoint } from '@/components/charts/trend-chart'
import { Button } from '@/components/ui/button'
import {
  SeriesCell,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableScroller,
} from '@/components/ui/table'
import { getSite } from '@/lib/data/sites'
import { getRealMetricsSummary } from '@/lib/data/site-metrics'
import { getLatestAuditRun } from '@/lib/data/audit'
import {
  getChannelDailySeriesByProvider,
  getChannelSummaries,
  type ChannelDailyPoint,
  type ChannelSummary,
} from '@/lib/data/site-channels'
import { SiteProfileCard } from '@/components/audit/site-profile-card'
import { PageSpeedReport } from '@/components/audit/pagespeed-report'
import { ChannelTrendCard } from '@/components/overview/channel-trend-card'
import { parseCustomRangeParams, parseRangeParam } from '@/lib/domain/date-range-param'
import { resolveDateRange } from '@/mock/dates'
import {
  CHARTABLE_PROVIDERS,
  channelBreakdowns,
  colorTokenOf,
  spendSeriesByChannel,
  totalsAcross,
} from '@/mock/metrics'
import {
  PROVIDER_FAMILIES,
  PROVIDER_META,
  PROVIDERS,
  hasCapability,
  type ProviderId,
} from '@/lib/domain/providers'
import { compare, deriveMetrics } from '@/lib/metrics/derive'
import {
  formatCurrencyCompact,
  formatMultiplier,
  formatNumber,
  formatPercent,
  formatDateRange,
} from '@/lib/format'

export const metadata = { title: 'Tổng quan' }

const SPEND_PROVIDERS = CHARTABLE_PROVIDERS.filter((provider) =>
  hasCapability(provider, 'spend'),
)

const familyMembers = (family: 'google' | 'meta' | 'tiktok'): readonly ProviderId[] =>
  PROVIDER_FAMILIES.find((entry) => entry.id === family)?.providers ?? []

export default async function OverviewPage({
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
  const previousRange = { start: range.previousStart, end: range.previousEnd }

  // Số liệu MOCK — minh hoạ cho khối chi phí quảng cáo, luôn bị khoá mờ bên
  // dưới vì chưa có adapter thật cho Google Ads/Meta/TikTok.
  const current = totalsAcross(SPEND_PROVIDERS, range)
  const previous = totalsAcross(SPEND_PROVIDERS, previousRange)
  const currentDerived = deriveMetrics(current)
  const previousDerived = deriveMetrics(previous)
  const breakdowns = channelBreakdowns(range)
  const spendByChannel = spendSeriesByChannel(SPEND_PROVIDERS, range)

  // Số liệu THẬT — GA4 + Search Console, đúng những gì đã có adapter kéo
  // báo cáo thật (xem lib/providers/google-metrics.ts). GA4 đóng góp
  // sessions/conversions, Search Console đóng góp clicks/impressions — gộp
  // trong CÙNG một totals vì adapter kia luôn để phần của nó bằng 0.
  const [real, realPrevious, channelSummaries, auditRun, dailySeriesByProvider] =
    await Promise.all([
      getRealMetricsSummary(site.id, range),
      getRealMetricsSummary(site.id, previousRange),
      getChannelSummaries(site.id, range),
      getLatestAuditRun(site.id),
      // Nuôi CẢ hai chỗ cần xu hướng theo ngày của TỪNG kênh riêng: lưới nhỏ
      // ở tab Tổng hợp và các thẻ đầy đủ ở tab Google/Meta/TikTok, không
      // truy vấn hai lần cho cùng một kênh. Một lượt gộp cho cả 10 provider
      // thay vì 10 lượt riêng — xem lý do ở `getChannelDailySeriesByProvider`.
      getChannelDailySeriesByProvider(site.id, range),
    ])

  const sessionPoints = real.dailySessions.map((point) => ({
    date: point.date,
    sessions: point.sessions,
  }))

  const summaryPanel = (
    <div key="summary" className="flex flex-col gap-6">
      <StatRow>
        {real.hasGa4 ? (
          <StatTile
            label="Chuyển đổi (GA4)"
            value={formatNumber(real.totals.conversions)}
            metric="conversions"
            deltaPct={compare(real.totals.conversions, realPrevious.totals.conversions).deltaPct}
          />
        ) : (
          <InlineLocked siteId={site.id} label="Cần kết nối GA4">
            <StatTile
              label="Chuyển đổi"
              value={formatNumber(current.conversions)}
              metric="conversions"
              deltaPct={compare(current.conversions, previous.conversions).deltaPct}
            />
          </InlineLocked>
        )}

        <InlineLocked siteId={site.id} label="Cần kết nối nguồn quảng cáo">
          <StatTile
            label="Tổng chi phí"
            value={formatCurrencyCompact(current.costMicros, site.currency)}
            metric="costMicros"
            deltaPct={compare(current.costMicros, previous.costMicros).deltaPct}
            footnote="Chi phí không tự thân tốt hay xấu — đọc cùng ROAS bên cạnh."
          />
        </InlineLocked>

        <InlineLocked siteId={site.id} label="Cần kết nối nguồn quảng cáo">
          <StatTile
            label="ROAS tổng hợp"
            value={formatMultiplier(currentDerived.roas)}
            metric="roas"
            deltaPct={compare(currentDerived.roas, previousDerived.roas).deltaPct}
            footnote="Giá trị chuyển đổi ÷ chi phí, gộp mọi kênh trả phí."
          />
        </InlineLocked>

        <InlineLocked siteId={site.id} label="Cần kết nối nguồn quảng cáo">
          <StatTile
            label="CPA"
            value={formatCurrencyCompact(currentDerived.cpaMicros, site.currency)}
            metric="cpaMicros"
            deltaPct={compare(currentDerived.cpaMicros, previousDerived.cpaMicros).deltaPct}
          />
        </InlineLocked>
      </StatRow>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader
            title="Truy cập theo ngày"
            description="Sessions từ GA4, cộng gộp mọi property đã kết nối."
          />
          <CardBody>
            {real.hasGa4 && sessionPoints.length > 0 ? (
              <SessionsChart data={sessionPoints} />
            ) : (
              <InlineLocked siteId={site.id} label="Cần kết nối GA4">
                <SessionsChart data={spendByChannel.map((point) => ({ date: point.date, sessions: 0 }))} />
              </InlineLocked>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Chi phí theo kênh"
            description="Cùng đơn vị tiền nên vẽ chung được một trục."
          />
          <CardBody>
            <InlineLocked siteId={site.id} label="Cần kết nối nguồn quảng cáo">
              <SpendChart providers={SPEND_PROVIDERS} data={spendByChannel} />
            </InlineLocked>
          </CardBody>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <SectionHead
          label="Phân rã"
          title="Hiệu suất từng kênh"
          description="Bảng thay cho thanh tiến độ: ROAS không có trần, nên thanh tiến độ ngụ ý một thang 0–100% không tồn tại."
        />

        <InlineLocked
          siteId={site.id}
          label="Cần kết nối nguồn quảng cáo"
          className="rounded-[var(--radius-lg)]"
        >
          <BreakdownTable breakdowns={breakdowns} currency={site.currency} />
        </InlineLocked>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHead
          label="Từng kênh"
          title="Xu hướng mọi nền tảng"
          description="Khác trang Kênh (chỉ hiện số) — mỗi thẻ ở đây vẽ ĐÚNG chỉ số riêng của nền tảng đó theo thời gian, không lặp lại 3 tab Google/Meta/TikTok bên cạnh (những tab đó hiện bản đầy đủ, đây là bản rút gọn nhìn hết một lượt)."
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const summary = channelSummaries.get(provider) as ChannelSummary
            return (
              <ChannelTrendCard
                key={provider}
                siteId={site.id}
                provider={provider}
                connected={summary.connected}
                hasData={summary.hasData}
                series={dailySeriesByProvider.get(provider) ?? []}
                compact
              />
            )
          })}
        </div>
      </section>
    </div>
  )

  const googlePanel = (
    <FamilyPanel
      key="google"
      siteId={site.id}
      providers={familyMembers('google')}
      summaries={channelSummaries}
      dailySeriesByProvider={dailySeriesByProvider}
    />
  )

  const metaPanel = (
    <FamilyPanel
      key="meta"
      siteId={site.id}
      providers={familyMembers('meta')}
      summaries={channelSummaries}
      dailySeriesByProvider={dailySeriesByProvider}
    />
  )

  const tiktokPanel = (
    <FamilyPanel
      key="tiktok"
      siteId={site.id}
      providers={familyMembers('tiktok')}
      summaries={channelSummaries}
      dailySeriesByProvider={dailySeriesByProvider}
    />
  )

  return (
    <PageShell>
      <PageHeader
        title="Tổng quan"
        description={`Hiệu suất hợp nhất của ${site.domain} trên toàn bộ kênh đã kết nối.`}
        meta={
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
            {formatDateRange(range.start, range.end)} · so với kỳ liền trước
          </p>
        }
        action={
          <Button asChild variant="secondary" size="md">
            <Link href={`/${site.id}/insights`}>
              Xem đề xuất
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        }
      />

      <SiteProfileCard siteId={site.id} run={auditRun} />
      {auditRun ? <PageSpeedReport pagespeed={auditRun.pagespeed} pageUrl={site.url} /> : null}

      <DataGate
        siteId={site.id}
        title="Chưa có số liệu để tổng hợp"
        description="Tổng quan gộp chi phí, chuyển đổi và ROAS từ mọi kênh. Cần ít nhất một kết nối để có gì mà gộp."
      >
        <OverviewTabs
          tabs={[
            { id: 'summary', label: 'Tổng hợp' },
            { id: 'google', label: 'Google' },
            { id: 'meta', label: 'Meta' },
            { id: 'tiktok', label: 'TikTok' },
          ]}
          panels={[summaryPanel, googlePanel, metaPanel, tiktokPanel]}
        />
      </DataGate>
    </PageShell>
  )
}

function SessionsChart({ data }: { readonly data: readonly { date: string; sessions: number }[] }) {
  return (
    <TrendChart
      data={data}
      series={[{ key: 'sessions', label: 'Sessions', colorToken: '--color-signal', kind: 'area' }]}
      format="number"
    />
  )
}

function SpendChart({
  providers,
  data,
}: {
  readonly providers: readonly ProviderId[]
  readonly data: readonly TrendPoint[]
}) {
  return (
    <TrendChart
      data={data}
      series={providers.map((provider) => ({
        key: provider,
        label: PROVIDER_META[provider].shortLabel,
        colorToken: colorTokenOf(provider),
        kind: 'line' as const,
      }))}
      format="currency"
      currencySymbol="₫"
    />
  )
}

function BreakdownTable({
  breakdowns,
  currency,
}: {
  readonly breakdowns: ReturnType<typeof channelBreakdowns>
  readonly currency: string
}) {
  return (
    <Card className="overflow-hidden">
      <TableScroller aria-label="Hiệu suất từng kênh">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Kênh</TH>
              <TH numeric>Chi phí</TH>
              <TH numeric>Tỷ trọng chi</TH>
              <TH numeric>Chuyển đổi</TH>
              <TH numeric>CPA</TH>
              <TH numeric>ROAS</TH>
              <TH numeric>CTR</TH>
            </TR>
          </THead>
          <TBody>
            {breakdowns.map((row) => (
              <TR key={row.provider}>
                <TD>
                  <SeriesCell colorToken={colorTokenOf(row.provider)}>
                    {PROVIDER_META[row.provider].label}
                  </SeriesCell>
                </TD>
                <TD numeric>{formatCurrencyCompact(row.totals.costMicros, currency)}</TD>
                <TD numeric>{formatPercent(row.shareOfSpend)}</TD>
                <TD numeric>{formatNumber(row.totals.conversions)}</TD>
                <TD numeric>{formatCurrencyCompact(row.derived.cpaMicros, currency)}</TD>
                <TD numeric>{formatMultiplier(row.derived.roas)}</TD>
                <TD numeric>{formatPercent(row.derived.ctr, 2)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableScroller>
    </Card>
  )
}

/**
 * Thân của 3 tab Google/Meta/TikTok — mỗi kênh THUỘC gia đình này một thẻ
 * đầy đủ, đúng chỉ số riêng (xem `channelChartMetric`), xếp dọc lần lượt.
 * Không còn gộp chung một "Chi phí theo ngày" cho cả gia đình — Meta giờ có
 * cả kênh trả phí (Facebook Ads) lẫn nội dung hữu cơ (Instagram, Facebook),
 * ép chung một biểu đồ chi phí sẽ bỏ sót hai cái sau hoàn toàn.
 */
function FamilyPanel({
  siteId,
  providers,
  summaries,
  dailySeriesByProvider,
}: {
  readonly siteId: string
  readonly providers: readonly ProviderId[]
  readonly summaries: ReadonlyMap<ProviderId, ChannelSummary>
  readonly dailySeriesByProvider: ReadonlyMap<ProviderId, readonly ChannelDailyPoint[]>
}) {
  return (
    <div className="flex flex-col gap-5">
      {providers.map((provider) => {
        const summary = summaries.get(provider)
        return (
          <ChannelTrendCard
            key={provider}
            siteId={siteId}
            provider={provider}
            connected={summary?.connected ?? false}
            hasData={summary?.hasData ?? false}
            series={dailySeriesByProvider.get(provider) ?? []}
          />
        )
      })}
    </div>
  )
}
