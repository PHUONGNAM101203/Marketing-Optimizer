import 'server-only'

import { familyOf, type ProviderId } from '@/lib/domain/providers'
import { syncConnection } from './sync-connection'

export interface SyncTarget {
  readonly id: string
  readonly provider: ProviderId
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
export const syncMany = async (targets: readonly SyncTarget[]): Promise<SyncManyResult> => {
  const byFamily = new Map<string, SyncTarget[]>()
  for (const target of targets) {
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
    total: targets.length,
  }
}
