-- ============================================================================
-- Thêm 'merchant-center' vào danh sách nền tảng hợp lệ của `connections`.
--
-- Constraint gốc (20260812000003) chỉ liệt kê 8 nền tảng ban đầu — thêm nền
-- tảng thứ 9 cần nới nó ra, không phải đổi hình dạng bảng.
-- ============================================================================

alter table public.connections
  drop constraint connections_provider_check;

alter table public.connections
  add constraint connections_provider_check check (
    provider in (
      'google-ads', 'ga4', 'gsc', 'gtm', 'youtube', 'merchant-center',
      'meta-ads', 'instagram', 'tiktok'
    )
  );
