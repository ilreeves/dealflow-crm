# Code review — 2026-08-11

Full review of the CRM (~18k lines) across four areas: business logic (`lib/`),
components, app routes/auth, and the database layer. This file records what was
**fixed** in the accompanying change set and what remains as a **backlog**,
ordered by priority. Verification after the fixes: `tsc` clean, ESLint 0
errors / 0 warnings (was 21 warnings), 139/139 tests passing (also under
`TZ=America/New_York`), production build succeeds, and the auth/redirect
behavior was exercised against a running dev server.

---

## Fixed in this change set

### Security
- **Open redirect in `/auth/callback`** — `?next=@evil.com` / `.evil.com` sent
  users to attacker hosts after sign-in. Now only same-origin relative paths
  pass; verified against the dev server ([route.ts](../app/auth/callback/route.ts)).
- **`/auth/callback` was unreachable when signed out** — the proxy bounced it
  to `/login` before the code exchange could run, so any Supabase email flow
  targeting it silently failed. Now public (safe with the redirect validation).
- **Failed code exchange looked like success** — an expired/replayed link now
  redirects to `/login?error=…` and the login page displays it (page split
  into a server page + `LoginForm.tsx` to read `searchParams`).
- **Signed-in users could never complete a password reset** — `/reset-password`
  was in the "bounce to / when signed in" set, which discarded the recovery
  `?code=`. It now stays reachable with a session ([proxy.ts](../proxy.ts)).
- **`/deck` prefix match** — `startsWith("/deck")` also exempted `/deck-anything`
  from auth. Now exact-segment matched (verified: `/deckfoo` → login).
- **Deck link expiry failed open** — an unparsable `shared_at` made a public
  share link valid forever. `isExpired` now fails closed ([deck.ts](../lib/deck.ts)).

### Silent data-loss paths
- **`addDealToPortfolio` swallowed everything** ([portfolio.ts](../lib/portfolio.ts)):
  a failed lookup was read as "no match" (→ duplicate company), a failed insert
  meant an Invested deal never appeared on the portfolio board with zero signal,
  and `%`/`_` in a deal name acted as LIKE wildcards (a name like `Acme_Bio`
  could match the wrong company). All three fixed; the three call sites now
  surface the error in their existing banners, and only log "Added to
  portfolio" activity when it actually happened. The mirror also now carries
  `indication`, `drug_names`, `ct_sponsor_name` so curated clinical identifiers
  survive the move to Invested.
- **Unchecked deletes on the two highest-consequence mutations** — deleting a
  deal or a portfolio company updated the UI even when the DB refused. Both now
  check the result and show the error.
- **Data Export could download a 0-byte `deals.csv` on a failed query** — worse
  than failing, since it looks like a valid backup. Now aborts with a message.
- **Activity loggers** (`lib/activity.ts`) — a failed audit insert was
  invisible; now logged to console (the feed is the only record of who changed
  what).
- **Deck share route** — the `deck_views` insert error (the whole point of the
  gate), DB lookup errors (previously indistinguishable from "dead link"), and
  a missing `SUPABASE_SERVICE_ROLE_KEY` (previously rendered every link as
  "unavailable" with nothing logged) are all now observable; transient DB
  errors return 503 instead of the permanent-sounding 404.
- **Supabase env fallbacks** — `?? "http://localhost"` / `?? "placeholder"` in
  client/server/proxy let a misconfigured deploy boot cleanly and render
  confident empty states everywhere. All three now fail fast via
  `lib/supabase/env.ts` (matching what `admin.ts` already did).

### Correctness bugs
- **Runway page vs Runway tab disagreed on planned-burn companies** — the
  portfolio-wide builder dropped the `burn_basis` argument to
  `movementUnderstatesBurn`, so e.g. Aurenar (planned-average basis) got a
  false "capital came in over that window" note on `/runway` but not on its own
  tab ([runway.ts](../lib/runway.ts)).
- **DST bug in runway date math** — `addMonths`/`monthsBetween` stepped in
  fixed 24h blocks, so any out-of-cash date spanning the November clock change
  displayed one day early (verified: `addMonths("2026-10-15", 1)` returned
  Nov 13; now Nov 14). Now calendar-day arithmetic.
