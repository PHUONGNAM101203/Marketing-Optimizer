import { Callout } from '@/components/ui/feedback'
import { formatDateRange } from '@/lib/format'

/* Hallmark · component: gsc-lag-notice · theme: studied-DNA (Ink & Signal)
 *
 * Search Console có độ trễ báo cáo NỘI TẠI từ phía Google: số của một ngày chỉ
 * xuất hiện sau đó 2-3 ngày. Đây không phải chuyện đồng bộ dày hơn thì khắc
 * phục được — đo thật ngày 26/8/2026: 0/5 kết nối GSC có hàng cho hôm nay VÀ
 * cho cả hôm qua, ngay sau một lượt đồng bộ vừa chạy xong.
 *
 * Không nói ra thì chọn "Hôm nay" sẽ thấy Search Console trống trơn và không
 * có cách nào phân biệt với "kết nối hỏng" — đúng lớp hiểu nhầm mà mọi cảnh
 * báo dữ liệu-rỗng khác trong app sinh ra để chặn.
 */

/** Google nói 2-3 ngày; lấy mốc 3 để không hứa hẹn quá tay. */
const GSC_REPORTING_LAG_DAYS = 3

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export function GscLagNotice({
  rangeStart,
  rangeEnd,
  today,
}: {
  readonly rangeStart: string
  readonly rangeEnd: string
  /** Truyền vào thay vì gọi `new Date()` ở đây — component render trên server;
   * nhận mốc thời gian từ nơi gọi giữ cho nó thuần và dễ suy luận. */
  readonly today: string
}) {
  // Khoảng kết thúc đủ xa hôm nay thì Google đã xử lý xong, không cần cảnh báo.
  if (daysBetween(rangeEnd, today) >= GSC_REPORTING_LAG_DAYS) return null

  const wholeRangeTooRecent = daysBetween(rangeStart, today) < GSC_REPORTING_LAG_DAYS

  return (
    <Callout tone="caution" title="Search Console chưa có số cho những ngày gần nhất">
      {wholeRangeTooRecent
        ? `Toàn bộ khoảng ${formatDateRange(rangeStart, rangeEnd)} nằm trong ${GSC_REPORTING_LAG_DAYS} ngày gần nhất, nên chưa thể có dữ liệu.`
        : `Vài ngày cuối của khoảng ${formatDateRange(rangeStart, rangeEnd)} chưa có dữ liệu.`}{' '}
      Google mất khoảng {GSC_REPORTING_LAG_DAYS} ngày mới xử lý xong số của một ngày — đây là độ trễ
      của chính Search Console, không phải kết nối lỗi, và đồng bộ lại cũng không làm nhanh hơn.
    </Callout>
  )
}
