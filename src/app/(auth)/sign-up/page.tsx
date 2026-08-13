import Link from 'next/link'
import { AuthForm } from '@/components/auth/auth-form'
import { signUp } from '@/lib/actions/auth'

export const metadata = { title: 'Đăng ký' }

export default function SignUpPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
          Tạo tài khoản
        </h1>
        <p className="mt-2 text-[length:var(--text-base)] text-[var(--color-ink-2)]">
          Bước sau bạn sẽ nhập website muốn theo dõi.
        </p>
      </div>

      <AuthForm action={signUp} mode="sign-up" submitLabel="Tạo tài khoản" />

      <p className="mt-6 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
        Đã có tài khoản?{' '}
        <Link
          href="/sign-in"
          className="rounded-[var(--radius-xs)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Đăng nhập
        </Link>
      </p>
    </>
  )
}
