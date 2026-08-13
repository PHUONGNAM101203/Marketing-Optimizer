import 'server-only'

import { revalidatePath } from 'next/cache'
import { detectMarket } from './market-detection'
import type { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_CURRENCY = 'VND'
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'

/**
 * Tự áp dụng đơn vị tiền/múi giờ đoán được từ nội dung site — CHỈ khi:
 *   1. Đoán được với độ tin cậy 'high' (xem `market-detection.ts`), không âm
 *      thầm áp dụng phỏng đoán yếu hơn.
 *   2. Site còn NGUYÊN giá trị mặc định lúc tạo (chưa ai chỉnh tay) — không
 *      bao giờ ghi đè lựa chọn thật của người dùng, dù mới hay cũ.
 *
 * Dùng chung ở hai nơi: `actions/audit.ts` (sau mỗi lượt quét, dữ liệu vừa
 * crawl) và `settings/page.tsx` (tự chữa cho site đã quét TRƯỚC KHI logic này
 * đạt độ tin cậy đúng — không bắt quét lại, chỉ đọc lại `page_signals` đã có
 * sẵn trong lượt quét gần nhất).
 */
export const applyDetectedMarketOnce = async (
  admin: ReturnType<typeof createAdminClient>,
  siteId: string,
  domain: string,
  pageLanguages: readonly (string | null)[],
): Promise<boolean> => {
  const market = detectMarket(domain, pageLanguages)
  if (!market || market.confidence !== 'high') return false
  if (market.currency === DEFAULT_CURRENCY && market.timezone === DEFAULT_TIMEZONE) return false

  const { data: siteRow } = await admin.from('sites').select('currency, timezone').eq('id', siteId).single()
  const stillAtDefault = siteRow?.currency === DEFAULT_CURRENCY && siteRow?.timezone === DEFAULT_TIMEZONE
  if (!stillAtDefault) return false

  await admin
    .from('sites')
    .update({ currency: market.currency, timezone: market.timezone, country: market.countryCode })
    .eq('id', siteId)
  revalidatePath(`/${siteId}`, 'layout')
  return true
}
