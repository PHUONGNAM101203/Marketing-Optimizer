import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Connection, ConnectionStatus } from '@/lib/domain/connection'
import { hasUsableData } from '@/lib/domain/connection'
import { isProviderId, type ProviderId } from '@/lib/domain/providers'

/**
 * Kết nối thật của một Site.
 *
 * Đây là nguồn sự thật cho câu hỏi quan trọng nhất của toàn bộ giao diện:
 * "Site này đã có dữ liệu chưa?". Trước khi có bảng này, câu trả lời luôn là
 * "rồi" vì dữ liệu mẫu không biết phân biệt — và mọi màn hình đều nói dối.
 */

interface ConnectionRow {
  readonly id: string
  readonly site_id: string
  readonly provider: string
  readonly external_account_id: string
  readonly account_name: string
  readonly status: ConnectionStatus
  readonly scopes: string[]
  readonly connected_at: string
  readonly last_synced_at: string | null
  readonly error_code: string | null
  readonly error_message: string | null
  readonly error_at: string | null
}

const toConnection = (row: ConnectionRow): Connection | null => {
  if (!isProviderId(row.provider)) return null

  return {
    id: row.id,
    siteId: row.site_id,
    provider: row.provider,
    externalAccountId: row.external_account_id,
    accountName: row.account_name,
    status: row.status,
    scopes: row.scopes,
    connectedByName: '',
    connectedAt: row.connected_at,
    lastSyncedAt: row.last_synced_at,
    error:
      row.error_code && row.error_message
        ? {
            code: row.error_code,
            message: row.error_message,
            occurredAt: row.error_at ?? row.connected_at,
            actionable: true,
          }
        : null,
  }
}

export const listConnections = async (
  siteId: string,
): Promise<readonly Connection[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('connections')
    .select('*')
    .eq('site_id', siteId)
    .order('connected_at', { ascending: true })

  if (error) throw new Error(`Không đọc được kết nối: ${error.message}`)

  return ((data ?? []) as ConnectionRow[])
    .map(toConnection)
    .filter((connection): connection is Connection => connection !== null)
}

export interface ConnectionSummary {
  readonly all: readonly Connection[]
  readonly byProvider: ReadonlyMap<ProviderId, Connection>
  /** Có ít nhất một kết nối đang cho dữ liệu dùng được. */
  readonly hasData: boolean
  /** Chưa từng kết nối gì — Site vừa tạo xong. */
  readonly isEmpty: boolean
  readonly needsAttentionCount: number
  readonly lastSyncedAt: string | null
}

export const getConnectionSummary = async (
  siteId: string,
): Promise<ConnectionSummary> => {
  const all = await listConnections(siteId)

  const timestamps = all
    .map((connection) => connection.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort()

  return {
    all,
    byProvider: new Map(all.map((connection) => [connection.provider, connection])),
    hasData: all.some((connection) => hasUsableData(connection.status)),
    isEmpty: all.length === 0,
    needsAttentionCount: all.filter(
      (connection) => connection.status === 'expired' || connection.status === 'error',
    ).length,
    lastSyncedAt: timestamps.at(-1) ?? null,
  }
}
