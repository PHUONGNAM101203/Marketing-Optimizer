-- ============================================================================
-- Thêm `posted_at`/`permalink_url` — thời điểm video THẬT được đăng
-- (`create_time` của TikTok, Unix giây) và link gốc xem trên tiktok.com
-- (`share_url`), KHÁC `date` (ngày snapshot được ghi, đổi mỗi ngày cho cùng
-- một video). Cùng mẫu đã dùng cho `content_metrics_daily` (xem
-- `20260814000008_content_metrics_posted_at.sql`) — video_metrics_daily bị
-- bỏ sót ở migration đầu, giờ bổ sung bằng ALTER thay vì để trống rồi phải
-- backfill sau. Tên/kiểu field đã xác nhận qua tài liệu chính thức TikTok
-- Video Object (`create_time`: int64 Unix epoch giây, `share_url`: string)
-- trước khi thêm cột, tránh đoán sai tên field.
-- ============================================================================

alter table public.video_metrics_daily
  add column posted_at timestamptz,
  add column permalink_url text;
