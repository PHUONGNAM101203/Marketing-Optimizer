import type { ProviderId } from '@/lib/domain/providers'
import { PROVIDER_META, hasCapability } from '@/lib/domain/providers'
import type {
  ChannelBreakdown,
  DateRange,
  DatedRow,
  MetricRow,
  MetricTotals,
  TimeSeriesPoint,
} from '@/lib/metrics/types'
import { microsToUnits, unitsToMicros } from '@/lib/metrics/types'
import { deriveMetrics, sumTotals } from '@/lib/metrics/derive'
import { createRandom, trendedSeries } from './random'
import {
  MOCK_TODAY,
  addDays,
  dateSequence,
  dayOfWeekOf,
  daysSince,
  toIsoDate,
} from './dates'

/**
 * Chuỗi số liệu mẫu theo ngày cho từng nền tảng.
 *
 * ⚠ GHI CHÚ VỀ ĐƠN VỊ TIỀN — cần xử lý ở M3 khi dựng schema thật:
 * VND không có đơn vị phụ, nên lưu bằng micros là thừa 6 chữ số. Tổng chi tiêu
 * trọn đời quá ~9 tỷ VND sẽ vượt `Number.MAX_SAFE_INTEGER` khi cộng dồn bằng
 * micros. Ở M1 với dữ liệu mẫu thì chưa chạm ngưỡng, nhưng khi tạo bảng
 * `metrics_daily` thật phải chọn: dùng `numeric` phía Postgres và đổi sang đơn
 * vị tiền trước khi cộng ở tầng ứng dụng, hoặc lưu VND theo đơn vị gốc.
 */

interface ProviderProfile {
  readonly impressions: number
  readonly clickRate: number
  /** Chi phí mỗi ngày, tính bằng VND. */
  readonly dailyCost: number
  readonly conversionRate: number
  /** Giá trị trung bình một đơn, VND. */
  readonly orderValue: number
  readonly sessionsPerClick: number
  readonly growthPerDay: number
  readonly noise: number
  readonly weekendDip: number
  readonly seed: number
}

/**
 * Hệ số được cân để ROAS ra 2,8–4,3x — mức thật của thương mại điện tử Việt
 * Nam. Bộ số đầu tiên cho ra 12,5x đều tăm tắp ở mọi kênh: nhìn thì đẹp nhưng
 * vô nghĩa, và tệ hơn là nó che mất chính vấn đề mà màn hình này sinh ra để
 * phát hiện — kênh nào đang lỗ.
 */
const PROFILES: Readonly<Partial<Record<ProviderId, ProviderProfile>>> = {
  'google-ads': {
    impressions: 48_000,
    clickRate: 0.041,
    dailyCost: 12_600_000,
    conversionRate: 0.032,
    orderValue: 850_000,
    sessionsPerClick: 0.94,
    growthPerDay: 0.0021,
    noise: 0.13,
    weekendDip: 0.18,
    seed: 1_001,
  },
  'meta-ads': {
    impressions: 96_000,
    clickRate: 0.019,
    dailyCost: 10_900_000,
    conversionRate: 0.022,
    orderValue: 760_000,
    sessionsPerClick: 0.88,
    growthPerDay: 0.0009,
    noise: 0.19,
    weekendDip: 0.06,
    seed: 2_002,
  },
  tiktok: {
    impressions: 180_000,
    clickRate: 0.011,
    dailyCost: 3_600_000,
    conversionRate: 0.011,
    orderValue: 540_000,
    sessionsPerClick: 0.81,
    growthPerDay: 0.0038,
    noise: 0.26,
    weekendDip: -0.12,
    seed: 3_003,
  },
  ga4: {
    impressions: 0,
    clickRate: 0,
    dailyCost: 0,
    conversionRate: 0.021,
    orderValue: 1_610_000,
    sessionsPerClick: 0,
    growthPerDay: 0.0016,
    noise: 0.11,
    weekendDip: 0.21,
    seed: 4_004,
  },
  gsc: {
    impressions: 96_000,
    clickRate: 0.052,
    dailyCost: 0,
    conversionRate: 0,
    orderValue: 0,
    sessionsPerClick: 1,
    growthPerDay: 0.0012,
    noise: 0.09,
    weekendDip: 0.24,
    seed: 5_005,
  },
  youtube: {
    impressions: 34_000,
    clickRate: 0.028,
    dailyCost: 0,
    conversionRate: 0,
    orderValue: 0,
    sessionsPerClick: 0.4,
    growthPerDay: 0.0044,
    noise: 0.22,
    weekendDip: -0.08,
    seed: 6_006,
  },
  instagram: {
    impressions: 58_000,
    clickRate: 0.016,
    dailyCost: 0,
    conversionRate: 0,
    orderValue: 0,
    sessionsPerClick: 0.55,
    growthPerDay: 0.0018,
    noise: 0.2,
    weekendDip: -0.05,
    seed: 7_007,
  },
  // gtm không có mặt: nền tảng này chỉ quản lý thẻ, không sinh chuỗi thời gian.
}

