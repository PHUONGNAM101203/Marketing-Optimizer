-- ============================================================================
-- Ảnh đại diện kênh — lưu MỘT LẦN lúc kết nối, giống `account_name`, không
-- refetch mỗi lần tải trang (khác dữ liệu "Khám phá" như top video, luôn lấy
-- trực tiếp mỗi lần). Chỉ có ý nghĩa với các nền tảng có khái niệm "kênh"
-- (YouTube, TikTok, Instagram, Facebook) — null ở các nền tảng còn lại.
-- ============================================================================

alter table public.connections add column avatar_url text;
