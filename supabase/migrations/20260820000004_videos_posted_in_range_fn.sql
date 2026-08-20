-- ============================================================================
-- RPC mới cho tab "Tổng quan" của TikTok — trả về TOÀN BỘ video có `posted_at`
-- (ngày đăng thật, cột thêm ở 20260820000001) rơi vào đúng khoảng ngày đang
-- chọn, sắp theo `posted_at` GIẢM DẦN (video mới nhất trước, đủ độ chính xác
-- giờ:phút:giây — không cắt về `date`). Thay hẳn `fetchTiktokContentExplore`
-- (Display API sống, chỉ trả 20 video ĐĂNG GẦN NHẤT bất kể khoảng ngày chọn)
-- cho riêng tab này — đọc thẳng `video_metrics_daily` (đã có TOÀN BỘ video
-- account nhờ `fetchAllTiktokVideos` phân trang hết, không giới hạn 20), vừa
-- đúng khoảng ngày người dùng chọn vừa không cần gọi mạng sống mỗi lần đổi
-- khoảng ngày (trang Explore ở `site-explore.ts` vẫn dùng
-- `fetchTiktokContentExplore` — KHÔNG đụng tới, đó là tính năng khác).
--
-- Không tính tăng trưởng/baseline gì cả (khác `get_video_range_snapshots`) —
-- chỉ cần trạng thái MỚI NHẤT của mỗi video thoả điều kiện ngày đăng, nên đơn
-- giản hơn nhiều, không phụ thuộc độ sâu lịch sử snapshot.
-- ============================================================================

create function public.get_videos_posted_in_range(
  p_connection_id uuid,
  p_range_start date,
  p_range_end date
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
  posted_at timestamptz,
  permalink_url text,
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from (
    select distinct on (external_video_id)
      external_video_id, title, cover_image_url, posted_at, permalink_url,
      views, likes, comments, shares
    from public.video_metrics_daily
    where connection_id = p_connection_id
      and posted_at is not null
      and posted_at::date >= p_range_start
      and posted_at::date <= p_range_end
    order by external_video_id, date desc
  ) latest
  order by posted_at desc
$$;

revoke all on function public.get_videos_posted_in_range(uuid, date, date) from public;
grant execute on function public.get_videos_posted_in_range(uuid, date, date) to authenticated;
