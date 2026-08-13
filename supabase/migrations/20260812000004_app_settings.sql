-- ============================================================================
-- Cấu hình hệ thống nhập qua web
--
-- Client ID/Secret của OAuth Google (và sau này Meta/TikTok) là MỘT cặp cho
-- cả app, không phải mỗi người dùng một cặp — người dùng cuối bấm "Kết nối
-- Google" và không bao giờ nhìn thấy hai giá trị này. Chỉ người vận hành app
-- mới nhập chúng, và họ cần nhập qua web thay vì sửa file .env.local — nhiều
-- người vận hành không rành việc sửa file trên server.
--
-- `.env.local`/biến môi trường Vercel không phù hợp cho việc này: Vercel
-- production không có ổ đĩa ghi được lúc chạy, và Next.js không nạp lại
-- .env.local sau khi server đã khởi động. Nên bảng này thay thế vai trò đó.
-- ============================================================================

-- ─── is_platform_admin ────────────────────────────────────────────────────
--
-- Ai được sửa app_settings. Đây KHÔNG phải site_role — nó không gắn với một
-- Site nào, mà là quyền vận hành toàn app.
alter table public.profiles
  add column is_platform_admin boolean not null default false;

-- Chặn tự phong: policy "profiles_update_own" (migration 001) cho phép người
-- dùng sửa MỌI cột trên chính hàng profile của họ, kể cả is_platform_admin
-- nếu không có gì ngăn — một người dùng bình thường gọi UPDATE qua khoá anon
-- sẽ tự cấp quyền admin cho chính mình. Trigger này đóng đúng lỗ hổng đó:
-- chỉ chặn khi request đến từ vai trò "authenticated" (tức là qua API bằng
-- phiên người dùng thường); request chạy trực tiếp bằng migration hoặc bằng
-- service_role thì auth.role() không phải 'authenticated' nên đi qua được.
create or replace function public.prevent_platform_admin_self_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and auth.role() = 'authenticated' then
    raise exception 'is_platform_admin chỉ đổi được bằng service_role';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_platform_admin
  before update on public.profiles
  for each row
  execute function public.prevent_platform_admin_self_grant();

-- ─── app_settings ───────────────────────────────────────────────────────
--
-- Két giống hệt connection_secrets: RLS bật, CỐ TÌNH không có policy nào.
-- Chỉ service_role chạm được. Ai được phép GHI qua giao diện web do Server
-- Action tự kiểm tra is_platform_admin trước khi dùng client service_role —
-- không có policy nào giả vờ mở hé cho vai trò "authenticated" cả.
create table public.app_settings (
  key         text primary key,
  value_enc   text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table public.app_settings enable row level security;

-- KHÔNG có policy cho app_settings. Đọc kỹ khối trên trước khi thêm một cái.

-- ─── Cấp quyền lần đầu ─────────────────────────────────────────────────────
--
-- Ai đó phải là platform admin đầu tiên để còn vào /system-settings cấp
-- quyền cho người khác về sau. Gán trực tiếp bằng migration, không qua API.
update public.profiles
set is_platform_admin = true
where id = (select id from auth.users where email = 'ginanhluong@gmail.com');
