-- ============================================================================
-- Kiểm tra SEO/GEO/AIO — một lần quét toàn site
--
-- Một hàng = một lượt quét. Ghi ĐIỂM + DANH SÁCH PHÁT HIỆN (jsonb) của cả ba
-- hạng mục trong CÙNG một hàng thay vì ba bảng riêng — cả ba luôn đọc/hiện
-- cùng lúc trên một trang (ba tab của cùng một lượt quét), tách bảng chỉ tổ
-- phải JOIN lại mỗi lần đọc mà không được lợi gì.
--
-- Quét chạy trong chính server action (chưa có hàng đợi job nền) nên luôn
-- đồng bộ — status 'running' chỉ tồn tại trong lúc request đang xử lý, không
-- phải trạng thái chờ lâu dài như `connections.status = 'syncing'`.
-- ============================================================================

create table public.audit_runs (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  status         text not null default 'running' check (status in ('running', 'completed', 'failed')),
  pages_scanned  integer not null default 0,
  seo_score      integer check (seo_score between 0 and 100),
  geo_score      integer check (geo_score between 0 and 100),
  aio_score      integer check (aio_score between 0 and 100),
  -- Mảng { id, category, status, title, description, fix, evidence, heuristic }.
  findings       jsonb not null default '[]'::jsonb,
  error          text,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  started_by     uuid references auth.users (id) on delete set null
);

create index audit_runs_site_idx on public.audit_runs (site_id, started_at desc);

alter table public.audit_runs enable row level security;

-- Chỉ đọc qua vai trò thường — server action ghi bằng service_role (giống
-- metrics_daily), vì quét chạy trong tiến trình server, không phải một lệnh
-- ghi trực tiếp từ form người dùng.
create policy "audit_runs_select_member"
  on public.audit_runs for select
  to authenticated
  using (public.is_site_member(site_id));
