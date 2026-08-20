-- ============================================================================
-- `get_video_range_snapshots` coi baseline vắng mặt (không có snapshot nào
-- TRƯỚC `p_range_start`) là 0 một cách VÔ ĐIỀU KIỆN — đúng khi video THẬT SỰ
-- được đăng trong khoảng đã chọn (baseline = 0 là chính xác, video chưa tồn
-- tại trước đó), nhưng SAI khi video đã tồn tại từ trước mà lịch sử snapshot
-- chỉ đơn giản là chưa đủ sâu — khi đó "tăng trưởng trong khoảng" bị lộ ra
-- là tổng cộng dồn từ lúc bắt đầu theo dõi, giống hệt nhau cho MỌI khoảng
-- ngày (7/28/90 ngày) dù dữ liệu thật khác nhau — người dùng phát hiện qua
-- ảnh chụp màn hình cho thấy đúng vấn đề này.
--
-- Giờ có `posted_at` (thêm ở 20260820000001) để phân biệt rạch ròi hai
-- trường hợp: chỉ giữ lại một dòng khi (a) có baseline THẬT (đáng tin, dùng
-- công thức end-baseline như cũ) HOẶC (b) không có baseline nhưng `posted_at`
-- rơi đúng vào khoảng đã chọn (baseline=0 là chính xác, không phải lỗ hổng
-- dữ liệu). Video không thoả điều kiện nào (đã tồn tại trước khoảng chọn mà
-- không có baseline) bị LOẠI HẲN khỏi kết quả — thà trả về danh sách rỗng
-- (UI hiện trạng thái "đang thu thập dữ liệu") còn hơn số liệu trông như
-- đúng nhưng thực ra là tổng cộng dồn nguỵ trang thành "trong khoảng ngày".
-- ============================================================================

drop function if exists public.get_video_range_snapshots(uuid, date, date);

create function public.get_video_range_snapshots(
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
      external_video_id, date, views, likes, comments, shares, title, cover_image_url,
      posted_at, permalink_url
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
    e.posted_at,
    e.permalink_url,
    e.date, e.views, e.likes, e.comments, e.shares,
    b.date, b.views, b.likes, b.comments, b.shares
  from end_row e
  left join baseline_row b on b.external_video_id = e.external_video_id
  where
    -- (a) có baseline thật trước khoảng chọn — công thức end-baseline đáng tin.
    b.external_video_id is not null
    -- (b) không có baseline, nhưng biết chắc video sinh ra TRONG khoảng chọn
    -- (baseline=0 đúng về mặt logic, không phải lỗ hổng lịch sử snapshot).
    or (e.posted_at is not null
        and e.posted_at::date >= p_range_start
        and e.posted_at::date <= p_range_end)
$$;

revoke all on function public.get_video_range_snapshots(uuid, date, date) from public;
grant execute on function public.get_video_range_snapshots(uuid, date, date) to authenticated;
