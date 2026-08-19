import Link from 'next/link'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { PageShell } from '@/components/layout/page-header'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SiteFavicon } from '@/components/brand/site-favicon'
import { acceptInvite, previewInvite } from '@/lib/actions/site-invite'

export const metadata = { title: 'Lời mời tham gia' }

const ROLE_LABELS: Readonly<Record<string, string>> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị',
  viewer: 'Chỉ xem',
}

/**
 * Trang xác nhận trước khi tham gia — `proxy.ts` đã ép người chưa đăng nhập
 * qua `/sign-in?next=/invite/[token]` trước khi tới được đây, nên
 * `previewInvite` luôn chạy với phiên đã có. Tách READ (preview) khỏi WRITE
 * (accept) để một cú bấm link tình cờ không tự động thêm ai vào site —
 * người dùng phải tự bấm "Tham gia".
 */
export default async function InvitePage({
  params,
}: {
  readonly params: Promise<{ readonly token: string }>
}) {
  const { token } = await params
  const result = await previewInvite(token)

  if ('error' in result) {
    return (
      <PageShell>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
          <TriangleAlert aria-hidden className="size-10 text-[var(--color-negative)]" />
          <h1 className="text-[length:var(--text-xl)] font-semibold text-[var(--color-ink)]">
            Không mở được lời mời
          </h1>
          <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">{result.error}</p>
          <Button asChild variant="secondary" size="md">
            <Link href="/">Về trang chủ</Link>
          </Button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
        <SiteFavicon domain={result.siteDomain} className="size-12" />
        <div>
          <h1 className="text-[length:var(--text-xl)] font-semibold text-[var(--color-ink)]">
            Bạn được mời vào {result.siteName}
          </h1>
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            Với vai trò <strong className="text-[var(--color-ink)]">{ROLE_LABELS[result.role]}</strong>
          </p>
        </div>

        {result.alreadyMember ? (
          <Card className="w-full p-5">
            <CardBody className="flex flex-col items-center gap-3 p-0">
              <CheckCircle2 aria-hidden className="size-8 text-[var(--color-positive)]" />
              <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                Bạn đã là thành viên của site này rồi.
              </p>
              <Button asChild variant="primary" size="md">
                <Link href={`/${result.siteId}/overview`}>Vào site</Link>
              </Button>
            </CardBody>
          </Card>
        ) : (
          <form action={acceptInvite.bind(null, token)}>
            <Button type="submit" variant="primary" size="lg">
              Tham gia {result.siteName}
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  )
}
