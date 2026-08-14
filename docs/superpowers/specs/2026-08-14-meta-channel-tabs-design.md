# Facebook/Instagram channel pages: Tổng quan / Dashboard tabs

## Problem

User asked for the same "Tổng quan / Dashboard" tab treatment already shipped
for TikTok (`docs/superpowers/specs/2026-08-14-tiktok-channel-tabs-design.md`,
`docs/superpowers/plans/2026-08-14-tiktok-channel-tabs.md`) to be extended to
the Facebook and Instagram channel-detail pages. Full UI-design authority was
delegated ("quyết định mọi thứ liên quan tới UI"), with the explicit
condition that the result gets reviewed carefully before being considered
done — this spec exists so that review has something concrete to check
against, and so a sibling session building the Dashboard's backend data layer
has an exact contract to build to (coordinated live over cross-session
messaging while writing this document).

## What's different from TikTok (read this before assuming the TikTok plan transfers)

Researched against the actual current code before writing anything below —
these are facts, not assumptions:

1. **No images.** `src/lib/providers/meta-explore.ts`'s `fetchInstagramExplore`
   and `fetchFacebookContentExplore` request no media/thumbnail field at all
   (no `full_picture`/`attachments` for Facebook, no `media_url`/
   `thumbnail_url` for Instagram). A TikTok-style photo/video grid is not
   buildable from data that exists today. **Decision: ranked list/table, not
   a grid**, for both platforms.
2. **No "views."** Neither platform's basic post fields expose a per-post
   view count (Facebook: reactions/comments/shares; Instagram: likes/comments
   only, no shares at all). **Decision: rank and compute growth by total
   engagement** (likes/reactions + comments + shares, treating a missing
   shares count as 0), not views — this changes the trending-pipeline
   contract's semantics from TikTok's, not just its name.
3. **Header stats don't need new backend work.** `instagramMetricsAdapter`
   and `facebookMetricsAdapter` (`src/lib/providers/meta-metrics.ts`,
   `src/lib/providers/facebook-metrics.ts`) already fetch and store 3
   `extra` fields each per sync — Instagram: `reach`, `impressions`,
   `profileViews`; Facebook: `impressions`, `engagedUsers`,
   `postEngagements` — but `channel-detail-body.tsx` currently surfaces only
   one of each (`reach` / `impressions`, as the single trend-chart metric).
   **Decision: the profile header's 3-stat row uses the two already-fetched,
   currently-unsurfaced fields per platform — zero adapter changes needed for
   the header.** (There is no real follower-count/media-count field fetched
   by either adapter — that would need a new Graph endpoint call, which is
   out of scope here; the header does NOT claim to show follower count.)
4. **Facebook and Instagram are two separate `connections` rows**, not one.
   Confirmed via `src/lib/domain/providers.ts` (`PROVIDER_FAMILIES`) and
   `meta-discovery.ts`: both sit under one OAuth family (`meta`, shared
   Business Manager grant), but each gets its own `connections` row with its
   own `externalAccountId`/avatar/account name. This spec's components are
   built once and used by both provider `case`s in `channel-detail-body.tsx`
   — not duplicated per platform — with platform-specific labels/metrics
   passed in as props by the caller.
5. **`createdAt` and a permalink are fetched-but-discarded today, same bug
   pattern as TikTok before its Task 1.** Both adapters already request a
   timestamp field (`timestamp` for Instagram, `created_time` for Facebook)
   but never map it into the returned type. Neither requests a permalink
   field at all. Both need the same kind of additive fix TikTok's Task 1
   made (`docs/superpowers/plans/2026-08-14-tiktok-channel-tabs.md`, Task 1)
   — add `createdAt`/`permalinkUrl` to `InstagramExplore.topPosts`/
   `FacebookExplore.topPosts`, requesting one new Graph field
   (`permalink`/`permalink_url`) per platform.
6. **No `fetchError` field today**, unlike `TiktokExplore`. On a failed
   fetch, both functions currently return `{ topPosts: [] }` silently — a
   real API failure is indistinguishable from "no posts in range." This
   predates this feature but is being fixed alongside the other additive
   changes to `meta-explore.ts` in this spec's scope, matching the pattern
   `TiktokExplore.fetchError` already established.

