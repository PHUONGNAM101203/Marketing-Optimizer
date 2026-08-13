-- ============================================================================
-- Hồ sơ website (lĩnh vực/chủ đề, ước tính bằng từ khoá — nền cho tính năng
-- AI tự phát hiện sâu hơn sau này) và PageSpeed Insights — tính CÙNG một lượt
-- quét SEO/GEO/AIO, không quét/gọi API thêm lần nào riêng.
-- ============================================================================

alter table public.audit_runs add column site_profile jsonb;
alter table public.audit_runs add column pagespeed jsonb;

-- PageSpeed Insights API key — CÙNG kiểu bí mật với developer_token_enc
-- (mã riêng cho một mục đích, không phải OAuth Client ID/Secret dùng chung),
-- nên đặt cùng bảng `site_oauth_apps`, gia đình 'google'.
alter table public.site_oauth_apps add column pagespeed_api_key_enc text;
