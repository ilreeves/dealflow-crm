-- Runway seed data — extracted from board decks, August 2026.
--
-- ⚠️ THIS FILE IS THE BOOTSTRAP, NOT THE FULL RECORD. It was run against
-- production on 2026-08-07 and covers iO Urology, InterShunt, Vesalio and Vektor
-- Medical only. Companies extracted after that were written straight to the
-- database over the REST API, with their sources and caveats carried in each
-- row's own `source_detail` and `notes` columns — so **the table itself is the
-- source of truth for provenance**, not this file. Re-running this is harmless
-- (idempotent, and it never deletes) but will not restore everything.
--
-- RUN migration_runway.sql FIRST. Then run this in a fresh SQL Editor tab.
-- Idempotent: re-running updates the same (company, as_of) rows rather than
-- duplicating them, so it's safe to re-run as more decks are read.
--
-- Companies are looked up BY NAME rather than by hardcoded UUID so this file
-- stays readable and portable.
--
-- Dollars, not thousands, per the portfolio_revenue convention.

-- ─── iO Urology ───────────────────────────────────────────────────────────────
-- Source: "IO Urology Q2 2026_Board Deck_PreRead.pdf", emailed 2026-07-14 for the
-- 2026-07-21 board meeting. Slides 11 (cash flow) and 12 (balance sheet).
--
-- The deck gives four consecutive quarters of burn, so the trend is real data
-- rather than an interpolation. Only the 6/30/2026 cash balance is stated, so the
-- earlier rows carry burn only — which is exactly why cash and burn are separate
-- nullable columns.
--
-- No company-stated runway for the CURRENT cash position: the deck's "12-14 mo"
-- and "28+ mo" figures are POST-Series-B scenarios, not runway on $6.0M, so
-- entering them would overstate the position by design. Runway here is derived.

INSERT INTO portfolio_cash (company_id, as_of, cash_on_hand, monthly_burn, burn_basis, source, source_detail, notes)
SELECT id, '2026-06-30', 6000000, 495000, 'Net burn — 3-mo average', 'Board deck',
  'IO Urology Q2 2026 Board Deck PreRead, slides 11–12',
  'Cash burn includes CapEx (handles) — the deck cites lower CapEx as a driver of the $495k. Q2 actual was $109k/mo below the $603k forecast. Series B delayed: forecast cash at 6/30 assumed the raise closed and was $48.7M vs $6.0M actual.'
FROM portfolio_companies WHERE name = 'iO Urology'
ON CONFLICT (company_id, as_of) DO UPDATE SET
  cash_on_hand = EXCLUDED.cash_on_hand, monthly_burn = EXCLUDED.monthly_burn,
  burn_basis = EXCLUDED.burn_basis, source = EXCLUDED.source,
  source_detail = EXCLUDED.source_detail, notes = EXCLUDED.notes, updated_at = NOW();

-- Prior three quarters: burn only, no cash balance stated for these dates.
INSERT INTO portfolio_cash (company_id, as_of, monthly_burn, burn_basis, source, source_detail, notes)
SELECT c.id, v.as_of, v.burn, 'Net burn — 3-mo average', 'Board deck',
  'IO Urology Q2 2026 Board Deck PreRead, slide 11 (last-4-quarters trend)',
  'Burn only — the deck states a cash balance for 6/30/2026 alone.'
FROM portfolio_companies c
CROSS JOIN (VALUES
  (DATE '2026-03-31', 411000),
  (DATE '2025-12-31', 435000),
  (DATE '2025-09-30', 483000)
) AS v(as_of, burn)
WHERE c.name = 'iO Urology'
ON CONFLICT (company_id, as_of) DO UPDATE SET
  monthly_burn = EXCLUDED.monthly_burn, burn_basis = EXCLUDED.burn_basis,
  source = EXCLUDED.source, source_detail = EXCLUDED.source_detail,
  notes = EXCLUDED.notes, updated_at = NOW();

