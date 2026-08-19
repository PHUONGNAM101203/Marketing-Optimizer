import type { Entity, EntityKind, EntityStatus } from '@/lib/domain/entity'
import { PRIMARY_ENTITY_KIND } from '@/lib/domain/entity'
import type { ProviderId } from '@/lib/domain/providers'
import type { EntityPerformance, MetricTotals } from '@/lib/metrics/types'
import { deriveMetrics } from '@/lib/metrics/derive'
import { createRandom, randomBetween } from './random'

/**
 * Thực thể và hiệu suất cấp thực thể.
 *
 * Ở M1 chỉ sinh TỔNG theo thực thể, không sinh chuỗi ngày cho từng campaign:
 * bảng xếp hạng chỉ cần tổng, và sinh 28 ngày × 40 thực thể × 8 nền tảng cho
 * một prototype là công vô ích. Khi nối API thật, `entityPerformance` đổi nguồn
 * còn component giữ nguyên.
 */

interface EntitySeed {
  readonly name: string
  /** Tỉ trọng chi phí hoặc lưu lượng trong tổng của nền tảng. */
  readonly weight: number
  readonly status?: EntityStatus
  /** Lệch hiệu quả so với mức trung bình của nền tảng. 1 = đúng mức. */
  readonly efficiency?: number
}

const SEEDS: Readonly<Partial<Record<ProviderId, readonly EntitySeed[]>>> = {
  'google-ads': [
    { name: 'Search — Thương hiệu', weight: 0.14, efficiency: 2.4 },
    { name: 'Search — Nội thất phòng khách', weight: 0.26, efficiency: 1.1 },
    { name: 'Performance Max — Toàn danh mục', weight: 0.28, efficiency: 0.95 },
    { name: 'Shopping — Đèn trang trí', weight: 0.17, efficiency: 1.25 },
    { name: 'Search — Từ khoá chung', weight: 0.11, efficiency: 0.42 },
    { name: 'Display — Remarketing', weight: 0.04, efficiency: 0.7, status: 'paused' },
  ],
  'meta-ads': [
    { name: 'Advantage+ — Danh mục chính', weight: 0.34, efficiency: 1.15 },
    { name: 'Retargeting — Xem sản phẩm 14 ngày', weight: 0.21, efficiency: 1.9 },
    { name: 'Prospecting — Lookalike 2%', weight: 0.24, efficiency: 0.78 },
    { name: 'Video — Bộ sưu tập Thu 2026', weight: 0.13, efficiency: 0.55 },
    { name: 'Lead — Tư vấn thiết kế', weight: 0.08, efficiency: 0.9 },
  ],
  tiktok: [
    { name: 'Spark Ads — Review nội thất', weight: 0.42, efficiency: 1.3 },
    { name: 'Video Shopping — Đèn ngủ', weight: 0.31, efficiency: 0.85 },
    { name: 'Traffic — Bộ sưu tập mới', weight: 0.27, efficiency: 0.6 },
  ],
  gsc: [
    { name: 'nội thất phòng khách hiện đại', weight: 0.09 },
    { name: 'đèn trang trí phòng ngủ', weight: 0.08 },
    { name: 'nhà xinh décor', weight: 0.14 },
    { name: 'kệ sách gỗ tự nhiên', weight: 0.06 },
    { name: 'bàn trà mặt đá', weight: 0.05 },
    { name: 'thảm trải sàn phòng khách', weight: 0.05 },
    { name: 'trang trí nhà cửa tối giản', weight: 0.04 },
    { name: 'ghế sofa nhỏ gọn cho chung cư', weight: 0.04 },
  ],
  ga4: [
    { name: '/', weight: 0.22 },
    { name: '/bo-suu-tap/phong-khach', weight: 0.15 },
    { name: '/san-pham/den-tre-mat-may', weight: 0.09 },
    { name: '/bo-suu-tap/den-trang-tri', weight: 0.08 },
    { name: '/blog/cach-phoi-mau-phong-ngu', weight: 0.07 },
    { name: '/gio-hang', weight: 0.06 },
    { name: '/thanh-toan', weight: 0.04 },
  ],
  youtube: [
    { name: 'Tour căn hộ 62m² — tối giản Nhật', weight: 0.31 },
    { name: '5 lỗi phối đèn ai cũng mắc', weight: 0.24 },
    { name: 'Unbox bộ sưu tập Thu 2026', weight: 0.19 },
    { name: 'Chọn thảm sao cho đúng tỉ lệ', weight: 0.14 },
    { name: 'Behind the scenes — xưởng gỗ', weight: 0.12 },
  ],
  instagram: [
    { name: 'Reel — Trước & sau: phòng khách 18m²', weight: 0.29 },
    { name: 'Carousel — Bảng màu Thu 2026', weight: 0.22 },
    { name: 'Reel — 3 cách xếp kệ sách', weight: 0.2 },
    { name: 'Post — Đèn tre mắt mây', weight: 0.16 },
    { name: 'Story highlight — Khách hàng', weight: 0.13 },
  ],
}

