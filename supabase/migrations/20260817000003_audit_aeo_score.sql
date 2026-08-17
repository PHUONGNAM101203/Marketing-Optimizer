-- ============================================================================
-- Thêm điểm AEO (Answer Engine Optimization) song song seo_score/geo_score/
-- aio_score đã có — hạng mục thứ 4, độc lập, đo nội dung có được cấu trúc để
-- bị trích nguyên văn làm câu trả lời không (FAQ, trả lời trực tiếp, HowTo,
-- Speakable, heading dạng câu hỏi). Xem
-- docs/superpowers/specs/2026-08-17-aeo-audit-category-design.md và
-- src/lib/audit/rules/aeo.ts.
--
-- `null` mặc định (cùng kiểu 3 cột điểm kia) — audit_runs đã có TRƯỚC
-- migration này đọc lại sẽ ra `aeo_score: null`, UI tự hiện đúng trạng thái
-- "chưa có dữ liệu" dựa trên `findings.length === 0` của category 'aeo'
-- (không có finding nào category đó vì luật AEO chưa tồn tại lúc quét) —
-- không cần logic phân biệt gì thêm ở tầng dữ liệu.
-- ============================================================================

alter table public.audit_runs add column aeo_score integer null check (aeo_score between 0 and 100);
