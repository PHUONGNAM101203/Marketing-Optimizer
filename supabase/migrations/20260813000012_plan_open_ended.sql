-- ============================================================================
-- Kế hoạch cho phép KHÔNG có ngày kết thúc lúc tạo — chỉ cần biết bắt đầu khi
-- nào để lên lịch. Đóng/kết thúc kế hoạch là một hành động SỬA sau này (xem
-- `updatePlanPeriodAction`), không phải điều kiện bắt buộc lúc tạo mới.
--
-- Constraint `check (period_end > period_start)` giữ nguyên, KHÔNG cần đổi —
-- Postgres coi biểu thức so sánh với NULL là NULL (không phải FALSE), CHECK
-- constraint chỉ chặn khi kết quả là FALSE, nên period_end = NULL luôn qua.
-- ============================================================================

alter table public.plans
  alter column period_end drop not null;
