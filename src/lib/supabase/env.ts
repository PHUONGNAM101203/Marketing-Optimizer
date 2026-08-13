import { z } from 'zod'

/**
 * Biến môi trường, validate ngay lúc đọc.
 *
 * Đọc `process.env.X!` rồi dùng thẳng là cách hỏng tệ nhất: khi biến thiếu,
 * app không đổ ở lúc khởi động mà đổ ở đâu đó giữa một request, với thông báo
 * kiểu "Invalid URL" chẳng chỉ về đâu cả. Validate ở đây cho lỗi nói đúng
 * biến nào thiếu.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL phải là URL hợp lệ'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY trông không giống một khoá hợp lệ'),
})

/**
 * Khoá server-only. KHÔNG có tiền tố NEXT_PUBLIC_ — đó chính là thứ ngăn
 * Next.js nhét nó vào bundle gửi xuống trình duyệt. `service_role` bỏ qua toàn
 * bộ RLS; lộ ra client là mất sạch dữ liệu của mọi người dùng.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'SUPABASE_SERVICE_ROLE_KEY trông không giống một khoá hợp lệ'),
})

export const publicEnv = () => {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })

  if (!parsed.success) {
    throw new Error(
      `Thiếu cấu hình Supabase trong .env.local:\n${parsed.error.issues
        .map((issue) => `  · ${issue.message}`)
        .join('\n')}`,
    )
  }

  return parsed.data
}

export const serverEnv = () => {
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  if (!parsed.success) {
    throw new Error(
      `Thiếu cấu hình server trong .env.local:\n${parsed.error.issues
        .map((issue) => `  · ${issue.message}`)
        .join('\n')}`,
    )
  }

  return parsed.data
}

/**
 * Khoá mã hoá token OAuth ở tầng ứng dụng — xem `lib/crypto.ts`. Phải là
 * base64 của đúng 32 byte (khoá AES-256). Client ID/Secret của từng nhà cung
 * cấp KHÔNG nằm ở đây — mỗi Site tự khai báo OAuth app riêng của họ, lưu mã
 * hoá trong bảng `site_oauth_apps` (xem `lib/data/site-oauth-apps.ts`).
 */
const cryptoSchema = z.object({
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => {
      try {
        return Buffer.from(value, 'base64').length === 32
      } catch {
        return false
      }
    }, 'TOKEN_ENCRYPTION_KEY phải giải mã base64 ra đúng 32 byte'),
})

export const cryptoEnv = () => {
  const parsed = cryptoSchema.safeParse({
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  })

  if (!parsed.success) {
    throw new Error(
      `Chưa cấu hình khoá mã hoá trong .env.local:\n${parsed.error.issues
        .map((issue) => `  · ${issue.message}`)
        .join('\n')}`,
    )
  }

  return parsed.data
}

/**
 * Bí mật cho route cron `/api/cron/sync-all`. Vercel tự gửi kèm giá trị này
 * trong header Authorization cho request phát sinh từ lịch cron thật — so
 * khớp để chặn ai đó gọi thẳng route từ bên ngoài.
 */
const cronSchema = z.object({
  CRON_SECRET: z.string().min(16, 'CRON_SECRET nên dài ít nhất 16 ký tự'),
})

export const cronEnv = () => {
  const parsed = cronSchema.safeParse({ CRON_SECRET: process.env.CRON_SECRET })

  if (!parsed.success) {
    throw new Error(
      `Chưa cấu hình CRON_SECRET trong .env.local:\n${parsed.error.issues
        .map((issue) => `  · ${issue.message}`)
        .join('\n')}`,
    )
  }

  return parsed.data
}
