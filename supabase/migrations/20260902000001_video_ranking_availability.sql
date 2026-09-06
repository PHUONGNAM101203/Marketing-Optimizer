-- ============================================================================
-- Thêm `last_seen_date` cho hai RPC nuôi bảng xếp hạng video
--
-- Vì sao: TikTok thôi liệt kê một video (chủ tài khoản chuyển về nháp, đặt
-- riêng tư, hoặc đã xoá — Display API không có trường trạng thái nên không
-- phân biệt được) thì snapshot cũ vẫn nằm nguyên trong bảng, nên video đó tiếp
-- tục chiếm một dòng trong bảng xếp hạng với ảnh bìa đã chết. Người dùng nhìn
-- vào chỉ thấy một ô trống không giải thích được.
--
-- Đã có `last_seen_date` ở `get_videos_posted_in_range` (migration
-- 20260827000004) cho lưới video; hai hàm này nuôi bảng xếp hạng và còn thiếu.
--
-- `connection_last_seen_date` chốt theo ĐÚNG biên trên mà hàm đang xét, không
-- phải `max(date)` toàn bảng: xem một khoảng ngày trong quá khứ thì mốc so
-- sánh phải là lượt đồng bộ cuối cùng TRONG khoảng đó. Lấy mốc hôm nay sẽ
-- khiến mọi video đều "vắng mặt" và cả bảng biến mất.
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
  baseline_shares bigint,
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
    where connection_id = p_connection_id and date <= p_range_end
  ),
  end_row as (
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
    b.date, b.views, b.likes, b.comments, b.shares,
    e.date as last_seen_date,
    n.day as connection_last_seen_date
  from end_row e
  cross join newest n
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

drop function if exists public.get_video_trending_snapshots(uuid, date[]);

create function public.get_video_trending_snapshots(
  p_connection_id uuid,
  p_cutoffs date[]
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
  posted_at timestamptz,
  permalink_url text,
  latest_date date,
  latest_views bigint,
  latest_likes bigint,
  latest_comments bigint,
  latest_shares bigint,
  earliest_date date,
  earliest_views bigint,
  cutoff0_date date,
  cutoff0_views bigint,
  cutoff1_date date,
  cutoff1_views bigint,
  cutoff2_date date,
  cutoff2_views bigint,
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
  ),
  latest as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares, title, cover_image_url,
      posted_at, permalink_url
    from public.video_metrics_daily
    where connection_id = p_connection_id
    order by external_video_id, date desc
  ),
  earliest as (
    select distinct on (external_video_id)
      external_video_id, date, views
    from public.video_metrics_daily
    where connection_id = p_connection_id
    order by external_video_id, date asc
  ),
  cutoff_rows as (
    select c.idx - 1 as window_index, v.external_video_id, v.date, v.views
    from unnest(p_cutoffs) with ordinality as c(cutoff, idx)
    cross join lateral (
      select distinct on (external_video_id)
        external_video_id, date, views
      from public.video_metrics_daily
      where connection_id = p_connection_id and date <= c.cutoff
      order by external_video_id, date desc
    ) v
  )
  select
    l.external_video_id,
    l.title,
    l.cover_image_url,
    l.posted_at,
    l.permalink_url,
    l.date, l.views, l.likes, l.comments, l.shares,
    e.date, e.views,
    c0.date, c0.views,
    c1.date, c1.views,
    c2.date, c2.views,
    l.date as last_seen_date,
    n.day as connection_last_seen_date
  from latest l
  cross join newest n
  left join earliest e on e.external_video_id = l.external_video_id
  left join cutoff_rows c0 on c0.external_video_id = l.external_video_id and c0.window_index = 0
  left join cutoff_rows c1 on c1.external_video_id = l.external_video_id and c1.window_index = 1
  left join cutoff_rows c2 on c2.external_video_id = l.external_video_id and c2.window_index = 2
$$;

revoke all on function public.get_video_trending_snapshots(uuid, date[]) from public;
grant execute on function public.get_video_trending_snapshots(uuid, date[]) to authenticated;
