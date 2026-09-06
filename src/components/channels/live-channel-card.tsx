import { ChannelCard } from './channel-card'
import { getChannelSummariesLive, type ChannelSummary } from '@/lib/data/site-channels'
import type { ProviderId } from '@/lib/domain/providers'

/* Hallmark · component: live-channel-card · theme: studied-DNA (Ink & Signal)
 *
 * Thẻ kênh cho những nền tảng mà số liệu phải lấy TRỰC TIẾP từ API lúc render
 * (Klaviyo, follower Facebook/Instagram) — xem `channel-live-extras.ts`.
 *
 * Tồn tại chỉ để có một ranh giới `Suspense` riêng cho từng kênh chậm. Trước
 * đây cả trang `await` một lượt chung, nên một Klaviyo cache nguội (khoảng 4
 * giây vì Reporting API bắt giãn nhịp) giữ luôn chín kênh còn lại — dù chín
 * kênh đó đọc từ database và đã sẵn sàng từ mili-giây đầu.
 */
export async function LiveChannelCard({
  siteId,
  provider,
  start,
  end,
  currency,
}: {
  readonly siteId: string
  readonly provider: ProviderId
  readonly start: string
  readonly end: string
  readonly currency: string
}) {
  const summaries = await getChannelSummariesLive(siteId, start, end)
  return (
    <ChannelCard
      siteId={siteId}
      provider={provider}
      summary={summaries.get(provider) as ChannelSummary}
      currency={currency}
    />
  )
}
