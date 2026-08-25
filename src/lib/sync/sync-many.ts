import 'server-only'

import { familyOf, type ProviderId } from '@/lib/domain/providers'
import { syncConnection } from './sync-connection'

export interface SyncTarget {
  readonly id: string
  readonly provider: ProviderId
  /** `null` = chưa nạp lịch sử; `syncConnection` sẽ kéo cửa sổ rộng cho lượt
   * này. Dùng ở đây CHỈ để đếm và giới hạn số lượt nạp mỗi lần cron. */
  readonly backfilled_at?: string | null
}

export interface SyncManyResult {
  readonly synced: number
  readonly failed: number
  /** Provider KHÔNG có `MetricsAdapter` (`gtm`, `klaviyo`). `syncConnection`
   * trả `metrics-not-ready` cho chúng SAU KHI đã set `status:'connected'` +
   * `last_synced_at` — tức là đã làm đúng việc cần làm, không phải hỏng. Đếm
   * riêng để báo cáo cron không hiện `failed` cố định mỗi lượt chạy, che mất
   * lỗi thật. */
  readonly skipped: number
  readonly total: number
  /** Connection bị hoãn sang lượt cron sau vì đã chạm `MAX_BACKFILLS_PER_RUN`.
   * > 0 nghĩa là việc nạp lịch sử còn dở, chưa phải lỗi. */
  readonly deferred: number
}

/**
 * Đồng bộ một loạt connection, SONG SONG GIỮA các provider family nhưng TUẦN
 * TỰ BÊN TRONG mỗi family.
 *
 * Trước đây cả vòng lặp chạy tuần tự tuyệt đối vì lý do chính đáng: bắn
 * `Promise.all` cho toàn bộ connection sẽ dí quá nhiều request đồng thời vào
 * API Google và chạm rate limit của chính Google. Nhưng quota đó tính RIÊNG
 * theo từng nền tảng — một request Meta Graph API không hề tiêu quota của
 * Google, cũng không tiêu quota của TikTok. Chạy 5 family cạnh nhau vì vậy
 * KHÔNG làm tăng số request đồng thời mà bất kỳ nền tảng nào nhìn thấy: mỗi
 * nền tảng vẫn chỉ thấy đúng một request tại một thời điểm, y như cũ.
 *
 * Đổi lại, thời gian của cả lượt cron giảm từ "tổng của mọi connection" xuống
 * "family chậm nhất" — chỗ này quan trọng vì Google chiếm 6/11 provider, nên
 * trước đây một site nhiều kết nối Meta/TikTok vẫn phải xếp hàng sau toàn bộ
 * Google mới tới lượt.
 */
/** Trần số connection được nạp lịch sử trong MỘT lượt cron.
 *
 * Nạp một cửa sổ 365 ngày là 4-5 lượt gọi API cho mỗi connection, mất vài giây
 * mỗi cái — thả trần thì một site nhiều kết nối sẽ ăn hết `maxDuration = 800`
 * ngay lượt đầu và bị Vercel giết giữa chừng, để lại phần nạp dở. Chặn ở đây
 * thì các connection còn lại nạp ở lượt sau: cron chạy mỗi giờ nên toàn bộ
 * xong trong vài giờ, và mỗi lượt đều kết thúc gọn ghẽ.
 *
 * Đặt ở tầng này chứ không trong `syncConnection` vì nó là quyết định về NGÂN
 * SÁCH CỦA MỘT LƯỢT CHẠY, không phải về một connection đơn lẻ. */
const MAX_BACKFILLS_PER_RUN = 4

export const syncMany = async (targets: readonly SyncTarget[]): Promise<SyncManyResult> => {
  // Hoãn phần vượt trần sang lượt cron sau. Lọc TRƯỚC khi chia family để trần
  // áp cho cả lượt chạy, không phải cho từng family.
  let backfillBudget = MAX_BACKFILLS_PER_RUN
  const admitted = targets.filter((target) => {
    if (target.backfilled_at !== null && target.backfilled_at !== undefined) return true
    if (backfillBudget <= 0) return false
    backfillBudget -= 1
    return true
  })

  const byFamily = new Map<string, SyncTarget[]>()
  for (const target of admitted) {
    const family = familyOf(target.provider)
    const bucket = byFamily.get(family)
    if (bucket) bucket.push(target)
    else byFamily.set(family, [target])
  }

  const perFamily = await Promise.all(
    [...byFamily.values()].map(async (bucket) => {
      let synced = 0
      let failed = 0
      let skipped = 0
      for (const target of bucket) {
        // Một connection lỗi không được kéo sập cả family — `syncConnection`
        // đã trả `{ ok: false }` thay vì throw cho lỗi nghiệp vụ, nhưng vẫn
        // bọc để lỗi ngoài dự kiến (mạng, JSON hỏng) chỉ tính là 1 failed.
        try {
          const result = await syncConnection(target.id)
          if (result.ok) synced += 1
          else if (result.error === 'metrics-not-ready') skipped += 1
          else failed += 1
        } catch (error) {
          console.error(
            `Không đồng bộ được connection ${target.id}: ${error instanceof Error ? error.message : String(error)}`,
          )
          failed += 1
        }
      }
      return { synced, failed, skipped }
    }),
  )

  return {
    synced: perFamily.reduce((sum, entry) => sum + entry.synced, 0),
    failed: perFamily.reduce((sum, entry) => sum + entry.failed, 0),
    skipped: perFamily.reduce((sum, entry) => sum + entry.skipped, 0),
    total: admitted.length,
    deferred: targets.length - admitted.length,
  }
}