- **Quarterly-only revenue plans never qualified as an annual plan** —
  `planYearFor` required an FY row while `annualProjection` accepts four
  planned quarters, so a complete quarterly plan showed no plan/progress on the
  Revenue page. The two now share one definition ([revenue.ts](../lib/revenue.ts)).
- **YTD coverage label overstated coverage** — Q1+Q3 reported (Q2 missing)
  was labeled "Q1–Q3". Non-contiguous sets now render "Q1 + Q3".
- **Runway chart windowed default never applied** — the `near/all` toggle's
  default was locked in on first render before data loaded, so long curves
  (Francis, 23 points) always opened un-windowed. Now derived after load
  ([RunwayTab.tsx](../components/portfolio/RunwayTab.tsx)).
- **`fmtMoney` sign and unit edges** — negatives rendered "$-4.5M" (now
  "-$4.5M"; this was already worked around locally in two components), and
  999,950 rendered "$1000K" (now "$1.0M").
- **`valueColor` painted unknown-cost positions green** — a null cost basis was
  treated as $0, so any value looked like a gain. Null cost is now neutral
  (a real $0 basis — Knopp — still paints).
- **`NotesExposure`** — all-null principals rendered "Infinity% above cost".
- **`formatBytes`** — ≥1 TB rendered "1.1 undefined"; sub-byte values crashed
  the index. Clamped.
- **`fetchListOptions`** — a null `value` row would land as a blank dropdown
  option; now skipped.

### Database (`supabase/`)
- **`schema.sql` could not recreate production** — eight `deals` columns the
  app reads/writes on every save (`category`, `series`, `clinical_stage`,
  `current_valuation`, `current_fundraise`, `fundraising_to_date`,
  `stage_entered_at`, `contact_email`) existed only in the live DB. Added as
  an idempotent `ALTER TABLE` block (also unblocks two backfills later in the
  file that referenced them and aborted the script).
- **`portfolio_files` and `portfolio_cash_forecast` were missing from
  `schema.sql`** — appended verbatim, matching the file's convention.
- **`migration_integrity_repairs.sql` (NEW — review, then run in the SQL
  Editor)**: missing indexes (`deals.created_at` — the default landing page
  query; `deal_activity.created_at`; `deck_views (token, viewed_at)`; five
  FK+sort composites) · server-side `updated_at` triggers on the three money
  tables (currently client-stamped, which defeats the audit trail
  `migration_runway_audit.sql` exists for) · `NOT NULL` on
  `portfolio_revenue.company_id` / `portfolio_cash.company_id` (a NULL row is
  invisible in every view and exempt from the UNIQUE keys) · fix for the
  base-case forecast rows being exempt from their UNIQUE key (NULLS DISTINCT —
  re-loading a deck currently duplicates the whole series and double-counts)
  · case-insensitive unique on `investor_contacts.name` · `(list_key, value)`
  unique on `list_options` · CHECK constraints on `entity_type`/`period_type`/
  `fiscal_year` · a `profiles` SELECT policy (Team Members currently always
  shows 1 person) · a one-off orphan sweep for `company_decks` /
  `company_enrichment` / `company_competitors`. Each section pre-checks for
  existing violations and stops with a message instead of failing silently.

### Cleanup
- All 21 ESLint warnings cleared (unused imports/vars, `useEffect` deps —
  `createBrowserClient` is a singleton so adding `supabase` is safe).
- Dead `non_con_deck_*` fields removed from `Deal`/`PortfolioCompany` types
  (superseded by `company_decks`; DB columns left for the migration backlog).
- `File` icon import in `FilesSection` shadowed the DOM `File` type used in
  `uploadFiles` — dead `fileIcon` helper and import removed.
- `termStr` `any` → typed; stale/stranded comments in `revenue.ts`/`types.ts`
  fixed; duplicate `sequentialGrowth` computation deduped;
  `force-dynamic` added to `/analytics` and `/catalysts` (whose comments
  document a request-time-clock invariant that was only held up by a side
  effect) and removed from the three static auth pages.

---

## Backlog (identified, not fixed)

