import type { ProviderFamily, ProviderId } from '@/lib/domain/providers'
import type { OAuthFamilyAdapter } from './types'
import type { MetricsAdapter } from './metrics-types'
import { googleAdapter } from './google'
import { METRICS_ADAPTERS as GOOGLE_METRICS_ADAPTERS } from './google-metrics'
import { googleAdsMetricsAdapter } from './google-ads-metrics'
import { merchantCenterMetricsAdapter } from './google-merchant-metrics'
import { metaAdapter } from './meta'
import { metaAdsMetricsAdapter, instagramMetricsAdapter } from './meta-metrics'
import { facebookMetricsAdapter } from './facebook-metrics'
import { tiktokAdapter } from './tiktok'
import { tiktokMetricsAdapter } from './tiktok-metrics'

/**
 * Registry adapter theo gia đình — route OAuth đọc bảng này để biết gia đình
 * nào đã "chạy được", thay vì hard-code if/else rải trong route handler.
 */
export const OAUTH_ADAPTERS: Readonly<Partial<Record<ProviderFamily, OAuthFamilyAdapter>>> = {
  google: googleAdapter,
  meta: metaAdapter,
  tiktok: tiktokAdapter,
}

/** Registry theo NỀN TẢNG (không phải gia đình) — kéo báo cáo là việc của
 * từng sản phẩm, không phải của cả gia đình OAuth. */
export const METRICS_ADAPTERS: Readonly<Partial<Record<ProviderId, MetricsAdapter>>> = {
  ...GOOGLE_METRICS_ADAPTERS,
  'google-ads': googleAdsMetricsAdapter,
  'merchant-center': merchantCenterMetricsAdapter,
  'meta-ads': metaAdsMetricsAdapter,
  instagram: instagramMetricsAdapter,
  facebook: facebookMetricsAdapter,
  tiktok: tiktokMetricsAdapter,
}
