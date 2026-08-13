-- ============================================================================
-- Thêm 'facebook' (nội dung hữu cơ Facebook Page — khác 'meta-ads') vào danh
-- sách nền tảng hợp lệ của `connections` và `plan_items`. `PROVIDERS` ở
-- lib/domain/providers.ts hiện có 10 giá trị, cả hai check constraint phải
-- khớp đúng 10 — cùng mẫu đã làm khi thêm 'merchant-center'.
-- ============================================================================

alter table public.connections
  drop constraint connections_provider_check;

alter table public.connections
  add constraint connections_provider_check check (
    provider in (
      'google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'merchant-center',
      'meta-ads', 'instagram', 'tiktok', 'facebook'
    )
  );

alter table public.plan_items
  drop constraint plan_items_provider_check;

alter table public.plan_items
  add constraint plan_items_provider_check check (
    provider in (
      'google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'merchant-center',
      'meta-ads', 'instagram', 'tiktok', 'facebook'
    )
  );