### High value
1. **Rate-limit the public deck route** (`app/api/deck/[token]/route.ts`) — no
   auth, no rate limit, and each POST both inserts an attacker-controlled
   `deck_views` row via the service-role client and mints a fresh 1-hour signed
   URL. One leaked link = unlimited signed-URL vending machine and a poisonable
   view tracker. Add per-token+IP rate limiting and de-dupe repeat views within
   a window; consider dropping the signed-URL TTL to 5–10 min (DeckGate fetches
   on demand) so revocation is meaningful.
2. **Deleting a deal/company should revoke its share links** — `company_decks`
   is polymorphic (no FK): the delete handlers remove neither the deck rows nor
   the storage objects, so a deleted company's public link keeps serving for up
   to 4 weeks. The repairs migration sweeps existing orphans; the delete
   handlers (`DealDetailModal`, `PortfolioCompanyDetail`) still need the
   cleanup, and the deck route could defensively check the parent exists.
3. **Catalysts join to companies by name** — renaming a portfolio company
   silently detaches its catalysts (`catalysts.company_name` is plain text;
   `PortfolioCompanyForm` renames without updating it). Either add a
   `company_id` FK + backfill, or make the rename path also update
   `catalysts`/`catalyst_activity`/`legacy_companies`.
4. **~15 more unchecked mutations in components** — the same
   silently-swallowed-error class as the fixed deletes, one small fix each.
   Catalyst mutations are the worst cluster (`CatalystGantt` saveTitle /
   applyBarMenu / commitMove, `CatalystCalendar` status/note/delete/dismissed-
   reminders, `CatalystEditModal` — which also logs "Catalyst deleted" activity
   even when the delete failed). Then: `FundraisingTab.handleDeleteRound`
   (deletes positions first, unchecked, then the round — can silently destroy
   Solas position rows; snapshot-and-restore already exists in `RoundEditor` to
   copy), `NotesList`/`MeetingsList` note inserts (failed insert discards the
   typed text) and `MeetingFiles` uploads, `ProfileSettings.saveName` (false ✓),
   `ListManager`, `InvestorDirectory`, `InvestorIntrosTab`, `CapRoundsTab`
   mark-delete, settings custom-field load/delete, `InvestModal` rollback
   deletes (a failed rollback leaves the orphan the rollback exists to
   prevent — collect and report). The good pattern to copy is in
   `RunwayTab`/`DealFundraisingTab`.
5. **Dashboard pages render errors as zeros** — every server page coalesces
   `data ?? []` without reading `error`, so an RLS/transient failure renders
   "0 deals / $0 AUM" confidently. Destructure `error` and throw to an
   `error.tsx` boundary (one exists per the App Router default) or pass a
   per-section `failed` flag.

### Performance
6. **Pipeline board over-fetch** — `/` does `select('*')` on `deals` (37
   columns incl. `description`, `pass_reason`, `custom_fields` JSONB) with no
   limit; the board renders ~6 fields and `DealDetailModal` refetches anyway.
   Select the ~12 columns actually used. (Index for the sort is in the repairs
   migration.)
7. **Revenue/Runway pages fetch full history** — every `portfolio_revenue` /
   `portfolio_cash` row ever, for views that show the current year. Bound with
   `.gte()` on a trailing window.
8. **Analytics scans `deal_activity` unbounded** — stage-change rows grow
   forever and are walked twice per load. Bound to a rolling window (e.g. 24
   months) or precompute.
9. **`CatalystGantt` drag re-renders the whole chart** on every `pointermove`
   (`setDrag` per event) — apply `dx` via a transform on the dragged element,
   commit on `pointerup`.
10. **Repeated `auth.getUser()` + profile fetch** — the layout already has the
    user server-side, but `PipelineBoard`, `DealDetailModal`, `NotesList`, and
    `MeetingsList` each refetch it (per mount, and per note submit; `eq('id',
    undefined)` when logged out). Pass `actorName` down or extract one
    `useActorName()`.
