import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { mediaPathForPost, mediaPathForVideo, mirrorImage } from '@/lib/storage/media-mirror'

/**
 * Chép bù ảnh cho những hàng đã ghi TRƯỚC khi việc chép ảnh tồn tại.
 *
 * Một lượt đồng bộ thường chỉ chạm được video/bài mà API trả về trong đúng lượt
 * đó (TikTok trả ~20-36 video mỗi kênh), nên hàng cũ hơn không bao giờ tới lượt.
 * Đo lúc bắt đầu: 17 hàng đã có URL nội bộ, 980 hàng vẫn là link ngoài đang hết
 * hạn dần.
 *
 * Làm theo TỪNG VIDEO, không theo từng hàng. ~997 hàng chỉ là ~126 video duy
 * nhất — mỗi video có một hàng snapshot mỗi ngày và tất cả trỏ về CÙNG một ảnh.
 * Chép một lần rồi cập nhật MỌI hàng của video đó vừa giảm số lượt tải xuống
 * gần tám lần, vừa cứu được cả những hàng cũ mà link của chính chúng đã chết.
 *
 * Luôn lấy URL của hàng MỚI NHẤT: link TikTok có chữ ký và hết hạn theo thời
 * gian, nên bản mới nhất là bản còn cơ hội tải được. Dùng link của hàng cũ gần
 * như chắc chắn thất bại.
 */

/** PostgREST mặc định trả tối đa 1000 hàng. Lấy sát trần rồi tự khử trùng lặp
 * trong TS — Postgres có `distinct on` nhưng PostgREST không phơi ra, và thêm
 * một RPC chỉ để phục vụ việc chép bù là không đáng. */
const SCAN_ROWS = 1000

/**
 * Hỏng đủ số lần này thì thôi hẳn, không thử lại nữa.
 *
 * Phải có, không phải để tiết kiệm: ảnh chép được sẽ tự rời danh sách chờ vì
 * URL trong bảng đã đổi thành URL nội bộ, còn ảnh HỎNG thì URL giữ nguyên nên
 * lượt sau lại chọn đúng nó. Không đếm số lần hỏng thì sau một hai lượt, toàn
 * bộ hạn mức mỗi lượt bị những ảnh chết chiếm giữ vĩnh viễn và phần đuôi không
 * bao giờ tới lượt.
 *
 * Ba lần chứ không phải một: một lượt tải hỏng chưa chắc là ảnh đã chết — có
 * thể quá giờ chờ, CDN chập chờn, hoặc mạng lỗi. Cron chạy mỗi giờ nên ba lần
 * là trải qua ba giờ, đủ để loại trừ trục trặc nhất thời.
 */
const MAX_ATTEMPTS = 3

type FailureKind = 'video' | 'post'

const isMirrored = (url: string): boolean => url.includes('/storage/v1/object/public/media/')

export interface BackfillMediaResult {
  /** Số ảnh chép được trong lượt này. */
  readonly mirrored: number
  /** Tải/upload không thành công trong lượt này. */
  readonly failed: number
  /** Còn chờ vì hết hạn mức của lượt này; lượt cron sau làm tiếp. */
  readonly remaining: number
  /** Đã hỏng đủ `MAX_ATTEMPTS` lần — coi như mất hẳn, không thử lại nữa. */
  readonly abandoned: number
}

/** Gom URL mới nhất theo từng ID, bỏ những ID đã trỏ về Storage. */
const newestUrlById = (
  rows: readonly { readonly id: string; readonly url: string | null }[],
): Map<string, string> => {
  const newest = new Map<string, string>()
  for (const row of rows) {
    // Hàng đầu tiên gặp = hàng mới nhất, nhờ `order by date desc` ở nơi truy vấn.
    if (row.url && !newest.has(row.id)) newest.set(row.id, row.url)
  }
  return new Map([...newest].filter(([, url]) => !isMirrored(url)))
}

/**
 * `limit` là số ẢNH được thử trong một lượt chạy, không phải số hàng.
 *
 * Cần trần vì việc này dùng chung ngân sách `maxDuration` với vòng đồng bộ số
 * liệu: mỗi ảnh là một lượt tải từ CDN cộng một lượt upload. Phần vượt trần để
 * lượt cron sau làm tiếp — cron chạy mỗi giờ nên vài trăm ảnh xong trong một
 * buổi, và mỗi lượt đều kết thúc gọn thay vì bị Vercel cắt giữa chừng. Cùng
 * khuôn với `MAX_BACKFILLS_PER_RUN` của phần nạp số liệu lịch sử.
 */
