import { notFound } from 'next/navigation'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Callout } from '@/components/ui/feedback'
import { ProviderMark } from '@/components/connections/provider-mark'
import { ConnectPanel } from '@/components/connections/connect-panel'
import { GoogleAdsPicker } from '@/components/connections/google-ads-picker'
import { MetaAdsPicker } from '@/components/connections/meta-ads-picker'
import { GtmPicker } from '@/components/connections/gtm-picker'
import { PendingGoogleConnectionsPicker } from '@/components/connections/pending-google-connections-picker'
import { KlaviyoConnectCard } from '@/components/connections/klaviyo-connect-card'
import { ExternalChannelLink } from '@/components/connections/external-channel-link'
import { RefreshConnectionButton } from '@/components/connections/refresh-connection-button'
import { DisconnectConnectionButton } from '@/components/connections/disconnect-connection-button'
import { getSite } from '@/lib/data/sites'
import { getConnectionSummary } from '@/lib/data/connections'
import { getConfiguredOAuthApps, getGoogleAdsDeveloperToken } from '@/lib/data/site-oauth-apps'
import { getConfiguredPageSpeedApiKey } from '@/lib/audit/pagespeed'
import { getAppOrigin } from '@/lib/http/origin'
import {
  PROVIDER_FAMILIES,
  PROVIDERS,
  PROVIDER_META,
  isProviderFamily,
  type ProviderId,
} from '@/lib/domain/providers'
import {
  CONNECTION_STATUS_LABELS,
  type Connection,
  type ConnectionStatus,
} from '@/lib/domain/connection'
import { formatRelativeTime } from '@/lib/format'

export const metadata = { title: 'Kết nối' }

const STATUS_TONE: Readonly<
  Record<ConnectionStatus, 'positive' | 'negative' | 'caution' | 'neutral' | 'signal'>
> = {
  connected: 'positive',
  syncing: 'signal',
  disconnected: 'neutral',
  expired: 'caution',
  error: 'negative',
}

const OAUTH_ERROR_LABELS: Readonly<Record<string, string>> = {
  denied: 'Bạn đã huỷ cấp quyền — không có gì thay đổi.',
  invalid_state: 'Phiên kết nối đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.',
  'missing-code': 'Google không trả về mã xác thực. Vui lòng thử lại.',
  'no-accounts':
    'Cấp quyền thành công, nhưng tài khoản Google đó không có tài sản nào (GA4, Search Console, Tag Manager, YouTube, Merchant Center) cả — đã kiểm tra toàn bộ, không chỉ riêng cái khớp domain này. Có thể bạn đã chọn nhầm tài khoản Google lúc cấp quyền (nếu trình duyệt có sẵn nhiều tài khoản, màn hình chọn tài khoản sẽ hiện lại — chọn đúng tài khoản quản lý website này). Với Merchant Center: kiểm tra (1) đã bật đúng "Content API for Shopping" trong Google Cloud — KHÔNG phải "Merchant API" mới, và (2) tài khoản Merchant Center đã khai báo đúng Website URL trùng domain này chưa (Cài đặt doanh nghiệp → Thông tin doanh nghiệp trong merchants.google.com).',
  'google-api-error':
    'Cấp quyền thành công, nhưng gọi API của Google bị lỗi khi dò tài sản (không phải "không có gì" — xem chi tiết bên dưới). Thường do chưa bật đúng API trong Google Cloud project của OAuth app này: vào console.cloud.google.com → APIs & Services → Enabled APIs, bật "Google Analytics Admin API", "Google Search Console API", "Tag Manager API".',
  forbidden: 'Chỉ chủ sở hữu hoặc quản trị viên của website mới được thêm kết nối.',
  'family-not-ready': 'Nhà cung cấp này chưa mở kết nối thật.',
  'app-not-configured':
    'Website này chưa khai báo OAuth app — bấm "Thiết lập kết nối" ở dưới trước.',
  'exchange-failed': 'Không đổi được mã xác thực với Google. Vui lòng thử lại.',
  'connection-write-failed': 'Không ghi được kết nối. Vui lòng thử lại.',
  'secret-write-failed': 'Không lưu được token. Vui lòng thử lại.',
  'no-google-connection':
    'Kết nối Google (GA4, Search Console...) trước khi nâng quyền cho Google Ads.',
}

