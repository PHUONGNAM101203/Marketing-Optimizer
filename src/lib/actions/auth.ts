'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Server action cho đăng nhập / đăng ký.
 *
 * Mọi input đi qua Zod trước khi chạm tới Supabase. Server action là một
 * endpoint HTTP công khai — người ta gọi thẳng vào nó được, không cần đi qua
 * form của ta, nên "form đã kiểm tra rồi" không phải là một sự bảo đảm.
 */

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự'),
})

const signUpSchema = credentialsSchema.extend({
  fullName: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập họ tên')
    .max(120, 'Họ tên quá dài'),
})

export interface AuthState {
  readonly error: string | null
}

const firstIssue = (error: z.ZodError): string =>
  error.issues[0]?.message ?? 'Dữ liệu không hợp lệ'

/** Đường dẫn nội bộ an toàn — chặn open redirect qua tham số `next`. */
const safeNext = (value: FormDataEntryValue | null): string => {
  const raw = typeof value === 'string' ? value : ''
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

export async function signIn(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Cố tình KHÔNG phân biệt "sai mật khẩu" với "email không tồn tại".
    // Phân biệt hai trường hợp này biến trang đăng nhập thành công cụ dò xem
    // ai đã đăng ký tài khoản.
    return { error: 'Email hoặc mật khẩu không đúng.' }
  }

  revalidatePath('/', 'layout')

  const next = safeNext(formData.get('next'))
  if (next !== '/') redirect(next)

  // Tự quyết đích đến ở đây thay vì đẩy về `/` rồi để trang gốc chuyển tiếp
  // lần nữa: chuyển hướng hai chặng làm thanh địa chỉ kẹt ở `/` trong khi nội
  // dung đã là trang khác, và bấm tải lại thì nhảy tiếp một lần nữa.
  const { data: sites } = await supabase
    .from('sites')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)

  redirect(sites?.[0] ? `/${sites[0].id}/overview` : '/onboarding')
}

export async function signUp(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  })

  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const origin = (await headers()).get('origin') ?? ''

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Trigger `handle_new_user` đọc chỗ này để điền vào bảng profiles.
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Không tạo được tài khoản. Email có thể đã được dùng.' }
  }

  revalidatePath('/', 'layout')
  redirect('/auth/check-email')
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/sign-in')
}
