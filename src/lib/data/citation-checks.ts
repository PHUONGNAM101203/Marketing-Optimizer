import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AiEngine, CitationCheck, CitationSentiment } from '@/lib/domain/geo'

interface CitationCheckRow {
  readonly id: string
  readonly prompt_id: string
  readonly engine: string
  readonly checked_at: string
  readonly date: string
  readonly cited: boolean
  readonly position: number | null
  readonly sentiment: string | null
  readonly excerpt: string | null
  readonly cited_url: string | null
  readonly competitors_cited: readonly string[]
}

const toCitationCheck = (row: CitationCheckRow): CitationCheck => ({
  id: row.id,
  promptId: row.prompt_id,
  engine: row.engine as AiEngine,
  checkedAt: row.checked_at,
  date: row.date,
  cited: row.cited,
  position: row.position,
  sentiment: row.sentiment as CitationSentiment | null,
  excerpt: row.excerpt,
  citedUrl: row.cited_url,
  competitorsCited: row.competitors_cited,
})

/** Lượt kiểm tra GẦN NHẤT cho mỗi prompt trong danh sách — Map để nơi gọi
 * (`TrackedPromptCard`, mỗi thẻ một prompt) tra cứu O(1), không phải lọc
 * mảng phẳng theo `promptId` mỗi lần render. Prompt chưa từng kiểm tra không
 * có entry trong Map — nơi gọi tự phân biệt "chưa kiểm tra" với "có kiểm
 * tra" qua `.has()`, không suy từ giá trị `undefined`. */
export const getLatestCitationCheckByPrompt = async (
  promptIds: readonly string[],
): Promise<ReadonlyMap<string, CitationCheck>> => {
  if (promptIds.length === 0) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('citation_checks')
    .select('*')
    .in('prompt_id', promptIds)
    .order('checked_at', { ascending: false })

  if (error) throw new Error(`Không đọc được lượt kiểm tra trích dẫn: ${error.message}`)

  const latestByPrompt = new Map<string, CitationCheck>()
  for (const row of (data ?? []) as readonly CitationCheckRow[]) {
    // Đã ORDER BY checked_at desc — entry ĐẦU TIÊN gặp cho mỗi prompt_id
    // chính là lượt mới nhất, không cần so sánh ngày lại lần nữa.
    if (!latestByPrompt.has(row.prompt_id)) latestByPrompt.set(row.prompt_id, toCitationCheck(row))
  }
  return latestByPrompt
}

/** Tổng số lượt kiểm tra ĐÃ CHẠY của toàn site — cho ô thống kê "Lượt kiểm
 * tra trích dẫn" ở trang chính, cần đếm qua MỌI prompt của site chứ không
 * chỉ site đang xem một trang chi tiết, nên join ngược qua `tracked_prompts`
 * thay vì nhận danh sách `promptIds` như hàm trên (nơi gọi ở đây không có
 * sẵn danh sách đó trước khi cần con số này). */
export const countCitationChecks = async (siteId: string): Promise<number> => {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('citation_checks')
    .select('id, tracked_prompts!inner(site_id)', { count: 'exact', head: true })
    .eq('tracked_prompts.site_id', siteId)

  if (error) throw new Error(`Không đếm được lượt kiểm tra trích dẫn: ${error.message}`)
  return count ?? 0
}
