-- ============================================================================
-- M4 (lát đầu tiên) · Số liệu thật theo ngày
--
-- Một hàng = một connection, một ngày. `cost_micros` luôn 0 cho GA4/Search
-- Console (không phải nền tảng quảng cáo) — không suy diễn chi phí từ traffic,
-- để trống thay vì đoán.
-- ============================================================================

create table public.metrics_daily (
  connection_id            uuid not null references public.connections (id) on delete cascade,
  date                     date not null,
  sessions                 bigint not null default 0,
  users                    bigint not null default 0,
  conversions              bigint not null default 0,
  clicks                   bigint not null default 0,
  impressions              bigint not null default 0,
  cost_micros              bigint not null default 0,
  conversion_value_micros  bigint not null default 0,
  synced_at                timestamptz not null default now(),
  primary key (connection_id, date)
);

create index metrics_daily_date_idx on public.metrics_daily (date);

alter table public.metrics_daily enable row level security;

-- Chỉ đọc — chỉ service_role ghi (job đồng bộ, không phải phiên người dùng).
-- Giống connections: thành viên Site đọc được, không ai ghi được qua khoá anon.
create policy "metrics_daily_select_member"
  on public.metrics_daily for select
  to authenticated
  using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and public.is_site_member(c.site_id)
    )
  );
