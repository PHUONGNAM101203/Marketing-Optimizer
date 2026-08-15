-- ============================================================================
-- Snapshot số liệu bài đăng Facebook/Instagram theo ngày — CÙNG lý do
-- `video_metrics_daily` (xem 20260814000002): Graph API chỉ trả số CỘNG DỒN
-- tại thời điểm gọi (like/comment/share), không có báo cáo lịch sử theo
-- ngày. Muốn biết "tăng nhanh" bắt buộc phải tự lưu lại rồi tự trừ.
--
-- DÙNG CHUNG cho cả `facebook` VÀ `instagram` (khác `video_metrics_daily`
-- chỉ riêng TikTok) — cùng gia đình OAuth `meta`, cùng Graph API, hình dạng
-- bài viết gần như giống hệt nhau, không có lý do tách hai bảng gần trùng
-- lặp. Cột `provider` phân biệt hai nguồn khi đọc.
--
-- Không có cột `views` — khác `video_metrics_daily` — vì cả node bài viết
-- Facebook Page lẫn media Instagram Business đều không lộ số liệu
-- impressions/views ổn định nào qua field cơ bản không cần `read_insights`
-- (quyền này đang TẠM BỎ khỏi OAuth scope, xem `src/lib/providers/meta.ts`).
-- "Top"/"tăng nhanh" cho Facebook/Instagram xếp theo TỔNG ENGAGEMENT
-- (likes/reactions + comments + shares) thay vì views — xem
-- `get_content_trending_snapshots` và `content-trending-types.ts`.
-- ============================================================================

create table public.content_metrics_daily (
  connection_id      uuid not null references public.connections (id) on delete cascade,
  provider           text not null check (provider in ('facebook', 'instagram')),
  external_post_id   text not null,
  date               date not null,
  likes              bigint not null default 0,  -- reactions cho facebook, like_count cho instagram
  comments           bigint not null default 0,
  shares             bigint not null default 0,  -- luôn 0 cho instagram — Graph API không lộ field chia sẻ cho media
  message            text,                        -- nội dung/caption bài viết, đã cắt bớt
  image_url          text,                        -- full_picture (facebook) / media_url (instagram) — miễn phí kèm response, để sẵn cho UI dạng lưới ảnh sau này
  permalink          text,
  synced_at          timestamptz not null default now(),
  primary key (connection_id, external_post_id, date)
);

create index content_metrics_daily_connection_date_idx
  on public.content_metrics_daily (connection_id, date);

alter table public.content_metrics_daily enable row level security;

-- Chỉ đọc — chỉ service_role ghi (job đồng bộ, không phải phiên người dùng),
-- giống hệt policy của video_metrics_daily/metrics_daily.
create policy "content_metrics_daily_select_member"
  on public.content_metrics_daily for select
  to authenticated
  using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and public.is_site_member(c.site_id)
    )
  );
