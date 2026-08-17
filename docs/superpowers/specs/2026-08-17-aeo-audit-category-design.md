# AEO audit category — design

## Context

`audit_runs` scores three deliberately-separate axes today: SEO (traditional
search technical foundation), GEO (generative-engine citation readiness —
llms.txt, schema, entity/trust signals), AIO (AI Overview/answer-engine
readiness — AI crawler access, extractable format). Two existing checks
already live in the wrong bucket for what they actually measure:
`aio-faq-pattern` (FAQPage schema / question-headings) sits in AIO, and
`geo-direct-answers` (concise direct-answer opening paragraph) sits in GEO.
Both are really about structuring *content* to be lifted verbatim as an
answer — the definition of Answer Engine Optimization (AEO): featured
snippets, voice assistants, "People Also Ask", FAQ rich results.

## Decision

Add AEO as a fourth independent score, matching the existing SEO/GEO/AIO
pattern exactly (own rule file, own score column, own tab). Migrate the two
misplaced checks into it rather than duplicating them. Do not touch SEO, and
do not remove/rename anything from GEO/AIO beyond the two migrated checks —
out of scope for this change.

After migration: GEO retains 4 checks (llms.txt, schema coverage, heading
density, E-E-A-T). AIO retains 3 checks (AI crawler access, extractable
format, concise opening summary). Both remain large enough to score
meaningfully.

## AEO rule set (`src/lib/audit/rules/aeo.ts`)

| id | Check | Origin |
|---|---|---|
| `aeo-faq-pattern` | FAQPage schema, or ≥2 question-phrased headings | migrated from `aio-faq-pattern` |
| `aeo-direct-answer` | First paragraph after a heading answers concisely (40–300 chars) | migrated from `geo-direct-answers` |
| `aeo-howto-schema` | Instructional content (H1 matches "cách"/"hướng dẫn"/"how to") has HowTo schema | new, heuristic |
| `aeo-speakable-schema` | Page declares `schema.org/SpeakableSpecification` | new — `warn` not `fail` on absence (advanced/optional, most sites lack it; failing it would be misleadingly harsh) |
| `aeo-question-heading-ratio` | Share of H2/H3 headings phrased as questions | new, heuristic |

All three new checks read fields already present on `PageSignals` from the
existing crawler (heading text, JSON-LD types) — no new crawl work.

## Data model

New migration: `alter table audit_runs add column aeo_score numeric null`,
mirroring the three existing score columns exactly (same nullability,
same type). No RLS change needed (inherits the table's existing policy).

Existing `audit_runs` rows predate this column and will read `aeo_score:
null`. The AEO tab must render an explicit "chưa quét — chạy lại audit để có
điểm AEO" state for those runs, not a false zero.

## Touch points

- `src/lib/audit/rules/aeo.ts` (new rule set)
- `src/lib/audit/rules/geo.ts`, `aio.ts` (remove the two migrated checks)
- `src/lib/audit/rules/index.ts` (wire `aeo` into `evaluateAllRules`)
- `src/lib/domain/audit.ts` (`AuditCategory`, `AUDIT_CATEGORIES`,
  `AUDIT_CATEGORY_LABELS`, `AUDIT_CATEGORY_DESCRIPTIONS`, `AuditRun.aeoScore`,
  `scoreOf`)
- `src/lib/actions/audit.ts` (persist `aeo_score` on the inserted/updated row)
- `src/lib/data/audit.ts` (read `aeo_score` back into `AuditRun`)
- `src/app/(app)/[siteId]/audit/page.tsx` / tab list, `audit-category-panel.tsx`
- one new Supabase migration + hand-added RPC-adjacent type entries in
  `database.types.ts` (same convention as prior migrations in this repo)

## Verification

No test suite in this repo (see `CLAUDE.md`). Verify with `npx tsc --noEmit`
+ `npm run lint` + `npm run build`, then run a real `/audit` scan against
armywear.dk to confirm the AEO score computes and the tab renders findings
correctly, including the "not yet scanned" state for the pre-existing latest
run before a fresh scan completes.

## Out of scope (deferred to a follow-up spec)

Real LLM citation checking on `/ai-visibility` (calling ChatGPT/Claude/
Gemini/Perplexity APIs to verify actual citations) — separate sub-project,
larger scope (external API costs, key management, rate limits, model
selection), to be brainstormed and specced separately after this ships.