## Scope and phasing

**Phase 1 (this spec, build now):** header, tabs, Tổng quan tab (ranked
post list + click-through detail dialog), and the two Dashboard widgets that
need zero new backend work (top-in-current-range, aggregate engagement
stats). Ships independently, exactly like TikTok's Tổng quan tab shipped
before its Dashboard's backend was ready.

**Phase 2 (separate follow-up, not planned/built yet):** the two Dashboard
widgets that depend on a new backend contract — top-all-time and
trending-fast (week/month/year). A sibling session is building the data
layer for this now; the contract below is CONFIRMED (negotiated live over
cross-session messaging while writing this spec) — two changes from the
first draft:

- `latestSnapshotAt: string | null` added alongside `earliestSnapshotAt`
  (same rationale as TikTok's equivalent field — cheap "last synced when"
  signal, the RPC already computes `max(date)`).
- `thumbnailUrl`/`permalinkUrl` will be **real data, not always `null`** —
  Facebook's post-node fetch already returns `full_picture` and Instagram's
  media fetch already returns `media_url`/`permalink` in the same response
  their sync job already calls (no extra request), so the backend session
  will store and return them for real. This does NOT retroactively change
  this spec's Phase-1 decision to build a ranked list, not a dense grid, for
  the Overview tab (posts still have no "view count," and a caption-first
  list remains the right shape for this content type) — but see the
  Overview-tab section below for a small, low-cost use of this: showing a
  small thumbnail per row, once Phase 1's own live-fetch adapter also
  requests these fields (below).

The confirmed contract:

```ts
export interface ContentSummary {
  readonly externalPostId: string
  readonly title: string
  readonly thumbnailUrl: string | null   // null today for both platforms
  readonly likes: number                  // Facebook: reactions total; Instagram: like_count
  readonly comments: number
  readonly shares: number | null          // always null for Instagram
  readonly permalinkUrl: string | null
  readonly createdAt: string | null
}
export interface ContentGrowthSummary extends ContentSummary {
  readonly growthDelta: number    // delta of TOTAL ENGAGEMENT (likes+comments+shares), not views
  readonly growthPct: number | null
}
export interface ContentTrendingResult {
  readonly topAllTime: readonly ContentSummary[]
  readonly trendingFast: {
    readonly week: readonly ContentGrowthSummary[]
    readonly month: readonly ContentGrowthSummary[]
    readonly year: readonly ContentGrowthSummary[]
  }
  readonly earliestSnapshotAt: string | null
  readonly latestSnapshotAt: string | null
}
```

Per the sibling session's confirmation, this type lives in a new
`src/lib/providers/content-trending-types.ts`, reusing
`TRENDING_WINDOW_DAYS`/`hasEnoughHistory`/`MAX_TOP_ALL_TIME` from
`video-trending-types.ts` rather than redefining them (only the
engagement-vs-views ranking metric and a lower minimum-engagement floor
differ). The backend session owns wiring `trending: ContentTrendingResult`
directly into `ChannelDetail`'s `facebook`/`instagram` cases in
`site-channel-detail.ts` — Phase 2 UI work will only ever need to read
`channelDetail.trending`, exactly like the TikTok Dashboard does today,
with no knowledge of the snapshot table/RPC underneath.

This is deliberately a NEW, parallel type family (not a rename/extension of
`VideoTrendingResult` in `src/lib/providers/video-trending-types.ts`) so
nothing about the already-shipped, already-in-production TikTok/YouTube
trending pipeline is touched by this work. Phase 2 gets planned once the
sibling session confirms/ships this contract — speculatively building UI
against an unconfirmed shape would risk a wasted rewrite.

## Provider adapter changes (`src/lib/providers/meta-explore.ts`)

Both `InstagramExplore`/`FacebookExplore` gain:
- `createdAt: string | null` — mapped from `timestamp` (Instagram, already
  an ISO string, no conversion needed) / `created_time` (Facebook, already
  an ISO string per Graph API's standard datetime format for this field —
  no Unix-seconds conversion needed here, unlike TikTok's epoch-seconds
  `create_time`).
