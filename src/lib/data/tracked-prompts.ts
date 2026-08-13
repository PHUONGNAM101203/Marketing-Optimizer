import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { AiEngine, PromptIntent, TrackedPrompt } from '@/lib/domain/geo'

interface TrackedPromptRow {
  readonly id: string
  readonly site_id: string
  readonly text: string
  readonly intent: string
  readonly engines: readonly string[]
  readonly cadence: string
  readonly enabled: boolean
  readonly created_at: string
}

const toTrackedPrompt = (row: TrackedPromptRow): TrackedPrompt => ({
  id: row.id,
  siteId: row.site_id,
  text: row.text,
  intent: row.intent as PromptIntent,
  engines: row.engines as readonly AiEngine[],
  cadence: row.cadence as 'daily' | 'weekly',
  enabled: row.enabled,
  createdAt: row.created_at,
})

export const listTrackedPrompts = async (siteId: string): Promise<readonly TrackedPrompt[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tracked_prompts')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Không đọc được câu hỏi theo dõi: ${error.message}`)
  return (data ?? []).map((row) => toTrackedPrompt(row as TrackedPromptRow))
}