export const backfillMedia = async (
  admin: SupabaseClient<Database>,
  limit: number,
): Promise<BackfillMediaResult> => {
  const [videoRows, postRows, failureRows] = await Promise.all([
    admin
      .from('video_metrics_daily')
      .select('external_video_id, cover_image_url')
      .not('cover_image_url', 'is', null)
      .order('date', { ascending: false })
      .limit(SCAN_ROWS),
    admin
      .from('content_metrics_daily')
      .select('external_post_id, image_url')
      .not('image_url', 'is', null)
      .order('date', { ascending: false })
      .limit(SCAN_ROWS),
    admin.from('media_backfill_failures').select('kind, external_id, attempts'),
  ])

  const attemptsByKey = new Map(
    (failureRows.data ?? []).map((row) => [`${row.kind}:${row.external_id}`, row.attempts]),
  )

  const targets = [
    {
      kind: 'video' as FailureKind,
      path: mediaPathForVideo,
      pending: newestUrlById(
        (videoRows.data ?? []).map((row) => ({
          id: row.external_video_id,
          url: row.cover_image_url,
        })),
      ),
    },
    {
      kind: 'post' as FailureKind,
      path: mediaPathForPost,
      pending: newestUrlById(
        (postRows.data ?? []).map((row) => ({
          id: row.external_post_id,
          url: row.image_url,
        })),
      ),
    },
  ]

  let mirrored = 0
  let failed = 0
  let remaining = 0
  let abandoned = 0
  let budget = limit

  // Gom lại rồi ghi một lần ở cuối: một lượt hỏng hàng loạt không đáng phải trả
  // giá bằng hàng chục lượt gọi mạng riêng lẻ giữa vòng lặp.
  const failures: { kind: FailureKind; external_id: string; attempts: number }[] = []

  for (const target of targets) {
    for (const [externalId, sourceUrl] of target.pending) {
      const priorAttempts = attemptsByKey.get(`${target.kind}:${externalId}`) ?? 0
      if (priorAttempts >= MAX_ATTEMPTS) {
        abandoned += 1
        continue
      }
      if (budget <= 0) {
        remaining += 1
        continue
      }
      budget -= 1

      const stored = await mirrorImage(admin, sourceUrl, target.path(externalId))
      // `mirrorImage` trả về NGUYÊN url gốc khi không chép được (ảnh đã chết,
      // CDN chặn, hết giờ chờ). So sánh để biết có thật sự tiến triển không,
      // thay vì đếm mù mọi lượt gọi là thành công.
      if (!stored || stored === sourceUrl) {
        failures.push({ kind: target.kind, external_id: externalId, attempts: priorAttempts + 1 })
        failed += 1
        continue
      }

      // Cập nhật MỌI hàng của video/bài này, không riêng hàng mới nhất — đây
      // đúng là chỗ những hàng cũ có link đã chết được cứu.
      const { error } =
        target.kind === 'video'
          ? await admin
              .from('video_metrics_daily')
              .update({ cover_image_url: stored })
              .eq('external_video_id', externalId)
          : await admin
              .from('content_metrics_daily')
              .update({ image_url: stored })
              .eq('external_post_id', externalId)

      if (error) {
        console.error(`Không cập nhật được URL ảnh cho ${target.kind} ${externalId}: ${error.message}`)
        failed += 1
        continue
      }
      mirrored += 1
    }
  }

  if (failures.length > 0) {
    const now = new Date().toISOString()
    const { error } = await admin
      .from('media_backfill_failures')
      .upsert(
        failures.map((failure) => ({ ...failure, last_attempt_at: now })),
        { onConflict: 'kind,external_id' },
      )
    if (error) {
      // Không ném: lượt đồng bộ số liệu vừa chạy xong đã thành công, và lần
      // hỏng không ghi được chỉ làm lượt sau thử lại thừa một lần.
      console.error(`Không ghi được lần chép ảnh hỏng: ${error.message}`)
    }
  }

  return { mirrored, failed, remaining, abandoned }
}