- `permalinkUrl: string | null` — requires adding `permalink` (Instagram
  media object) / `permalink_url` (Facebook post object) to each function's
  requested `fields` string.
- `thumbnailUrl: string | null` — requires adding `full_picture` (Facebook)
  / `media_url` (Instagram) to the same `fields` string. Confirmed by the
  sibling session building Phase 2: both fields come back in the same
  response their own fetch already makes, so there's no extra request cost
  to requesting them here too. Used for a small thumbnail in the Overview
  tab's post-list rows (see below) — this does not change the Phase-1
  decision to keep a list layout rather than a dense grid.
- `fetchError: string | null`, following `TiktokExplore`'s exact pattern:
  `null` on success (list may be empty — normal), a message on a failed
  `fetch()` (non-ok response). Neither Graph endpoint here has TikTok's
  "200-with-embedded-error-code" quirk (that's TikTok-specific, documented
  in `tiktok.ts`), so this is simpler — only the HTTP-level check is needed.

Also drop the `.slice(0, 80)` truncation on `caption`/`message` for the same
reason TikTok's Task 1/Fix-5 did: the new detail dialog wants the full,
untruncated text, and nothing else needs the 80-char cap once the grid-style
card (which never existed for these platforms anyway) isn't in the picture —
confirm no other consumer depends on the cap before removing it (same
diligence TikTok's fix wave already established as the right process here).

## Header

One new component, `src/components/channels/meta/meta-channel-header.tsx`,
used by BOTH the `facebook` and `instagram` cases (not duplicated) — takes
the same prop shape as `TiktokChannelHeader` (`siteId`, `detail` narrowed to
the facebook-or-instagram `ChannelDetail` variant, `dailySeries`,
`connected`, `dateRangeLabel`) and internally branches on `detail.kind` to
pick the right 3 field names/labels for the header's stat row, exactly
mirroring how `TiktokChannelHeader` already computes its own stats
internally from `dailySeries` rather than receiving them pre-computed.

- Instagram stats: Reach / Lượt hiển thị / Lượt xem trang cá nhân (from
  `extra.reach` / `extra.impressions` / `extra.profileViews`).
- Facebook stats: Lượt hiển thị / Người dùng tương tác / Lượt tương tác bài
  đăng (from `extra.impressions` / `extra.engagedUsers` /
  `extra.postEngagements`).

No `@handle` equivalent needed here — Facebook/Instagram account names are
already the real, meaningful identity string (unlike TikTok's situation).

**Deliberate non-reuse of `TiktokChannelHeader`:** the two are visually
identical in shape but this spec creates a new component rather than
generalizing/importing the shipped TikTok one, to avoid touching
already-reviewed, already-in-production code for an unrelated platform. The
duplication is small (one header layout) and documented here rather than
silently introduced.

## Tabs

Reuse `src/components/ui/tabs.tsx`'s `UrlTabs` as-is — already a generic
primitive, no changes needed (its recent fix already makes tab-switching
purely client-side with no server re-fetch, which matters here exactly as
much as it did for TikTok, maybe more since two Graph API calls are the
resulting cost of a naive re-fetch instead of one).

## Tab 1: Tổng quan — ranked post list

New component `src/components/channels/meta/meta-post-list.tsx` (generic
across both platforms via a `metrics: readonly { label: string; value:
number | null }[]` prop per row, computed by the caller from whichever
fields that platform's `topPosts` item actually has) + a per-row click
target opening `src/components/channels/meta/meta-post-detail-dialog.tsx`.

Row content, left to right: a rank number (1-10, matching the visual
language `TiktokVideoRankingList` already established for ranked lists on
this app — order already reflects the adapter's own engagement sort, the
number is purely a scannability aid, not a separate computation), a small
(`size-10`, same dimensions `TiktokVideoRankingList` already uses) thumbnail
when `thumbnailUrl` is present else a plain placeholder square (same
fallback pattern as that component), truncated caption/message with a
`title=` tooltip, exact post date (`formatDate` from `createdAt`), and the
platform's engagement numbers inline. Clicking opens
the dialog: the larger `thumbnailUrl` image when present (same treatment as
TikTok's dialog), full caption, all engagement numbers at a larger size,
exact date/time (`formatDateTime`), and a "Xem bài đăng gốc" link when
`permalinkUrl` is present (mirrors TikTok's "Xem trên TikTok" link exactly).

Deliberate non-reuse of `TiktokVideoRankingList`/`TiktokVideoCard-`
family: those are typed and icon-labeled around TikTok's exact 4-metric,
thumbnail-first shape; forcing Facebook/Instagram's variable-metric,
no-thumbnail shape through them would mean either duplicating them anyway
(defeating the point) or reworking shipped TikTok components mid-review-cycle
for an unrelated platform. New, small, focused components instead — same
tradeoff and rationale as the header.

Empty/error states: match `TiktokVideoGrid`'s pattern exactly (`Callout` for
`fetchError`, `EmptyState` for a genuinely empty list, using the new
`fetchError` field from the adapter change above).

## Tab 2: Dashboard (Phase 1 widgets only)

Two widgets, both zero-new-backend:

1. **Top bài đăng theo khoảng lọc đang chọn** — reuses `detail.data.topPosts`
   (already date-filtered + engagement-sorted + capped at 10 by the
   existing adapter), rendered via the same `meta-post-list.tsx` component
   used in the Overview tab (same data, same rendering, just framed as
   "trong {khoảng đang lọc}" — exact parallel to TikTok Dashboard widget 1).
2. **Thống kê tổng tương tác** — sums the platform's engagement fields
   across `detail.data.topPosts` (same set as widget 1), 2-3 stat tiles
   depending on platform (Facebook: reactions/comments/shares; Instagram:
   likes/comments). New component `src/components/channels/meta/
   meta-stats-summary.tsx`, structurally identical to
   `TiktokStatsSummary` but with a variable tile count — not reused for the
   same "don't touch shipped TikTok code" reason as above.

Widgets 3 ("top mọi thời gian") and 4 ("tăng nhanh") are Phase 2, not built
in this spec — the Dashboard tab ships with 2 widgets now, 2 more added in a
follow-up once the backend contract above is confirmed and implemented.

## Data flow summary

```
getChannelDetail (site-channel-detail.ts) — facebook/instagram cases:
  unchanged shape of the call itself, `data` now additionally carries
  createdAt/permalinkUrl/fetchError per post (adapter change above)
  → no `trending` field yet (Phase 2)

page.tsx: same conditional-header-swap pattern as TikTok
  (provider === 'facebook' || provider === 'instagram') && detail.kind matches
  → MetaChannelHeader instead of the generic PageHeader block

channel-detail-body.tsx: case 'facebook'/'instagram' →
  UrlTabs(['overview','dashboard'])
    overview panel  → MetaPostList(detail.data.topPosts) [+ retained TrendCard]
    dashboard panel → MetaPostList(detail.data.topPosts, framed as in-range) + MetaStatsSummary(detail.data.topPosts)
```

The existing `TrendCard` (Reach/Lượt hiển thị daily trend) stays in the
Overview tab panel, same position relative to the post list as TikTok kept
its follower-trend chart — unchanged content, just now nested under a tab.

## Error handling

- Adapter fetch failure (new `fetchError` field): surfaces via `Callout` in
  the post list, identical pattern to TikTok's `TiktokVideoGrid`.
- No trending-pipeline failure mode to handle yet (Phase 2 doesn't exist
  here).

## Out of scope

- Phase 2 Dashboard widgets (top-all-time, trending-fast) — separate
  follow-up once the backend contract lands.
- Any change to `metrics_daily`/adapter account-level snapshot fetching
  (no new follower-count/media-count endpoint calls) — the header uses only
  fields already being fetched today.
- Reusing/refactoring any shipped TikTok component — new components only,
  documented duplication instead.
- Meta Ads (`meta-ads` provider) — unrelated, ads spend/campaigns, not
  organic content.