11. Smaller: `ListManager.move()` issues one UPDATE per option per click (swap
    two rows instead); `DealForm` selects `source` from every deal to build a
    combo box (move to `list_options`); `PortfolioBoard` has no memoization;
    `fund-performance` valuation resolution is O(companies × rounds) — fine
    today, trivial to pre-bucket; `runway.ts` re-sorts the same rows five times
    per company; `useLatestRound` never refetches after a round edit (Overview
    header stale until remount); `PortfolioCompanyDetail` catalysts fetch has
    no cancelled-guard and uses `select('*')`; enrichment route fans out one
    clinicaltrials.gov request per drug name with no cap (`.slice(0, 8)` it).

### Product / correctness decisions (need your call)
12. **Convertible-note accrual is entirely manual** — `terms.interest_rate` /
    `interest_type` are stored but nothing computes or validates
    `accrued_interest` against 10% simple Actual/365; figures go stale as time
    passes. If the convention (see CRM memory) is meant to be enforced, the
    math is missing rather than wrong — a `noteAccruedInterest(principal, rate,
    start, asOf)` in `lib/rounds.ts` plus a "computed vs entered" mismatch
    badge in `FundraisingTab` would do it.
13. **"Check Size" column in `DealsTable` is always "—"** — no form writes
    `deals.check_size`. Add the field to `DealForm` or drop the column.
14. **`indication` is captured but rendered nowhere** — both forms write it;
    no overview shows it. Add next to Clinical Stage or remove the input.
15. **Search-while-on-page does nothing** — `GlobalSearch` → `/?open=<id>` (and
    `/portfolio?open=<id>`) is read only in a mount-time initializer, so it
    no-ops if you're already on that page. Track the last-seen param (same
    shape as `useServerState`).
16. **`fund-performance` vs `CapRoundsTab` compute "current valuation" and
    position value independently** — extract `latestValuation()` /
    `positionValue()` into `lib/portfolio.ts` so the Ownership tab can't
    disagree with Fund Performance. Same for the legacy/exited exclusion set,
    which exists only in `analytics`.
17. **`forecastAccuracy` / `forecastContradictsFlatBurn`** (~90 lines in
    `cashForecast.ts`) have no callers — wire in or delete; if kept, both need
    scenario filtering / sorting fixes first (details in file review).
18. **Duplication worth consolidating when convenient** — `ABMS_SPECIALTIES`
    (42 entries, twice), catalyst constants (4 copies), `Th`/`Tile`/`Stat`
    components (byte-identical copies), `buildEmail` deck-share closure
    (~25 lines, twice), enrichment types (`Trial`/`Pub`/`statusColor`, twice),
    `inputCls`/`fmtMoney`/`Field` locals in `InvestModal`/`FundPerformanceView`
    that `lib/rounds.ts` / `components/shared/Field.tsx` already export.
19. **DB odds and ends** — drop the eight dead `non_con_deck_*` columns + two
    token indexes once confirmed backfilled; drop the dead
    `company_enrichment.competitors`/`indication_used` (superseded by
    `company_competitors`); `portfolio_revenue.period_end` could be
    `NOT NULL` (always derivable); a retention policy for `deck_views`;
    `deals.stage` / `portfolio_companies.status` / catalyst+intro statuses
    have app-side enums but no CHECKs; `PORTFOLIO_STATUSES` in `types.ts` has
    no consumers while `runway.ts` hardcodes the strings.
20. **Forms: Save button sits outside the `<form>`** (`DealForm`,
    `PortfolioCompanyForm`) — native `required`/email/url validation never
    runs, and an empty name makes Save appear dead (no message). Wire
    `type="submit" form="<id>"` or set an explicit error.

### Notes
- Deck token entropy, RLS coverage (all 27 tables), `.single()` uniqueness
  backing, FK cascades on non-polymorphic tables, and DATE vs TIMESTAMPTZ
  typing were all checked and are sound.
- The three revenue migrations interact cleanly; `migration_revenue_revised`'s
  data step is effectively idempotent but fragile if 'Reforecast' is ever
  hand-entered again — a CHECK on `projected_source` would make it structural.
- The deployed build registers the proxy correctly (`ƒ Proxy (Middleware)` in
  the build output); an earlier stale `.next/` manifest suggesting otherwise
  was a cloud-sync artifact. Consider adding `.next/` to cloud-sync exclusions —
  there are `app 3`/`middleware 3` conflict copies in there.
