import Link from 'next/link'
import { AuthForm } from '@/components/auth/auth-form'
import { signIn } from '@/lib/actions/auth'

export const metadata = { title: 'Đăng nhập' }

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly next?: string }>
}) {
  const { next } = await searchParams

  return (
    <>
      <div className="mb-8">
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
          Đăng nhập
        </h1>
        <p className="mt-2 text-[length:var(--text-base)] text-[var(--color-ink-2)]">
          Vào trung tâm điều hành marketing của bạn.
        </p>
      </div>

      <AuthForm action={signIn} mode="sign-in" next={next} submitLabel="Đăng nhập" />

      <p className="mt-6 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
        Chưa có tài khoản?{' '}
        <Link
          href="/sign-up"
          className="rounded-[var(--radius-xs)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Đăng ký
        </Link>
      </p>
    </>
  )
}
