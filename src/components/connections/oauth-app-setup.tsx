'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Settings2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { saveSiteOAuthApp, type SaveOAuthAppState } from '@/lib/actions/oauth-apps'
import type { ProviderFamily } from '@/lib/domain/providers'

/* Hallmark · component: oauth-app-setup · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Mỗi Site tự khai báo OAuth app riêng — người nhập không chỉ là kỹ thuật
 * viên, nên hướng dẫn nằm NGAY TRONG dialog thay vì trỏ ra tài liệu ngoài.
 * Client Secret không bao giờ hiển thị lại sau khi lưu — form luôn trống,
 * trigger chỉ đổi nhãn để báo đã cấu hình hay chưa.
 */

const GUIDE_STEPS: Readonly<Record<ProviderFamily, readonly string[]>> = {
  google: [
    'Vào console.cloud.google.com, tạo một project mới (hoặc dùng lại project cũ nếu đã có).',
    'Vào APIs & Services → Library, tìm và bật TỪNG API sau: "Google Analytics Admin API", "Google Analytics Data API", "Search Console API", "Tag Manager API", "YouTube Data API v3", "YouTube Analytics API". Nếu có dùng Google Ads/Merchant Center thì bật thêm 2 cái ở dưới.',
    '(Chỉ cần nếu dùng Google Ads) Bật "Google Ads API".',
    '(Chỉ cần nếu dùng Merchant Center) Bật đúng "Content API for Shopping" — LƯU Ý: Google có một API mới tên "Merchant API" khác hẳn, app này gọi API CŨ (Content API for Shopping), bật nhầm cái mới sẽ không hoạt động được.',
    'Vào APIs & Services → OAuth consent screen — chọn "External", điền tên app.',
    'Ở mục Scopes, bấm "Add or remove scopes" và thêm ĐỦ các scope sau (kể cả khi chưa dùng ngay — thiếu một cái là màn hình cấp quyền sẽ báo lỗi khi bấm vào ô tương ứng sau này): analytics.readonly, webmasters.readonly, tagmanager.readonly, youtube.readonly, yt-analytics.readonly. Có dùng Ads thì thêm adwords; có dùng Merchant Center thì thêm content.',
    'Ở mục "Test users" (khi app còn ở chế độ Testing), thêm chính email Google bạn dùng để quản lý website — thiếu bước này Google sẽ chặn ngay ở màn hình đăng nhập với lỗi "app chưa xác minh".',
    'Vào APIs & Services → Credentials → Create Credentials → OAuth client ID, chọn "Web application".',
    'Ở mục "Authorized redirect URIs", dán đúng địa chỉ bên dưới, rồi bấm Create.',
    'Google hiện ra Client ID và Client secret — dán vào form bên dưới.',
  ],
  youtube: [
    'Family này TÁCH RIÊNG khỏi "Google" ở trên — dành cho trường hợp kênh YouTube do một tài khoản Google KHÁC quản lý, không phải tài khoản quản lý Analytics/Search Console.',
    'Có thể dùng LẠI đúng Client ID/Secret đã tạo cho family Google phía trên — về kỹ thuật đó chỉ là danh tính ứng dụng, không gắn với một tài khoản Google cụ thể nào. Muốn tách quota/nhật ký riêng thì tạo một OAuth Client mới ở console.cloud.google.com — cả hai cách đều hoạt động.',
    'Nếu tạo app mới: vào APIs & Services → Library, bật "YouTube Data API v3" và "YouTube Analytics API".',
    'Vào APIs & Services → OAuth consent screen → Scopes, thêm youtube.readonly và yt-analytics.readonly nếu chưa có.',
    'QUAN TRỌNG nếu app còn ở chế độ Testing: vào mục "Test users", thêm ĐÚNG email của tài khoản Google quản lý kênh YouTube (khác tài khoản GA4 ở trên) — thiếu bước này Google chặn ngay ở màn hình đăng nhập.',
    'Vào APIs & Services → Credentials → Create Credentials → OAuth client ID (bỏ qua nếu dùng lại Client ID/Secret cũ) — Authorized redirect URIs dán đúng địa chỉ bên dưới.',
    'Dán Client ID/Secret vào form bên dưới, rồi bấm "Đăng nhập YouTube" và chọn đúng tài khoản Google quản lý kênh — nếu trình duyệt đang đăng nhập sẵn tài khoản GA4, chọn "Sử dụng tài khoản khác" ở màn hình Google.',
  ],
  meta: [
    'Vào developers.facebook.com/apps, bấm "Create App" → chọn loại "Business".',
    'Trong App Dashboard, bấm "Add Product" → thêm "Marketing API" (cho Facebook Ads). Với Instagram, Meta đã gộp vào sản phẩm "Instagram" (không còn "Instagram Graph API" riêng) — chọn luồng "Instagram API with Facebook Login for Business" (đọc dữ liệu tài khoản Instagram Business/Creator đã liên kết với Trang Facebook, qua Business Manager). Tài khoản Instagram phải là Business hoặc Creator và đã liên kết với một Trang Facebook — chuyển đổi và liên kết Trang trước nếu chưa.',
    'Số liệu riêng của Trang Facebook (lượt hiển thị/tương tác Page, KHÁC Facebook Ads) cần quyền "read_insights" — thêm quyền này ở đúng Use Case đang có "pages_show_list"/"pages_read_engagement" (mục "Quyền và tính năng" trên App Dashboard), Standard Access là đủ khi App còn ở Development Mode. Nếu App đã kết nối trước khi thêm quyền này, phải NGẮT KẾT NỐI rồi kết nối lại Facebook — token cũ không tự có thêm quyền mới.',
    'Vào Business Settings (business.facebook.com/settings) → xác nhận App đã được gắn với đúng Business Manager quản lý tài khoản quảng cáo/trang/Instagram của bạn — Marketing API chỉ đọc được tài khoản thuộc cùng Business đó.',
    'Vào App Settings → Basic để lấy App ID và App Secret — App Secret chỉ hiện khi bấm "Show" và nhập lại mật khẩu Facebook.',
    'Meta hiện ưu tiên sản phẩm "Facebook Login for Business" (thay cho "Facebook Login" cũ) cho App loại Business. Thêm sản phẩm này nếu chưa có → mục Configurations → tạo/chỉnh một Configuration → dán địa chỉ redirect URI bên dưới vào đó. Nếu App của bạn vẫn hiện sản phẩm "Facebook Login" cổ điển, dùng Settings → "Valid OAuth Redirect URIs" như trước.',
    'App mới tạo mặc định ở chế độ "Development" — chỉ tài khoản có vai trò Admin/Developer/Tester trong App mới đăng nhập được. Muốn người khác dùng được phải nộp App Review xin quyền ads_read (Marketing API) và instagram_basic + instagram_manage_insights (Instagram — xác nhận với App thật 8/2026: đây là luồng "API setup with Facebook Login", KHÁC luồng "API setup with Instagram Login" dùng instagram_business_basic; hai luồng có tên quyền tương tự nhưng không dùng chung được) (Meta duyệt thủ công, thường vài ngày đến vài tuần) rồi bật "Live" — nếu chỉ dùng cho tài khoản của chính bạn (kể cả đọc nội dung Page ở bước trên) thì bỏ qua bước này, Development mode là đủ.',
    'Nộp App Review cần khai Privacy Policy URL ở App Settings → Basic — dùng đúng https://marketing-optimizer-zeta.vercel.app/privacy (đã có sẵn trong app này).',
  ],
  tiktok: [
    'Vào developers.tiktok.com, đăng nhập bằng CHÍNH tài khoản TikTok của bạn (không phải tài khoản TikTok for Business) → "Manage apps" → "Connect an app" để tạo app mới. Đây là sản phẩm hoàn toàn khác business-api.tiktok.com cũ — không dùng lại được App ID/Secret đã có ở đó.',
    'Trong app vừa tạo, vào "Add products" → thêm cả "Login Kit" và "Display API".',
    'Vào mục Credentials của app để lấy Client Key và Client Secret.',
    'Vào cấu hình sản phẩm "Login Kit" → chọn nền tảng "Web" → mục Redirect URI, dán đúng địa chỉ bên dưới.',
    'Vào mục Scopes, bật "user.info.basic" (tự cấp sẵn, không cần duyệt), "user.info.stats" (follower/lượt thích/số video), và "video.list" (danh sách video) — hai cái sau cần App Review mới chạy được ngoài Sandbox.',
    'App mới tạo ở chế độ Sandbox — test được ngay với tối đa 10 tài khoản TikTok tự khai trong mục Sandbox, không cần duyệt. Muốn dùng với tài khoản TikTok bất kỳ phải nộp App Review (mô tả use case, có thể cần video demo) rồi bật "Live".',
    'Vào mục "URL properties" của app, khai đủ Privacy Policy URL và Terms of Service URL hợp lệ — thiếu một trong hai TikTok từ chối App Review ngay từ vòng đầu. Dùng đúng https://marketing-optimizer-zeta.vercel.app/privacy và https://marketing-optimizer-zeta.vercel.app/terms (đã có sẵn trong app này).',
  ],
}

