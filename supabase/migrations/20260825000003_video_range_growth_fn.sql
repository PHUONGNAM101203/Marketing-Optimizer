-- ============================================================================
-- `get_video_range_growth` — video tăng nhanh TRONG một khoảng ngày
--
-- Vì sao không dùng lại `get_video_range_snapshots`: hàm đó lấy mốc đầu là
-- snapshot mới nhất TRƯỚC `p_range_start`, và trả `baseline_* = null` khi
-- không có. Đúng cho việc nó sinh ra (tăng trưởng trong khoảng, phần trước
-- khoảng phải bị trừ đi), nhưng vô dụng cho bảng "tăng nhanh": app mới bắt
-- đầu chụp snapshot TikTok từ 13/8/2026, nên MỌI khoảng bắt đầu trước ngày đó
-- đều không có mốc trước — kể cả "01/08 – 26/08". Đo thật trên production:
-- 10 video trong khoảng tháng 8, `baseline_views` null cả 10.
--
-- Ở đây mốc đầu là snapshot mới nhất trước khoảng NẾU CÓ, không thì snapshot
-- SỚM NHẤT TRONG khoảng. Nói đúng bản chất: "tăng trưởng quan sát được trong
-- khoảng này, với dữ liệu đang có". Video chỉ có đúng một snapshot trong
-- khoảng sẽ ra mốc đầu = mốc cuối, tăng trưởng 0, và bị phía TypeScript loại —
-- đúng, vì một điểm đo thì không suy ra được tăng trưởng nào.
--
-- KHÔNG sửa `get_video_range_snapshots` tại chỗ: `getTiktokVideoRangeStats` và
-- bảng so sánh hai khoảng đang dựa vào đúng ngữ nghĩa "trừ đi phần trước
-- khoảng" của nó. Đổi ngữ nghĩa dùng chung để phục vụ một widget là cách chắc
-- chắn nhất làm sai một chỗ khác mà không ai thấy.
--
-- SECURITY INVOKER + `set search_path = ''` theo đúng quy ước bảo mật của
-- repo — policy RLS của `video_metrics_daily` vẫn là thứ quyết định ai đọc
-- được gì.
-- ============================================================================

create or replace function public.get_video_range_growth(
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
  end_views bigint,
  end_likes bigint,
  end_comments bigint,
  end_shares bigint,
  baseline_date date,
  baseline_views bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_in_range as (
    select distinct on (v.external_video_id)
      v.external_video_id, v.date, v.views, v.likes, v.comments, v.shares,
      v.title, v.cover_image_url, v.posted_at, v.permalink_url
    from public.video_metrics_daily v
    where v.connection_id = p_connection_id
      and v.date <= p_range_end
    order by v.external_video_id, v.date desc
  ),
  before_range as (
    select distinct on (v.external_video_id)
      v.external_video_id, v.date, v.views
    from public.video_metrics_daily v
    where v.connection_id = p_connection_id
      and v.date < p_range_start
    order by v.external_video_id, v.date desc
  ),
  first_in_range as (
    select distinct on (v.external_video_id)
      v.external_video_id, v.date, v.views
    from public.video_metrics_daily v
    where v.connection_id = p_connection_id
      and v.date >= p_range_start
      and v.date <= p_range_end
    order by v.external_video_id, v.date asc
  )
  select
    l.external_video_id,
    l.title,
    l.cover_image_url,
    l.posted_at,
    l.permalink_url,
    l.views    as end_views,
    l.likes    as end_likes,
    l.comments as end_comments,
    l.shares   as end_shares,
    coalesce(b.date, f.date)   as baseline_date,
    coalesce(b.views, f.views) as baseline_views
  from last_in_range l
  left join before_range b on b.external_video_id = l.external_video_id
  left join first_in_range f on f.external_video_id = l.external_video_id
  where coalesce(b.views, f.views) is not null;
$$;

revoke all on function public.get_video_range_growth(uuid, date, date) from public, anon;
grant execute on function public.get_video_range_growth(uuid, date, date) to authenticated, service_role;
