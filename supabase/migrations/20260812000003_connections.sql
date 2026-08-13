-- ============================================================================
-- M3 (phần đọc) · Kết nối nền tảng
--
-- Đưa lên sớm hơn kế hoạch vì một lý do đúng đắn: nếu không có bảng này, ứng
-- dụng không có cách nào BIẾT một Site đã kết nối gì chưa, nên nó hiển thị dữ
-- liệu mẫu cho cả Site vừa tạo xong. Người dùng nhìn thấy "713 tr ₫ chi phí"
-- trên website họ mới thêm hai giây trước. Đó là nói dối, dù không cố ý.
-- ============================================================================

create type public.connection_status as enum (
  'connected',
  'syncing',
  'expired',
  'error',
  'revoked'
);

create table public.connections (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references public.sites (id) on delete cascade,
  provider            text not null check (
    provider in ('google-ads','ga4','gsc','gtm','youtube','meta-ads','instagram','tiktok')
  ),
  -- ID tài khoản phía nền tảng: customer ID, property ID, ad account ID…
  external_account_id text not null,
  account_name        text not null,
  status              public.connection_status not null default 'syncing',
  scopes              text[] not null default '{}',
  connected_by        uuid references auth.users (id) on delete set null,
  connected_at        timestamptz not null default now(),
  last_synced_at      timestamptz,
  error_code          text,
  error_message       text,
  error_at            timestamptz
);

-- Một tài khoản nền tảng chỉ nối vào một Site một lần.
create unique index connections_site_provider_account_key
  on public.connections (site_id, provider, external_account_id);
create index connections_site_idx on public.connections (site_id);

-- ============================================================================
-- Két token
--
-- Bảng này CỐ TÌNH không có một policy RLS nào.
--
-- RLS bật + không policy = Postgres từ chối mọi thao tác từ vai trò thường.
-- Chỉ `service_role` chạm được. Đây không phải thiếu sót — refresh token của
-- Google Ads và Meta cho phép TIÊU TIỀN QUẢNG CÁO THẬT, nên đường đọc chúng
-- phải hẹp đến mức không thể vô tình mở ra.
--
-- Giá trị lưu vào đây đã được mã hoá AES-256-GCM ở tầng ứng dụng bằng khoá
-- nằm trong biến môi trường. Kẻ tấn công đọc được database vẫn không giải mã
-- được, vì khoá không nằm trong database.
-- ============================================================================

create table public.connection_secrets (
  connection_id       uuid primary key
                        references public.connections (id) on delete cascade,
  access_token_enc    text not null,
  refresh_token_enc   text,
  expires_at          timestamptz,
  updated_at          timestamptz not null default now()
);

alter table public.connections        enable row level security;
alter table public.connection_secrets enable row level security;

-- KHÔNG có policy cho connection_secrets. Đây là chủ đích, đọc kỹ khối trên.

create policy "connections_select_member"
  on public.connections for select
  to authenticated
  using (public.is_site_member(site_id));

create policy "connections_insert_admin"
  on public.connections for insert
  to authenticated
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "connections_update_admin"
  on public.connections for update
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]))
  with check (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));

create policy "connections_delete_admin"
  on public.connections for delete
  to authenticated
  using (public.has_site_role(site_id, array['owner','admin']::public.site_role[]));
