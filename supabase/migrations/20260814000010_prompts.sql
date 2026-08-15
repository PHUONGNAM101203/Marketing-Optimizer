-- ============================================================================
-- Prompt Studio · prompts + versions + lịch sử chạy thử
--
-- `variables` nằm trên `prompts`, KHÔNG trên `prompt_versions` — một prompt
-- có nhiều version nhưng cùng một bộ biến khai báo (đổi biến là đổi hợp đồng
-- của prompt, không phải nội dung của một bản). Khớp domain type
-- `PromptTemplate.variables` đã có sẵn từ M-mock, không đổi type đó.
-- ============================================================================

create table public.prompts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  name          text not null,
  description   text not null default '',
  category      text not null check (
    category in ('ad-copy','seo-content','analysis','planning','reporting','email','social','geo')
  ),
  variables     jsonb not null default '[]',
  -- FK sang prompt_versions thêm ở dưới, sau khi bảng đó tồn tại — hai bảng
  -- tham chiếu vòng nhau.
  current_version_id uuid,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index prompts_site_idx on public.prompts (site_id);

create table public.prompt_versions (
  id             uuid primary key default gen_random_uuid(),
  prompt_id      uuid not null references public.prompts (id) on delete cascade,
  version        int not null,
  system_prompt  text not null,
  user_template  text not null,
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (prompt_id, version)
);

alter table public.prompts
  add constraint prompts_current_version_fk
  foreign key (current_version_id) references public.prompt_versions (id) on delete set null;

create table public.prompt_runs (
  id          uuid primary key default gen_random_uuid(),
  prompt_id   uuid not null references public.prompts (id) on delete cascade,
  version_id  uuid not null references public.prompt_versions (id) on delete cascade,
  inputs      jsonb not null default '{}',
  output      text not null,
  model       text not null,
  tokens_in   int not null,
  tokens_out  int not null,
  latency_ms  int not null,
  rating      smallint check (rating between 1 and 5),
  ran_by      uuid references auth.users (id) on delete set null,
  ran_at      timestamptz not null default now()
);

create index prompt_runs_prompt_idx on public.prompt_runs (prompt_id, ran_at desc);

alter table public.prompts enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.prompt_runs enable row level security;

create policy "prompts_select_member"
  on public.prompts for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "prompt_versions_select_member"
  on public.prompt_versions for select
  to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );

create policy "prompt_runs_select_member"
  on public.prompt_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.prompts p
      where p.id = prompt_id and public.is_site_member(p.site_id)
    )
  );
