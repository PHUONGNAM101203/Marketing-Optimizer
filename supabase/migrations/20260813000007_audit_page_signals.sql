-- ============================================================================
-- Lưu nguyên trạng RAW từng trang đã quét (PageSignals[]) — cho phép các lượt
-- "Quét lại" sau CỘNG DỒN vào những gì đã quét trước thay vì luôn quét lại
-- đúng phần đầu sitemap và không bao giờ tiến xa hơn với site lớn/chậm.
-- ============================================================================

alter table public.audit_runs add column page_signals jsonb;
