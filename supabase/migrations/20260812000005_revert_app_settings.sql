-- ============================================================================
-- Revert migration 20260812000004_app_settings.sql
--
-- Migration đó dựng mô hình "một cặp Client ID/Secret dùng chung toàn app,
-- người vận hành cấu hình một lần". Sau khi bàn lại, mô hình đúng là MỖI SITE
-- tự khai báo OAuth app riêng của họ — xem 20260812000006_site_oauth_apps.sql.
-- Migration đó đã lỡ chạy lên database thật trước khi bị thay đổi hướng, nên
-- revert bằng một migration mới thay vì sửa/xoá file cũ — sửa một migration
-- đã áp dụng làm lịch sử local và remote lệch nhau.
-- ============================================================================

drop trigger if exists profiles_guard_platform_admin on public.profiles;
drop function if exists public.prevent_platform_admin_self_grant();
drop table if exists public.app_settings;
alter table public.profiles drop column if exists is_platform_admin;
