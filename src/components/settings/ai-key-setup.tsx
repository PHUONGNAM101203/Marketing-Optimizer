'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Check, ExternalLink, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, inputClass } from '@/components/ui/form-field'
import { saveSiteAiKeyAction, type SaveAiKeyState } from '@/lib/actions/ai-keys'

/* Hallmark · component: ai-key-setup · theme: studied-DNA (Ink & Signal)
 * states: default · focus · disabled · loading · error · success
 *
 * Đơn giản hơn hẳn oauth-app-setup.tsx — một field duy nhất, không cần dialog
 * nhiều bước. Key không bao giờ hiển thị lại sau khi lưu, cùng quy ước với
 * Client Secret ở oauth-app-setup: input luôn trống, placeholder báo đã cấu
 * hình hay chưa.
 */

export interface AiKeySetupProps {
  readonly siteId: string
  readonly isConfigured: boolean
}

export function AiKeySetup({ siteId, isConfigured }: AiKeySetupProps) {
  const [state, formAction, pending] = useActionState<SaveAiKeyState, FormData>(
    saveSiteAiKeyAction,
    { error: null, success: false, changed: false },
  )
  const apiKeyInputRef = useRef<HTMLInputElement>(null)

  // Chỉ xoá input khi thực sự có lượt ghi thật (`changed`) — submit trống
  // "không đổi gì" (`success` nhưng không `changed`) không chạm vào input,
  // không có gì để xoá. Phụ thuộc vào `state` (đổi định danh mỗi lần action
  // chạy xong) chứ không phải `state.changed` riêng lẻ, để hai lượt lưu thật
  // liên tiếp đều kích hoạt lại — so registered value không đổi giữa hai lần
  // thành công liên tiếp sẽ không kích hoạt lại effect nếu chỉ phụ thuộc field.
  useEffect(() => {
    if (state.success && state.changed && apiKeyInputRef.current) {
      apiKeyInputRef.current.value = ''
    }
  }, [state])

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="siteId" value={siteId} />

      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex w-fit items-center gap-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-signal)] hover:underline"
      >
        Lấy API Key tại console.anthropic.com
        <ExternalLink aria-hidden className="size-3.5" />
      </a>

      <FormField
        label="Claude API Key"
        htmlFor="ai-key-api-key"
        hint={
          isConfigured
            ? 'Đã lưu trước đó — để trống nếu không đổi. Không hiện lại được vì lý do bảo mật.'
            : undefined
        }
      >
        <input
          ref={apiKeyInputRef}
          id="ai-key-api-key"
          name="apiKey"
          type="password"
          required={!isConfigured}
          autoComplete="off"
          placeholder={isConfigured ? '••••••••••••' : undefined}
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

      {state.success && state.changed ? (
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
        className="w-fit"
      >
        Lưu cấu hình
      </Button>
    </form>
  )
}
