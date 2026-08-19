-- ============================================================================
-- Thêm 'klaviyo' vào danh sách nền tảng hợp lệ của `connections`/`plan_items`
-- — cùng mẫu đã làm khi thêm 'merchant-center'/'facebook'. `PROVIDERS` ở
-- lib/domain/providers.ts giờ có 11 giá trị, cả hai check constraint phải
-- khớp đúng 11.
--
-- Klaviyo KHÁC 10 nền tảng còn lại: xác thực bằng private API key dán trực
-- tiếp, không phải OAuth — không cần `oauth_apps`/`site_oauth_apps`, key mã
-- hoá lưu thẳng vào `connection_secrets.access_token_enc` (đã nullable sẵn
-- `refresh_token_enc`/`expires_at`, đúng shape cho một key không hết hạn,
-- không cần refresh).
-- ============================================================================

alter table public.connections
  drop constraint connections_provider_check;

alter table public.connections
  add constraint connections_provider_check check (
    provider in (
      'google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'merchant-center',
      'meta-ads', 'instagram', 'tiktok', 'facebook', 'klaviyo'
    )
  );

alter table public.plan_items
  drop constraint plan_items_provider_check;

alter table public.plan_items
  add constraint plan_items_provider_check check (
    provider in (
      'google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'merchant-center',
      'meta-ads', 'instagram', 'tiktok', 'facebook', 'klaviyo'
    )
  );
