-- ============================================================================
-- Ứng viên GA4/Search Console/Tag Manager chưa được người dùng xác nhận
--
-- `discoverGoogleAccounts` lọc CỨNG theo domain (xem `google-discovery.ts`) —
-- đúng đa số trường hợp, nhưng khi KHÔNG khớp gì cả (property GA4 đặt tên
-- trùng thương hiệu nhưng data stream trỏ domain khác, site Search Console
-- chưa verify đúng property…), OAuth callback trước đây THẢ LUÔN token vừa
-- lấy được và báo lỗi chung chung "không thấy tài sản nào" — người dùng
-- không có cách nào tự chọn đúng tài sản trong số những cái access token đó
-- THẬT SỰ nhìn thấy được.
--
-- Bảng này giữ tạm token + danh sách ứng viên (không lọc domain) ngay tại
-- callback, để trang Kết nối hiện một bước "chọn đúng cái" thay vì bắt người
-- dùng cấp quyền lại từ đầu và hy vọng lần này khớp. Một khi người dùng xác
-- nhận một ứng viên, nó chuyển thành `connections` + `connection_secrets`
-- thật và hàng pending bị xoá.
-- ============================================================================

create table public.pending_google_connections (
  id                    uuid primary key default gen_random_uuid(),
  site_id               uuid not null references public.sites (id) on delete cascade,
  provider              text not null check (provider in ('ga4', 'gsc', 'gtm')),
  external_account_id   text not null,
  account_name          text not null,
  -- Ngữ cảnh giúp người dùng chọn đúng — vd. domain thật của data stream GA4
  -- ("Luồng web: mysite.com") hoặc cảnh báo ("Chưa có luồng web nào").
  -- NULL khi bản thân account_name/external_account_id đã đủ rõ (Search
  -- Console: external_account_id chính là site URL).
  detail                text,
  access_token_enc      text not null,
  refresh_token_enc     text,
  expires_at            timestamptz,
  scopes                text[] not null default '{}',
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now()
);

create index pending_google_connections_site_idx
  on public.pending_google_connections (site_id);

alter table public.pending_google_connections enable row level security;

-- KHÔNG có policy nào — cùng lý do với `connection_secrets` (xem
-- `20260812000003_connections.sql`): bảng này chứa token mã hoá, chỉ
-- `service_role` chạm được. Trang Kết nối đọc bảng này bằng admin client,
-- dựa vào việc `getSite()` (RLS session client) đã xác nhận thành viên
-- trước đó trong CÙNG request — không tự ý mở select cho `authenticated`
-- chỉ để tiện đọc, giữ đúng nguyên tắc "hẹp đến mức không thể vô tình mở ra".
