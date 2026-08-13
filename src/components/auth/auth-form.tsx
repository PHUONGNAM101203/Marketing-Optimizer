'use client'

import { useActionState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, inputClass } from '@/components/ui/form-field'
import type { AuthState } from '@/lib/actions/auth'

/* Hallmark · component: auth-form · Ink & Signal
 * states: default · hover · focus · active · disabled · loading · error · success
 */

export type AuthAction = (
  previous: AuthState,
  formData: FormData,
) => Promise<AuthState>

export interface AuthFormProps {
  readonly action: AuthAction
  readonly mode: 'sign-in' | 'sign-up'
  readonly next?: string
  readonly submitLabel: string
}

export function AuthForm({ action, mode, next, submitLabel }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    { error: null },
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {mode === 'sign-up' ? (
        <FormField label="Họ và tên" htmlFor="fullName">
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            maxLength={120}
            className={inputClass}
          />
        </FormField>
      ) : null}

      <FormField label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="ban@congty.vn"
          className={inputClass}
        />
      </FormField>

      <FormField
        label="Mật khẩu"
        htmlFor="password"
        hint={mode === 'sign-up' ? 'Ít nhất 8 ký tự.' : undefined}
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          className={inputClass}
        />
      </FormField>

      {state.error ? (
        // role="alert" để trình đọc màn hình đọc ngay khi lỗi xuất hiện —
        // người dùng bàn phím không nhìn thấy chữ đỏ hiện ra bên dưới.
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        state={pending ? 'loading' : 'idle'}
        loadingLabel="Đang xử lý…"
        className="mt-1 w-full"
      >
        {submitLabel}
      </Button>
    </form>
  )
}
