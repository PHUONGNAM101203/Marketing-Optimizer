import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { mediaPathForPost, mediaPathForVideo, mirrorImage } from '@/lib/storage/media-mirror'

/**
 * Chép bù ảnh cho những hàng đã ghi TRƯỚC khi việc chép ảnh tồn tại.
 *
 * Việc chia làm hai phần, và phần lớn công việc KHÔNG cần tải gì cả:
 *
 * 1. Lan URL nội bộ ra hàng cũ — do `backfill_media_targets()` làm trong
 *    database. Mỗi video có một hàng snapshot mỗi ngày, tất cả trỏ về cùng một
 *    ảnh, nhưng lúc đồng bộ chỉ hàng của ngày hôm đó được ghi URL nội bộ. Đo
 *    thật 27/8/2026: bước này kéo 879 hàng video còn link ngoài xuống 56, và
 *    2.121 hàng bài đăng xuống 12 — bằng một câu lệnh, không tải một byte nào.
 *
 * 2. Tải phần còn lại từ CDN — chỉ những video/bài mà nền tảng không còn trả về
 *    nên chưa từng được chép. Sau bước 1 chỉ còn 9 mục. Đây là phần duy nhất
 *    tốn thời gian, nên nó là phần bị giới hạn bởi `limit`.
 *
 * Với những link đã hết hạn thì bước 2 không cứu được gì — ảnh đã biến mất khỏi
 * CDN. `media_backfill_failures` tồn tại để những mục đó không thử lại mãi mãi.
 */

/**
 * Hỏng đủ số lần này thì thôi hẳn, không thử lại nữa.
 *
 * Phải có, không phải để tiết kiệm: ảnh chép được sẽ tự rời danh sách chờ vì
 * URL trong bảng đã đổi thành URL nội bộ, còn ảnh HỎNG thì URL giữ nguyên nên
 * lượt sau lại chọn đúng nó. Không đếm số lần hỏng thì toàn bộ hạn mức mỗi lượt
 * sẽ bị những ảnh chết chiếm giữ vĩnh viễn và phần đuôi không bao giờ tới lượt.
 *
 * Ba lần chứ không phải một: một lượt tải hỏng chưa chắc là ảnh đã chết — có
 * thể quá giờ chờ, CDN chập chờn, hoặc mạng lỗi. Cron chạy mỗi giờ nên ba lần
 * là trải qua ba giờ, đủ để loại trừ trục trặc nhất thời.
 */
const MAX_ATTEMPTS = 3

export interface BackfillMediaResult {
  /** Số ảnh tải được từ CDN và chép về Storage trong lượt này. */
  readonly mirrored: number
  /** Tải/upload không thành công trong lượt này. */
  readonly failed: number
  /** Còn chờ vì hết hạn mức của lượt này; lượt cron sau làm tiếp. */
  readonly remaining: number
  /** Đã hỏng đủ `MAX_ATTEMPTS` lần — coi như mất hẳn, không thử lại nữa. */
  readonly abandoned: number
}

const EMPTY_RESULT: BackfillMediaResult = {
  mirrored: 0,
  failed: 0,
  remaining: 0,
  abandoned: 0,
}

/**
 * `limit` là số ảnh được TẢI TỪ CDN trong một lượt, không phải số hàng được
 * sửa. Bước lan URL ở trong database không bị giới hạn — nó chạy trọn vẹn mỗi
 * lượt vì chi phí gần như bằng không khi đã bắt kịp.
 *
 * Cần trần cho bước tải vì nó dùng chung ngân sách `maxDuration` với vòng đồng
 * bộ số liệu: mỗi ảnh là một lượt tải từ CDN cộng một lượt upload. Phần vượt
 * trần để lượt cron sau làm tiếp, và mỗi lượt đều kết thúc gọn thay vì bị
 * Vercel cắt giữa chừng. Cùng khuôn với `MAX_BACKFILLS_PER_RUN` của phần nạp
 * số liệu lịch sử.
 */
export const backfillMedia = async (
  admin: SupabaseClient<Database>,
  limit: number,
): Promise<BackfillMediaResult> => {
  const { data: targets, error } = await admin.rpc('backfill_media_targets')
  if (error) {
    console.error(`Không lấy được danh sách ảnh cần chép bù: ${error.message}`)
    return EMPTY_RESULT
  }
  if (!targets || targets.length === 0) return EMPTY_RESULT

  const { data: failureRows } = await admin
    .from('media_backfill_failures')
    .select('kind, external_id, attempts')

  const attemptsByKey = new Map(
    (failureRows ?? []).map((row) => [`${row.kind}:${row.external_id}`, row.attempts]),
  )

  let mirrored = 0
  let failed = 0
  let remaining = 0
  let abandoned = 0
  let budget = limit

  // Gom lại rồi ghi một lần ở cuối: một lượt hỏng hàng loạt không đáng phải trả
  // giá bằng hàng chục lượt gọi mạng riêng lẻ giữa vòng lặp.
  const failures: { kind: string; external_id: string; attempts: number }[] = []

  for (const target of targets) {
    const priorAttempts = attemptsByKey.get(`${target.kind}:${target.external_id}`) ?? 0
    if (priorAttempts >= MAX_ATTEMPTS) {
      abandoned += 1
      continue
    }
    if (budget <= 0) {
      remaining += 1
      continue
    }
    budget -= 1

    const path =
      target.kind === 'video'
        ? mediaPathForVideo(target.external_id)
        : mediaPathForPost(target.external_id)

    const stored = await mirrorImage(admin, target.source_url, path)
    // `mirrorImage` trả về NGUYÊN url gốc khi không chép được (ảnh đã chết, CDN
    // chặn, hết giờ chờ). So sánh để biết có thật sự tiến triển không, thay vì
    // đếm mù mọi lượt gọi là thành công.
    if (!stored || stored === target.source_url) {
      failures.push({
        kind: target.kind,
        external_id: target.external_id,
        attempts: priorAttempts + 1,
      })
      failed += 1
      continue
    }

    // Chỉ ghi hàng mới nhất là đủ: lượt chạy SAU của
    // `backfill_media_targets()` sẽ lan URL này ra mọi hàng cũ của cùng
    // video/bài, đúng cơ chế ở bước 1.
    const { error: updateError } =
      target.kind === 'video'
        ? await admin
            .from('video_metrics_daily')
            .update({ cover_image_url: stored })
            .eq('external_video_id', target.external_id)
        : await admin
            .from('content_metrics_daily')
            .update({ image_url: stored })
            .eq('external_post_id', target.external_id)

    if (updateError) {
      console.error(
        `Không cập nhật được URL ảnh cho ${target.kind} ${target.external_id}: ${updateError.message}`,
      )
      failed += 1
      continue
    }
    mirrored += 1
  }

  if (failures.length > 0) {
    const now = new Date().toISOString()
    const { error: failureError } = await admin
      .from('media_backfill_failures')
      .upsert(
        failures.map((failure) => ({ ...failure, last_attempt_at: now })),
        { onConflict: 'kind,external_id' },
      )
    if (failureError) {
      // Không ném: lượt đồng bộ số liệu vừa chạy xong đã thành công, và lần
      // hỏng không ghi được chỉ làm lượt sau thử lại thừa một lần.
      console.error(`Không ghi được lần chép ảnh hỏng: ${failureError.message}`)
    }
  }

  return { mirrored, failed, remaining, abandoned }
}
