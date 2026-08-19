import type { ProviderId } from './providers'

/**
 * Bảng chiều (dimension) dùng chung cho mọi nền tảng.
 *
 * Một campaign Google Ads, một truy vấn Search Console, một video YouTube và
 * một bài Instagram đều là `Entity`. Nhờ vậy bảng xếp hạng, bộ lọc và biểu đồ
 * chỉ cần viết một lần — `kind` quyết định cột nào hiển thị.
 */
export interface Entity {
  readonly id: string
  readonly siteId: string
  readonly connectionId: string
  readonly provider: ProviderId
  readonly kind: EntityKind
  /** ID phía nền tảng. Cặp (connectionId, externalId) là khoá tự nhiên. */
  readonly externalId: string
  readonly name: string
  readonly status: EntityStatus
  /** Campaign → ad group → ad. `null` với thực thể gốc. */
  readonly parentId: string | null
  readonly meta: Readonly<Record<string, unknown>>
}

export type EntityKind =
  | 'account'
  | 'campaign'
  | 'adgroup'
  | 'ad'
  | 'keyword'
  | 'query'
  | 'page'
  | 'channel'
  | 'video'
  | 'post'
  | 'container'
  | 'tag'
  | 'product'

export type EntityStatus = 'active' | 'paused' | 'removed' | 'draft' | 'unknown'

export const ENTITY_KIND_LABELS: Readonly<Record<EntityKind, string>> = {
  account: 'Tài khoản',
  campaign: 'Chiến dịch',
  adgroup: 'Nhóm quảng cáo',
  ad: 'Quảng cáo',
  keyword: 'Từ khoá',
  query: 'Truy vấn',
  page: 'Trang',
  channel: 'Kênh',
  video: 'Video',
  post: 'Bài đăng',
  container: 'Container',
  tag: 'Thẻ',
  product: 'Sản phẩm',
}

export const ENTITY_STATUS_LABELS: Readonly<Record<EntityStatus, string>> = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  removed: 'Đã xoá',
  draft: 'Nháp',
  unknown: 'Không rõ',
}

/**
 * Thực thể chính của mỗi nền tảng — quyết định bảng nào hiện mặc định khi mở
 * trang kênh. Tránh phải viết if-else theo provider trong component.
 */
export const PRIMARY_ENTITY_KIND: Readonly<Record<ProviderId, EntityKind>> = {
  'google-ads': 'campaign',
  ga4: 'page',
  gsc: 'query',
  gtm: 'tag',
  youtube: 'video',
  'merchant-center': 'product',
  'meta-ads': 'campaign',
  instagram: 'post',
  // Đổi từ 'campaign' — TikTok không còn là nền tảng quảng cáo, thực thể
  // chính giờ là VIDEO (khớp `fetchTiktokContentExplore`), giống YouTube.
  tiktok: 'video',
  facebook: 'post',
  klaviyo: 'campaign',
}
