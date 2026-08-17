'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, ExternalLink, Settings2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import {
  saveSiteAiConfigAction,
  disconnectSiteAiConfigAction,
  type SaveAiConfigState,
  type DisconnectAiConfigState,
} from '@/lib/actions/ai-keys'
import type { AiProvider } from '@/lib/providers/ai'
import type { SiteAiConnection } from '@/lib/data/site-ai-keys'

/* Hallmark · component: ai-key-setup · theme: studied-DNA (Ink & Signal)
 * states: default · hover · focus · active · disabled · loading · error · success
 *
 * Mỗi Site chỉ kết nối MỘT provider AI tại một thời điểm (khoá chính
 * site_ai_keys.site_id) — đổi provider bắt buộc Ngắt kết nối trước, không có
 * đường "sửa trực tiếp sang provider khác" trong dialog này. API Key không
 * bao giờ hiển thị lại sau khi lưu — input luôn trống, cùng quy ước với
 * oauth-app-setup.tsx's Client Secret.
 *
 * Hướng dẫn lấy API Key CHƯA được đối chiếu trực tiếp với console thật của
 * từng hãng — khớp quy ước "CHƯA ai chạy thử" của repo cho các bước UI chưa
 * xác minh; tên nút/vị trí có thể lệch nếu hãng đổi giao diện.
 */

const PROVIDER_LABELS: Readonly<Record<AiProvider, string>> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
}

const CONSOLE_LINKS: Readonly<Record<AiProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
}

const MODEL_HINTS: Readonly<Record<AiProvider, string>> = {
  anthropic: 'vd. claude-opus-5 — xem danh sách tại docs.anthropic.com/en/docs/about-claude/models',
  openai: 'vd. gpt-5.1 — xem danh sách tại platform.openai.com/docs/models',
  gemini: 'vd. gemini-3-pro — xem danh sách tại ai.google.dev/gemini-api/docs/models',
}

const GUIDE_STEPS: Readonly<Record<AiProvider, readonly string[]>> = {
  anthropic: [
    'Vào console.anthropic.com, đăng nhập hoặc tạo tài khoản Anthropic.',
    'Vào mục Settings → API Keys (hoặc console.anthropic.com/settings/keys).',
    'Bấm "Create Key", đặt tên gợi nhớ (vd. tên website này), bấm tạo.',
    'Anthropic chỉ hiện API Key MỘT LẦN DUY NHẤT lúc tạo — sao chép ngay và dán vào form bên dưới trước khi đóng màn hình đó.',
    'Vào mục Billing, đảm bảo tài khoản có phương thức thanh toán/hạn mức — API Key hợp lệ nhưng tài khoản chưa có billing sẽ báo lỗi khi gọi thật.',
  ],
  openai: [
    'Vào platform.openai.com, đăng nhập hoặc tạo tài khoản OpenAI (khác tài khoản ChatGPT thường dùng, dù có thể đăng nhập chung).',
    'Vào mục API keys (platform.openai.com/api-keys).',
    'Bấm "Create new secret key", đặt tên gợi nhớ, chọn project nếu tài khoản có nhiều project.',
    'OpenAI chỉ hiện API Key MỘT LẦN DUY NHẤT lúc tạo — sao chép ngay và dán vào form bên dưới.',
    'Vào mục Billing (platform.openai.com/settings/organization/billing), nạp hạn mức trả trước hoặc thêm phương thức thanh toán — tài khoản mới thường không có hạn mức mặc định, gọi API sẽ báo lỗi hạn mức nếu bỏ qua bước này.',
  ],
  gemini: [
    'Vào aistudio.google.com, đăng nhập bằng tài khoản Google.',
    'Bấm "Get API key" (góc trên bên trái hoặc aistudio.google.com/apikey).',
    'Bấm "Create API key", chọn một Google Cloud project có sẵn hoặc để Google tự tạo project mới.',
    'Sao chép API Key vừa tạo, dán vào form bên dưới — khác Claude/OpenAI, key này xem lại được sau trong cùng màn hình nếu cần, nhưng vẫn nên lưu lại ngay.',
    'Gemini có hạn mức miễn phí (free tier) khá rộng cho tài khoản mới — thường không cần bật billing ngay để bắt đầu thử, nhưng hạn mức/giá có thể đổi theo chính sách Google tại thời điểm bạn đọc hướng dẫn này.',
  ],
}

