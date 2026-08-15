-- ============================================================================
-- Thêm `posted_at` — thời điểm bài đăng THẬT được tạo (`created_time` của
-- Facebook post / `timestamp` của Instagram media), KHÁC `date` (ngày snapshot
-- được ghi, đổi mỗi ngày cho cùng một bài). Bỏ sót ở migration đầu
-- (20260814000006) — nhớ ra khi đối chiếu lại contract `ContentSummary.createdAt`
-- đã chốt với phía UI, cần trước khi bất kỳ hàng nào được ghi thật nên sửa
-- ngay bằng ALTER thay vì để trống rồi phải backfill sau.
-- ============================================================================

alter table public.content_metrics_daily
  add column posted_at timestamptz;
