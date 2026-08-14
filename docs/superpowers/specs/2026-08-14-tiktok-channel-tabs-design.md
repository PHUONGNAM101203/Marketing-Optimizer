# TikTok channel page: Tổng quan / Dashboard tabs

## Problem

The TikTok channel-detail page (`src/app/(app)/[siteId]/channels/[provider]/page.tsx`,
rendered via `ChannelDetailBody`'s `kind: 'tiktok'` branch) is currently a single
scrolling column: 3 stat tiles, a follower-per-sync trend chart, and a video grid
(`VideoCardGrid`) with large cards. The user wants it split into two tabs —
**Tổng quan** (Overview) and **Dashboard** — redesigned to mirror TikTok's own
profile UI (reference screenshots: dense thumbnail grid, large circular avatar +
name/handle + stats in one row), plus a new ranking/trending dashboard.

Data for rankings/trending comes from a sibling effort (see
`2026-08-14-video-snapshot-pipeline-design.md`, implemented and merged): a new
`trending: VideoTrendingResult` field on `ChannelDetail` (tiktok + youtube kinds),
computed by `getTiktokVideoTrending(connectionId)`. This spec covers the UI only.

## Scope

TikTok channel page only. Same tab/component patterns are intended to extend to
YouTube later (the `trending` field already supports it), but that's a separate
follow-up, not part of this spec.

## Header redesign

Replace the current header block (small avatar next to `PageHeader` title, 3
stat tiles in a row below) with a TikTok-profile-style block, **for the TikTok
channel page only** — other providers keep their current `PageHeader` layout:

- Large circular avatar (`ChannelAvatar`, upsized) on the left.
- To its right: channel display name (large — this is `connections.account_name`,
  the only identity string the TikTok adapter currently stores).
  **Deviation from the reference:** the reference shows an `@handle` under the
  name; this app's TikTok adapter (`tiktokAdapter.listAccounts` in
  `src/lib/providers/tiktok.ts`) only requests `open_id,display_name,avatar_url`
  from `user/info/` — no `username`/handle field is fetched or stored anywhere
  in `connections`. Fetching it would need a new scope (`user.info.profile`)
  requiring its own TikTok app-review approval — real backend/OAuth scope work,
  out of bounds for this UI-only plan. So the `@handle` line is **not built**;
  the header shows name only. Revisit if/when that scope is added.
- On the same row as the name (or wrapping below on narrow screens): three
  inline stats — Follower / Lượt thích / Số video — styled as label+value pairs
  matching the reference, not as separate `Card` tiles.
- Existing elements that must still appear somewhere in the header area: back
  link to "Tất cả kênh", connect-status badge, date-range label. (Sync-recency
  is already shown globally in `Topbar`, not per-page — dropped from this list,
  it was never actually part of the per-page header to begin with.)

New component: `src/components/channels/tiktok/tiktok-channel-header.tsx`.

## Tabs

New URL-driven tab primitive: `src/components/ui/tabs.tsx` (`UrlTabs`) — reads
a `tab` search param (default `overview` when absent/invalid), renders a
`role="tablist"` matching the existing `OverviewTabs` visual style (bottom
border-signal indicator) but as `<Link>`s that set `?tab=...` instead of
`useState`, so it works from a Server Component page and survives reload/share.
This fills a real gap (no generic `Tabs` primitive exists yet) and is written
generically enough for other pages to reuse later — not TikTok-specific.

**Correction post-implementation of the sibling snapshot-pipeline spec:**
`getChannelDetail`'s `case 'tiktok'` (`src/lib/data/site-channel-detail.ts`)
already fetches `data` (`fetchTiktokContentExplore`) and `trending`
(`getTiktokVideoTrending`) together via one `Promise.all`, unconditionally —
this is shared plumbing with the YouTube branch and isn't something this UI
plan can special-case per tab without forking that shared function for one
provider. So there's no "fetch trending only on the Dashboard tab"
optimization to build here: `detail.trending` is always present by the time
`ChannelDetailBody` renders, regardless of which tab is active.

