import { Check, Clock, Gauge, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProviderMark } from '@/components/connections/provider-mark'
import { OAuthAppSetup } from '@/components/connections/oauth-app-setup'
import { AdsDeveloperTokenGuide } from '@/components/connections/ads-developer-token-guide'
import { OAUTH_ADAPTERS } from '@/lib/providers'
import {
  PROVIDER_FAMILIES,
  PROVIDER_META,
  type ProviderFamily,
  type ProviderId,
} from '@/lib/domain/providers'
import type { Connection } from '@/lib/domain/connection'

/** Gia đình nào đã có adapter thật — đọc thẳng registry, không lặp lại danh
 * sách ở đây, để không có chỗ nào quên cập nhật khi thêm adapter mới. */
const ADAPTER_READY_FAMILIES: ReadonlySet<ProviderFamily> = new Set(
  Object.keys(OAUTH_ADAPTERS) as ProviderFamily[],
)

/**
 * Bảng chọn nguồn dữ liệu, gom theo NHÀ CUNG CẤP.
 *
 * OAuth cấp quyền theo tài khoản chứ không theo sản phẩm: một lần đăng nhập
 * Google là lấy được cả Analytics, Search Console, Tag Manager, YouTube và Ads.
 * Bày tám nút riêng khiến người dùng tưởng phải làm tám lần một việc — và sai
 * cả về mặt kỹ thuật.
 */
export interface ConnectPanelProps {
  readonly siteId: string
  readonly connected: ReadonlyMap<ProviderId, Connection>
  /** Gia đình nào Site này ĐÃ khai báo OAuth app riêng, kèm Client ID đã lưu
   * (không phải Secret) — xem `site_oauth_apps`. */
  readonly configuredFamilies: ReadonlyMap<ProviderFamily, string>
  /** Origin của chính app này, để tính Redirect URI hiện trong dialog thiết lập. */
  readonly appOrigin: string
  /** Đã nhập Developer Token cho Google Ads chưa — quyết định hiện badge gì
   * ở dòng Google Ads bên dưới (xem `PROVIDER_FAMILIES[0].gatedProviders`). */
  readonly hasGoogleAdsDeveloperToken: boolean
  /** PageSpeed Insights có key hoạt động không — KHÔNG phải cấu hình theo
   * từng Site (PSI không đọc dữ liệu riêng của ai, chỉ quét URL công khai),
   * mà là một biến môi trường (`PAGESPEED_API_KEY`) đặt chung cho toàn hệ
   * thống. Hiện thành một dòng trạng thái độc lập thay vì nhét vào danh sách
   * sản phẩm phía trên vì nó không phải connection/entity của riêng Site này. */
  readonly hasPageSpeedApiKey: boolean
}

