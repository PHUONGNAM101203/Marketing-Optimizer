# Video Metrics Snapshot Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Power "video tăng nhanh" (trending) and "top video mọi thời gian" (all-time top) on the TikTok and YouTube channel-detail pages, using a new daily snapshot table for TikTok (its API only exposes cumulative counters, no historical report) and direct YouTube Analytics API calls for YouTube (which already supports arbitrary date ranges, no storage needed).

**Architecture:** New table `video_metrics_daily` (TikTok-only) written once/day from the existing `syncConnection` cron path. Two read functions — `getTiktokVideoTrending` (queries the table) and `getYoutubeVideoTrending` (calls YouTube Analytics twice) — both return the same `VideoTrendingResult` shape so `getChannelDetail` and the UI can treat both platforms uniformly.

**Tech Stack:** Next.js 16.3.0, Supabase Postgres + RLS, TypeScript, TikTok Display API, YouTube Analytics API v2.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md`
- Repo has no automated test runner (no vitest/jest, no `test` script in `package.json`) — verification for each task is `npx tsc --noEmit`, `npm run lint`, and manual/build checks where noted. Do not introduce a new test framework as part of this feature.
- No new cron job — everything piggybacks on the existing daily cron (`/api/cron/sync-all`, `0 20 * * *`, Vercel Hobby plan).
- No retention/pruning logic for `video_metrics_daily`.
- Do not modify the existing `fetchTiktokContentExplore` or `fetchYoutubeExplore` functions — this feature is additive (new functions alongside them), per the approved spec.
- Follow existing code comment style: only comment the non-obvious "why" (see `src/lib/data/sites.ts`, `src/lib/providers/tiktok.ts` for house style), no restating what code does. Comments in new code should be in Vietnamese, matching the rest of the codebase.

---

### Task 1: Migration — `video_metrics_daily` table

**Files:**
- Create: `supabase/migrations/20260814000002_video_metrics_daily.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: table `public.video_metrics_daily(connection_id uuid, external_video_id text, date date, views bigint, likes bigint, comments bigint, shares bigint, title text, cover_image_url text, synced_at timestamptz)`, primary key `(connection_id, external_video_id, date)` — consumed by Task 3 (writes) and Task 5 (reads).

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Verify the migration matches existing conventions**

Run: `ls supabase/migrations/ | tail -3` and open `supabase/migrations/20260812000007_metrics_daily.sql` side by side — confirm header comment style, `create table`/`create policy` formatting, and trailing newline match.

- [ ] **Step 3: Apply and regenerate types**

Run: `supabase db push` then `supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts` (skip both if no local Supabase project is linked in this environment — the migration will apply on next deploy either way; do not fail the task over this). If skipped, note it in the task handoff so a later step regenerates types once linked.

Run: `grep -n "video_metrics_daily" src/lib/supabase/database.types.ts` — expect matches if types were regenerated.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814000002_video_metrics_daily.sql src/lib/supabase/database.types.ts
git commit -m "feat: add video_metrics_daily table for TikTok video snapshots"
```

---

### Task 2: TikTok provider — paginated video fetch for snapshotting

**Files:**
- Modify: `src/lib/providers/tiktok.ts` (append after `fetchTiktokContentExplore`, currently ending around line 241)

**Interfaces:**
- Consumes: `VIDEO_LIST_ENDPOINT`, `TiktokVideoItem` (both already defined in this file).
- Produces: `TiktokVideoSnapshot { externalVideoId: string; title: string; coverImageUrl: string | null; views: number; likes: number; comments: number; shares: number }` and `fetchAllTiktokVideos(accessToken: string): Promise<readonly TiktokVideoSnapshot[]>` — consumed by Task 3.

- [ ] **Step 1: Append the paginated fetch function**

At the end of `src/lib/providers/tiktok.ts`:

```ts
export interface TiktokVideoSnapshot {
  readonly externalVideoId: string
  readonly title: string
  readonly coverImageUrl: string | null
  readonly views: number
  readonly likes: number
  readonly comments: number
  readonly shares: number
}

// Chặn vòng lặp phân trang chạy vô hạn nếu TikTok trả `has_more: true` kèm
// `cursor` không hợp lệ — 50 trang x 20 video = 1000 video là quá đủ cho một
// tài khoản thật, chặn ở đây rẻ hơn để cron treo.
const MAX_VIDEO_LIST_PAGES = 50

