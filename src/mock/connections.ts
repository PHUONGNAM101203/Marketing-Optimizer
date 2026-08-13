import type { Connection } from '@/lib/domain/connection'
import type { ProviderId } from '@/lib/domain/providers'

/**
 * Trạng thái kết nối được rải có chủ đích, không phải cho đẹp:
 * mỗi trạng thái trong `ConnectionStatus` xuất hiện ít nhất một lần, để trang
 * Connections buộc phải render đủ mọi nhánh. Bộ dữ liệu mẫu mà tất cả đều
 * `connected` sẽ giấu mất chính những màn hình khó thiết kế nhất.
 */
export const MOCK_CONNECTIONS: readonly Connection[] = [
  {
    id: 'conn-google-ads',
    siteId: 'site-nha-xinh',
    provider: 'google-ads',
    externalAccountId: '742-118-9034',
    accountName: 'Nhà Xinh Décor — Ads',
    status: 'connected',
    scopes: ['https://www.googleapis.com/auth/adwords'],
    connectedByName: 'Phương Nam',
    connectedAt: '2025-11-05T06:20:00Z',
    lastSyncedAt: '2026-08-12T01:15:00Z',
    error: null,
  },
  {
    id: 'conn-ga4',
    siteId: 'site-nha-xinh',
    provider: 'ga4',
    externalAccountId: 'properties/418902334',
    accountName: 'nhaxinhdecor.vn — GA4',
    status: 'connected',
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    connectedByName: 'Phương Nam',
    connectedAt: '2025-11-05T06:24:00Z',
    lastSyncedAt: '2026-08-12T01:15:00Z',
    error: null,
  },
  {
    id: 'conn-gsc',
    siteId: 'site-nha-xinh',
    provider: 'gsc',
    externalAccountId: 'sc-domain:nhaxinhdecor.vn',
    accountName: 'nhaxinhdecor.vn',
    status: 'connected',
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    connectedByName: 'Phương Nam',
    connectedAt: '2025-11-05T06:26:00Z',
    lastSyncedAt: '2026-08-11T22:40:00Z',
    error: null,
  },
  {
    id: 'conn-meta-ads',
    siteId: 'site-nha-xinh',
    provider: 'meta-ads',
    externalAccountId: 'act_601884723',
    accountName: 'Nhà Xinh Décor Ad Account',
    status: 'connected',
    scopes: ['ads_read', 'business_management'],
    connectedByName: 'Trần Khánh Vy',
    connectedAt: '2025-11-18T09:02:00Z',
    lastSyncedAt: '2026-08-12T00:50:00Z',
    error: null,
  },
  {
    id: 'conn-gtm',
    siteId: 'site-nha-xinh',
    provider: 'gtm',
    externalAccountId: 'GTM-N4XD9P2',
    accountName: 'nhaxinhdecor.vn — Web',
    status: 'error',
    scopes: ['https://www.googleapis.com/auth/tagmanager.readonly'],
    connectedByName: 'Trần Khánh Vy',
    connectedAt: '2025-11-20T03:15:00Z',
    lastSyncedAt: '2026-08-09T14:20:00Z',
    error: {
      code: 'SERVER_CONTAINER_UNREACHABLE',
      message:
        'Container phía server không phản hồi. Sự kiện Purchase gửi qua Measurement Protocol đang thất bại.',
      occurredAt: '2026-08-10T02:11:00Z',
      actionable: true,
    },
  },
  {
    id: 'conn-tiktok',
    siteId: 'site-nha-xinh',
    provider: 'tiktok',
    externalAccountId: '7284991003',
    accountName: 'Nhà Xinh Décor',
    status: 'expired',
    scopes: ['ad.report', 'campaign.list'],
    connectedByName: 'Trần Khánh Vy',
    connectedAt: '2026-01-08T07:45:00Z',
    lastSyncedAt: '2026-07-28T03:00:00Z',
    error: {
      code: 'REFRESH_TOKEN_EXPIRED',
      message: 'Cấp quyền đã hết hạn sau 90 ngày. Cần kết nối lại tài khoản.',
      occurredAt: '2026-07-29T03:00:00Z',
      actionable: true,
    },
  },
  {
    id: 'conn-youtube',
    siteId: 'site-nha-xinh',
    provider: 'youtube',
    externalAccountId: 'UC_nhaxinhdecor',
    accountName: 'Nhà Xinh Décor Official',
    status: 'syncing',
    scopes: ['https://www.googleapis.com/auth/yt-analytics.readonly'],
    connectedByName: 'Phương Nam',
    connectedAt: '2026-08-11T10:00:00Z',
    lastSyncedAt: null,
    error: null,
  },
]

/** Instagram chưa kết nối — để trang có ít nhất một thẻ ở trạng thái rỗng. */
export const UNCONNECTED_PROVIDERS: readonly ProviderId[] = ['instagram']

export const connectionsOfSite = (_siteId: string): readonly Connection[] =>
  MOCK_CONNECTIONS

export const connectionOfProvider = (
  _siteId: string,
  provider: ProviderId,
): Connection | undefined =>
  MOCK_CONNECTIONS.find((connection) => connection.provider === provider)

export const lastSyncOfSite = (siteId: string): string | null => {
  const timestamps = connectionsOfSite(siteId)
    .map((connection) => connection.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort()

  return timestamps.at(-1) ?? null
}
