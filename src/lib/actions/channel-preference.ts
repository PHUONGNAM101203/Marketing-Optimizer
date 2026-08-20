'use server'

import { cookies } from 'next/headers'
import { channelConnectionCookieName } from '@/lib/domain/channel-connection-cookie'

const REMEMBER_CONNECTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/**
 * Ghi nhớ lựa chọn kênh — áp dụng cho MỌI nơi có `ChannelSwitcher` (site nào
 * có ≥2 connection cùng provider). Cookie, không phải `localStorage`
 * (khác `lib/theme.ts`/`lib/sidebar.ts`, hai preference client-only còn lại
 * của app): trang chi tiết kênh là Server Component, cần biết lựa chọn NGAY
 * LƯỢT RENDER ĐẦU TIÊN để chọn đúng connection mặc định — `localStorage` vô
 * hình với server, chỉ dùng được cho preference áp lên `<html>` phía client.
 * `sameSite: 'lax'` + không `httpOnly` — đây chỉ là preference hiển thị,
 * không phải dữ liệu nhạy cảm, không cần chặn đọc phía client.
 */
export async function rememberChannelConnection(
  siteId: string,
  provider: string,
  connectionId: string,
): Promise<void> {
  const store = await cookies()
  store.set(channelConnectionCookieName(siteId, provider), connectionId, {
    maxAge: REMEMBER_CONNECTION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
  })
}