/**
 * TOÀN BỘ video của tài khoản, tự phân trang bằng `cursor`/`has_more` —
 * khác `fetchTiktokContentExplore` bên trên (chỉ 1 trang 20 video mới nhất,
 * dùng để hiển thị trực tiếp ở tab Khám phá). Hàm này dùng để ghi snapshot
 * hằng ngày vào `video_metrics_daily`, không hiển thị trực tiếp.
 */
export const fetchAllTiktokVideos = async (
  accessToken: string,
): Promise<readonly TiktokVideoSnapshot[]> => {
  const videos: TiktokVideoSnapshot[] = []
  let cursor: number | undefined
  let hasMore = true
  let pages = 0

  while (hasMore && pages < MAX_VIDEO_LIST_PAGES) {
    pages += 1
    const url = new URL(VIDEO_LIST_ENDPOINT)
    url.searchParams.set(
      'fields',
      'id,title,video_description,cover_image_url,view_count,like_count,comment_count,share_count',
    )

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(cursor === undefined ? { max_count: 20 } : { max_count: 20, cursor }),
    })
    if (!response.ok) break

    const body = (await response.json()) as {
      readonly data?: {
        readonly videos?: readonly TiktokVideoItem[]
        readonly cursor?: number
        readonly has_more?: boolean
      }
      readonly error?: { readonly code?: string }
    }

    // HTTP 200 không đảm bảo thành công — xem docblock của TiktokExplore
    // phía trên, TikTok nhét mã lỗi vào thân JSON.
    if (body.error && body.error.code && body.error.code !== 'ok') break

    for (const video of body.data?.videos ?? []) {
      if (!video.id) continue
      videos.push({
        externalVideoId: video.id,
        title: (video.video_description || video.title || '(không có chú thích)').slice(0, 80),
        coverImageUrl: video.cover_image_url ?? null,
        views: video.view_count ?? 0,
        likes: video.like_count ?? 0,
        comments: video.comment_count ?? 0,
        shares: video.share_count ?? 0,
      })
    }

    hasMore = body.data?.has_more ?? false
    cursor = body.data?.cursor
  }

  return videos
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/providers/tiktok.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/tiktok.ts
git commit -m "feat: add paginated TikTok video fetch for snapshotting"
```

---

### Task 3: Sync layer — write daily video snapshots

**Files:**
- Create: `src/lib/sync/sync-video-snapshots.ts`
- Modify: `src/lib/sync/sync-connection.ts:68-96` (inside the `try` block, after the `metrics_daily` upsert)

**Interfaces:**
- Consumes: `fetchAllTiktokVideos` (Task 2), `createAdminClient` (`@/lib/supabase/admin`, already used elsewhere in `lib/sync`).
- Produces: `syncTiktokVideoSnapshots(connectionId: string, accessToken: string): Promise<void>` — consumed by `syncConnection`.

- [ ] **Step 1: Write the sync function**

Create `src/lib/sync/sync-video-snapshots.ts`:

```ts
import 'server-only'

