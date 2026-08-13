/**
 * PRNG có hạt giống, dùng cho toàn bộ dữ liệu mẫu.
 *
 * `Math.random()` KHÔNG dùng được ở đây: Next.js render trang này cả trên server
 * lẫn client, hai lần chạy sẽ ra hai bộ số khác nhau và React sẽ báo lỗi hydrate.
 * Cùng hạt giống luôn cho cùng dãy số, ở mọi lần chạy, trên mọi máy.
 */

/** mulberry32 — nhỏ, nhanh, phân phối đủ tốt cho dữ liệu trưng bày. */
export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export const randomBetween = (
  random: () => number,
  min: number,
  max: number,
): number => min + random() * (max - min)

export const randomInt = (random: () => number, min: number, max: number): number =>
  Math.floor(randomBetween(random, min, max + 1))

export const pickOne = <T>(random: () => number, items: readonly T[]): T => {
  if (items.length === 0) throw new Error('pickOne: mảng rỗng')
  return items[Math.floor(random() * items.length)] as T
}

/**
 * Đường xu hướng có nhiễu và nhịp tuần.
 *
 * Dữ liệu marketing thật luôn có nhịp 7 ngày — cuối tuần khác ngày thường. Dữ
 * liệu mẫu phẳng lì làm biểu đồ trông đúng nhưng đọc sai: người xem sẽ tưởng
 * mọi chu kỳ đều mượt, và thiết kế sẽ không lộ ra chỗ vỡ khi gặp số thật.
 */
export const trendedSeries = (
  random: () => number,
  options: {
    readonly length: number
    readonly start: number
    readonly growthPerDay: number
    readonly noise: number
    readonly weekendDip: number
    readonly startDayOfWeek: number
  },
): readonly number[] => {
  const { length, start, growthPerDay, noise, weekendDip, startDayOfWeek } = options

  return Array.from({ length }, (_unused, index) => {
    const dayOfWeek = (startDayOfWeek + index) % 7
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    const trend = start * (1 + growthPerDay) ** index
    const jitter = 1 + randomBetween(random, -noise, noise)
    const weekly = isWeekend ? 1 - weekendDip : 1

    return Math.max(0, trend * jitter * weekly)
  })
}
