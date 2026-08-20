/**
 * Tên cookie nhớ tài khoản người dùng vừa chọn cho MỘT kênh (site+provider) —
 * tách riêng khỏi `lib/actions/channel-preference.ts` vì file đó có
 * `'use server'` (buộc MỌI export phải là Server Action async) trong khi hàm
 * này là helper thuần đồng bộ, dùng chung ở CẢ nơi ghi (Server Action) lẫn
 * nơi đọc (`channels/[provider]/page.tsx`, Server Component). Đọc/ghi đều tự
 * build đúng tên qua hàm này thay vì tự parse ngược lại (siteId/provider đều
 * có thể chứa dấu `-`, ghép rồi split lại dễ lẫn lộn). Không dùng `:` — ký tự
 * đó nằm trong tập bị cấm của cookie name theo RFC 2616 (separators).
 */
export const channelConnectionCookieName = (siteId: string, provider: string): string =>
  `channel-conn_${siteId}_${provider}`