import { fetchAllTiktokVideos } from '@/lib/providers/tiktok'
import { createAdminClient } from '@/lib/supabase/admin'

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * Ghi snapshot HÔM NAY cho từng video TikTok của connection — gọi từ
 * `syncConnection`, không phải cron riêng (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 * Không throw ra ngoài: lỗi ở đây không được làm hỏng phần đồng bộ
 * metrics_daily đã chạy xong trước đó trong cùng lượt `syncConnection`.
 */
export const syncTiktokVideoSnapshots = async (
  connectionId: string,
  accessToken: string,
): Promise<void> => {
  const admin = createAdminClient()
  const videos = await fetchAllTiktokVideos(accessToken)
  if (videos.length === 0) return

  const today = toIsoDate(new Date())
  const { error } = await admin.from('video_metrics_daily').upsert(
    videos.map((video) => ({
      connection_id: connectionId,
      external_video_id: video.externalVideoId,
      date: today,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      title: video.title,
      cover_image_url: video.coverImageUrl,
      synced_at: new Date().toISOString(),
    })),
    { onConflict: 'connection_id,external_video_id,date' },
  )

  if (error) console.error(`Không ghi được video_metrics_daily: ${error.message}`)
}
```

- [ ] **Step 2: Wire into `syncConnection`**

In `src/lib/sync/sync-connection.ts`, add the import at the top (after the existing `resolveAccessToken` import on line 7):

```ts
import { syncTiktokVideoSnapshots } from './sync-video-snapshots'
```

Then, in the `try` block, the code currently reads (lines 77-98):

```ts
    if (rows.length > 0) {
      const { error: upsertError } = await admin.from('metrics_daily').upsert(
        rows.map((row) => ({
          connection_id: connectionId,
          date: row.date,
          sessions: row.sessions,
          users: row.users,
          conversions: row.conversions,
          clicks: row.clicks,
          impressions: row.impressions,
          cost_micros: row.costMicros,
          conversion_value_micros: row.conversionValueMicros,
          extra: row.extra ?? {},
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'connection_id,date' },
      )

      if (upsertError) return { ok: false, error: `metrics-write-failed: ${upsertError.message}` }
    }

    await admin
      .from('connections')
      .update({ status: 'connected', last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)
```

Insert between the `if (rows.length > 0) { ... }` block and the `connections` status update:

```ts
    if (rows.length > 0) {
      const { error: upsertError } = await admin.from('metrics_daily').upsert(
        rows.map((row) => ({
          connection_id: connectionId,
          date: row.date,
          sessions: row.sessions,
          users: row.users,
          conversions: row.conversions,
          clicks: row.clicks,
          impressions: row.impressions,
          cost_micros: row.costMicros,
          conversion_value_micros: row.conversionValueMicros,
          extra: row.extra ?? {},
          synced_at: new Date().toISOString(),
        })),
        { onConflict: 'connection_id,date' },
      )

      if (upsertError) return { ok: false, error: `metrics-write-failed: ${upsertError.message}` }
    }

    if (connection.provider === 'tiktok') {
      await syncTiktokVideoSnapshots(connectionId, accessToken).catch((error) => {
        console.error(
          `Không đồng bộ được video snapshot: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    }

    await admin
      .from('connections')
      .update({ status: 'connected', last_synced_at: new Date().toISOString() })
      .eq('id', connectionId)
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/sync/sync-video-snapshots.ts` or `src/lib/sync/sync-connection.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/sync-video-snapshots.ts src/lib/sync/sync-connection.ts
git commit -m "feat: write daily TikTok video snapshots during connection sync"
```

---

### Task 4: Shared trending types

**Files:**
- Create: `src/lib/providers/video-trending-types.ts`

**Interfaces:**
- Produces: `VideoSummary`, `VideoGrowthSummary`, `VideoTrendingResult`, `TRENDING_WINDOW_DAYS`, `MIN_TRENDING_VIEWS` — consumed by Task 5 (`src/lib/data/video-trending.ts`), Task 6 (`src/lib/providers/google-explore.ts`), and Task 7 (`src/lib/data/site-channel-detail.ts`).

- [ ] **Step 1: Write the types file**

Create `src/lib/providers/video-trending-types.ts`:

```ts
/**
 * Hình dạng chung cho "top mọi thời gian" / "tăng nhanh" — dùng chung cho
 * TikTok (đọc từ `video_metrics_daily`) và YouTube (gọi thẳng Analytics
 * API), để trang chi tiết kênh render một component bất kể nguồn dữ liệu
 * bên dưới khác nhau (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 */
export interface VideoSummary {
  readonly externalVideoId: string
  readonly title: string
  readonly thumbnailUrl: string | null
  readonly views: number
  readonly likes: number
  readonly comments: number
  /** `null` = không đọc được (khác 0 chia sẻ thật) — YouTube Analytics chưa
   * chắc luôn trả cột này, xem `YoutubeExplore.topVideos[].shares`. */
  readonly shares: number | null
}

export interface VideoGrowthSummary extends VideoSummary {
  readonly growthDelta: number
  /** `null` khi mốc so sánh có 0 lượt xem — không chia được cho 0 (trong
   * thực tế không xảy ra vì cả hai nguồn đều lọc theo `MIN_TRENDING_VIEWS`
   * trước khi tính, nhưng kiểu vẫn khai báo đúng khả năng lý thuyết). */
  readonly growthPct: number | null
}

/** Ba cửa sổ CỐ ĐỊNH cho "tăng nhanh" — độc lập với khoảng ngày trang đang
 * chọn (khác mọi số liệu khác trên trang), để UI tự chuyển đổi phía client
 * không cần gọi lại server. */
export interface VideoTrendingWindows {
  readonly week: readonly VideoGrowthSummary[]
  readonly month: readonly VideoGrowthSummary[]
  readonly year: readonly VideoGrowthSummary[]
}

export interface VideoTrendingResult {
  readonly topAllTime: readonly VideoSummary[]
  readonly trendingFast: VideoTrendingWindows
}

export const TRENDING_WINDOW_DAYS = { week: 7, month: 30, year: 365 } as const

/** Video có dưới ngần này view ở đầu cửa sổ bị loại khỏi "tăng nhanh" — %
 * tăng của một video 2 view lên 20 view (900%) không có ý nghĩa, chỉ là
 * nhiễu do chia cho một số gần 0. */
export const MIN_TRENDING_VIEWS = 50
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (new file has no consumers yet, should compile standalone).

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/video-trending-types.ts
git commit -m "feat: add shared VideoTrendingResult types"
```

---

### Task 5: TikTok read layer

**Files:**
- Create: `src/lib/data/video-trending.ts`

**Interfaces:**
- Consumes: `VideoSummary`, `VideoGrowthSummary`, `VideoTrendingResult`, `TRENDING_WINDOW_DAYS`, `MIN_TRENDING_VIEWS` (Task 4), `createClient` from `@/lib/supabase/server` (session-scoped, RLS-protected — same pattern as `src/lib/data/site-metrics.ts`), `video_metrics_daily` table (Task 1, including its `database.types.ts` entry).
- Produces: `getTiktokVideoTrending(connectionId: string): Promise<VideoTrendingResult>` — consumed by Task 7. No date/range parameter — see Task 4's `VideoTrendingWindows` doc comment for why.

- [ ] **Step 1: Write the read function**

Create `src/lib/data/video-trending.ts`:

```ts
import 'server-only'

import {
  MIN_TRENDING_VIEWS,
  TRENDING_WINDOW_DAYS,
  type VideoGrowthSummary,
  type VideoSummary,
  type VideoTrendingResult,
} from '@/lib/providers/video-trending-types'
import { createClient } from '@/lib/supabase/server'

interface VideoMetricsRow {
  readonly external_video_id: string
  readonly date: string
  readonly views: number
  readonly likes: number
  readonly comments: number
  readonly shares: number
  readonly title: string | null
  readonly cover_image_url: string | null
}

const toSummary = (row: VideoMetricsRow): VideoSummary => ({
  externalVideoId: row.external_video_id,
  title: row.title ?? '(không có chú thích)',
  thumbnailUrl: row.cover_image_url,
  views: row.views,
  likes: row.likes,
  comments: row.comments,
  shares: row.shares,
})

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)

/**
 * Tăng trưởng của MỘT video trong `windowDays` ngày gần nhất. Mốc bắt đầu =
 * snapshot gần nhất TRƯỚC (hoặc đúng) ngày cắt; nếu chưa có snapshot nào cũ
 * đến vậy (connection mới, chưa đủ lịch sử), lùi về snapshot sớm nhất đang
 * có — "tăng trưởng từ lúc bắt đầu theo dõi", chấp nhận đánh giá thấp hơn
 * tăng trưởng thật thay vì không hiện gì. `snapshots` phải đã sắp theo ngày
 * tăng dần.
 */
const computeGrowth = (
  snapshots: readonly VideoMetricsRow[],
  windowDays: number,
): VideoGrowthSummary | null => {
  const endSnapshot = snapshots[snapshots.length - 1]!
  const cutoff = toIsoDate(new Date(Date.now() - windowDays * 86_400_000))
  const startSnapshot = [...snapshots].reverse().find((row) => row.date <= cutoff) ?? snapshots[0]!

  if (startSnapshot === endSnapshot) return null
  if (startSnapshot.views < MIN_TRENDING_VIEWS) return null

  const growthDelta = endSnapshot.views - startSnapshot.views
  return { ...toSummary(endSnapshot), growthDelta, growthPct: growthDelta / startSnapshot.views }
}

const TRENDING_WINDOW_KEYS = ['week', 'month', 'year'] as const

/**
 * "Top mọi thời gian" và "tăng nhanh" (tuần/tháng/năm) cho TikTok, đọc từ
 * `video_metrics_daily`. Không nhận tham số ngày — `topAllTime` luôn là
 * snapshot mới nhất mỗi video, `trendingFast` luôn tính đúng 3 cửa sổ cố
 * định, độc lập với khoảng ngày trang đang chọn (xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 */
export const getTiktokVideoTrending = async (connectionId: string): Promise<VideoTrendingResult> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('video_metrics_daily')
    .select('external_video_id, date, views, likes, comments, shares, title, cover_image_url')
    .eq('connection_id', connectionId)
    .order('date', { ascending: true })

  const rows = (data ?? []) as readonly VideoMetricsRow[]
  if (rows.length === 0) {
    return { topAllTime: [], trendingFast: { week: [], month: [], year: [] } }
  }

  const byVideo = new Map<string, VideoMetricsRow[]>()
  for (const row of rows) {
    const list = byVideo.get(row.external_video_id) ?? []
    list.push(row)
    byVideo.set(row.external_video_id, list)
  }

  const topAllTime = [...byVideo.values()]
    .map((snapshots) => toSummary(snapshots[snapshots.length - 1]!))
    .sort((a, b) => b.views - a.views)

  const trendingFast = { week: [] as VideoGrowthSummary[], month: [] as VideoGrowthSummary[], year: [] as VideoGrowthSummary[] }
  for (const snapshots of byVideo.values()) {
    for (const windowKey of TRENDING_WINDOW_KEYS) {
      const growth = computeGrowth(snapshots, TRENDING_WINDOW_DAYS[windowKey])
      if (growth) trendingFast[windowKey].push(growth)
    }
  }
  for (const windowKey of TRENDING_WINDOW_KEYS) {
    trendingFast[windowKey].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
  }

  return { topAllTime, trendingFast }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/data/video-trending.ts`. Task 1 already includes a hand-written `video_metrics_daily` entry in `database.types.ts`, so this should type-check cleanly against the `Database` type.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/video-trending.ts
git commit -m "feat: add TikTok video trending read layer"
```

---

### Task 6: YouTube read layer

**Files:**
- Modify: `src/lib/providers/google-explore.ts` (append after `fetchYoutubeExplore`, currently ending around line 350)

**Interfaces:**
- Consumes: `VideoSummary`, `VideoGrowthSummary`, `VideoTrendingResult`, `TRENDING_WINDOW_DAYS`, `MIN_TRENDING_VIEWS` (Task 4), `authHeader` (already defined in this file, line 11).
- Produces: `getYoutubeVideoTrending(accessToken: string, channelId: string): Promise<VideoTrendingResult>` — consumed by Task 7. No date/range parameter — see Task 4's `VideoTrendingWindows` doc comment for why.

- [ ] **Step 1: Append the trending function**

At the end of `src/lib/providers/google-explore.ts`, add the import at the top of the file first (after the existing file-level comment block, before `const authHeader = ...` on line 11):

```ts
import {
  MIN_TRENDING_VIEWS,
  TRENDING_WINDOW_DAYS,
  type VideoGrowthSummary,
  type VideoSummary,
  type VideoTrendingResult,
} from './video-trending-types'
```

Then append at the end of the file:

```ts
// ─── YouTube — trending/top-all-time ───────────────────────────────────────

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10)
const daysAgo = (days: number): string => toIsoDate(new Date(Date.now() - days * 86_400_000))

const YOUTUBE_ALL_METRICS = ['views', 'likes', 'comments', 'shares'] as const
// Trần trên số video lấy về mỗi lượt gọi — tài khoản có hàng nghìn video vẫn
// chỉ tốn 2 lượt gọi report tổng cộng cho toàn bộ tính năng này (khác
// `fetchAllTiktokVideos`, nơi TikTok bắt buộc phải phân trang vì không có
// cách sort/lọc theo server).
const MAX_TRENDING_VIDEOS = 200

interface YoutubeReportRow {
  readonly columnHeaders?: readonly { readonly name?: string }[]
  readonly rows?: readonly (readonly (string | number)[])[]
}

const fetchYoutubeMetaById = async (
  accessToken: string,
  videoIds: readonly string[],
): Promise<Map<string, { readonly title: string; readonly thumbnailUrl: string | null }>> => {
  const metaById = new Map<string, { readonly title: string; readonly thumbnailUrl: string | null }>()
  if (videoIds.length === 0) return metaById

  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}`,
    { headers: authHeader(accessToken) },
  )
  if (!videosResponse.ok) return metaById

  const videosData = (await videosResponse.json()) as {
    readonly items?: readonly {
      readonly id?: string
      readonly snippet?: {
        readonly title?: string
        readonly thumbnails?: {
          readonly medium?: { readonly url?: string }
          readonly default?: { readonly url?: string }
        }
      }
    }[]
  }
  for (const item of videosData.items ?? []) {
    if (!item.id) continue
    metaById.set(item.id, {
      title: item.snippet?.title ?? item.id,
      thumbnailUrl:
        item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    })
  }
  return metaById
}

/**
 * Tổng số liệu ALL-TIME (10 năm trở lại — YouTube Analytics trả 0 hàng cho
 * khoảng trước ngày kênh tạo, không lỗi, nên dùng mốc cố định đủ xa thay vì
 * phải tra ngày tạo kênh) cho từng video — dùng cho `topAllTime`, và làm mốc
 * "cộng dồn tại đầu cửa sổ" để tính % tăng trưởng trong
 * `getYoutubeVideoTrending` (cùng công thức TikTok dùng trên snapshot cộng
 * dồn — xem `startViews` bên dưới), vì chuỗi views-theo-ngày ở
 * `fetchYoutubeDailyViews` chỉ có views, không có 3 chỉ số kia.
 */
const fetchYoutubeAllTimeMetrics = async (
  accessToken: string,
  channelId: string,
): Promise<Map<string, VideoSummary>> => {
  const reportUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  reportUrl.searchParams.set('ids', `channel==${channelId}`)
  reportUrl.searchParams.set('startDate', daysAgo(3650))
  reportUrl.searchParams.set('endDate', toIsoDate(new Date()))
  reportUrl.searchParams.set('dimensions', 'video')
  reportUrl.searchParams.set('metrics', YOUTUBE_ALL_METRICS.join(','))
  reportUrl.searchParams.set('sort', '-views')
  reportUrl.searchParams.set('maxResults', String(MAX_TRENDING_VIDEOS))

  const reportResponse = await fetch(reportUrl.toString(), { headers: authHeader(accessToken) })
  if (!reportResponse.ok) return new Map()

  const reportData = (await reportResponse.json()) as YoutubeReportRow
  const rows = reportData.rows ?? []
  if (rows.length === 0) return new Map()

  const columnIndex = new Map(
    (reportData.columnHeaders ?? []).map((column, index) => [column.name, index]),
  )
  const valueAt = (row: readonly (string | number)[], metric: string): number | null => {
    const index = columnIndex.get(metric)
    return index === undefined ? null : Number(row[index] ?? 0)
  }

  const metaById = await fetchYoutubeMetaById(accessToken, rows.map((row) => String(row[0])))

  const result = new Map<string, VideoSummary>()
  for (const row of rows) {
    const id = String(row[0])
    const meta = metaById.get(id)
    result.set(id, {
      externalVideoId: id,
      title: meta?.title ?? id,
      thumbnailUrl: meta?.thumbnailUrl ?? null,
      views: valueAt(row, 'views') ?? 0,
      likes: valueAt(row, 'likes') ?? 0,
      comments: valueAt(row, 'comments') ?? 0,
      shares: valueAt(row, 'shares'),
    })
  }
  return result
}

/**
 * Chuỗi views-theo-ngày của từng video trong 365 ngày gần nhất — MỘT lượt
 * gọi duy nhất (`dimensions=video,day`), dùng để tính cả 3 cửa sổ tuần/
 * tháng/năm bằng cách cộng dồn theo mốc ngày, thay vì gọi report riêng cho
 * mỗi cửa sổ (sẽ tốn 6 lượt gọi thay vì 1).
 */
const fetchYoutubeDailyViews = async (
  accessToken: string,
  channelId: string,
): Promise<Map<string, Map<string, number>>> => {
  const reportUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports')
  reportUrl.searchParams.set('ids', `channel==${channelId}`)
  reportUrl.searchParams.set('startDate', daysAgo(365))
  reportUrl.searchParams.set('endDate', toIsoDate(new Date()))
  reportUrl.searchParams.set('dimensions', 'video,day')
  reportUrl.searchParams.set('metrics', 'views')
  reportUrl.searchParams.set('maxResults', String(MAX_TRENDING_VIDEOS * 366))

  const reportResponse = await fetch(reportUrl.toString(), { headers: authHeader(accessToken) })
  if (!reportResponse.ok) return new Map()

  const reportData = (await reportResponse.json()) as YoutubeReportRow
  const rows = reportData.rows ?? []
  const columnIndex = new Map(
    (reportData.columnHeaders ?? []).map((column, index) => [column.name, index]),
  )
  const videoIndex = columnIndex.get('video')
  const dayIndex = columnIndex.get('day')
  const viewsIndex = columnIndex.get('views')
  if (videoIndex === undefined || dayIndex === undefined || viewsIndex === undefined) {
    return new Map()
  }

  const byVideo = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const videoId = String(row[videoIndex])
    const day = String(row[dayIndex])
    const views = Number(row[viewsIndex] ?? 0)
    const days = byVideo.get(videoId) ?? new Map<string, number>()
    days.set(day, views)
    byVideo.set(videoId, days)
  }
  return byVideo
}

const TRENDING_WINDOW_KEYS = ['week', 'month', 'year'] as const

/**
 * "Top mọi thời gian" và "tăng nhanh" (tuần/tháng/năm) cho YouTube — gọi
 * thẳng YouTube Analytics API (2 lượt gọi report tổng cộng), không lưu
 * snapshot riêng (khác TikTok, xem
 * docs/superpowers/specs/2026-08-14-video-snapshot-pipeline-design.md).
 * % tăng trưởng = views trong cửa sổ / views cộng dồn TRƯỚC cửa sổ đó
 * (`allTime.views - growthDelta`) — cùng công thức TikTok dùng trên
 * snapshot cộng dồn, chỉ khác cách lấy dữ liệu nguồn.
 */
export const getYoutubeVideoTrending = async (
  accessToken: string,
  channelId: string,
): Promise<VideoTrendingResult> => {
  const [allTime, dailyViews] = await Promise.all([
    fetchYoutubeAllTimeMetrics(accessToken, channelId),
    fetchYoutubeDailyViews(accessToken, channelId),
  ])

  const topAllTime = [...allTime.values()].sort((a, b) => b.views - a.views)

  // Tính MỘT LẦN MỖI REQUEST (không phải hằng số module) — tiến trình server
  // sống lâu, hằng số module sẽ đóng băng ngày "hôm nay" ở lần import đầu
  // tiên và sai dần cho mọi request sau đó.
  const recentDates = Array.from({ length: 365 }, (_, i) => daysAgo(i))
  const sumRecentViews = (days: ReadonlyMap<string, number>, windowDays: number): number => {
    let total = 0
    for (let i = 0; i < windowDays; i += 1) total += days.get(recentDates[i]!) ?? 0
    return total
  }

  const trendingFast = { week: [] as VideoGrowthSummary[], month: [] as VideoGrowthSummary[], year: [] as VideoGrowthSummary[] }
  for (const [videoId, days] of dailyViews) {
    const meta = allTime.get(videoId)
    if (!meta) continue

    for (const windowKey of TRENDING_WINDOW_KEYS) {
      const growthDelta = sumRecentViews(days, TRENDING_WINDOW_DAYS[windowKey])
      const startViews = meta.views - growthDelta
      if (startViews < MIN_TRENDING_VIEWS) continue

      trendingFast[windowKey].push({ ...meta, growthDelta, growthPct: growthDelta / startViews })
    }
  }
  for (const windowKey of TRENDING_WINDOW_KEYS) {
    trendingFast[windowKey].sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))
  }

  return { topAllTime, trendingFast }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/providers/google-explore.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/google-explore.ts
git commit -m "feat: add YouTube video trending via Analytics API"
```

---

### Task 7: Wire trending into channel-detail data layer

**Files:**
- Modify: `src/lib/data/site-channel-detail.ts` (imports near the top; the `tiktok`/`youtube` union variants around lines 143-152 and 244-255; the `case 'tiktok':`/`case 'youtube':` branches around lines 244-255 and 303-312)

**Interfaces:**
- Consumes: `getTiktokVideoTrending` (Task 5), `getYoutubeVideoTrending` (Task 6), `VideoTrendingResult` (Task 4).
- Produces: `ChannelDetail`'s `tiktok` and `youtube` variants gain a `trending: VideoTrendingResult` field, consumed by the TikTok channel-detail UI (owned by the peer design session).

- [ ] **Step 1: Add imports**

In `src/lib/data/site-channel-detail.ts`, near the existing provider imports (alongside the line importing `fetchTiktokContentExplore` and `fetchYoutubeExplore`), add:

```ts
import { getYoutubeVideoTrending } from '@/lib/providers/google-explore'
import type { VideoTrendingResult } from '@/lib/providers/video-trending-types'
import { getTiktokVideoTrending } from '@/lib/data/video-trending'
```

- [ ] **Step 2: Extend the `tiktok` and `youtube` union variants**

Change (currently lines 143-152):

```ts
  | {
      readonly kind: 'tiktok'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: TiktokExplore
    }
```

to:

```ts
  | {
      readonly kind: 'tiktok'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: TiktokExplore
      readonly trending: VideoTrendingResult
    }
```

And change the `youtube` variant (currently lines 93-102):

```ts
  | {
      readonly kind: 'youtube'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: YoutubeExplore
    }
```

to:

```ts
  | {
      readonly kind: 'youtube'
      readonly accountName: string
      readonly externalAccountId: string
      /** Ảnh đại diện kênh — lưu một lần lúc kết nối (`connections.avatar_url`),
       * không refetch mỗi lần tải trang. `null` cho các nền tảng không có khái
       * niệm "kênh" (Ads/Analytics/Search Console/Tag Manager/Merchant Center). */
      readonly avatarUrl: string | null
      readonly data: YoutubeExplore
      readonly trending: VideoTrendingResult
    }
```

- [ ] **Step 3: Populate `trending` in both branches**

Change (currently lines 244-255):

```ts
    case 'youtube':
      return {
        kind: 'youtube',
        accountName,
        externalAccountId,
        avatarUrl,
        data: await fetchYoutubeExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        ),
      }
```

to:

```ts
    case 'youtube':
      return {
        kind: 'youtube',
        accountName,
        externalAccountId,
        avatarUrl,
        data: await fetchYoutubeExplore(
          tokenResult.accessToken,
          connection.external_account_id,
          range,
        ),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn (xem Task 4/6 trong plan này).
        trending: await getYoutubeVideoTrending(
          tokenResult.accessToken,
          connection.external_account_id,
        ),
      }
```

Change (currently lines 303-312):

```ts
    case 'tiktok':
      return {
        kind: 'tiktok',
        accountName,
        externalAccountId,
        avatarUrl,
        // Không truyền `externalAccountId` — Display API không có khái niệm
        // "chọn tài khoản", token đã gắn chết với đúng một tài khoản rồi.
        data: await fetchTiktokContentExplore(tokenResult.accessToken, range),
      }
```

to:

```ts
    case 'tiktok':
      return {
        kind: 'tiktok',
        accountName,
        externalAccountId,
        avatarUrl,
        // Không truyền `externalAccountId` — Display API không có khái niệm
        // "chọn tài khoản", token đã gắn chết với đúng một tài khoản rồi.
        data: await fetchTiktokContentExplore(tokenResult.accessToken, range),
        // Không truyền `range` — trending có 3 cửa sổ cố định riêng, độc lập
        // với khoảng ngày trang đang chọn (xem Task 4/5 trong plan này).
        trending: await getTiktokVideoTrending(connection.id),
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/data/site-channel-detail.ts`. If any other file destructures `ChannelDetail`'s `tiktok`/`youtube` variants with an exhaustive object shape check, TypeScript will flag it — fix by adding the new field there too (structural typing means most consumers reading `.data`/`.kind` won't need changes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/site-channel-detail.ts
git commit -m "feat: expose video trending data on TikTok/YouTube channel detail"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no new violations.

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual verification (as far as possible without real TikTok/YouTube API access)**

Run: `npm run dev`, open a site's TikTok or YouTube channel-detail page. Expected: page still renders (existing `data` unchanged), no runtime error from the new `trending` field being present but possibly empty (`{ topAllTime: [], trendingFast: [] }` is a valid, renderable state — the TikTok UI design session's component should treat this the same as "not enough data yet").

If a real TikTok connection with `connected_at` far enough in the past exists, trigger a manual sync (`POST /api/cron/sync-all` with the cron's expected auth, or call `syncConnection` directly) and confirm `select * from video_metrics_daily` in Supabase gets rows.

- [ ] **Step 5: Report to the results-coordination session**

Send a cross-session message (per the user's routing instruction) summarizing: migration applied (or pending link), build/typecheck/lint status, cron wiring confirmed, and the known assumptions to flag before merge (YouTube 200-video cap, TikTok 1000-video/50-page pagination cap, no retention policy, `trendingFast` requires ≥2 days of TikTok history so is empty for brand-new connections).

No commit for this task — it's a checkpoint, not a change.