const FAMILY_LABELS: Readonly<Record<ProviderFamily, string>> = {
  google: 'Google',
  youtube: 'YouTube',
  meta: 'Meta',
  tiktok: 'TikTok',
}

const CONSOLE_LINKS: Readonly<Record<ProviderFamily, string>> = {
  google: 'https://console.cloud.google.com/apis/credentials',
  youtube: 'https://console.cloud.google.com/apis/credentials',
  meta: 'https://developers.facebook.com/apps',
  tiktok: 'https://developers.tiktok.com/apps',
}

export interface OAuthAppSetupProps {
  readonly siteId: string
  readonly family: ProviderFamily
  readonly redirectUri: string
  readonly isConfigured: boolean
  /** Client ID đã lưu trước đó — không phải bí mật, nhớ lại được để khỏi gõ
   * lại. `null` khi chưa từng cấu hình. */
  readonly existingClientId: string | null
}

export function OAuthAppSetup({
  siteId,
  family,
  redirectUri,
  isConfigured,
  existingClientId,
}: OAuthAppSetupProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<SaveOAuthAppState, FormData>(
    saveSiteOAuthApp,
    { error: null, success: false },
  )

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => setOpen(false), 1200)
      return () => clearTimeout(timeout)
    }
  }, [state.success])

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isConfigured ? 'secondary' : 'primary'} size="md" className="w-full">
          <Settings2 aria-hidden className="size-4" />
          {isConfigured ? 'Cập nhật OAuth app' : 'Thiết lập kết nối'}
        </Button>
      </DialogTrigger>

      <DialogContent
        title={`Thiết lập OAuth app cho ${FAMILY_LABELS[family]}`}
        description="Mỗi website tự khai báo một OAuth app riêng — bạn tạo một lần trên trang nhà phát triển của họ, dán hai giá trị vào đây."
      >
        <ol className="mb-5 flex flex-col gap-2.5">
          {GUIDE_STEPS[family].map((step, index) => (
            <li key={step} className="flex gap-2.5 text-[length:var(--text-sm)]">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-3)] text-[length:var(--text-2xs)] font-semibold text-[var(--color-ink-2)]"
              >
                {index + 1}
              </span>
              <span className="text-[var(--color-ink-2)]">{step}</span>
            </li>
          ))}
        </ol>

        <a
          href={CONSOLE_LINKS[family]}
          target="_blank"
          rel="noreferrer noopener"
          className="mb-4 inline-flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Mở trang nhà phát triển {FAMILY_LABELS[family]}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>

        <RedirectUriField value={redirectUri} />

        <form action={formAction} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="family" value={family} />

          <FormField label="Client ID" htmlFor={`${family}-client-id`}>
            <input
              id={`${family}-client-id`}
              name="clientId"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              defaultValue={existingClientId ?? ''}
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Client Secret"
            htmlFor={`${family}-client-secret`}
            hint={
              isConfigured
                ? 'Đã lưu trước đó — để trống nếu không đổi. Không hiện lại được vì lý do bảo mật.'
                : undefined
            }
          >
            <input
              id={`${family}-client-secret`}
              name="clientSecret"
              type="password"
              required={!isConfigured}
              autoComplete="off"
              placeholder={isConfigured ? '••••••••••••' : undefined}
              className={inputClass}
            />
          </FormField>

          {family === 'google' ? (
            <FormField
              label="Developer Token (Google Ads) — tuỳ chọn"
              htmlFor={`${family}-developer-token`}
              hint="Chỉ cần nếu muốn kết nối Google Ads. Xin ở Google Ads → Tools → API Center, Google duyệt thủ công riêng, không liên quan Client ID/Secret ở trên."
            >
              <input
                id={`${family}-developer-token`}
                name="developerToken"
                type="password"
                autoComplete="off"
                placeholder={isConfigured ? 'Để trống nếu không đổi' : undefined}
                className={inputClass}
              />
            </FormField>
          ) : null}

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]"
              />
              {state.error}
            </p>
          ) : null}

          {state.success ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã lưu. Giờ bạn có thể bấm &quot;Kết nối tài khoản {FAMILY_LABELS[family]}&quot;.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="md"
            state={pending ? 'loading' : 'idle'}
            loadingLabel="Đang lưu…"
            className="w-full"
          >
            Lưu cấu hình
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

function RedirectUriField({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-ink)]">
        Redirect URI — dán đúng nguyên văn
      </p>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] py-2 pr-2 pl-3.5">
        <code className="min-w-0 flex-1 truncate text-[length:var(--text-sm)] text-[var(--color-ink)]">
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Sao chép Redirect URI"
          onClick={() => {
            void navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? (
            <Check aria-hidden className="size-4 text-[var(--color-positive)]" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
