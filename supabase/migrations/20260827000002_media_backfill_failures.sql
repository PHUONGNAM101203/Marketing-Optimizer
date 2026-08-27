-- ============================================================================
-- `media_backfill_failures` — nhớ những ảnh đã thử chép mà không được
--
-- Vì sao cần: việc chép bù chọn ảnh theo thứ tự cố định (video mới nhất trước).
-- Ảnh chép được thì tự rời danh sách chờ vì URL trong bảng đã thành URL nội bộ.
-- Ảnh KHÔNG chép được thì URL giữ nguyên, nên lượt sau lại chọn đúng nó, và nó
-- lại hỏng. Không có bảng này thì sau một hai lượt, toàn bộ hạn mức mỗi lượt bị
-- những ảnh chết chiếm giữ vĩnh viễn và phần đuôi không bao giờ tới lượt.
--
-- Vì sao vẫn thử lại vài lần chứ không loại ngay: một lượt tải hỏng không chắc
-- là ảnh đã chết — có thể quá giờ chờ, CDN chập chờn, hoặc mạng lỗi. Chỉ khi
-- hỏng liên tiếp `MEDIA_BACKFILL_MAX_ATTEMPTS` lần mới coi là mất hẳn.
--
-- Vì sao không đơn giản xoá URL đã chết đi: một lỗi tạm thời sẽ xoá vĩnh viễn
-- một URL vẫn còn dùng được, và mất luôn khả năng thử lại. Ghi riêng lần thử
-- hỏng không đụng gì tới dữ liệu gốc.
-- ============================================================================

create table if not exists public.media_backfill_failures (
  -- 'video' | 'post' — hai bảng nguồn khác nhau có thể trùng ID, nên khoá phải
  -- gồm cả loại.
  kind text not null,
  external_id text not null,
  attempts integer not null default 1,
  last_attempt_at timestamptz not null default now(),
  primary key (kind, external_id)
);

alter table public.media_backfill_failures enable row level security;

-- Không policy nào cho bất kỳ vai trò nào: bảng này chỉ do cron ghi và đọc, mà
-- cron luôn dùng `service_role` (xem `createAdminClient`) vốn bỏ qua RLS. Không
-- có gì trong đây cần hiển thị cho người dùng, đúng khuôn `connection_secrets`.

comment on table public.media_backfill_failures is
  'Ảnh thumbnail đã thử chép về Storage mà hỏng. Chặn việc thử lại vô hạn những link CDN đã hết hạn — xem migration 20260827000002.';