export function ConnectPanel({
  siteId,
  connected,
  configuredFamilies,
  appOrigin,
  hasGoogleAdsDeveloperToken,
  hasPageSpeedApiKey,
}: ConnectPanelProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[length:var(--text-2xs)] font-medium tracking-[var(--tracking-label)] text-[var(--color-ink-3)] uppercase">
          Thêm nguồn
        </h2>
        <Badge tone="outline" icon={<ShieldCheck aria-hidden className="size-3" />}>
          Quyền chỉ đọc
        </Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {PROVIDER_FAMILIES.map((family) => {
          const linked = family.providers.filter((provider) => connected.has(provider))
          const allLinked = linked.length === family.providers.length

          return (
            <Card key={family.id} className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">
                    {family.label}
                  </p>
                  <p className="mt-1 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
                    {family.description}
                  </p>
                </div>

                {linked.length > 0 ? (
                  <Badge tone={allLinked ? 'positive' : 'caution'}>
                    {linked.length}/{family.providers.length}
                  </Badge>
                ) : null}
              </div>

              <ul className="flex flex-col gap-1.5">
                {family.providers.map((provider) => {
                  const isConnected = connected.has(provider)
                  const isGated = family.gatedProviders.includes(provider)
                  // Google Ads là provider "gated" duy nhất hiện nay, và lý do
                  // gated là THIẾU Developer Token — một khi đã nhập, không
                  // còn gì để chờ nữa, badge cũ ("Chờ duyệt token") sai ý.
                  const needsDeveloperToken =
                    isGated && provider === 'google-ads' && !hasGoogleAdsDeveloperToken

                  return (
                    <li
                      key={provider}
                      className="flex items-center gap-2 text-[length:var(--text-sm)]"
                    >
                      <ProviderMark provider={provider} size="sm" />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          isConnected
                            ? 'text-[var(--color-ink)]'
                            : 'text-[var(--color-ink-2)]',
                        )}
                      >
                        {PROVIDER_META[provider].label}
                      </span>

                      {isConnected ? (
                        <Check
                          aria-label="đã kết nối"
                          className="size-3.5 shrink-0 text-[var(--color-positive)]"
                        />
                      ) : needsDeveloperToken ? (
                        // Nói trước, không để người dùng bấm rồi mới biết bị chặn.
                        // Hướng dẫn lấy token nằm ở khối tick Ads phía dưới,
                        // không nhét thêm ở đây — hàng này đã chật chỗ tên nền
                        // tảng rồi.
                        <Badge
                          tone="caution"
                          icon={<Clock aria-hidden className="size-3" />}
                        >
                          Cần Developer Token
                        </Badge>
                      ) : null}
                    </li>
                  )
                })}
              </ul>

              {family.id === 'google' ? (
                <div className="flex items-center gap-2 text-[length:var(--text-sm)]">
                  <Gauge aria-hidden className="size-4 shrink-0 text-[var(--color-ink-3)]" />
                  <span className="min-w-0 flex-1 truncate text-[var(--color-ink-2)]">
                    PageSpeed Insights
                  </span>
                  {hasPageSpeedApiKey ? (
                    <Check aria-label="đã cấu hình" className="size-3.5 shrink-0 text-[var(--color-positive)]" />
                  ) : (
                    <Badge tone="outline">Máy chủ chưa cấu hình</Badge>
                  )}
                </div>
              ) : null}

              <div className="mt-auto flex flex-col gap-2 pt-1">
                {ADAPTER_READY_FAMILIES.has(family.id) &&
                !configuredFamilies.has(family.id) ? (
                  // Chưa có OAuth app riêng cho Site này — hướng dẫn thiết
                  // lập trước khi cho bấm kết nối, thay vì để bấm rồi báo
                  // lỗi ở /start.
                  <OAuthAppSetup
                    siteId={siteId}
                    family={family.id}
                    redirectUri={`${appOrigin}/api/oauth/${family.id}/callback`}
                    isConfigured={false}
                    existingClientId={null}
                  />
                ) : (
                  <>
                    <form action={`/api/oauth/${family.id}/start`} method="GET">
                      <input type="hidden" name="siteId" value={siteId} />
                      {family.id === 'google' && !connected.has('google-ads') ? (
                        <div className="mb-2 flex flex-col gap-1">
                          <label className="flex items-start gap-2 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                            <input
                              type="checkbox"
                              name="adsScope"
                              value="1"
                              className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
                            />
                            <span>
                              Website này có chạy Google Ads? Tick để xin quyền Ads
                              luôn trong lượt cấp quyền này, khỏi phải làm lại lần
                              hai.
                            </span>
                          </label>
                          {/* Ngoài <label> để bấm không vô tình tích/bỏ tích ô
                              phía trên — link và checkbox là hai hành động độc lập. */}
                          <div className="pl-[22px]">
                            <AdsDeveloperTokenGuide />
                          </div>
                        </div>
                      ) : null}
                      {family.id === 'google' && !connected.has('merchant-center') ? (
                        <label className="mb-2 flex items-start gap-2 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                          <input
                            type="checkbox"
                            name="merchantScope"
                            value="1"
                            className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
                          />
                          <span>
                            Website này có Google Merchant Center? Tick để xin quyền
                            đọc danh mục sản phẩm luôn trong lượt cấp quyền này.
                          </span>
                        </label>
                      ) : null}
                      {family.id === 'meta' && !connected.has('meta-ads') ? (
                        <label className="mb-2 flex items-start gap-2 text-[length:var(--text-xs)] text-[var(--color-ink-2)]">
                          <input
                            type="checkbox"
                            name="metaAdsScope"
                            value="1"
                            className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-accent)]"
                          />
                          <span>
                            Website này có chạy Facebook Ads? Tick để xin quyền Ads
                            luôn trong lượt cấp quyền này — vẫn cần chọn đúng tài
                            khoản Ads thủ công ở bên dưới sau khi kết nối.
                          </span>
                        </label>
                      ) : null}
                      <Button
                        type="submit"
                        variant={linked.length > 0 ? 'secondary' : 'primary'}
                        size="md"
                        className="w-full"
                      >
                        {linked.length > 0 ? 'Thêm tài khoản' : family.actionLabel}
                      </Button>
                    </form>

                    {ADAPTER_READY_FAMILIES.has(family.id) ? (
                      <OAuthAppSetup
                        siteId={siteId}
                        family={family.id}
                        redirectUri={`${appOrigin}/api/oauth/${family.id}/callback`}
                        isConfigured
                        existingClientId={configuredFamilies.get(family.id) ?? null}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <p className="text-[length:var(--text-xs)] text-[var(--color-ink-3)]">
        Chúng tôi chỉ xin quyền đọc báo cáo. Không quyền tạo, sửa hay tạm dừng chiến
        dịch — kể cả khi bạn bật AI Agent, mọi thay đổi vẫn phải qua màn hình duyệt của
        bạn.
      </p>
    </section>
  )
}
