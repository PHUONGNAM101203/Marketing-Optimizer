import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * `created_by`/`ran_by`/`decided_by` lưu uuid (FK `auth.users`), nhưng domain
 * type (`PromptVersion.createdBy`, `PromptRun.ranBy`, `PendingAction.decidedBy`)
 * là chuỗi tên hiển thị — UI hiện tên, không hiện uuid. Một lượt truy vấn
 * `profiles` cho MỌI id cần tới trong một lần gọi, không N+1 theo từng hàng.
 */
export const resolveDisplayNames = async (
  supabase: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<ReadonlyMap<string, string>> => {
  const uniqueIds = [...new Set(userIds)]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', uniqueIds)

  return new Map((data ?? []).map((row) => [row.id, row.full_name ?? 'Chưa đặt tên']))
}
