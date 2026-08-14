-- ============================================================================
-- Agents · cấu hình, lịch sử chạy, hành động chờ duyệt
--
-- BẤT BIẾN AN TOÀN (xem src/lib/domain/agent.ts): agent chỉ tự chạy tool ĐỌC.
-- Tool GHI luôn dừng ở một hàng `pending_actions` — không có đường nào trong
-- schema này cho phép một run tự đổi trạng thái pending_actions.decision
-- ngoài qua service_role (tức là qua Server Action có xác thực người duyệt).
-- ============================================================================

create table public.agents (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  role         text not null check (
    role in ('ads-optimizer','seo-analyst','content-planner','report-writer','ai-visibility-tracker','anomaly-watcher')
  ),
  name         text not null,
  description  text not null default '',
  prompt_id    uuid not null references public.prompts (id) on delete restrict,
  tools        jsonb not null default '[]',
  schedule     jsonb,
  enabled      boolean not null default true,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index agents_site_idx on public.agents (site_id);

create table public.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references public.agents (id) on delete cascade,
  site_id      uuid not null references public.sites (id) on delete cascade,
  status       text not null check (
    status in ('queued','running','pending-approval','succeeded','failed','cancelled','rejected')
  ),
  trigger      text not null check (trigger in ('schedule','manual','event')),
  steps        jsonb not null default '[]',
  -- Dùng CHUNG cột này cho cả bản tóm tắt lúc thành công LẪN thông báo lỗi
  -- lúc thất bại — domain type `AgentRun` chỉ có `summary`, không có cột lỗi
  -- riêng, cố tình không đổi type đó ở đây.
  summary      text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  tokens_used  int
);

create index agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);
create index agent_runs_site_idx on public.agent_runs (site_id, started_at desc);

create table public.pending_actions (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.agent_runs (id) on delete cascade,
  tool               text not null check (
    tool in ('apply-budget-change','pause-campaign','resume-campaign','update-ad-copy','add-negative-keyword','publish-report')
  ),
  action_kind        text not null,
  provider           text not null check (
    provider in ('google-ads','ga4','gsc','gtm','youtube','meta-ads','instagram','tiktok')
  ),
  target_entity_id   text not null,
  target_entity_name text not null,
  summary            text not null,
  diff               jsonb not null default '[]',
  rationale          text not null,
  decided_by         uuid references auth.users (id) on delete set null,
  decided_at         timestamptz,
  decision           text check (decision in ('approved','rejected')),
  created_at         timestamptz not null default now()
);

create index pending_actions_run_idx on public.pending_actions (run_id);

alter table public.agents enable row level security;
alter table public.agent_runs enable row level security;
alter table public.pending_actions enable row level security;

create policy "agents_select_member"
  on public.agents for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "agent_runs_select_member"
  on public.agent_runs for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "pending_actions_select_member"
  on public.pending_actions for select
  to authenticated
  using (
    exists (
      select 1 from public.agent_runs r
      where r.id = run_id and public.is_site_member(r.site_id)
    )
  );