`UrlTabs` is therefore a **pure client-side rendering toggle**, not a
data-fetching switch: it reads `tab` from `useSearchParams()` (default
`overview`), renders `<Link href="?tab=...">` items that preserve the other
current search params (`range`/`from`/`to`), and shows one of two already-
resolved panels. No Server Component prop-threading of `tab` is needed —
both panels receive the same fully-populated `detail` as props.

## Tab 1: Tổng quan (Overview)

### Video grid

Replace `VideoCardGrid`'s current `sm:grid-cols-2 lg:grid-cols-3` large-card
layout with a dense grid matching the TikTok reference: `grid-cols-3
sm:grid-cols-4 lg:grid-cols-6`, each cell a `9:16` thumbnail with:

- View count overlay, bottom-left, small eye icon + formatted count (matches
  reference).
- Exact post date/time overlay (reference doesn't have this — it's this app's
  addition per explicit requirement), small text, top-right corner of the
  thumbnail, formatted from each video's `create_time` (e.g. `14/08 09:32`).
- No caption text on the card itself (reference doesn't show it either) —
  caption moves entirely into the detail view.
- Whole cell is a `button` (not a link — no dedicated video URL route) that
  opens the detail dialog for that video.

New component: `src/components/channels/tiktok/tiktok-video-grid.tsx` (grid +
date-range empty/error states, same props shape as today's `VideoCardGrid`) and
`tiktok-video-card.tsx` (single cell).

Filtering behavior is unchanged from today: `fetchTiktokContentExplore` already
filters TikTok's up-to-20-most-recent videos by `create_time` against the
page's resolved date range (7d/28d/month/custom) before sorting by views. This
spec doesn't touch that function.

### Video detail dialog

Clicking a card opens `DialogRoot`/`DialogContent` (existing Radix primitive)
showing:

- Thumbnail, full (untruncated) caption/title.
- Four stats (views/likes/comments/shares) at a larger size than the grid
  overlay — reuse `VideoStat`.
- Exact post date/time (same value as the card overlay, spelled out in full,
  e.g. "14 tháng 8, 2026 · 09:32").
- "Xem trên TikTok" link opening the original video. Requires adding the
  video-permalink field (TikTok's Video Object exposes this as `share_url`
  per this repo's prior API research — confirm the exact name against
  TikTok's current `video/list` field list during implementation, since
  field names have shifted across API versions before) to
  `fetchTiktokContentExplore`'s `video/list` call
  (`src/lib/providers/tiktok.ts`) and threading it through `VideoCardData` —
  the only backend-adjacent change in this spec, confined to the TikTok
  adapter file already owned by UI-adjacent work, not the snapshot pipeline.
  If the field turns out to be unavailable/nullable for some videos, the
  link is simply omitted for that video — not a blocking error.

New component: `src/components/channels/tiktok/tiktok-video-detail-dialog.tsx`.

## Tab 2: Dashboard

Four independent widgets, all reading from the same already-fetched `detail`
(no per-tab data fetching, see the corrected "Tabs" section above). The first
two reuse `detail.data.topVideos`; the last two consume `detail.trending`.

1. **Top 10 video xem nhiều nhất (theo khoảng lọc đang chọn)** — reuses
   `detail.data.topVideos` (already date-filtered + sorted by views desc by
   the existing adapter), rendered as a ranked list (rank badge + thumbnail +
   title + views), capped at 10. Same data source as the Overview grid, just
   a different presentation and explicitly framed as "trong {khoảng đang lọc}".
2. **Top 10 video xem nhiều nhất mọi thời gian** — `trending.topAllTime`,
   sliced to top 10, sorted by views desc (already sorted per the pipeline
   spec). Does **not** react to the page's date-range picker — labelled "mọi
   thời gian" with no filter affordance, per the original requirement that
   this list stays constant.
3. **Video có xu hướng tăng nhanh** — `trending.trendingFast`, with a
   client-side (no server round trip — all three windows are already in the
   payload) toggle for Tuần / Tháng / Năm. Per the original requirement
   ("thay đổi đáng tích cực" — positive change only), each window's list is
   filtered to entries with `growthPct > 0` before display — the backend
   doesn't exclude flat/negative entries itself, so the UI does. Each shown
   entry displays rank, thumbnail, title, `growthPct` (× 100, shown as
   `+NN%`) and `growthDelta` as supporting text (e.g. `+1,204 views`). Empty
   state per window independently (a video appearing in `month` but not
   `week` is expected, not an error — see pipeline spec's minimum-view-floor
   note; and after the positive-only filter, a window can end up empty even
   if the raw array wasn't) — see "Error handling" below for the exact
   `earliestSnapshotAt`-based empty-state copy per window.
4. **Thống kê tổng lượt react / comment / share** — sums `likes`, `comments`,
   `shares` across `detail.data.topVideos` (same filtered set as widget 1),
   shown as 3 `StatTile`s. Explicitly reuses widget 1's data — no new fetch.

New components:
`src/components/channels/tiktok/tiktok-dashboard.tsx` (orchestrator),
`tiktok-video-ranking-list.tsx` (shared ranked-list rendering for widgets 1–2),
`tiktok-trending-widget.tsx` (widget 3, owns the week/month/year toggle state),
`tiktok-stats-summary.tsx` (widget 4).

## Data flow summary

```
page.tsx (Server Component, unchanged fetch shape)
  reads: range/from/to (existing), site, channel summaries (existing)
  getChannelDetail → detail.data (topVideos) + detail.trending (always both, existing behavior)
  → for provider 'tiktok': TiktokChannelHeader (replaces PageHeader block)
  → ChannelDetailBody → case 'tiktok' → UrlTabs(['overview','dashboard'])
       overview panel  → TiktokVideoGrid(detail.data.topVideos)
       dashboard panel → TiktokDashboard(detail.data.topVideos, detail.trending)
```

`ChannelDetailBody`'s existing `switch (detail.kind)` dispatcher gets a new
branch path: for `kind: 'tiktok'`, delegate to `UrlTabs` + the two panel
components above instead of the current inline JSX (lines ~280-326), keeping
other providers untouched.

## Error handling

- `fetchTiktokContentExplore` failure (existing `fetchError` field): unchanged
  behavior, surfaces via `Callout`, same as today — affects Overview grid and
  Dashboard widgets 1+4 (shared source).
- `getTiktokVideoTrending` (`src/lib/data/video-trending.ts`) never throws or
  surfaces a Supabase error to the caller — a failed read silently resolves to
  the same empty shape as "no snapshots yet" (`topAllTime: []`, all three
  `trendingFast` windows `[]`, `earliestSnapshotAt: null`). So widgets 2+3
  have no distinct error state to build — an empty response, whatever its
  cause, always renders as each widget's own empty state (see below), never a
  `Callout`. This also means it can never reject the `Promise.all` in
  `getChannelDetail`, so widgets 1+4 (from `fetchTiktokContentExplore`) are
  never at risk of being taken down by a trending-side failure.
- Empty-state copy per widget, using `earliestSnapshotAt` to distinguish
  "not enough history yet" from "genuinely nothing" per window: for
  `trendingFast[window]`, if `earliestSnapshotAt` is `null` or newer than
  `TRENDING_WINDOW_DAYS[window]` days ago, show "Đang tích lũy dữ liệu cho
  {khung} — quay lại sau."; otherwise (enough history exists but the window
  is still empty, e.g. everything filtered out by the positive-growth or
  min-view-floor rules) show "Chưa có video tăng trưởng tích cực trong
  {khung}." `topAllTime` empty has one copy regardless: "Chưa có dữ liệu —
  video sẽ xuất hiện sau lần đồng bộ tiếp theo."

## Out of scope

- YouTube (structure intended to extend later, not built now).
- Any change to `fetchTiktokContentExplore`'s date-filtering/sorting/20-item-cap
  logic beyond adding the `share_url` field.
- Any change to `video_metrics_daily` / `getTiktokVideoTrending` (owned by the
  snapshot-pipeline spec, already implemented).
