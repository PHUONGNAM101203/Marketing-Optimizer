'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, CalendarPlus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePickerField } from '@/components/ui/date-picker-field'
import { TimePickerField } from '@/components/ui/time-picker-field'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { CurrencyConversionHint, LocalTimeHint } from '@/components/planner/live-hints'
import { createPlanAction, type PlanActionState } from '@/lib/actions/plans'

const INITIAL_STATE: PlanActionState = { error: null, ok: false }

export function NewPlanDialog({
  siteId,
  currency,
  timezone,
}: {
  readonly siteId: string
  readonly currency: string
  readonly timezone: string
}) {
  const [open, setOpen] = useState(false)
  const [totalBudget, setTotalBudget] = useState(0)
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(createPlanAction, INITIAL_STATE)

  useEffect(() => {
    if (state.ok) {
      const timeout = setTimeout(() => setOpen(false), 800)
      return () => clearTimeout(timeout)
    }
  }, [state.ok])

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="md">
          <CalendarPlus aria-hidden className="size-4" />
          Kế hoạch mới
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Kế hoạch mới"
        description="Đặt tên, ngày bắt đầu, và tổng ngân sách — thêm chiến dịch cụ thể sau khi tạo. Ngày kết thúc đặt sau, khi bạn muốn đóng kế hoạch lại."
      >
        <form
          key={open ? 'open' : 'closed'}
          action={formAction}
          noValidate
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="siteId" value={siteId} />

          <FormField label="Tên kế hoạch" htmlFor="plan-name">
            <input
              id="plan-name"
              name="name"
              required
              placeholder="Vd: Quý 3/2026"
              className={inputClass}
            />
          </FormField>

          <FormField label="Bắt đầu" htmlFor="plan-period-start">
            <div className="flex gap-2">
              <div className="min-w-0 flex-[2]">
                <DatePickerField id="plan-period-start" name="periodStart" required />
              </div>
              <div className="min-w-0 flex-1">
                <TimePickerField name="periodStartTime" />
              </div>
            </div>
          </FormField>
          <LocalTimeHint timezone={timezone} />

          <FormField label={`Tổng ngân sách (${currency})`} htmlFor="plan-total-budget">
            <input
              id="plan-total-budget"
              name="totalBudget"
              type="number"
              min={0}
              step="any"
              required
              placeholder="0"
              onChange={(event) => setTotalBudget(Number(event.currentTarget.value))}
              className={inputClass}
            />
          </FormField>
          <CurrencyConversionHint amount={totalBudget} fromCurrency={currency} />

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-negative-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--color-negative)]" />
              {state.error}
            </p>
          ) : null}

          {state.ok ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã tạo kế hoạch.
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
            Tạo kế hoạch
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
