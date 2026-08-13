'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePickerField } from '@/components/ui/date-picker-field'
import { TimePickerField } from '@/components/ui/time-picker-field'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import { CurrencyConversionHint, LocalTimeHint } from '@/components/planner/live-hints'
import { createPlanItemAction, type PlanActionState } from '@/lib/actions/plans'
import { OBJECTIVE_LABELS } from '@/lib/domain/plan'
import { PROVIDER_META, PROVIDERS } from '@/lib/domain/providers'

const INITIAL_STATE: PlanActionState = { error: null, ok: false }

const KPI_UNIT_LABELS = {
  count: 'Số lượng',
  currency: 'Tiền tệ',
  ratio: 'Tỷ lệ (x)',
  percent: 'Phần trăm (%)',
} as const

export function AddPlanItemDialog({
  planId,
  siteId,
  currency,
  timezone,
}: {
  readonly planId: string
  readonly siteId: string
  readonly currency: string
  readonly timezone: string
}) {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [budget, setBudget] = useState(0)
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(
    createPlanItemAction,
    INITIAL_STATE,
  )

  useEffect(() => {
    if (state.ok) {
      const timeout = setTimeout(() => setOpen(false), 800)
      return () => clearTimeout(timeout)
    }
  }, [state.ok])

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus aria-hidden className="size-3.5" />
          Thêm mục
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Thêm mục ngân sách"
        description="Một chiến dịch cụ thể trong kế hoạch — tự động thêm vào lịch triển khai bên dưới theo ngày bắt đầu."
      >
        <form
          key={open ? 'open' : 'closed'}
          action={formAction}
          noValidate
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="siteId" value={siteId} />

          <FormField label="Tên chiến dịch" htmlFor="item-campaign-name">
            <input
              id="item-campaign-name"
              name="campaignName"
              required
              placeholder="Vd: Black Friday — Google Search"
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Kênh" htmlFor="item-provider">
              <select id="item-provider" name="provider" required defaultValue={PROVIDERS[0]} className={inputClass}>
                {PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_META[provider].shortLabel}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Mục tiêu" htmlFor="item-objective">
              <select id="item-objective" name="objective" required defaultValue="traffic" className={inputClass}>
                {Object.entries(OBJECTIVE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Ngân sách" htmlFor="item-budget">
            <input
              id="item-budget"
              name="budget"
              type="number"
              min={0}
              step="any"
              required
              placeholder="0"
              onChange={(event) => setBudget(Number(event.currentTarget.value))}
              className={inputClass}
            />
          </FormField>
          <CurrencyConversionHint amount={budget} fromCurrency={currency} />

          <FormField label="Bắt đầu" htmlFor="item-start-date">
            <div className="flex gap-2">
              <div className="min-w-0 flex-[2]">
                <DatePickerField id="item-start-date" name="startDate" required onValueChange={setStartDate} />
              </div>
              <div className="min-w-0 flex-1">
                <TimePickerField name="startTime" />
              </div>
            </div>
          </FormField>
          <FormField label="Kết thúc" htmlFor="item-end-date">
            <div className="flex gap-2">
              <div className="min-w-0 flex-[2]">
                <DatePickerField id="item-end-date" name="endDate" required minDate={startDate} />
              </div>
              <div className="min-w-0 flex-1">
                <TimePickerField name="endTime" />
              </div>
            </div>
          </FormField>
          <LocalTimeHint timezone={timezone} />

          <div className="grid grid-cols-[1fr_auto_auto] gap-3">
            <FormField label="Chỉ số KPI" htmlFor="item-kpi-metric">
              <input
                id="item-kpi-metric"
                name="kpiMetric"
                required
                placeholder="Vd: ROAS"
                className={inputClass}
              />
            </FormField>
            <FormField label="Chỉ tiêu" htmlFor="item-kpi-target">
              <input
                id="item-kpi-target"
                name="kpiTarget"
                type="number"
                min={0}
                step="any"
                required
                placeholder="0"
                className={`${inputClass} w-24`}
              />
            </FormField>
            <FormField label="Đơn vị" htmlFor="item-kpi-unit">
              <select id="item-kpi-unit" name="kpiUnit" required defaultValue="ratio" className={`${inputClass} w-32`}>
                {Object.entries(KPI_UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Ghi chú" htmlFor="item-notes" hint="Không bắt buộc">
            <textarea id="item-notes" name="notes" rows={2} className={inputClass} />
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

          {state.ok ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-positive-soft)] p-3 text-[length:var(--text-sm)] text-[var(--color-ink)]"
            >
              <Check aria-hidden className="size-4 shrink-0 text-[var(--color-positive)]" />
              Đã thêm mục ngân sách.
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
            Thêm mục
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
