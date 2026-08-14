-- ============================================================================
-- RPC lấy đúng số dòng cần thiết cho "top mọi thời gian"/"tăng nhanh" của
-- TikTok, thay vì đọc toàn bộ lịch sử `video_metrics_daily` vào ứng dụng rồi
-- lọc bằng JS như trước.
--
-- Lý do bắt buộc: PostgREST giới hạn max_rows (mặc định 1000) mỗi truy vấn,
-- áp dụng CẢ cho stored procedure, không chỉ bảng/view (xem `max_rows` trong
-- supabase/config.toml). Số dòng thô = số video × số ngày đã theo dõi — với
-- MỘT connection theo dõi chỉ khoảng 3 video trong một năm đã vượt 1000
-- dòng (3×366), nên ngưỡng này bị chạm rất sớm trong thực tế.
--
-- Hàm này trả về ĐÚNG MỘT dòng MỖI VIDEO (không phải một dòng mỗi
-- video×vai-trò) — mọi "vai trò" cần dùng (mới nhất; cũ nhất làm dự phòng;
-- mới-nhất-trước-mỗi-mốc-cắt cho 3 cửa sổ cố định tuần/tháng/năm) được JOIN
-- thành các CỘT riêng trên cùng một dòng thay vì UNION thành nhiều dòng.
-- Nhờ vậy số dòng trả về LUÔN ĐÚNG BẰNG số video đang theo dõi, không nhân
-- thêm theo số ngày lịch sử LẪN không nhân theo số vai trò — ngưỡng thực tế
-- giờ trùng khớp với trần phân trang của chính TikTok (`MAX_VIDEO_LIST_PAGES`
-- trong `src/lib/providers/tiktok.ts`, tối đa ~1000 video/connection), không
-- còn là một giới hạn bổ sung thấp hơn.
--
-- Không dùng SECURITY DEFINER (khai báo tường minh SECURITY INVOKER dù đó là
-- mặc định, để không ai vô tình bỏ sót khi sửa sau này): hàm chạy với quyền
-- của người gọi, nên policy `video_metrics_daily_select_member` của
-- `video_metrics_daily` vẫn tự áp dụng như một SELECT trực tiếp. `set
-- search_path = ''` theo quy ước bảo mật chung của repo (xem
-- `20260812000001_init_auth_and_sites.sql`), nên mọi bảng tham chiếu bên
-- dưới đều ghi đủ `public.`. `revoke`/`grant` tường minh theo đúng quy ước
-- mọi hàm khác trong repo này đã dùng (xem cuối file).
-- ============================================================================

-- Hình dạng dòng trả về đổi khác (16 cột thay vì 9) so với lần định nghĩa
-- đầu — `create or replace function` không cho phép đổi kiểu trả về, phải
-- xoá rồi tạo lại.
drop function if exists public.get_video_trending_snapshots(uuid, date[]);

create function public.get_video_trending_snapshots(
  p_connection_id uuid,
  p_cutoffs date[]
)
returns table (
  external_video_id text,
  title text,
  cover_image_url text,
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
  cutoff2_views bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (external_video_id)
      external_video_id, date, views, likes, comments, shares, title, cover_image_url
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
  -- Mỗi video có TỐI ĐA một dòng cho mỗi mốc cắt (window_index 0/1/2 tương
  -- ứng tuần/tháng/năm, khớp thứ tự `p_cutoffs` mà phía TypeScript truyền
  -- vào — xem `TRENDING_WINDOW_KEYS` trong `src/lib/data/video-trending.ts`).
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
    l.date, l.views, l.likes, l.comments, l.shares,
    e.date, e.views,
    c0.date, c0.views,
    c1.date, c1.views,
    c2.date, c2.views
  from latest l
  left join earliest e on e.external_video_id = l.external_video_id
  left join cutoff_rows c0 on c0.external_video_id = l.external_video_id and c0.window_index = 0
  left join cutoff_rows c1 on c1.external_video_id = l.external_video_id and c1.window_index = 1
  left join cutoff_rows c2 on c2.external_video_id = l.external_video_id and c2.window_index = 2
$$;

revoke all on function public.get_video_trending_snapshots(uuid, date[]) from public;
grant execute on function public.get_video_trending_snapshots(uuid, date[]) to authenticated;
