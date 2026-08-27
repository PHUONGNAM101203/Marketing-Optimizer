-- ============================================================================
-- Thêm cột `last_seen_date` vào `get_videos_posted_in_range`
--
-- Vì sao cần: ngày 27/8/2026 danh sách video của một tài khoản tụt từ 109
-- xuống 101 trong MỘT ngày. Máy đo đặt trong vòng phân trang cho thấy chính
-- TikTok trả `has_more=false` sau 6 trang — app đã lấy tới hết, không dừng
-- sớm. Tức 8 video đó đã bị TikTok thôi liệt kê (chủ tài khoản chuyển về nháp,
-- đặt riêng tư, hoặc đã xoá — Display API KHÔNG có trường trạng thái nên không
-- phân biệt được ba trường hợp này).
--
-- Hệ quả trên giao diện: video vẫn hiện (snapshot cũ còn nguyên) nhưng ảnh bìa
-- chết dần và không xin lại được link mới, nên người dùng thấy một ô trống
-- không lời giải thích — trông hệt như app hỏng.
--
-- `last_seen_date` là ngày snapshot cuối cùng mà TikTok còn trả về video đó.
-- So với ngày snapshot mới nhất của CẢ connection là biết ngay video còn được
-- liệt kê hay không. So ở phía đọc chứ không chốt cứng một cờ boolean ở đây:
-- một lượt đồng bộ hỏng giữa chừng có thể làm mọi video "vắng mặt" một ngày,
-- và nơi gọi cần tự quyết định ngưỡng bao nhiêu ngày thì mới coi là mất.
-- ============================================================================

drop function if exists public.get_videos_posted_in_range(uuid, date, date);

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
  shares bigint,
  last_seen_date date,
  connection_last_seen_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with newest as (
    select max(date) as day
    from public.video_metrics_daily
    where connection_id = p_connection_id
  )
  select
    latest.external_video_id, latest.title, latest.cover_image_url, latest.posted_at,
    latest.permalink_url, latest.views, latest.likes, latest.comments, latest.shares,
    latest.date as last_seen_date,
    newest.day as connection_last_seen_date
  from (
    select distinct on (external_video_id)
      external_video_id, title, cover_image_url, posted_at, permalink_url,
      views, likes, comments, shares, date
    from public.video_metrics_daily
    where connection_id = p_connection_id
      and posted_at is not null
      and posted_at::date >= p_range_start
      and posted_at::date <= p_range_end
    order by external_video_id, date desc
  ) latest
  cross join newest
  order by latest.posted_at desc
$$;

revoke all on function public.get_videos_posted_in_range(uuid, date, date) from public;
grant execute on function public.get_videos_posted_in_range(uuid, date, date) to authenticated;
