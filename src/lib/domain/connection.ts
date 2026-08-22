import type { ProviderId } from './providers'

/**
 * Một kết nối OAuth tới một tài khoản trên một nền tảng.
 *
 * QUAN TRỌNG: type này KHÔNG chứa token. Access token và refresh token nằm ở
 * bảng `connection_secrets` riêng, không có RLS policy nào (mặc định deny mọi
 * client), chỉ `service_role` chạm được. Nếu một trường token xuất hiện trong
 * file này thì đó là lỗi bảo mật, không phải tiện lợi.
 */
export interface Connection {
  readonly id: string
  readonly siteId: string
  readonly provider: ProviderId
  /** ID tài khoản phía nền tảng: customer ID, property ID, ad account ID... */
  readonly externalAccountId: string
  readonly accountName: string
  readonly status: ConnectionStatus
  readonly scopes: readonly string[]
  readonly connectedByName: string
  readonly connectedAt: string
  readonly lastSyncedAt: string | null
  readonly error: ConnectionError | null
}

export type ConnectionStatus =
  /** Hoạt động bình thường, dữ liệu đang được đồng bộ. */
  | 'connected'
  /** Chưa từng kết nối. */
  | 'disconnected'
  /** Đang chạy đồng bộ. */
  | 'syncing'
  /** Refresh token hết hạn hoặc bị thu hồi — cần người dùng cấp quyền lại. */
  | 'expired'
  /** Đồng bộ thất bại vì lý do khác. */
  | 'error'

export interface ConnectionError {
  readonly code: string
  readonly message: string
  readonly occurredAt: string
  /** Người dùng có tự xử lý được không, hay phải chờ hệ thống. */
  readonly actionable: boolean
}

export const CONNECTION_STATUS_LABELS: Readonly<Record<ConnectionStatus, string>> = {
  connected: 'Đã kết nối',
  disconnected: 'Chưa kết nối',
  syncing: 'Đang đồng bộ',
  expired: 'Hết hạn cấp quyền',
  error: 'Lỗi',
}

/** Trạng thái cần người dùng ra tay ngay. */
export const needsAttention = (status: ConnectionStatus): boolean =>
  status === 'expired' || status === 'error'

/** Trạng thái có dữ liệu dùng được (kể cả khi đang sync lại). */
export const hasUsableData = (status: ConnectionStatus): boolean =>
  status === 'connected' || status === 'syncing'

export type SyncStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'partial'

export interface SyncRun {
  readonly id: string
  readonly connectionId: string
  readonly kind: 'backfill' | 'incremental' | 'manual'
  readonly status: SyncStatus
  readonly windowStart: string
  readonly windowEnd: string
  readonly rowsWritten: number
  readonly startedAt: string
  readonly finishedAt: string | null
  readonly error: string | null
}

/** Cửa sổ mà một connection vừa tạo còn được coi là "đang đồng bộ lần đầu".
 * Lượt đồng bộ đầu tiên chạy ngay trong OAuth callback và mất vài chục giây;
 * 15 phút là rộng rãi kể cả khi job nền bị xếp hàng. */
const FIRST_SYNC_GRACE_MS = 15 * 60 * 1000

/**
 * Connection có ĐANG thật sự chạy lượt đồng bộ đầu tiên không.
 *
 * KHÔNG chỉ nhìn `status === 'syncing'`: đó là giá trị lúc `insert`, và một
 * connection có thể kẹt nguyên trạng thái đó vĩnh viễn nếu lượt đồng bộ đầu
 * chết giữa chừng — production đang có đúng một hàng như vậy (gtm, kẹt từ
 * 13/8/2026). Ai dựa vào cờ đó để quyết định "còn phải chờ nữa không" sẽ chờ
 * mãi mãi: nghe Realtime không bao giờ ngắt, hoặc quay vòng polling không có
 * điểm dừng.
 *
 * Chốt chặn thật là thời gian: chưa từng đồng bộ xong VÀ mới kết nối gần đây.
 */
export const isAwaitingFirstSync = (connection: Connection, now: Date): boolean =>
  connection.lastSyncedAt === null &&
  now.getTime() - new Date(connection.connectedAt).getTime() < FIRST_SYNC_GRACE_MS
