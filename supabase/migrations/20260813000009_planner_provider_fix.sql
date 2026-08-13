-- `plan_items.provider` bị thiếu 'merchant-center' khỏi danh sách hợp lệ ở
-- migration trước (20260813000008) — copy nguyên danh sách cũ của
-- `connections` trước khi `connections` được cập nhật thêm merchant-center
-- (20260813000001). `PROVIDERS` ở lib/domain/providers.ts hiện có 9 giá trị,
-- check constraint phải khớp đúng 9, không phải 8.
alter table public.plan_items
  drop constraint plan_items_provider_check;

alter table public.plan_items
  add constraint plan_items_provider_check check (
    provider in (
      'google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'merchant-center', 'meta-ads', 'instagram', 'tiktok'
    )
  );
