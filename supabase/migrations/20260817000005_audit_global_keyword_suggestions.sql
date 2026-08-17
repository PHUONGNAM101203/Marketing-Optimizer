-- ============================================================================
-- 10 câu hỏi/từ khoá phổ biến TOÀN CẦU theo chủ đề site, sinh bởi AI mỗi lần
-- quét — xem docs/superpowers/specs/2026-08-17-ai-citation-check-design.md
-- và src/lib/audit/global-suggestions.ts. Thay thế nội dung mục "Gợi ý theo
-- chủ đề" trên /ai-visibility (trước đó 100% sinh từ mẫu câu tĩnh).
--
-- Mảng đối tượng `{text, intent}` — cùng hình dạng `PromptSuggestion`
-- (src/lib/audit/prompt-suggestions.ts). Mặc định `[]` (không phải `null`)
-- vì luôn tính được ít nhất fallback template khi có `site_profile.category`
-- — chỉ đúng nghĩa "rỗng" khi audit chưa từng chạy, giống các trường jsonb
-- khác của bảng này (`findings`, `page_citability`).
-- ============================================================================

alter table public.audit_runs
  add column global_keyword_suggestions jsonb not null default '[]'::jsonb;
