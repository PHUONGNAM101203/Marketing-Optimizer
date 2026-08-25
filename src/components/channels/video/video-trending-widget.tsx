import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { formatCompact, formatDate, formatNumber } from '@/lib/format'
import type { VideoGrowthSummary } from '@/lib/providers/video-trending-types'

/* Hallmark · component: video-trending-widget · theme: studied-DNA (Ink & Signal)
 *
 * Dùng chung cho TikTok/YouTube.
 *
 * Bản trước có ba nút Tuần/Tháng/Năm, mỗi nút một cửa sổ cố định tính từ HÔM
 * NAY và độc lập với khoảng ngày trang đang chọn. Đã bỏ: chọn tháng 7 mà danh
 * sách vẫn toàn video tháng 8, ngay cạnh những khối khác đều theo tháng 7 —
 * người đọc không có cách nào biết bảng này đang nói về khoảng nào. Giờ nó
 * theo đúng khoảng ngày đang chọn, và ba nút kia trùng chức năng với chính bộ
 * chọn khoảng ngày ở topbar nên không còn lý do tồn tại.
 *
 * Không còn `'use client'`/`useState` — không còn state nào để giữ.
 */
export function VideoTrendingWidget({
  trendingFast,
  rangeLabel,
  likelyBroken = false,
}: {
  /** Đã tính sẵn theo khoảng ngày đang chọn ở tầng data. */
  readonly trendingFast: readonly VideoGrowthSummary[]
  /** Nhãn khoảng ngày đang xem, hiện ngay trên thẻ để không phải suy đoán
   * bảng này đang nói về khoảng nào. */
  readonly rangeLabel: string
  /** `true` khi kết nối đã đủ lâu mà vẫn không có snapshot nào — dấu hiệu
   * lỗi ghi THẬT (thiếu quyền, token hỏng...) bị nuốt im lặng trước đây,
   * KHÁC "chưa đủ thời gian tích luỹ". Tính sẵn phía server (xem
   * `ChannelDetail.videoSnapshotsLikelyBroken` trong `site-channel-detail.ts`)
   * — không tính `Date.now()` ở đây vì component này là Client Component
   * dùng hook, gọi hàm bất định ngay trong thân render vi phạm rule "render
   * phải thuần" của react-hooks. CHỈ TikTok truyền field này (snapshot của
   * nó có thể lỗi âm thầm phía ghi); YouTube không truyền — mặc định `false`
   * giữ nguyên thông điệp "đang tích luỹ" cũ. */
  readonly likelyBroken?: boolean
}) {
  // Backend không tự loại video đứng yên/giảm — yêu cầu gốc là "thay đổi
  // đáng tích cực", nên lọc ở đây.
  const positiveEntries = trendingFast.filter((entry) => (entry.growthPct ?? 0) > 0).slice(0, 5)

  return (
    <Card>
      <CardHeader title="Video có xu hướng tăng nhanh" description={rangeLabel} />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {positiveEntries.length === 0 ? (
          <EmptyState
            title={likelyBroken ? 'Không lấy được video' : 'Chưa có video tăng trưởng'}
            description={
              likelyBroken
                ? 'Kết nối đã đủ lâu nhưng vẫn chưa có snapshot video nào — có thể quyền truy cập video đã bị thu hồi hoặc chưa được cấp. Thử ngắt kết nối và kết nối lại.'
                : `Không có video nào tăng trưởng trong ${rangeLabel}. Nếu khoảng này nằm trước ngày kênh được kết nối thì chưa có dữ liệu để so.`
            }
          />
        ) : (
          <ol className="flex flex-col divide-y divide-[var(--color-rule)]">
            {positiveEntries.map((entry, index) => (
              <TrendingRow key={index} rank={index + 1} entry={entry} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}

function TrendingRow({ rank, entry }: { readonly rank: number; readonly entry: VideoGrowthSummary }) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        data-numeric
        className="w-5 shrink-0 text-[length:var(--text-sm)] font-semibold text-[var(--color-ink-3)]"
      >
        {rank}
      </span>
      {entry.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.thumbnailUrl}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[length:var(--text-sm)] text-[var(--color-ink)]" title={entry.title}>
          {entry.title}
        </p>
        {entry.createdAt ? (
          <p className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
            {formatDate(entry.createdAt.slice(0, 10))}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span data-numeric className="text-[length:var(--text-sm)] font-semibold text-[var(--color-positive)]">
          +{formatNumber(Math.round((entry.growthPct ?? 0) * 100))}%
        </span>
        <span data-numeric className="text-[length:var(--text-2xs)] text-[var(--color-ink-3)]">
          +{formatCompact(entry.growthDelta)} views
        </span>
      </div>
    </li>
  )
}
