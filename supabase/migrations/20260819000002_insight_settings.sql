-- ============================================================================
-- Ngưỡng cảnh báo + trạng thái thao tác cho trang Đề xuất
--
-- Trước đây "Ngưỡng cảnh báo" và nút "Bỏ qua"/"Đưa vào hàng chờ duyệt" đều
-- là nút chết — không có nơi nào lưu lựa chọn của người dùng. Insight tự nó
-- KHÔNG có hàng DB riêng (luôn tính lại từ connections/metrics_daily mỗi lần
-- tải trang, xem site-insights.ts) nhưng `id` của nó ổn định
-- (`anomaly-${connectionId}-${rangeStart}-${kind}`, `broken-${connectionId}`…)
-- nên gắn trạng thái theo `insight_id` dạng text là đủ, không cần đổi kiến
-- trúc "tính lại mỗi lần" đó.
-- ============================================================================

-- Ngưỡng cảnh báo — NULL nghĩa là "dùng mặc định hệ thống", không phải "tắt".
-- Mặc định hệ thống (0.3/0.6/48) vẫn giữ nguyên trong code
-- (site-insights.ts) làm giá trị fallback.
alter table public.sites add column insight_drop_threshold_pct numeric;
alter table public.sites add column insight_critical_drop_threshold_pct numeric;
alter table public.sites add column insight_stale_sync_hours integer;

create table public.insight_actions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  insight_id text not null,
  action text not null check (action in ('dismissed', 'acknowledged')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (site_id, insight_id)
);

alter table public.insight_actions enable row level security;

create policy "insight_actions_select_member"
  on public.insight_actions for select
  to authenticated
  using (public.is_site_member(site_id));

-- Bỏ qua/đưa vào hàng chờ là thao tác dùng hàng ngày (không phải cấu hình
-- site), gate ở mức thành viên — khớp `prompt_runs_insert_member`
-- (20260814000012_prompts_agents_write_policies.sql).
create policy "insight_actions_insert_member"
  on public.insight_actions for insert
  to authenticated
  with check (public.is_site_member(site_id));

create policy "insight_actions_update_member"
  on public.insight_actions for update
  to authenticated
  using (public.is_site_member(site_id))
  with check (public.is_site_member(site_id));

-- Cần cho luồng "Khôi phục" — bỏ dismissed/acknowledged để insight quay lại
-- hiện bình thường ở lần tải trang sau.
create policy "insight_actions_delete_member"
  on public.insight_actions for delete
  to authenticated
  using (public.is_site_member(site_id));
