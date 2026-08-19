'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, ExternalLink, KeyRound, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { ProviderMark } from '@/components/connections/provider-mark'
import { connectKlaviyo, type ConnectKlaviyoState } from '@/lib/actions/klaviyo-connection'

/* Hallmark · component: klaviyo-connect-card · theme: studied-DNA (Ink & Signal)
 *
 * Klaviyo KHÔNG thuộc OAuth family nào (`PROVIDER_FAMILIES`) — connect qua
 * private API key dán trực tiếp, nên nó cần thẻ + dialog RIÊNG thay vì đi
 * qua `ConnectPanel`. Cố tình dựng ĐÚNG khuôn thẻ family của `ConnectPanel`
 * (header + danh sách provider + nút full-width ở đáy) để không trông lạc
 * lõng cạnh Google/YouTube/Meta/TikTok, và hướng dẫn từng bước bên trong
 * dialog cùng độ chi tiết với `OAuthAppSetup` (GUIDE_STEPS) — khác OAuth ở
 * chỗ không có Redirect URI/Client ID/Secret, chỉ một private API key.
 */

const GUIDE_STEPS: readonly string[] = [
  'Đăng nhập vào đúng tài khoản Klaviyo muốn kết nối.',
  'Vào biểu tượng bánh răng (Settings) → Account → API Keys, hoặc mở thẳng liên kết bên dưới.',
  'Bấm "Create Private API Key".',
  'Đặt tên gợi nhớ (vd. "Marketing Optimizer") để sau này dễ nhận ra và thu hồi khi cần.',
  'Ở mục quyền (Scopes), chọn "Full Access Key", hoặc tối thiểu bật quyền ĐỌC (Read) cho: Campaigns, Flows, Profiles, Segments, Lists, Metrics và Analytics/Reporting — thiếu quyền nào, đúng phần dữ liệu đó sẽ trống khi xem chi tiết kênh.',
  'Bấm "Create" — Klaviyo chỉ hiện đủ key MỘT LẦN DUY NHẤT, copy ngay trước khi đóng màn hình đó.',
  'Dán key vào ô bên dưới rồi bấm "Kết nối".',
]

const KLAVIYO_API_KEYS_URL = 'https://www.klaviyo.com/settings/account/api-keys'

const INITIAL_STATE: ConnectKlaviyoState = { error: null, success: false }

export function KlaviyoConnectCard({
  siteId,
  isConnected,
}: {
  readonly siteId: string
  readonly isConnected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ConnectKlaviyoState, FormData>(
    connectKlaviyo,
    INITIAL_STATE,
  )

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => setOpen(false), 1200)
      return () => clearTimeout(timeout)
    }
  }, [state.success])

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--text-base)] font-semibold text-[var(--color-ink)]">Klaviyo</p>
          <p className="mt-1 text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
            Campaign, flow, khách hàng, segment — dán private API key, không cần đăng nhập tài khoản.
          </p>
        </div>
        {isConnected ? <Badge tone="positive">1/1</Badge> : null}
      </div>

      <ul className="flex flex-col gap-1.5">
        <li className="flex items-center gap-2 text-[length:var(--text-sm)]">
          <ProviderMark provider="klaviyo" size="sm" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              isConnected ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-2)]',
            )}
          >
            Klaviyo
          </span>
          {isConnected ? (
            <Check aria-label="đã kết nối" className="size-3.5 shrink-0 text-[var(--color-positive)]" />
          ) : null}
        </li>
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-1">
        <DialogRoot open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant={isConnected ? 'secondary' : 'primary'} size="md" className="w-full">
              <KeyRound aria-hidden className="size-4" />
              {isConnected ? 'Thêm tài khoản' : 'Kết nối Klaviyo'}
            </Button>
          </DialogTrigger>

          <DialogContent
            title="Kết nối Klaviyo"
            description="Klaviyo xác thực bằng private API key thay vì đăng nhập — tạo một key CHỈ ĐỌC theo các bước dưới đây rồi dán vào form."
          >
            <ol className="mb-5 flex flex-col gap-2.5">
              {GUIDE_STEPS.map((step, index) => (
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
              href={KLAVIYO_API_KEYS_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mb-5 inline-flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
            >
              Mở trang API Keys của Klaviyo
              <ExternalLink aria-hidden className="size-3.5" />
            </a>

            <form key={open ? 'open' : 'closed'} action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="siteId" value={siteId} />

              <FormField label="Private API key" htmlFor="klaviyo-api-key">
                <input
                  id="klaviyo-api-key"
                  name="apiKey"
                  type="password"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className={`${inputClass} font-mono`}
                />
              </FormField>

              {state.error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
                >
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
                  {state.error}
                </p>
              ) : null}

              {state.success ? (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
                >
                  <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
                  Đã kết nối.
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="md"
                state={pending ? 'loading' : 'idle'}
                loadingLabel="Đang kết nối…"
                className="w-full"
              >
                Kết nối
              </Button>
            </form>
          </DialogContent>
        </DialogRoot>
      </div>
    </Card>
  )
}