const SEED_BASE: Readonly<Record<ProviderId, number>> = {
  'google-ads': 11_001,
  'meta-ads': 12_002,
  tiktok: 13_003,
  facebook: 13_500,
  gsc: 14_004,
  ga4: 15_005,
  youtube: 16_006,
  instagram: 17_007,
  gtm: 18_008,
  'merchant-center': 19_009,
  klaviyo: 20_010,
}

export const entitiesOf = (
  siteId: string,
  provider: ProviderId,
): readonly Entity[] => {
  const seeds = SEEDS[provider] ?? []
  const kind: EntityKind = PRIMARY_ENTITY_KIND[provider]

  return seeds.map((seed, index) => ({
    id: `${provider}-entity-${index}`,
    siteId,
    connectionId: `conn-${provider}`,
    provider,
    kind,
    externalId: `${provider}-${index}`,
    name: seed.name,
    status: seed.status ?? 'active',
    parentId: null,
    meta: {},
  }))
}

/**
 * Hiệu suất từng thực thể, suy ra từ tổng của nền tảng theo tỉ trọng.
 * `efficiency` là thứ tạo ra chênh lệch thật giữa các campaign — không có nó
 * thì mọi dòng trong bảng có cùng CPA và màn hình tối ưu chẳng còn gì để chỉ ra.
 */
export const entityPerformance = (
  siteId: string,
  provider: ProviderId,
  providerTotals: MetricTotals,
): readonly EntityPerformance[] => {
  const seeds = SEEDS[provider] ?? []
  const entities = entitiesOf(siteId, provider)
  const random = createRandom(SEED_BASE[provider])

  return seeds
    .map((seed, index) => {
      const entity = entities[index]
      if (!entity) return null

      const jitter = randomBetween(random, 0.92, 1.08)
      const share = seed.weight * jitter
      const efficiency = seed.efficiency ?? 1

      const scale = (value: number | null): number | null =>
        value === null ? null : Math.round(value * share)

      const cost = scale(providerTotals.costMicros)
      const clicks = scale(providerTotals.clicks)
      // Chuyển đổi nhân thêm efficiency: cùng mức chi, campaign tốt ra nhiều
      // đơn hơn — đó chính là tín hiệu mà trang tối ưu cần đọc được.
      const conversions =
        providerTotals.conversions === null
          ? null
          : Math.round(providerTotals.conversions * share * efficiency)

      const totals: MetricTotals = {
        impressions: scale(providerTotals.impressions),
        clicks,
        costMicros: cost,
        conversions,
        conversionValueMicros:
          providerTotals.conversionValueMicros === null
            ? null
            : Math.round(providerTotals.conversionValueMicros * share * efficiency),
        sessions: scale(providerTotals.sessions),
        users: scale(providerTotals.users),
        revenueMicros: scale(providerTotals.revenueMicros),
      }

      return {
        entityId: entity.id,
        entityName: entity.name,
        provider,
        totals,
        derived: deriveMetrics(totals),
      }
    })
    .filter((row): row is EntityPerformance => row !== null)
    .sort((a, b) => {
      const byCost = (b.totals.costMicros ?? 0) - (a.totals.costMicros ?? 0)
      if (byCost !== 0) return byCost
      return (b.totals.impressions ?? 0) - (a.totals.impressions ?? 0)
    })
}

/** Vị trí trung bình theo truy vấn — chỉ Search Console mới có. */
export const averagePositionOf = (entityId: string): number => {
  const random = createRandom(
    [...entityId].reduce((sum, char) => sum + char.charCodeAt(0), 0),
  )
  return Number(randomBetween(random, 2.1, 24.6).toFixed(1))
}

export const entityStatusOf = (
  provider: ProviderId,
  index: number,
): EntityStatus => SEEDS[provider]?.[index]?.status ?? 'active'