-- ─── Vektor Medical ───────────────────────────────────────────────────────────
-- Source: "2026.07.20 - Vektor Medical - Board of Directors - Q2 Pre-read deck",
-- slide 11. The richest cash series in the book: THIRTEEN consecutive months of
-- actual cash balance AND actual monthly cash burn, both stated by the company.
-- Deck figures are in $000s and are converted to dollars here.
--
-- ⚠️ CASH ROSE IN THREE MONTHS — Dec-25, Jan-26 and Mar-26 — because financings
-- landed ($16.5M convertible note funded). This is exactly the case
-- cashMovementBurn()'s `cashRose` flag exists for: Mar-26's balance jumped
-- $3.649M → $10.521M while the company's OWN burn that month was $1.358M, so
-- roughly $8.2M came in. Never read burn off the balance movement in those
-- months; the company's stated burn is the operating truth.
--
-- Useful cross-validation of the movement method where NO financing intervened:
-- May-26 $8.636M → Jun-26 $7.501M implies ~$1.152M/mo against the company's
-- stated $1.127M — inside 2%.
--
-- No company-stated runway in this deck, so runway is derived: $7.501M at the
-- June burn of $1.127M/mo is ~6.7 months. Note the ~$25M Series B is a separate
-- live round from the note that already funded.

INSERT INTO portfolio_cash (company_id, as_of, cash_on_hand, monthly_burn, burn_basis, source, source_detail, notes)
SELECT c.id, v.as_of, v.cash, v.burn, 'Net burn — single month', 'Board deck',
  'Vektor Medical Q2-2026 Board pre-read, slide 11 (monthly actuals table)',
  v.note
FROM portfolio_companies c
CROSS JOIN (VALUES
  (DATE '2026-06-30',  7501000, 1127000, 'Q2-26 close. 1H-26 burn was $421k below forecast.'),
  (DATE '2026-05-31',  8636000, 1227000, NULL),
  (DATE '2026-04-30',  8693000, 1918000, NULL),
  (DATE '2026-03-31', 10521000, 1358000, 'Cash ROSE $3.649M → $10.521M — financing inflow of roughly $8.2M, not negative burn.'),
  (DATE '2026-02-28',  3649000, 1948000, NULL),
  (DATE '2026-01-31',  5517000,  911000, 'Cash ROSE — financing inflow, not negative burn.'),
  (DATE '2025-12-31',  3102000, 1779000, 'Cash ROSE $1.208M → $3.102M — financing inflow, not negative burn.'),
  (DATE '2025-11-30',  1208000, 1229000, 'Low point of the series before the note funded.'),
  (DATE '2025-10-31',  2431000, 1308000, NULL),
  (DATE '2025-09-30',  3739000,  970000, NULL),
  (DATE '2025-08-31',  4709000,  935000, NULL),
  (DATE '2025-07-31',  5644000, 1298000, NULL),
  (DATE '2025-06-30',  6942000, 1054000, NULL)
) AS v(as_of, cash, burn, note)
WHERE c.name = 'Vektor Medical'
ON CONFLICT (company_id, as_of) DO UPDATE SET
  cash_on_hand = EXCLUDED.cash_on_hand, monthly_burn = EXCLUDED.monthly_burn,
  burn_basis = EXCLUDED.burn_basis, source = EXCLUDED.source,
  source_detail = EXCLUDED.source_detail, notes = EXCLUDED.notes, updated_at = NOW();

-- ─── InterShunt ───────────────────────────────────────────────────────────────
-- Source: "260720 InterShunt BOD - FINAL.pdf", 2026-07-20 board meeting, slides
-- 21 and 23. The best-documented cash position in the book — a dated forecast
-- curve, not just a balance.
--
-- TWO balances recorded, which is what makes the cross-portfolio comparable burn
-- computable: $13,428,717 (5/31) → $12,929,120 (6/30) = ~$500k/mo ACTUAL.
--
-- ⚠️ EXPECT A "check" FLAG HERE, AND IT IS CORRECT. Stated cash-out is April
-- 2027 (~9.7 months from 6/30), but $12.9M ÷ $500k/mo of current burn would be
-- ~26 months. The gap is real and is the single most important fact about
-- InterShunt's cash: burn is forecast to roughly triple as the pivotal ramps.
-- The deck's own curve steps 6/30 $12.93M → Oct-26 $7.86M → Dec-26 $6.23M →
-- Feb-27 $2.65M → Mar-27 $1.63M → Apr-27 $(0.55)M, i.e. ~$1.29M/mo average to
-- cash-out. The stated date wins per convention; the flag prompts reading this.

