# Remember Last-Selected Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a logged-in user hits `/`, send them to the site they last viewed (persisted per-account) instead of always the first-created site, until they explicitly switch.

**Architecture:** Add `profiles.last_site_id` (nullable FK to `sites`). `src/app/page.tsx` reads it and redirects there if it's still a site the user can access, else falls back to the first site (today's behavior). `src/app/(app)/[siteId]/layout.tsx` writes it via Next's `after()` whenever the rendered site differs from the stored value, so the write never blocks page render.

**Tech Stack:** Next.js 16.3.0 (App Router, `after()` from `next/server`), Supabase Postgres + RLS, TypeScript.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-remember-last-site-design.md`
- No new client-side state, no new dependency, no new RLS policy (reuse `profiles_update_own` from `20260812000001_init_auth_and_sites.sql`).
- Repo has no automated test runner (no vitest/jest, no `test` script in `package.json`) — verification for each task is `npx tsc --noEmit`, `npm run lint`, and manual check where noted. Do not introduce a new test framework as part of this feature.
- Follow existing code comment style: only comment the non-obvious "why" (see `src/lib/data/sites.ts` for the house style), no restating what code does.

---

### Task 1: Migration — add `profiles.last_site_id`

**Files:**
- Create: `supabase/migrations/20260814000001_profile_last_site.sql`

**Interfaces:**
- Produces: column `public.profiles.last_site_id uuid null references public.sites(id) on delete set null`, consumed by Task 2's `setLastSiteId` and `getCurrentProfile`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Ghi nhớ site đã chọn gần nhất theo tài khoản, để "/" đưa người dùng quay
-- lại đúng site họ đang làm việc thay vì luôn về site tạo đầu tiên.
-- on delete set null: site bị xoá thì quay về hành vi mặc định (site đầu
-- tiên), không kẹt vào lỗi ràng buộc khoá ngoại.
-- ============================================================================

alter table public.profiles
  add column last_site_id uuid references public.sites (id) on delete set null;
```

- [ ] **Step 2: Verify the migration file matches existing conventions**

Run: `ls supabase/migrations/ | tail -3` and open the newest prior migration (`20260813000015_connection_avatar.sql`) side by side — confirm header comment style, `alter table` formatting, and trailing newline match.

- [ ] **Step 3: Apply locally if a local Supabase stack is configured**

Run: `supabase db push` (skip if no local Supabase project is linked in this environment — the migration will apply on next deploy either way; do not fail the task over this).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814000001_profile_last_site.sql
git commit -m "feat: add profiles.last_site_id column"
```

---

### Task 2: Data layer — read/write `last_site_id`

**Files:**
- Modify: `src/lib/data/sites.ts:112-131` (`getCurrentProfile`)
- Modify: `src/lib/data/sites.ts` (add `setLastSiteId` near the bottom of the file)

**Interfaces:**
- Consumes: Supabase server client via `createClient()` (already imported in this file), `profiles.last_site_id` column from Task 1.
- Produces:
  - `getCurrentProfile(): Promise<{ userId: string; email: string; displayName: string; avatarUrl: string | null; lastSiteId: string | null } | null>` — adds `lastSiteId` to the existing return shape.
  - `setLastSiteId(userId: string, siteId: string): Promise<void>` — best-effort update, never throws.
- Consumed by: Task 3 (`src/app/page.tsx`) reads `lastSiteId`; Task 4 (`src/app/(app)/[siteId]/layout.tsx`) reads `lastSiteId` and calls `setLastSiteId`.

- [ ] **Step 1: Extend `getCurrentProfile`'s select and return value**

In `src/lib/data/sites.ts`, change the `getCurrentProfile` function (currently lines 112-131):

```ts
export const getCurrentProfile = async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, last_site_id')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? '',
    displayName: data?.full_name ?? user.email?.split('@')[0] ?? 'Bạn',
    avatarUrl: data?.avatar_url ?? null,
    lastSiteId: data?.last_site_id ?? null,
  }
}
```

(Only change: `.select(...)` now includes `last_site_id`, and the returned object gains `lastSiteId`.)

- [ ] **Step 2: Add `setLastSiteId`**

Append to the end of `src/lib/data/sites.ts`:

```ts
/**
 * Ghi lại site đang xem, theo tài khoản. Gọi từ `after()` trong layout của
 * site — không được throw ra ngoài request đang render, nên tự nuốt lỗi ở
 * đây và chỉ log.
 */
