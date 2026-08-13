-- ============================================================================
-- Kế hoạch/mục ngân sách chuyển từ NGÀY sang NGÀY GIỜ — người dùng cần chọn
-- cả giờ bắt đầu/kết thúc (vd. campaign lên sóng đúng 9h thay vì mặc định
-- nửa đêm). `date` → `timestamptz`; giá trị cũ giữ nguyên NGÀY đó lúc 00:00.
-- ============================================================================

alter table public.plans
  alter column period_start type timestamptz using period_start::timestamptz,
  alter column period_end   type timestamptz using period_end::timestamptz;

alter table public.plan_items
  alter column start_date type timestamptz using start_date::timestamptz,
  alter column end_date   type timestamptz using end_date::timestamptz;

drop function if exists public.create_plan_item_with_deployment(
  uuid, text, text, text, bigint, date, date, jsonb, text, text
);

create or replace function public.create_plan_item_with_deployment(
  p_plan_id       uuid,
  p_provider      text,
  p_campaign_name text,
  p_objective     text,
  p_budget_micros bigint,
  p_start_date    timestamptz,
  p_end_date      timestamptz,
  p_kpi_targets   jsonb,
  p_notes         text,
  p_owner         text
)
returns public.plan_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_site_id uuid;
  v_item public.plan_items;
begin
  select site_id into v_site_id from public.plans where id = p_plan_id;
  if v_site_id is null then
    raise exception 'plan not found';
  end if;

  insert into public.plan_items (
    plan_id, provider, campaign_name, objective, budget_micros, start_date, end_date, kpi_targets, notes
  )
  values (
    p_plan_id, p_provider, p_campaign_name, p_objective, p_budget_micros, p_start_date, p_end_date, p_kpi_targets, p_notes
  )
  returning * into v_item;

  insert into public.deployments (site_id, plan_item_id, title, providers, scheduled_at, status, owner)
  values (v_site_id, v_item.id, p_campaign_name, array[p_provider], p_start_date, 'scheduled', p_owner);

  return v_item;
end;
$$;

revoke all on function public.create_plan_item_with_deployment(
  uuid, text, text, text, bigint, timestamptz, timestamptz, jsonb, text, text
) from public;
grant execute on function public.create_plan_item_with_deployment(
  uuid, text, text, text, bigint, timestamptz, timestamptz, jsonb, text, text
) to authenticated;
