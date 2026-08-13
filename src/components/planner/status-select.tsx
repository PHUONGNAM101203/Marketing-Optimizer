'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
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
  'disabled:opacity-60',
)

/** `useFormStatus` chỉ đọc được `<form>` cha khi gọi từ một component CON
 * của form đó — tách riêng để khoá dropdown + đổi con trỏ chờ trong lúc
 * server action chạy, thay vì để y nguyên như đã bấm xong (cảm giác
 * "không phản hồi" đúng thứ người dùng phàn nàn). */
function StatusSelectField({
  name,
  defaultValue,
  ariaLabel,
  options,
}: {
  readonly name: string
  readonly defaultValue: string
  readonly ariaLabel: string
  readonly options: Readonly<Record<string, ReactNode>>
}) {
  const { pending } = useFormStatus()

  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={pending}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      className={cn(selectClass, pending && 'cursor-wait')}
    >
      {Object.entries(options).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}

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
      <StatusSelectField
        name="status"
        defaultValue={status}
        ariaLabel="Trạng thái kế hoạch"
        options={PLAN_STATUS_LABELS}
      />
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
      <StatusSelectField
        name="status"
        defaultValue={status}
        ariaLabel="Trạng thái triển khai"
        options={DEPLOYMENT_STATUS_LABELS}
      />
    </form>
  )
}
