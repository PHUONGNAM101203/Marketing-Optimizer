import 'server-only'

import { headers } from 'next/headers'

/**
 * Origin của chính app này, dùng để hiện Redirect URI cho người dùng dán vào
 * Google Cloud Console / Meta for Developers. Route Handler có sẵn
 * `request.nextUrl.origin`; Server Component thì không có `NextRequest`, nên
 * cần đọc từ header — `x-forwarded-*` là header Vercel/proxy đặt, `host` là
 * fallback lúc chạy local.
 */
export const getAppOrigin = async (): Promise<string> => {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
