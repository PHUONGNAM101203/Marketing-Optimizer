# Real LLM citation checking + topic-based question suggestions — design

## Context

`/ai-visibility` today has a placeholder: a Callout explicitly states citation
checking against ChatGPT/Claude/Gemini/Perplexity isn't wired up, and the
"Lượt kiểm tra trích dẫn" stat is hardcoded to `"0"`. `tracked_prompts` (real,
CRUD-backed) and `citation_checks` (schema-complete, zero writers) both
already exist from the 2026-08-13 `ai_visibility` migration. Separately, a
parallel session is generalizing this app's AI-calling infrastructure from
Claude-only to multi-provider (`callAi` dispatcher in `providers/ai.ts`,
`resolveAiConfig`/`getSiteAiConnection` in `lib/data/site-ai-keys.ts`) — Tasks
7-8 of that plan are complete and stable; Tasks 9-13 touch
`actions/ai-keys.ts`, the Settings UI, `actions/prompts.ts`, and
`agents/run-agent.ts`, none of which this design touches.

This spec covers two related, independently shippable pieces that both live
on `/ai-visibility`:

- **A — Citation checking**: for each tracked prompt, actually ask the
  site's configured LLM and record whether it mentions the site.
- **B — Topic-based question/keyword suggestions**: replace the current
  template-only `suggestPrompts()` output with LLM-generated suggestions
  informed by the site's own topic, with a template fallback.

## Part A — Citation checking

**Call:** `resolveAiConfig(siteId)` → `callAi` with the tracked prompt's
text as the user message, a web-search tool enabled (per decision: real web
search grounding, not train-time-knowledge-only — closer to how a user
actually experiences ChatGPT/Perplexity today, worth the added per-call
cost). Falls back through the same chain already established
(`site_ai_keys` → env `ANTHROPIC_API_KEY`) — if neither is configured, the
check surfaces as "chưa cấu hình", same UX as the existing prompt test-run
flow.

**Citation detection:** substring match of the site's domain and
`SiteProfile.businessName` against the model's final text response.
`cited: boolean`, `excerpt: string | null` (surrounding sentence when
matched). `position`, `sentiment`, `competitors_cited` are written as `null`/
`[]` in this pass — reliably inferring rank/sentiment/competitor names from
free text needs its own follow-up design, not stubbed out here.

**Storage:** `citation_checks` (existing table, unmodified) — one row per
check run: `prompt_id`, `engine` (derived from the resolved provider —
`anthropic`→`claude`, `openai`→`chatgpt`, `gemini`→`gemini`, matching
`AI_ENGINES`), `checked_at`, `date`, `cited`, `excerpt`, `cited_url` (first
URL in the response text if present, else `null`).

**Trigger:** "Kiểm tra ngay" button per `TrackedPromptCard`, on-demand only
(same pattern as `testRunPromptAction`) — no scheduled/cadence automation in
this pass, despite `tracked_prompts.cadence` already existing as a column.

**UI:** `TrackedPromptCard` gains a latest-check summary (cited/not cited,
engine, relative time, excerpt) once at least one check exists. The
"Lượt kiểm tra trích dẫn" stat on the page becomes a real count instead of
hardcoded `"0"`.

## Part B — Topic-based question/keyword suggestions

**Call:** `resolveAiConfig(siteId)` → `callAi`, prompting for ~10 commonly
searched questions/keywords about the site's topic (`SiteProfile.category`,
`topKeywords`, `description` as input) — knowledge-based, no web search tool
(this doesn't need grounding the way citation-checking does, and it's
explicitly NOT meant to depend on any connection per the requirement that it
work for every site regardless of what's connected).

**Freshness:** computed once per audit scan, inside `performAuditScan`
alongside `computeSiteProfile` — not on every page load. New column
`audit_runs.global_keyword_suggestions jsonb null`
(`readonly { question: string }[]`). "Continuously updated" means it
refreshes every time the site is rescanned, consistent with how
`site_profile` itself already behaves.

**Fallback:** if the LLM call fails or no key is available at all
(site-level and env-level both absent), fall back to the existing
`suggestPrompts()` template output — this section is never fully empty.

**UI:** replaces the current "Gợi ý theo chủ đề" section content (same
card/list UI, different data source) — not run side-by-side with the
template version, since the LLM version is a strict quality upgrade when
available and the template is purely the degradation path.

## Data model changes

- No changes to `citation_checks` (already correctly shaped).
- New migration: `alter table audit_runs add column global_keyword_suggestions jsonb null`.

## Touch points

- `src/lib/actions/citation-checks.ts` (new) — `runCitationCheckAction`
- `src/lib/data/citation-checks.ts` (new) — read latest check(s) per prompt
- `src/lib/audit/global-suggestions.ts` (new) — LLM call + fallback logic
  for Part B, invoked from `performAuditScan`
- `src/lib/actions/audit.ts` — call the above, persist
  `global_keyword_suggestions`
- `src/lib/domain/audit.ts` / `src/lib/data/audit.ts` — thread the new field
  through `AuditRun`
- `src/lib/domain/geo.ts` — `AI_ENGINES`/`CitationCheck` types already exist,
  reuse as-is
- `src/components/geo/tracked-prompt-card.tsx` — citation summary + trigger
  button
- `src/app/(app)/[siteId]/ai-visibility/page.tsx` — real stat, swap
  suggestion source
- one new Supabase migration

## Explicitly out of scope (this pass)

- Google AI Overviews / Copilot checks — no public API, stays manual/unsupported.
- Scheduled/cadence-based automatic re-checking.
- Sentiment, competitor extraction, citation position/ranking.
- Multi-key-per-site (site still tests against whichever single provider it
  has configured, per earlier decision).

## Verification

`tsc`/`lint`/`build`, then a real "Kiểm tra ngay" run against a tracked
prompt on armywear.dk once the shared `resolveAiConfig`/`callAi` layer from
the parallel session is confirmed stable, plus a fresh `/audit` scan to
confirm `global_keyword_suggestions` populates and the fallback path works
when tested with no key configured.
