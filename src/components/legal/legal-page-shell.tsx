import type { ReactNode } from 'react'
import Link from 'next/link'
import { Wordmark } from '@/components/brand/logo'

/**
 * Khung dùng chung cho 2 trang công khai, KHÔNG cần đăng nhập (Chính sách
 * quyền riêng tư, Điều khoản dịch vụ) — Facebook/TikTok App Review và người
 * dùng thật đều phải đọc được mà không cần tài khoản, nên cố tình đặt ngoài
 * `(app)`, không dùng layout có sidebar/topbar.
 */
export function LegalPageShell({
  title,
  updatedAt,
  copyrightYear,
  otherPageHref,
  otherPageLabel,
  children,
}: {
  readonly title: string
  readonly updatedAt: string
  readonly copyrightYear: number
  readonly otherPageHref: string
  readonly otherPageLabel: string
  readonly children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-[var(--color-paper-2)]">
      <header className="border-b border-[var(--color-rule)] bg-[var(--color-paper)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="rounded-[var(--radius-sm)]">
            <Wordmark size="sm" />
          </Link>
          <Link
            href={otherPageHref}
            className="text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
          >
            {otherPageLabel}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="text-[length:var(--text-3xl)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
          {title}
        </h1>
        <p className="mt-2 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
          Cập nhật lần cuối: {updatedAt}
        </p>

        <div className="mt-8 flex flex-col gap-6 text-[length:var(--text-base)] leading-[var(--leading-normal)] text-[var(--color-ink-2)]">
          {children}
        </div>
      </main>

      <footer className="border-t border-[var(--color-rule)] px-5 py-8">
        <p className="mx-auto max-w-3xl text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
          © {copyrightYear} Confluence — Phuong Nam. Liên hệ:{' '}
          <a href="mailto:pnamhuynhle@gmail.com" className="text-[var(--color-signal)] hover:underline">
            pnamhuynhle@gmail.com
          </a>
        </p>
      </footer>
    </div>
  )
}

/** Khối một mục — tiêu đề + nội dung, dùng lặp lại xuyên suốt cả 2 trang. */
export function LegalSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function LegalList({ items }: { readonly items: readonly ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index} className="list-disc marker:text-[var(--color-ink-3)]">
          {item}
        </li>
      ))}
    </ul>
  )
}
