'use client'

import { useActionState, useEffect, useState } from 'react'
import { Check, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/ui/dialog'
import { FormField, inputClass } from '@/components/ui/form-field'
import {
  updateInsightThresholds,
  type UpdateInsightThresholdsState,
} from '@/lib/actions/site'
import type { InsightThresholds } from '@/lib/domain/insight'

/* Hallmark · component: alert-thresholds-dialog · theme: studied-DNA (Ink & Signal)
 *
 * Ba ngưỡng dùng thẳng để phát hiện bất thường ở `site-insights.ts`
 * (`thresholdsFromSite`) — đây là dialog DUY NHẤT chỉnh chúng, không có
 * đường nào khác. Để trống một ô = quay về mặc định hệ thống, không phải
 * "tắt cảnh báo trục này".
 */

const INITIAL_STATE: UpdateInsightThresholdsState = { error: null, success: false }

export function AlertThresholdsDialog({
  siteId,
  current,
  isDefault,
}: {
  readonly siteId: string
  readonly current: InsightThresholds
  /** Từng cột đang là mặc định (site chưa tự đặt) hay giá trị site tự chọn —
   * hiện đúng placeholder/giá trị ban đầu cho form. */
  readonly isDefault: {
    readonly dropThresholdPct: boolean
    readonly criticalDropThresholdPct: boolean
    readonly staleSyncHours: boolean
  }
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<UpdateInsightThresholdsState, FormData>(
    updateInsightThresholds,
    INITIAL_STATE,
  )

  useEffect(() => {
    if (state.success) {
      const timeout = setTimeout(() => setOpen(false), 800)
      return () => clearTimeout(timeout)
    }
  }, [state.success])

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="md">
          <SlidersHorizontal aria-hidden className="size-4" />
          Ngưỡng cảnh báo
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Ngưỡng cảnh báo"
        description="Quyết định khi nào một biến động số liệu được coi là bất thường. Để trống một ô để dùng lại mặc định hệ thống."
      >
        <form key={open ? 'open' : 'closed'} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="siteId" value={siteId} />

          <FormField
            label="Ngưỡng cảnh báo (giảm bao nhiêu % thì báo)"
            htmlFor="drop-threshold"
          >
            <div className="relative">
              <input
                id="drop-threshold"
                name="dropThresholdPct"
                type="number"
                min={1}
                max={99}
                step={1}
                defaultValue={isDefault.dropThresholdPct ? '' : Math.round(current.dropThresholdPct * 100)}
                placeholder={String(Math.round(current.dropThresholdPct * 100))}
                className={inputClass}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
                %
              </span>
            </div>
          </FormField>

          <FormField
            label="Ngưỡng nghiêm trọng (giảm bao nhiêu % thì báo khẩn)"
            htmlFor="critical-threshold"
          >
            <div className="relative">
              <input
                id="critical-threshold"
                name="criticalDropThresholdPct"
                type="number"
                min={1}
                max={99}
                step={1}
                defaultValue={
                  isDefault.criticalDropThresholdPct
                    ? ''
                    : Math.round(current.criticalDropThresholdPct * 100)
                }
                placeholder={String(Math.round(current.criticalDropThresholdPct * 100))}
                className={inputClass}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[length:var(--text-sm)] text-[var(--color-ink-3)]">
                %
              </span>
            </div>
          </FormField>

          <FormField
            label="Báo khi kết nối chưa đồng bộ quá bao nhiêu giờ"
            htmlFor="stale-hours"
          >
            <input
              id="stale-hours"
              name="staleSyncHours"
              type="number"
              min={1}
              max={720}
              step={1}
              defaultValue={isDefault.staleSyncHours ? '' : current.staleSyncHours}
              placeholder={String(current.staleSyncHours)}
              className={inputClass}
            />
          </FormField>

          {state.error ? (
            <p className="flex items-center gap-1.5 text-[length:var(--text-sm)] text-[var(--color-negative)]">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              {state.error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="md" disabled={pending} className="self-end">
            {state.success ? (
              <>
                <Check aria-hidden className="size-4" />
                Đã lưu
              </>
            ) : (
              'Lưu ngưỡng'
            )}
          </Button>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
