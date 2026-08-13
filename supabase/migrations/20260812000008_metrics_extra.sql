-- ============================================================================
-- Chỉ số riêng từng nền tảng
--
-- Các cột cố định của metrics_daily (sessions, clicks, cost_micros…) là chỉ
-- số CHUNG, đúng cho web analytics và ads. YouTube không có "sessions" hay
-- "cost" — nó có views, watch time, subscribers. Thêm cột riêng cho từng nền
-- tảng vào bảng chính sẽ phình ra vô hạn; JSONB đúng việc hơn cho phần không
-- chung này, đúng như thiết kế gốc đã tính từ đầu.
-- ============================================================================

alter table public.metrics_daily
  add column extra jsonb not null default '{}'::jsonb;

-- ============================================================================
-- Developer Token của Google Ads
--
-- KHÁC với Client ID/Secret: đây không phải OAuth credential, mà là một mã
-- Google cấp riêng cho MỘT tài khoản MCC sau khi xét duyệt thủ công — không
-- gộp chung được với ô Client ID/Secret sẵn có. Nullable vì tuyệt đại đa số
-- family sẽ không cần: chỉ 'google' + có dùng Google Ads mới cần.
-- ============================================================================
alter table public.site_oauth_apps
  add column developer_token_enc text;