/**
 * Mốc gốc của mọi chuỗi. Chuỗi được sinh MỘT LẦN cho toàn bộ quãng lịch sử rồi
 * cắt lát theo khoảng ngày yêu cầu.
 *
 * Bản đầu sinh lại từ index 0 cho mỗi khoảng ngày, nên kỳ hiện tại và kỳ trước
 * nhận đúng cùng một dãy số — mọi delta ra 0,0% và cả tính năng so sánh trông
 * như hỏng. Cắt lát từ một chuỗi liên tục là cách duy nhất để hai kỳ khác nhau
 * một cách nhất quán.
 */
const ORIGIN_DATE = '2025-01-01'
const SPAN_DAYS = 800

const fullSeriesCache = new Map<ProviderId, readonly MetricRow[]>()

/** GA4 đo phiên, không đo hiển thị — mỗi nền tảng chỉ điền các cột nó thật sự có. */
export const metricRowsFor = (
  provider: ProviderId,
  range: DateRange,
): readonly MetricRow[] => {
  const profile = PROFILES[provider]
  if (!profile) return []

  const full = fullSeriesCache.get(provider) ?? buildFullSeries(provider, profile)
  fullSeriesCache.set(provider, full)

  const startIndex = daysSince(ORIGIN_DATE, range.start)
  const endIndex = daysSince(ORIGIN_DATE, range.end)

  return full.slice(Math.max(0, startIndex), Math.max(0, endIndex + 1))
}

const buildFullSeries = (
  provider: ProviderId,
  profile: ProviderProfile,
): readonly MetricRow[] => {
  const dates = dateSequence({
    start: ORIGIN_DATE,
    end: toIsoDate(addDays(new Date(ORIGIN_DATE), SPAN_DAYS - 1)),
  })
  const random = createRandom(profile.seed)
  const startDayOfWeek = dates.length > 0 ? dayOfWeekOf(dates[0] as string) : 1

  const shape = {
    length: dates.length,
    growthPerDay: profile.growthPerDay,
    noise: profile.noise,
    weekendDip: profile.weekendDip,
    startDayOfWeek,
  }

  /**
   * Hệ số trong PROFILES mô tả giá trị của HÔM NAY, không phải của mốc gốc.
   * Không neo lại thì tăng trưởng cộng dồn qua 800 ngày thổi mọi con số lên
   * 5–20 lần và phá hết cân đối ROAS vừa hiệu chỉnh.
   */
  const daysToToday = daysSince(ORIGIN_DATE, toIsoDate(MOCK_TODAY))
  const anchor = (todayValue: number): number =>
    todayValue / (1 + profile.growthPerDay) ** daysToToday

  const impressionSeries = trendedSeries(random, {
    ...shape,
    start: anchor(profile.impressions),
  })
  const costSeries = trendedSeries(random, {
    ...shape,
    start: anchor(profile.dailyCost),
  })
  const sessionSeries = trendedSeries(random, { ...shape, start: anchor(3_900) })

  const carriesSpend = hasCapability(provider, 'spend')
  const carriesTraffic = hasCapability(provider, 'traffic')
  const carriesConversions = hasCapability(provider, 'conversions')

  return dates.map((date, index) => {
    const impressions = Math.round(impressionSeries[index] ?? 0)
    const clicks = Math.round(impressions * profile.clickRate)
    const cost = carriesSpend ? Math.round(costSeries[index] ?? 0) : null
    const conversions = carriesConversions
      ? Math.round(clicks * profile.conversionRate)
      : null
    const conversionValue =
      conversions === null ? null : Math.round(conversions * profile.orderValue)

    // GA4 là nguồn phiên của cả site, không phải phiên từ một kênh.
    const sessions =
      provider === 'ga4'
        ? Math.round(sessionSeries[index] ?? 0)
        : carriesTraffic
          ? Math.round(clicks * profile.sessionsPerClick)
          : null

    // Kiểu tường minh: nếu để TS suy diễn từ ba nhánh ternary, nó sinh ra union
    // có thuộc tính optional `undefined`, không khớp index signature của MetricRow.
    const extra: Readonly<Record<string, string | number | null>> =
      provider === 'gsc'
        ? { averagePosition: Number((8.4 - index * 0.004).toFixed(2)) }
        : provider === 'youtube'
          ? { videoViews: Math.round(impressions * 0.31) }
          : {}

    return {
      provider,
      connectionId: `conn-${provider}`,
      entityId: `${provider}-account`,
      date,
      impressions: profile.impressions > 0 ? impressions : null,
      clicks: profile.clickRate > 0 ? clicks : null,
      costMicros: cost === null ? null : unitsToMicros(cost),
      conversions,
      conversionValueMicros:
        conversionValue === null ? null : unitsToMicros(conversionValue),
      sessions,
      users: sessions === null ? null : Math.round(sessions * 0.78),
      revenueMicros:
        provider === 'ga4' && conversionValue !== null
          ? unitsToMicros(conversionValue)
          : null,
      extra,
    }
  })
}

