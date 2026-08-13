'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PROVIDERS } from '@/lib/domain/providers'
import { unitsToMicros } from '@/lib/metrics/types'
import { combineDateTime } from '@/lib/datetime'
import { createClient } from '@/lib/supabase/server'

export interface PlanActionState {
  readonly error: string | null
  readonly ok: boolean
}

const INITIAL_STATE: PlanActionState = { error: null, ok: false }

const PERMISSION_DENIED = '42501'

// Kết thúc KHÔNG bắt buộc lúc tạo — chỉ cần biết bắt đầu khi nào để lên lịch.
// Đóng kế hoạch lại là việc làm SAU (xem `updatePlanPeriodAction`), không
// phải điều kiện để tạo kế hoạch mới.
const createPlanSchema = z
  .object({
    siteId: z.string().uuid('Site không hợp lệ'),
    name: z.string().trim().min(2, 'Tên kế hoạch quá ngắn').max(120, 'Tên kế hoạch quá dài'),
    periodStart: z.string().min(1, 'Thiếu ngày bắt đầu'),
    periodStartTime: z.string().trim().optional(),
    totalBudget: z.coerce.number().positive('Tổng ngân sách phải lớn hơn 0'),
  })
  .transform((data) => ({
    ...data,
    periodStartAt: combineDateTime(data.periodStart, data.periodStartTime),
  }))

export async function createPlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = createPlanSchema.safeParse({
    siteId: formData.get('siteId'),
    name: formData.get('name'),
    periodStart: formData.get('periodStart'),
    periodStartTime: formData.get('periodStartTime'),
    totalBudget: formData.get('totalBudget'),
  })
  if (!parsed.success) {
    return { ...INITIAL_STATE, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ...INITIAL_STATE, error: 'Phiên đăng nhập đã hết hạn.' }

  const { siteId, name, periodStartAt, totalBudget } = parsed.data
  const { error } = await supabase.from('plans').insert({
    site_id: siteId,
    name,
    period_start: periodStartAt,
    total_budget_micros: unitsToMicros(totalBudget),
    created_by: user.id,
  })

  if (error) {
    return {
      ...INITIAL_STATE,
      error:
        error.code === PERMISSION_DENIED
          ? 'Chỉ chủ sở hữu hoặc quản trị viên mới tạo được kế hoạch.'
          : `Không tạo được: ${error.message}`,
    }
  }

  revalidatePath(`/${siteId}/planner`)
  return { ok: true, error: null }
}

const updatePlanPeriodSchema = z.object({
  planId: z.string().uuid(),
  siteId: z.string().uuid(),
  periodEnd: z.string().trim().optional(),
  periodEndTime: z.string().trim().optional(),
  // Nút "Mở lại" gửi field riêng này thay vì dựa vào periodEnd rỗng — hai
  // input CÙNG TÊN `periodEnd` (ô ẩn của DatePickerField + value trên nút)
  // sẽ đụng nhau, `FormData.get` luôn trả input ĐẦU tiên theo thứ tự DOM chứ
  // không phải giá trị của nút vừa bấm.
  clear: z.string().optional(),
})

/** Đặt/đổi/gỡ ngày kết thúc SAU khi kế hoạch đã tồn tại — "đóng kế hoạch lại"
 * là sửa, không phải điều kiện bắt buộc lúc tạo (xem `createPlanSchema`). Trả
 * `PlanActionState` (không phải `void`) để dùng chung mẫu dialog+`useActionState`
 * với các form khác trong Planner, không phải mẫu select tự submit.
 * Bỏ trống `periodEnd` nghĩa là MỞ LẠI (gỡ ngày kết thúc), không phải lỗi. */