INSERT INTO portfolio_cash (company_id, as_of, cash_on_hand, monthly_burn, burn_basis, out_of_cash_date, source, source_detail, notes)
SELECT id, '2026-06-30', 12929120, 499597, 'Net burn — single month', '2027-04-30', 'Board deck',
  '260720 InterShunt BOD - FINAL, slides 21 & 23',
  'Burn is the ACTUAL May→June cash movement, so it is a real measured figure. Forward burn is forecast far higher: the deck''s curve averages ~$1.29M/mo to cash-out as the pivotal ramps, which is why stated runway (Apr-27) is much shorter than cash ÷ current burn. Interpolating the deck''s monthly grid, zero is crossed ~2027-04-23; recorded as month-end per the deck''s "cash out April 2027". Series C of $134M needed through commercial launch (Jun-33). Also in this deck: new 409A as of 6/1/2026, +14.2% on the $6.00/sh of 11/8/2024.'
FROM portfolio_companies WHERE name = 'Intershunt'
ON CONFLICT (company_id, as_of) DO UPDATE SET
  cash_on_hand = EXCLUDED.cash_on_hand, monthly_burn = EXCLUDED.monthly_burn,
  burn_basis = EXCLUDED.burn_basis, out_of_cash_date = EXCLUDED.out_of_cash_date,
  source = EXCLUDED.source, source_detail = EXCLUDED.source_detail,
  notes = EXCLUDED.notes, updated_at = NOW();

INSERT INTO portfolio_cash (company_id, as_of, cash_on_hand, source, source_detail, notes)
SELECT id, '2026-05-31', 13428717, 'Board deck',
  '260720 InterShunt BOD - FINAL, slide 21 milestone table',
  'Balance at the "EFS Procedures Complete" milestone (May-26). Recorded so the actual cash-movement burn is computable.'
FROM portfolio_companies WHERE name = 'Intershunt'
ON CONFLICT (company_id, as_of) DO UPDATE SET
  cash_on_hand = EXCLUDED.cash_on_hand, source = EXCLUDED.source,
  source_detail = EXCLUDED.source_detail, notes = EXCLUDED.notes, updated_at = NOW();

-- ─── Vesalio ──────────────────────────────────────────────────────────────────
-- Source: "Vesalio August 2026 Board Update.pdf", emailed 2026-08-05. Balance
-- sheet (slide 8), P&L (slide 7), cash-flow commentary (slides 3 and 9).
--
-- ⚠️ TWO JUDGEMENT CALLS HERE, both flagged for review:
--
-- 1. out_of_cash_date is the deck's own words — "cash runway is currently
--    projected to first week of September" — recorded as 2026-09-07. It is a
--    company statement, so it wins over the arithmetic per convention.
--
-- 2. monthly_burn is NOT a deck figure. The deck states no monthly cash burn, so
--    this is YTD June operating loss ($5,183,599) ÷ 6 = $863,933, labelled as
--    'Operating cash outflow' rather than net burn so it is never silently
--    compared against a true cash-burn figure like iO's. It excludes stock comp
--    ($585k YTD, non-cash) and interest expense ($593k YTD, largely accrued on
--    the $15.475M of convertible notes). Sense-check: $2.648M to the first week
--    of September implies roughly $1.2M/month, so this understates the real cash
--    burn — treat the stated date, not the derived runway, as the truth.
--
-- The $5.0M that extends runway "through end of December and into January 2027"
-- is NOT recorded as committed_funding: it is the raise being pursued, not
-- capital signed. Putting it in would flatter the position.

INSERT INTO portfolio_cash (company_id, as_of, cash_on_hand, monthly_burn, burn_basis, out_of_cash_date, source, source_detail, notes)
SELECT id, '2026-06-30', 2648126, 863933, 'Operating cash outflow', '2026-09-07', 'Board deck',
  'Vesalio August 2026 Board Update, slides 3 / 7 / 8 / 9',
  'Cash per unaudited 6/30/2026 balance sheet. Out-of-cash date is the deck''s "first week of September". BURN IS DERIVED, NOT STATED: YTD operating loss / 6; excludes stock comp and accrued note interest, so it understates cash burn (implied ~$1.2M/mo). A $5.0M raise plus targeted expense reductions would extend runway into January 2027 — being pursued, not committed. Updated cash-flow runway due at the 8/20/2026 board meeting. Balance sheet also carries $15,475,000 of convertible notes as current.'
FROM portfolio_companies WHERE name = 'Vesalio'
ON CONFLICT (company_id, as_of) DO UPDATE SET
  cash_on_hand = EXCLUDED.cash_on_hand, monthly_burn = EXCLUDED.monthly_burn,
  burn_basis = EXCLUDED.burn_basis, out_of_cash_date = EXCLUDED.out_of_cash_date,
  source = EXCLUDED.source, source_detail = EXCLUDED.source_detail,
  notes = EXCLUDED.notes, updated_at = NOW();
