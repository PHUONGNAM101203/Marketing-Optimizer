import Link from 'next/link'
import { MailCheck } from 'lucide-react'

export const metadata = { title: 'Kiểm tra email' }

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-sm">
        <MailCheck aria-hidden className="mb-5 size-8 text-[var(--color-signal)]" />

        <h1 className="text-[length:var(--text-display-s)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
          Kiểm tra email
        </h1>

        <p className="mt-3 text-[length:var(--text-base)] text-[var(--color-ink-2)]">
          Chúng tôi vừa gửi một liên kết xác nhận. Bấm vào đó để kích hoạt tài khoản,
          rồi quay lại đăng nhập.
        </p>

        <p className="mt-2 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
          Không thấy thư? Kiểm tra hộp thư rác — thư xác nhận hay bị lọc nhầm.
        </p>

        <Link
          href="/sign-in"
          className="mt-6 inline-block rounded-[var(--radius-xs)] text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Về trang đăng nhập
        </Link>
      </div>
    </div>
  )
}