export const setLastSiteId = async (userId: string, siteId: string): Promise<void> => {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ last_site_id: siteId })
    .eq('id', userId)

  if (error) console.error(`Không ghi được last_site_id: ${error.message}`)
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/data/sites.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/sites.ts
git commit -m "feat: read/write last-selected site on profile"
```

---

### Task 3: Root entry — redirect to last-selected site

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile()` and `listSites()` from `src/lib/data/sites.ts` (Task 2's `lastSiteId` field).

- [ ] **Step 1: Replace the redirect logic**

Current file (`src/app/page.tsx`):

```ts
import { redirect } from 'next/navigation'
import { listSites } from '@/lib/data/sites'
import { getCurrentUser } from '@/lib/supabase/server'

/**
 * Điểm vào. Ba nhánh:
 *   chưa đăng nhập      → /sign-in
 *   đăng nhập, chưa Site → /onboarding
 *   đăng nhập, có Site   → Site đầu tiên
 *
 * Proxy cũng chặn trường hợp chưa đăng nhập, nhưng kiểm tra lại ở đây là
 * cố ý: proxy là lớp tiện lợi, không phải lớp bảo mật — một cấu hình
 * matcher sai là nó im lặng ngừng chạy.
 */
export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const sites = await listSites()
  if (sites.length === 0) redirect('/onboarding')

  redirect(`/${sites[0]!.id}/overview`)
}
```

Replace with:

```ts
import { redirect } from 'next/navigation'
import { getCurrentProfile, listSites } from '@/lib/data/sites'
import { getCurrentUser } from '@/lib/supabase/server'

/**
 * Điểm vào. Ba nhánh:
 *   chưa đăng nhập      → /sign-in
 *   đăng nhập, chưa Site → /onboarding
 *   đăng nhập, có Site   → Site đã xem gần nhất, hoặc Site đầu tiên nếu
 *                          chưa từng chọn / Site đã lưu không còn truy cập
 *                          được (đã xoá, hoặc bị gỡ quyền — listSites() đã
 *                          lọc theo RLS nên "không có trong danh sách" phủ
 *                          cả hai trường hợp)
 *
 * Proxy cũng chặn trường hợp chưa đăng nhập, nhưng kiểm tra lại ở đây là
 * cố ý: proxy là lớp tiện lợi, không phải lớp bảo mật — một cấu hình
 * matcher sai là nó im lặng ngừng chạy.
 */
export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')

  const [sites, profile] = await Promise.all([listSites(), getCurrentProfile()])
  if (sites.length === 0) redirect('/onboarding')

  const targetSiteId =
    profile?.lastSiteId && sites.some((site) => site.id === profile.lastSiteId)
      ? profile.lastSiteId
      : sites[0]!.id

  redirect(`/${targetSiteId}/overview`)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/app/page.tsx`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in, switch to a non-default site via the site switcher, then navigate the browser to `/` directly. Expected: redirected to the site just switched to, not `sites[0]`.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: redirect / to last-selected site"
```

---

### Task 4: Site layout — persist site on view

**Files:**
- Modify: `src/app/(app)/[siteId]/layout.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile()` (already called in this file) for `lastSiteId`; `setLastSiteId(userId, siteId)` from Task 2; `after` from `next/server`.

- [ ] **Step 1: Import `after` and `setLastSiteId`**

At the top of `src/app/(app)/[siteId]/layout.tsx`, change:

```ts
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { SideRail } from '@/components/layout/side-rail'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentProfile, getSite, listSites } from '@/lib/data/sites'
import { getConnectionSummary } from '@/lib/data/connections'
```

to:

```ts
import { notFound, redirect } from 'next/navigation'
import { after } from 'next/server'
import type { ReactNode } from 'react'
import { SideRail } from '@/components/layout/side-rail'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentProfile, getSite, listSites, setLastSiteId } from '@/lib/data/sites'
import { getConnectionSummary } from '@/lib/data/connections'
```

- [ ] **Step 2: Schedule the write after the existing guards**

In the same file, the body currently reads (lines 30-35):

```ts
  if (!profile) redirect('/sign-in')
  // RLS đã lọc: không đọc được nghĩa là hoặc không tồn tại, hoặc không có
  // quyền. Cả hai đều trả 404 — trả 403 sẽ tiết lộ Site đó có tồn tại.
  if (!site) notFound()

  return (
```

Insert between `if (!site) notFound()` and `return (`:

```ts
  if (!profile) redirect('/sign-in')
  // RLS đã lọc: không đọc được nghĩa là hoặc không tồn tại, hoặc không có
  // quyền. Cả hai đều trả 404 — trả 403 sẽ tiết lộ Site đó có tồn tại.
  if (!site) notFound()

  // Chỉ ghi khi site thực sự đổi so với lần trước — tránh ghi lại mỗi lần
  // chuyển trang/tab trong cùng một site. after() chạy sau khi response đã
  // trả về nên không thêm độ trễ cho việc render.
  if (profile.lastSiteId !== site.id) {
    after(() => setLastSiteId(profile.userId, site.id))
  }

  return (
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/app/(app)/[siteId]/layout.tsx`.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in, switch to site B via the switcher (page navigates to `/${B}/overview`), then reload the browser at `/`. Expected: redirected to site B, not `sites[0]`. Then sign out and sign back in, hit `/`. Expected: still site B.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/[siteId]/layout.tsx"
git commit -m "feat: persist last-viewed site to profile"
```

---

### Task 5: Full verification pass

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

- [ ] **Step 4: End-to-end manual walkthrough**

With `npm run dev` running: (1) switch to a non-first site, reload `/` → lands on that site; (2) remove your own membership from that site directly in Supabase (or use a second test site you then lose access to) and hit `/` → falls back to `sites[0]` without a 404; (3) confirm a brand-new user with exactly one site still lands correctly and a user with zero sites still lands on `/onboarding`.

No commit for this task — it's a checkpoint, not a change.
