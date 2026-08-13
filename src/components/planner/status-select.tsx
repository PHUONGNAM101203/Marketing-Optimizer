'use client'

import { updateDeploymentStatusAction, updatePlanStatusAction } from '@/lib/actions/plans'
import {
  DEPLOYMENT_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  type DeploymentStatus,
  type PlanStatus,
} from '@/lib/domain/plan'
import { cn } from '@/lib/cn'

/* Dropdown tự submit ngay khi đổi — không cần nút "Lưu" riêng cho một thao
 * tác đơn giản là đổi trạng thái. `'use client'` vì cần onChange, khác các
 * form nút bấm nhị phân (bật/tắt) ở nơi khác trong app không cần JS. */
const selectClass = cn(
  'rounded-[var(--radius-full)] border-none bg-[var(--color-paper-3)] px-2.5 py-1',
  'text-[length:var(--text-2xs)] font-medium text-[var(--color-ink-2)]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
)

export function PlanStatusSelect({
  planId,
  siteId,
  status,
}: {
  readonly planId: string
  readonly siteId: string
  readonly status: PlanStatus
}) {
  return (
    <form action={updatePlanStatusAction}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="siteId" value={siteId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Trạng thái kế hoạch"
        className={selectClass}
      >
        {Object.entries(PLAN_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  )
}

export function DeploymentStatusSelect({
  deploymentId,
  siteId,
  status,
}: {
  readonly deploymentId: string
  readonly siteId: string
  readonly status: DeploymentStatus
}) {
  return (
    <form action={updateDeploymentStatusAction}>
      <input type="hidden" name="deploymentId" value={deploymentId} />
      <input type="hidden" name="siteId" value={siteId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Trạng thái triển khai"
        className={selectClass}
      >
        {Object.entries(DEPLOYMENT_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  )
}
