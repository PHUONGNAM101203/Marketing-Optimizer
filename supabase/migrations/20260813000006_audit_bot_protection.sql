-- ============================================================================
-- Cờ báo trang chủ bị chặn bởi hệ thống chống bot (Cloudflare/WAF) trong lượt
-- quét — khi true, điểm số/hồ sơ site tính từ lượt quét đó không đáng tin vì
-- crawler chỉ đọc được màn hình chặn, không phải nội dung thật.
-- ============================================================================

alter table public.audit_runs
  add column blocked_by_bot_protection boolean not null default false;
