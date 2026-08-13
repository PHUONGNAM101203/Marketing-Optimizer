'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Clock3, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePickerField } from '@/components/ui/date-picker-field'
import { TimePickerField } from '@/components/ui/time-picker-field'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { updatePlanPeriodAction, type PlanActionState } from '@/lib/actions/plans'
import { formatDateTime } from '@/lib/format'

const INITIAL_STATE: PlanActionState = { error: null, ok: false }

/** Kế hoạch mới tạo không bắt buộc có ngày kết thúc (xem `createPlanSchema`)
 * — đây là nơi ĐẶT/ĐỔI/GỠ nó sau, khi người dùng thật sự muốn đóng kế hoạch
 * lại. Tách khỏi ô ngày bắt đầu — không dùng chung dialog tạo mới. */
export function EditPlanPeriodDialog({
  planId,
  siteId,
  periodEnd,
}: {
  readonly planId: string
  readonly siteId: string
  readonly periodEnd: string | null
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(
    updatePlanPeriodAction,
    INITIAL_STATE,
  )

  useEffect(() => {
    if (state.ok) {
      const timeout = setTimeout(() => setOpen(false), 800)
      return () => clearTimeout(timeout)
    }
  }, [state.ok])

  // `combineDateTime` luôn sinh đúng dạng "yyyy-MM-ddTHH:mm:00" — tách lại an
  // toàn bằng cắt chuỗi, không cần parse ngày giờ đầy đủ chỉ để lấy 2 mẩu.
  const [defaultDate, defaultTime] = periodEnd ? periodEnd.split('T') : [undefined, undefined]

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Clock3 aria-hidden className="size-3.5" />
          {periodEnd ? `Kết thúc ${formatDateTime(periodEnd)}` : 'Đặt ngày kết thúc'}
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Ngày kết thúc kế hoạch"
        description="Kế hoạch mở sẽ chạy tới khi bạn đóng lại. Bỏ trống và lưu để mở lại."
      >
        <form key={open ? 'open' : 'closed'} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="siteId" value={siteId} />

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <FormField label="Ngày" htmlFor="plan-period-end-date">
                <DatePickerField id="plan-period-end-date" name="periodEnd" defaultValue={defaultDate} />
              </FormField>
            </div>
            <div className="w-32 shrink-0">
              <FormField label="Giờ" htmlFor="plan-period-end-time">
                <TimePickerField
                  id="plan-period-end-time"
                  name="periodEndTime"
                  defaultValue={defaultTime?.slice(0, 5)}
                />
              </FormField>
            </div>
          </div>

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
              Đã lưu.
            </p>
          ) : null}

          <div className="flex gap-2">
            {periodEnd ? (
              <Button
                type="submit"
                variant="secondary"
                size="md"
                name="clear"
                value="1"
                formNoValidate
                className="flex-1"
              >
                <X aria-hidden className="size-4" />
                Mở lại (gỡ ngày kết thúc)
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              size="md"
              state={pending ? 'loading' : 'idle'}
              loadingLabel="Đang lưu…"
              className="flex-1"
            >
              Lưu
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
