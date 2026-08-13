-- ============================================================================
-- YouTube tách thành family OAuth riêng khỏi 'google' — một Site có thể có
-- người quản lý GA4/Search Console khác hẳn người quản lý kênh YouTube, hai
-- tài khoản Google khác nhau, nên cần đăng nhập (và OAuth app) riêng biệt.
-- ============================================================================

alter table public.site_oauth_apps
  drop constraint site_oauth_apps_family_check;

alter table public.site_oauth_apps
  add constraint site_oauth_apps_family_check
  check (family in ('google', 'youtube', 'meta', 'tiktok'));