export interface AiKeySetupProps {
  readonly siteId: string
  readonly connection: SiteAiConnection | null
}

export function AiKeySetup({ siteId, connection }: AiKeySetupProps) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<AiProvider>(connection?.provider ?? 'anthropic')
  const [saveState, saveAction, savePending] = useActionState<SaveAiConfigState, FormData>(saveSiteAiConfigAction, {
    error: null,
    success: false,
  })
  const [disconnectState, disconnectAction, disconnectPending] = useActionState<DisconnectAiConfigState, FormData>(
    disconnectSiteAiConfigAction,
    { error: null, success: false },
  )

  useEffect(() => {
    if (saveState.success) {
      const timeout = setTimeout(() => setOpen(false), 1200)
      return () => clearTimeout(timeout)
    }
  }, [saveState.success])

  if (connection) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--text-sm)] text-[var(--color-ink-2)]">
          Đã kết nối:{' '}
          <span className="font-medium text-[var(--color-ink)]">{PROVIDER_LABELS[connection.provider]}</span>
          {' · model '}
          <span className="font-medium text-[var(--color-ink)]">{connection.model}</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <DialogRoot open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="md">
                Đổi API Key / model
              </Button>
            </DialogTrigger>
            <DialogContent
              title={`Cập nhật ${PROVIDER_LABELS[connection.provider]}`}
              description="Đổi API Key hoặc model cho provider đang kết nối — để trống API Key nếu chỉ muốn đổi model."
            >
              <ConnectForm
                siteId={siteId}
                provider={connection.provider}
                isUpdating
                state={saveState}
                formAction={saveAction}
                pending={savePending}
                defaultModel={connection.model}
              />
            </DialogContent>
          </DialogRoot>
          <form action={disconnectAction}>
            <input type="hidden" name="siteId" value={siteId} />
            <Button
              type="submit"
              variant="ghost"
              size="md"
              state={disconnectPending ? 'loading' : 'idle'}
              loadingLabel="Đang ngắt…"
            >
              Ngắt kết nối
            </Button>
          </form>
        </div>
        {disconnectState.error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
            {disconnectState.error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <Settings2 aria-hidden className="size-4" />
          Kết nối AI provider
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Kết nối AI provider"
        description="Chọn một nhà cung cấp AI và dán API Key của bạn — website này chỉ dùng được MỘT provider tại một thời điểm."
      >
        <FormField label="Nhà cung cấp" htmlFor="ai-key-provider">
          <select
            id="ai-key-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className={`${inputClass} mb-5`}
          >
            {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </FormField>

        <ol className="mb-5 flex flex-col gap-2.5">
          {GUIDE_STEPS[provider].map((step, index) => (
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
          href={CONSOLE_LINKS[provider]}
          target="_blank"
          rel="noreferrer noopener"
          className="mb-5 inline-flex items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
        >
          Mở trang lấy API Key {PROVIDER_LABELS[provider]}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>

        <ConnectForm
          siteId={siteId}
          provider={provider}
          isUpdating={false}
          state={saveState}
          formAction={saveAction}
          pending={savePending}
          defaultModel=""
        />
      </DialogContent>
    </DialogRoot>
  )
}

function ConnectForm({
  siteId,
  provider,
  isUpdating,
  state,
  formAction,
  pending,
  defaultModel,
}: {
  readonly siteId: string
  readonly provider: AiProvider
  readonly isUpdating: boolean
  readonly state: SaveAiConfigState
  readonly formAction: (formData: FormData) => void
  readonly pending: boolean
  readonly defaultModel: string
}) {
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="provider" value={provider} />

      <FormField
        label="API Key"
        htmlFor="ai-key-api-key"
        hint={isUpdating ? 'Đã lưu trước đó — để trống nếu không đổi. Không hiện lại được vì lý do bảo mật.' : undefined}
      >
        <input
          id="ai-key-api-key"
          name="apiKey"
          type="password"
          required={!isUpdating}
          autoComplete="off"
          placeholder={isUpdating ? '••••••••••••' : undefined}
          className={inputClass}
        />
      </FormField>

      <FormField label="Model" htmlFor="ai-key-model" hint={MODEL_HINTS[provider]}>
        <input
          id="ai-key-model"
          name="model"
          type="text"
          required
          autoComplete="off"
          spellCheck={false}
          defaultValue={defaultModel}
          className={inputClass}
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
          Đã lưu.
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
  )
}
