-- ============================================================================
-- Snapshot số liệu video TikTok theo ngày — TikTok Display API chỉ trả số
-- CỘNG DỒN tại thời điểm gọi (view/like/comment/share), không có báo cáo
-- lịch sử theo ngày như GA4/GSC/YouTube Analytics. Muốn biết "tăng nhanh"
-- (delta theo thời gian) bắt buộc phải tự lưu lại rồi tự trừ.
--
-- Chỉ TikTok dùng bảng này — YouTube gọi thẳng YouTube Analytics API theo
-- khoảng ngày bất kỳ, không cần lưu trữ riêng (xem
-- docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
-- ============================================================================

create table public.video_metrics_daily (
  connection_id      uuid not null references public.connections (id) on delete cascade,
  external_video_id  text not null,
  date               date not null,
  views              bigint not null default 0,
  likes              bigint not null default 0,
  comments           bigint not null default 0,
  shares             bigint not null default 0,
  title              text,
  cover_image_url    text,
  synced_at          timestamptz not null default now(),
  primary key (connection_id, external_video_id, date)
);

create index video_metrics_daily_connection_date_idx
  on public.video_metrics_daily (connection_id, date);

alter table public.video_metrics_daily enable row level security;

-- Chỉ đọc — chỉ service_role ghi (job đồng bộ, không phải phiên người dùng),
-- giống hệt policy của metrics_daily.
create policy "video_metrics_daily_select_member"
  on public.video_metrics_daily for select
  to authenticated
  using (
    exists (
      select 1 from public.connections c
      where c.id = connection_id and public.is_site_member(c.site_id)
    )
  );
