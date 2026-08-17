-- ============================================================================
-- Prompt mẫu dùng được ngay (Prompt Studio) và gợi ý agent nên bật (Agents),
-- cả hai sinh bởi AI theo đúng chủ đề sản phẩm/dịch vụ site — cùng vòng đời
-- `global_keyword_suggestions` (tính một lần mỗi lượt quét audit). Xem
-- src/lib/audit/prompt-template-suggestions.ts và
-- src/lib/audit/agent-suggestions.ts.
--
-- Hình dạng lưu: `{source: 'ai'|'template', templates/suggestions: [...]}` —
-- không phải mảng phẳng như `global_keyword_suggestions` bản đầu (đã sửa
-- cùng đợt này, xem migration đó) — UI đọc `source` để không claim "AI sinh"
-- cho nội dung fallback.
-- ============================================================================

alter table public.audit_runs
  add column prompt_template_suggestions jsonb not null default '{"source":"template","templates":[]}'::jsonb,
  add column agent_role_suggestions jsonb not null default '{"source":"template","suggestions":[]}'::jsonb;