export default async function ConnectionsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly siteId: string }>
  readonly searchParams: Promise<{
    readonly oauth_connected?: string
    readonly oauth_error?: string
    readonly oauth_error_detail?: string
    readonly oauth_pending?: string
    readonly count?: string
  }>
}) {
  const { siteId } = await params
  const { oauth_connected, oauth_error, oauth_error_detail, oauth_pending, count } = await searchParams
  const site = await getSite(siteId)
  if (!site) notFound()

  const [summary, configuredFamilies, appOrigin, googleAdsDeveloperToken] = await Promise.all([
    getConnectionSummary(site.id),
    getConfiguredOAuthApps(site.id),
    getAppOrigin(),
    getGoogleAdsDeveloperToken(site.id),
  ])
  const hasPageSpeedApiKey = Boolean(getConfiguredPageSpeedApiKey())

  const connectedFamilyLabel =
    oauth_connected && isProviderFamily(oauth_connected)
      ? PROVIDER_FAMILIES.find((family) => family.id === oauth_connected)?.label
      : null
  const adsUpgraded = oauth_connected === 'google-ads-upgrade'
  const merchantUpgraded = oauth_connected === 'merchant-center-upgrade'

  return (
    <PageShell>
      {adsUpgraded ? (
        <Callout
          tone="positive"
          icon={<CircleCheck aria-hidden className="size-5 text-[var(--color-positive)]" />}
          title="Đã nâng quyền Google Ads"
        >
          <p>Chọn tài khoản Google Ads muốn kết nối ở khối bên dưới.</p>
        </Callout>
      ) : merchantUpgraded ? (
        <Callout
          tone="positive"
          icon={<CircleCheck aria-hidden className="size-5 text-[var(--color-positive)]" />}
          title="Đã nâng quyền Merchant Center"
        >
          <p>
            Tài khoản Merchant Center khớp domain website này đã tự kết nối — xem ở danh
            sách bên dưới. Không thấy gì nghĩa là tài khoản Merchant Center bạn dùng chưa
            khai báo đúng website này trong phần Cài đặt doanh nghiệp.
          </p>
        </Callout>
      ) : oauth_pending ? (
        <Callout
          tone="caution"
          icon={<CircleCheck aria-hidden className="size-5 text-[var(--color-caution)]" />}
          title="Không tự khớp được domain nào"
        >
          <p>
            Cấp quyền thành công. Chọn đúng tài sản muốn kết nối ở khối bên dưới —{' '}
            {oauth_pending} lựa chọn tìm thấy trên tài khoản Google đó.
          </p>
        </Callout>
      ) : connectedFamilyLabel ? (
        <Callout
          tone="positive"
          icon={<CircleCheck aria-hidden className="size-5 text-[var(--color-positive)]" />}
          title={`Đã kết nối ${connectedFamilyLabel}`}
        >
          <p>
            {count && Number(count) > 0
              ? `${count} tài sản đã được thêm và đang đồng bộ dữ liệu lần đầu.`
              : 'Kết nối đã được thiết lập.'}
          </p>
        </Callout>
      ) : null}

      {oauth_error ? (
        <Callout
          tone="critical"
          icon={
            <TriangleAlert aria-hidden className="size-5 text-[var(--color-negative)]" />
          }
          title="Kết nối chưa thành công"
        >
          <p>{OAUTH_ERROR_LABELS[oauth_error] ?? 'Có lỗi xảy ra. Vui lòng thử lại.'}</p>
          {oauth_error_detail ? (
            <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-paper)]/60 p-2.5 font-mono text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
              {oauth_error_detail}
            </p>
          ) : null}
        </Callout>
      ) : null}

      <PageHeader
        title="Kết nối"
        description={
          summary.isEmpty
            ? `${site.domain} chưa có nguồn dữ liệu nào. Kết nối xong là số liệu tự chảy về, không phải nhập tay gì cả.`
            : `Nguồn dữ liệu đang đổ về ${site.domain}.`
        }
        meta={
          summary.isEmpty ? null : (
            <p className="text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
              {summary.all.length} trên {PROVIDERS.length} nền tảng đã nối
              {summary.lastSyncedAt
                ? ` · đồng bộ ${formatRelativeTime(summary.lastSyncedAt, new Date())}`
                : ''}
            </p>
          )
        }
      />

      {summary.needsAttentionCount > 0 ? (
        <Callout
          tone="critical"
          icon={
            <TriangleAlert aria-hidden className="size-5 text-[var(--color-negative)]" />
          }
          title={`${summary.needsAttentionCount} kết nối cần bạn xử lý`}
        >
          <p>
            Trong lúc gián đoạn, số liệu của những nền tảng này{' '}
            <strong>không xuất hiện</strong> ở bất kỳ báo cáo nào — kể cả trang Tổng
            quan.
          </p>
        </Callout>
      ) : null}

      <ConnectPanel
        siteId={site.id}
        connected={summary.byProvider}
        configuredFamilies={configuredFamilies}
        appOrigin={appOrigin}
        hasGoogleAdsDeveloperToken={Boolean(googleAdsDeveloperToken)}
        hasPageSpeedApiKey={hasPageSpeedApiKey}
      />

      <PendingGoogleConnectionsPicker siteId={site.id} />
      <GtmPicker siteId={site.id} />
      <GoogleAdsPicker siteId={site.id} />
      <MetaAdsPicker siteId={site.id} />
      {/* Không đi qua `ConnectPanel` — Klaviyo không thuộc OAuth family nào,
          xác thực bằng private API key dán trực tiếp. Ẩn khi đã kết nối,
          giống các picker OAuth ở trên tự ẩn theo trạng thái riêng của
          chúng — connection đã có sẽ hiện ở lưới "Đã kết nối" bên dưới. */}
      {!summary.byProvider.has('klaviyo') ? <KlaviyoConnectCard siteId={site.id} /> : null}

      {summary.all.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
            Đã kết nối
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summary.all.map((connection) => (
              <ConnectionCard key={connection.id} connection={connection} />
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  )
}

function ConnectionCard({ connection }: { readonly connection: Connection }) {
  const tone = STATUS_TONE[connection.status]
  const provider: ProviderId = connection.provider

  return (
    <Card
      tone={connection.status === 'error' ? 'critical' : 'bordered'}
      className="flex h-full flex-col gap-4 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderMark provider={provider} />
          <div className="min-w-0">
            <p className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
              {PROVIDER_META[provider].label}
            </p>
            <p className="truncate text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
              {connection.accountName}
            </p>
          </div>
        </div>

        <Badge tone={tone} icon={<StatusDot tone={tone} />}>
          {CONNECTION_STATUS_LABELS[connection.status]}
        </Badge>
      </div>

      {connection.error ? (
        <p className="rounded-[var(--radius-sm)] bg-[var(--color-paper)]/60 p-2.5 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
          {connection.error.message}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          {connection.lastSyncedAt
            ? `Đồng bộ ${formatRelativeTime(connection.lastSyncedAt, new Date())}`
            : 'Đang đồng bộ lần đầu…'}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <ExternalChannelLink provider={provider} externalAccountId={connection.externalAccountId} />

          {connection.status !== 'expired' && connection.status !== 'error' ? (
            <RefreshConnectionButton connectionId={connection.id} />
          ) : null}

          <DisconnectConnectionButton
            connectionId={connection.id}
            providerLabel={PROVIDER_META[provider].label}
            accountName={connection.accountName}
          />
        </div>
      </div>
    </Card>
  )
}
