import { Badge } from '@/components/ui/badge'
import { Wordmark } from '@/components/brand/logo'
import { ProviderMark } from '@/components/connections/provider-mark'
import { CreateSiteForm } from '@/components/onboarding/create-site-form'
import { PROVIDERS, PROVIDER_META } from '@/lib/domain/providers'
import { cn } from '@/lib/cn'

export const metadata = { title: 'Thêm website' }

/**
 * Onboarding: nhập URL → tạo Site.
 *
 * Đây là điểm vào duy nhất của cả sản phẩm. Không có gì trong hệ thống bị khoá
 * cứng vào một website cụ thể — website người dùng gõ vào ô này trở thành Site,
 * và mọi kết nối, số liệu, đề xuất, agent sau đó đều treo dưới `siteId` của nó.
 */
export default async function OnboardingPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-16">
      <Wordmark size="md" className="mb-10" />

      <div className="mb-10">
        <p className="mb-3 text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
          Bước 1 trên 2
        </p>
        <h1 className="text-[length:var(--text-display)] leading-[var(--leading-tight)] font-bold tracking-[var(--tracking-tight)] text-[var(--color-ink)]">
          Website nào?
        </h1>
        <p className="mt-3 max-w-prose text-[length:var(--text-base)] text-[var(--color-ink-2)]">
          Nhập địa chỉ website bạn muốn theo dõi. Toàn bộ số liệu, kết nối và đề xuất
          sau này sẽ gắn với nó.
        </p>
      </div>

      <CreateSiteForm />

      <section className="mt-12 border-t border-[var(--color-rule)] pt-8">
        <h2 className="mb-1 text-[length:var(--text-xl)] font-semibold text-[var(--color-ink)]">
          Bước 2 — chọn nguồn dữ liệu
        </h2>
        <p className="mb-5 max-w-prose text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Kết nối được nền tảng nào thì dùng nền tảng đó. Không bắt buộc đủ tám — mỗi
          kết nối thêm vào chỉ làm bức tranh đầy hơn.
        </p>

        <ul className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <li
              key={provider}
              className={cn(
                'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2.5',
                'border border-[var(--color-rule)] bg-[var(--color-paper)]',
              )}
            >
              <ProviderMark provider={provider} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">
                {PROVIDER_META[provider].label}
              </span>
              {provider === 'google-ads' ? (
                <Badge tone="caution">Cần developer token</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

    </div>
  )
}
