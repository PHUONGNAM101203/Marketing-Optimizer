-- ============================================================================
-- RPC lấy số liệu TikTok "trong khoảng ngày đang chọn" từ chính snapshot đã
-- lưu (`video_metrics_daily`), thay vì lọc theo `create_time` trên 20 video
-- gần nhất từ Display API (`fetchTiktokContentExplore`) — cách cũ trả rỗng
-- cho MỌI tài khoản có video cũ hơn 20-video-gần-nhất dù video đó vẫn còn
-- tương tác trong khoảng ngày đã chọn, vì lọc theo NGÀY ĐĂNG chứ không phải
-- "có hoạt động trong khoảng ngày" (xem
-- src/lib/data/video-trending.ts, hàm `getTiktokVideoRangeStats`).
--
-- Trả về, MỖI VIDEO một dòng: snapshot mới nhất tính đến hết `p_range_end`
-- ("end"), và snapshot mới nhất TRƯỚC `p_range_start` ("baseline", có thể
-- null nếu video chưa được theo dõi trước khoảng ngày đó). Phía TypeScript
-- tự trừ end - baseline để ra "tăng trưởng trong khoảng" — cùng nguyên tắc
-- cộng dồn `get_video_trending_snapshots` đã dùng, chỉ khác tham số là một
-- cặp ngày tuỳ ý thay vì 3 mốc cắt cố định tuần/tháng/năm.
--
-- SECURITY INVOKER (mặc định, khai báo tường minh) + `set search_path = ''`
-- theo đúng quy ước bảo mật chung của repo (xem
-- `20260812000001_init_auth_and_sites.sql`) — policy
-- `video_metrics_daily_select_member` vẫn tự áp dụng như một SELECT trực
-- tiếp. `revoke`/`grant` tường minh theo đúng quy ước mọi hàm khác dùng.
-- ============================================================================

create function public.get_video_range_snapshots(
  p_connection_id uuid,
  p_range_start date,
  p_range_end date
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
  end_date date,
  end_views bigint,
  end_likes bigint,
  end_comments bigint,
  end_shares bigint,
  baseline_date date,
  baseline_views bigint,
  baseline_likes bigint,
  baseline_comments bigint,
  baseline_shares bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with end_row as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares, title, cover_image_url
    from public.video_metrics_daily
    where connection_id = p_connection_id and date <= p_range_end
    order by external_video_id, date desc
  ),
  baseline_row as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares
    from public.video_metrics_daily
    where connection_id = p_connection_id and date < p_range_start
    order by external_video_id, date desc
  )
  select
    e.external_video_id,
    e.title,
    e.cover_image_url,
    e.date, e.views, e.likes, e.comments, e.shares,
    b.date, b.views, b.likes, b.comments, b.shares
  from end_row e
  left join baseline_row b on b.external_video_id = e.external_video_id
$$;

revoke all on function public.get_video_range_snapshots(uuid, date, date) from public;
grant execute on function public.get_video_range_snapshots(uuid, date, date) to authenticated;
