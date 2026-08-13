-- ============================================================================
-- Thêm quốc gia mục tiêu của site — cùng nguồn sự thật với currency/timezone
-- (khoá của TLD_MARKET ở src/lib/audit/market-detection.ts), để dropdown
-- "Quốc gia" ở Sửa thông tin website tự set đúng currency/timezone khớp
-- nhau. Chỉ mang tính hiển thị/tiện chọn nhanh — currency/timezone vẫn là
-- hai cột thật sự dùng để tính toán số liệu, `country` để NULL không chặn gì.
-- ============================================================================

alter table public.sites
  add column country text;