export async function updatePlanPeriodAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = updatePlanPeriodSchema.safeParse({
    planId: formData.get('planId'),
    siteId: formData.get('siteId'),
    periodEnd: formData.get('periodEnd'),
    periodEndTime: formData.get('periodEndTime'),
    clear: formData.get('clear'),
  })
  if (!parsed.success) {
    return { ...INITIAL_STATE, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const periodEnd =
    parsed.data.clear || !parsed.data.periodEnd
      ? null
      : combineDateTime(parsed.data.periodEnd, parsed.data.periodEndTime)

  const supabase = await createClient()
  const { error } = await supabase
    .from('plans')
    .update({ period_end: periodEnd })
    .eq('id', parsed.data.planId)

  if (error) {
    return {
      ...INITIAL_STATE,
      error:
        error.code === PERMISSION_DENIED
          ? 'Chỉ chủ sở hữu hoặc quản trị viên mới sửa được kế hoạch.'
          : `Không lưu được: ${error.message}`,
    }
  }

  revalidatePath(`/${parsed.data.siteId}/planner`)
  return { ok: true, error: null }
}

const createPlanItemSchema = z
  .object({
    planId: z.string().uuid(),
    siteId: z.string().uuid(),
    provider: z.enum(PROVIDERS),
    campaignName: z.string().trim().min(2, 'Tên chiến dịch quá ngắn').max(120, 'Tên chiến dịch quá dài'),
    objective: z.enum(['awareness', 'traffic', 'engagement', 'leads', 'sales', 'retention']),
    budget: z.coerce.number().positive('Ngân sách phải lớn hơn 0'),
    startDate: z.string().min(1, 'Thiếu ngày bắt đầu'),
    startTime: z.string().trim().optional(),
    endDate: z.string().min(1, 'Thiếu ngày kết thúc'),
    endTime: z.string().trim().optional(),
    kpiMetric: z.string().trim().min(1, 'Thiếu tên chỉ số KPI').max(60, 'Tên chỉ số KPI quá dài'),
    kpiTarget: z.coerce.number().positive('Chỉ tiêu KPI phải lớn hơn 0'),
    kpiUnit: z.enum(['count', 'currency', 'ratio', 'percent']),
    notes: z.string().trim().max(500, 'Ghi chú quá dài').optional(),
  })
  .transform((data) => ({
    ...data,
    startAt: combineDateTime(data.startDate, data.startTime),
    endAt: combineDateTime(data.endDate, data.endTime),
  }))
  .refine((data) => data.endAt >= data.startAt, {
    message: 'Ngày giờ kết thúc phải sau hoặc bằng ngày giờ bắt đầu',
    path: ['endDate'],
  })

/**
 * Tạo Plan Item + Deployment tương ứng CÙNG LÚC qua RPC
 * `create_plan_item_with_deployment` (1 transaction thật ở DB) — xem migration
 * `20260813000008_planner.sql` để hiểu vì sao không ghi 2 bảng bằng 2 lệnh
 * insert riêng từ đây.
 */
export async function createPlanItemAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const parsed = createPlanItemSchema.safeParse({
    planId: formData.get('planId'),
    siteId: formData.get('siteId'),
    provider: formData.get('provider'),
    campaignName: formData.get('campaignName'),
    objective: formData.get('objective'),
    budget: formData.get('budget'),
    startDate: formData.get('startDate'),
    startTime: formData.get('startTime'),
    endDate: formData.get('endDate'),
    endTime: formData.get('endTime'),
    kpiMetric: formData.get('kpiMetric'),
    kpiTarget: formData.get('kpiTarget'),
    kpiUnit: formData.get('kpiUnit'),
    notes: formData.get('notes') || undefined,
  })
  if (!parsed.success) {
    return { ...INITIAL_STATE, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ...INITIAL_STATE, error: 'Phiên đăng nhập đã hết hạn.' }

  const {
    planId,
    siteId,
    provider,
    campaignName,
    objective,
    budget,
    startAt,
    endAt,
    kpiMetric,
    kpiTarget,
    kpiUnit,
    notes,
  } = parsed.data

  const { error } = await supabase.rpc('create_plan_item_with_deployment', {
    p_plan_id: planId,
    p_provider: provider,
    p_campaign_name: campaignName,
    p_objective: objective,
    p_budget_micros: unitsToMicros(budget),
    p_start_date: startAt,
    p_end_date: endAt,
    p_kpi_targets: [{ metric: kpiMetric, target: kpiTarget, unit: kpiUnit }],
    p_notes: notes ?? null,
    p_owner: user.email ?? 'Không rõ',
  })

  if (error) {
    return {
      ...INITIAL_STATE,
      error:
        error.code === PERMISSION_DENIED
          ? 'Chỉ chủ sở hữu hoặc quản trị viên mới thêm được mục ngân sách.'
          : `Không thêm được: ${error.message}`,
    }
  }

  revalidatePath(`/${siteId}/planner`)
  return { ok: true, error: null }
}

const updatePlanStatusSchema = z.object({
  planId: z.string().uuid(),
  siteId: z.string().uuid(),
  status: z.enum(['draft', 'approved', 'active', 'completed', 'archived']),
})

export async function updatePlanStatusAction(formData: FormData): Promise<void> {
  const parsed = updatePlanStatusSchema.safeParse({
    planId: formData.get('planId'),
    siteId: formData.get('siteId'),
    status: formData.get('status'),
  })
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase.from('plans').update({ status: parsed.data.status }).eq('id', parsed.data.planId)

  revalidatePath(`/${parsed.data.siteId}/planner`)
}

const updateDeploymentStatusSchema = z.object({
  deploymentId: z.string().uuid(),
  siteId: z.string().uuid(),
  status: z.enum(['scheduled', 'in-progress', 'live', 'blocked', 'done']),
})

export async function updateDeploymentStatusAction(formData: FormData): Promise<void> {
  const parsed = updateDeploymentStatusSchema.safeParse({
    deploymentId: formData.get('deploymentId'),
    siteId: formData.get('siteId'),
    status: formData.get('status'),
  })
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase
    .from('deployments')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.deploymentId)

  revalidatePath(`/${parsed.data.siteId}/planner`)
}

const deletePlanItemSchema = z.object({
  planItemId: z.string().uuid(),
  siteId: z.string().uuid(),
})

/** Xoá Plan Item xoá kèm Deployment liên quan (ON DELETE CASCADE ở DB). */
export async function deletePlanItemAction(formData: FormData): Promise<void> {
  const parsed = deletePlanItemSchema.safeParse({
    planItemId: formData.get('planItemId'),
    siteId: formData.get('siteId'),
  })
  if (!parsed.success) return

  const supabase = await createClient()
  await supabase.from('plan_items').delete().eq('id', parsed.data.planItemId)

  revalidatePath(`/${parsed.data.siteId}/planner`)
}
