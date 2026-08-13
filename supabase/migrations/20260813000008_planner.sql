-- ============================================================================
-- Kế hoạch (Planner) — CRUD thủ công đầu tiên (plans/plan_items/deployments).
-- AI tự sinh kế hoạch dời sau khi Prompt Studio có sẵn hạ tầng gọi LLM.
-- ============================================================================

create table public.plans (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid not null references public.sites (id) on delete cascade,
  name                 text not null,
  period_start         date not null,
  period_end           date not null,
  total_budget_micros  bigint not null default 0,
  status               text not null default 'draft'
                         check (status in ('draft', 'approved', 'active', 'completed', 'archived')),
  source               text not null default 'manual' check (source in ('manual', 'ai')),
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  check (period_end > period_start)
);

create index plans_site_idx on public.plans (site_id);

create table public.plan_items (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.plans (id) on delete cascade,
  provider       text not null check (
    provider in ('google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'meta-ads', 'instagram', 'tiktok')
  ),
  campaign_name  text not null,
  objective      text not null check (
    objective in ('awareness', 'traffic', 'engagement', 'leads', 'sales', 'retention')
  ),
  budget_micros  bigint not null check (budget_micros > 0),
  start_date     date not null,
  end_date       date not null,
  -- Mảng KpiTarget {metric, target, unit} — cấu trúc linh hoạt, xem lib/domain/plan.ts.
  kpi_targets    jsonb not null default '[]'::jsonb,
  notes          text,
  check (end_date >= start_date)
);

create index plan_items_plan_idx on public.plan_items (plan_id);

-- Lịch triển khai — LUÔN tạo kèm 1 plan_item (xem create_plan_item_with_deployment
-- bên dưới), không có form tạo độc lập ở phase này. `plan_item_id` vẫn để
-- nullable (không NOT NULL) — đúng domain model gốc (`planItemId: string | null`),
-- để ngỏ cho lịch nội dung không gắn ngân sách sau này mà không cần đổi schema.
create table public.deployments (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  plan_item_id   uuid references public.plan_items (id) on delete cascade,
  title          text not null,
  providers      text[] not null default '{}',
  scheduled_at   timestamptz not null,
  status         text not null default 'scheduled'
                   check (status in ('scheduled', 'in-progress', 'live', 'blocked', 'done')),
  owner          text not null,
  created_at     timestamptz not null default now()
);

create index deployments_site_idx on public.deployments (site_id);
create index deployments_plan_item_idx on public.deployments (plan_item_id);

alter table public.plans        enable row level security;
alter table public.plan_items   enable row level security;
alter table public.deployments  enable row level security;

-- ─── plans ──────────────────────────────────────────────────────────────────
create policy "plans_select_member"
  on public.plans for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "plans_insert_admin"
  on public.plans for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

create policy "plans_update_admin"
  on public.plans for update
  to authenticated
  using (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

-- KHÔNG có policy delete cho `plans` — ngân sách kế hoạch không xoá thẳng,
-- chỉ chuyển status 'archived' (qua update). Chủ đích, không phải thiếu sót.

-- ─── plan_items ─────────────────────────────────────────────────────────────
-- Bảng này không có site_id trực tiếp — quyền suy qua plan cha.
create policy "plan_items_select_member"
  on public.plan_items for select
  to authenticated
  using (exists (
    select 1 from public.plans p where p.id = plan_id and public.is_site_member(p.site_id)
  ));

create policy "plan_items_insert_admin"
  on public.plan_items for insert
  to authenticated
  with check (exists (
    select 1 from public.plans p
    where p.id = plan_id and public.has_site_role(p.site_id, array['owner', 'admin']::public.site_role[])
  ));

create policy "plan_items_update_admin"
  on public.plan_items for update
  to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_id and public.has_site_role(p.site_id, array['owner', 'admin']::public.site_role[])
  ))
  with check (exists (
    select 1 from public.plans p
    where p.id = plan_id and public.has_site_role(p.site_id, array['owner', 'admin']::public.site_role[])
  ));

create policy "plan_items_delete_admin"
  on public.plan_items for delete
  to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_id and public.has_site_role(p.site_id, array['owner', 'admin']::public.site_role[])
  ));

-- ─── deployments ────────────────────────────────────────────────────────────
create policy "deployments_select_member"
  on public.deployments for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "deployments_insert_admin"
  on public.deployments for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

create policy "deployments_update_admin"
  on public.deployments for update
  to authenticated
  using (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner', 'admin']::public.site_role[]));

-- ============================================================================
-- Tạo Plan Item + Deployment cùng lúc trong MỘT transaction thật.
--
-- PostgREST (client Supabase JS) không ghi nhiều bảng nguyên tử được — hai
-- lệnh insert riêng từ server action có thể thành công nửa chừng (item tạo
-- được, deployment thì không, do lỗi mạng/race) để lại dữ liệu mồ côi. Gói cả
-- hai bước vào một function chạy trong một transaction database thật.
--
-- `security invoker` (KHÔNG phải `security definer`) — chạy dưới quyền người
-- gọi, để RLS insert của cả `plan_items` lẫn `deployments` vẫn được áp dụng
-- bình thường. Khác với `is_site_member`/`has_site_role` (định nghĩa ở
-- 20260812000001) — hai hàm đó PHẢI definer để cắt vòng lặp RLS khi đọc
-- `site_members`; hàm này không đọc bảng có RLS đệ quy nên không cần.
-- ============================================================================
create or replace function public.create_plan_item_with_deployment(
  p_plan_id       uuid,
  p_provider      text,
  p_campaign_name text,
  p_objective     text,
  p_budget_micros bigint,
  p_start_date    date,
  p_end_date      date,
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
  values (v_site_id, v_item.id, p_campaign_name, array[p_provider], p_start_date::timestamptz, 'scheduled', p_owner);

  return v_item;
end;
$$;

revoke all on function public.create_plan_item_with_deployment(
  uuid, text, text, text, bigint, date, date, jsonb, text, text
) from public;
grant execute on function public.create_plan_item_with_deployment(
  uuid, text, text, text, bigint, date, date, jsonb, text, text
) to authenticated;
