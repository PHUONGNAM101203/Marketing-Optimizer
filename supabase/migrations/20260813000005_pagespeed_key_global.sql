-- ============================================================================
-- PageSpeed Insights API key chuyển từ "mỗi Site tự nhập" sang "một key cấu
-- hình chung toàn hệ thống" (biến môi trường PAGESPEED_API_KEY) — PSI không
-- đọc dữ liệu riêng của ai, chỉ quét URL công khai, nên không có lý do bắt
-- mỗi Site tự xin một key riêng. Cột này chưa từng được ghi giá trị nào.
-- ============================================================================

alter table public.site_oauth_apps drop column pagespeed_api_key_enc;