export const totalsFor = (provider: ProviderId, range: DateRange): MetricTotals =>
  sumTotals(metricRowsFor(provider, range))

/** Tổng cộng dồn qua nhiều nền tảng — dùng cho hàng KPI ở trang Tổng quan. */
export const totalsAcross = (
  providers: readonly ProviderId[],
  range: DateRange,
): MetricTotals =>
  sumTotals(providers.flatMap((provider) => metricRowsFor(provider, range)))

/** Nền tảng có chuỗi thời gian — dùng để lặp mà không cần biết tên cụ thể. */
export const CHARTABLE_PROVIDERS: readonly ProviderId[] = Object.keys(
  PROFILES,
) as readonly ProviderId[]

/** Cộng nhiều nền tảng thành một chuỗi theo ngày, cho biểu đồ tổng quan. */
export const combinedSeries = (
  providers: readonly ProviderId[],
  range: DateRange,
): readonly TimeSeriesPoint[] => {
  const dates = dateSequence(range)
  const byProvider = providers.map((provider) => metricRowsFor(provider, range))

  return dates.map((date, index) => {
    const rowsForDate = byProvider
      .map((rows) => rows[index])
      .filter((row): row is MetricRow => row !== undefined)

    return { date, ...sumTotals(rowsForDate) }
  })
}

/** Chuỗi riêng từng nền tảng, giữ nguyên `provider` để gán đúng màu series. */
export const seriesByProvider = (
  providers: readonly ProviderId[],
  range: DateRange,
): ReadonlyArray<{
  readonly provider: ProviderId
  readonly points: readonly TimeSeriesPoint[]
}> =>
  providers.map((provider) => ({
    provider,
    points: metricRowsFor(provider, range).map((row) => ({
      date: row.date,
      impressions: row.impressions,
      clicks: row.clicks,
      costMicros: row.costMicros,
      conversions: row.conversions,
      conversionValueMicros: row.conversionValueMicros,
      sessions: row.sessions,
      users: row.users,
      revenueMicros: row.revenueMicros,
    })),
  }))

/**
 * Chi phí theo ngày, mỗi nền tảng một cột — đúng hình dạng Recharts cần.
 * Tính một lượt cho mọi nền tảng thay vì gọi lại trong vòng lặp render.
 */
export const spendSeriesByChannel = (
  providers: readonly ProviderId[],
  range: DateRange,
): readonly DatedRow[] => {
  const dates = dateSequence(range)
  const rowsByProvider = new Map(
    providers.map((provider) => [provider, metricRowsFor(provider, range)]),
  )

  return dates.map((date, index) => {
    const costs = Object.fromEntries(
      providers.map((provider) => {
        const cost = rowsByProvider.get(provider)?.[index]?.costMicros ?? null
        return [provider, cost === null ? null : microsToUnits(cost)]
      }),
    )
    return { ...costs, date }
  })
}

export const channelBreakdowns = (
  range: DateRange,
): readonly ChannelBreakdown[] => {
  const spendProviders = CHARTABLE_PROVIDERS.filter((provider) =>
    hasCapability(provider, 'spend'),
  )

  const perProvider = spendProviders.map((provider) => ({
    provider,
    totals: totalsFor(provider, range),
  }))

  const totalSpend = perProvider.reduce(
    (sum, entry) => sum + (entry.totals.costMicros ?? 0),
    0,
  )
  const totalConversions = perProvider.reduce(
    (sum, entry) => sum + (entry.totals.conversions ?? 0),
    0,
  )

  return perProvider
    .map(({ provider, totals }) => ({
      provider,
      totals,
      derived: deriveMetrics(totals),
      shareOfSpend: totalSpend === 0 ? null : (totals.costMicros ?? 0) / totalSpend,
      shareOfConversions:
        totalConversions === 0 ? null : (totals.conversions ?? 0) / totalConversions,
    }))
    .sort((a, b) => (b.totals.costMicros ?? 0) - (a.totals.costMicros ?? 0))
}

export const colorTokenOf = (provider: ProviderId): string =>
  PROVIDER_META[provider].colorToken
