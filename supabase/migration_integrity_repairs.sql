-- Data-integrity and index repairs (August 2026 code review)
--
-- REVIEW BEFORE RUNNING. Each section is independent — run them one at a time
-- in the Supabase SQL Editor and stop at any error rather than pushing past it.
-- The DO $$ blocks report pre-existing violations instead of failing silently.

-- ============================================================
-- 1. Missing indexes on hot queries (safe, no behavior change)
-- ============================================================

-- The pipeline board (default landing page) orders every load by created_at.
CREATE INDEX IF NOT EXISTS deals_created_at_idx ON deals (created_at DESC);

-- The Activity page reads the newest 100 rows with NO action filter, which the
-- existing (action, created_at DESC) composite index cannot serve.
CREATE INDEX IF NOT EXISTS deal_activity_created_at_idx ON deal_activity (created_at DESC);

-- The deck view tracker sorts by viewed_at within a token; the existing index
-- covers token alone, and the table only ever grows.
CREATE INDEX IF NOT EXISTS deck_views_token_viewed_idx ON deck_views (token, viewed_at DESC);

-- .eq(fk).order(col) pairs the FK-only indexes don't fully serve. Negligible
-- at current row counts; included for consistency with the newer migrations.
CREATE INDEX IF NOT EXISTS portfolio_fundraise_rounds_company_date_idx ON portfolio_fundraise_rounds (company_id, date DESC);
CREATE INDEX IF NOT EXISTS deal_fundraise_rounds_deal_date_idx ON deal_fundraise_rounds (deal_id, date DESC);
CREATE INDEX IF NOT EXISTS deal_notes_deal_created_idx ON deal_notes (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_files_deal_created_idx ON deal_files (deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_valuation_marks_company_date_idx ON portfolio_valuation_marks (company_id, as_of_date DESC);

-- ============================================================
-- 2. updated_at must be server-stamped on the money tables
-- ============================================================
-- migration_runway_audit.sql exists because a cash figure changed untraceably,
-- but updated_at is still client-supplied on these three tables — a direct
-- REST edit leaves the row looking untouched. Every other mutable table
-- already has this trigger.

DROP TRIGGER IF EXISTS update_portfolio_cash_updated_at ON portfolio_cash;
CREATE TRIGGER update_portfolio_cash_updated_at
  BEFORE UPDATE ON portfolio_cash
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_portfolio_revenue_updated_at ON portfolio_revenue;
CREATE TRIGGER update_portfolio_revenue_updated_at
  BEFORE UPDATE ON portfolio_revenue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_portfolio_cash_forecast_updated_at ON portfolio_cash_forecast;
CREATE TRIGGER update_portfolio_cash_forecast_updated_at
  BEFORE UPDATE ON portfolio_cash_forecast
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. NULL company_id rows would be invisible in every view
-- ============================================================
-- Both tables group by company id in lib/revenue.ts and lib/runway.ts, so a
-- row that arrives without one (the REST bulk-load path can omit it) is
-- permanently orphaned AND exempt from the UNIQUE keys.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM portfolio_revenue WHERE company_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'portfolio_revenue has % NULL company_id rows — fix or delete them first', n; END IF;
  SELECT count(*) INTO n FROM portfolio_cash WHERE company_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'portfolio_cash has % NULL company_id rows — fix or delete them first', n; END IF;
END $$;

ALTER TABLE portfolio_revenue ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE portfolio_cash ALTER COLUMN company_id SET NOT NULL;

-- ============================================================
-- 4. Base-case forecast rows are exempt from their UNIQUE key
-- ============================================================
-- Postgres UNIQUE is NULLS DISTINCT, so scenario IS NULL (the base case —
-- most rows) never conflicts: reloading the same deck silently duplicates the
-- whole series, which then double-counts in lib/cashForecast.ts.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT company_id, forecast_as_of, period_end
    FROM portfolio_cash_forecast WHERE scenario IS NULL
    GROUP BY 1, 2, 3 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'portfolio_cash_forecast has % duplicated base-case series keys — dedupe first', n; END IF;
END $$;

-- The old UNIQUE constraint's auto-generated name gets truncated by Postgres,
-- so find it rather than guessing (it's the table's only unique constraint).
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'portfolio_cash_forecast'::regclass AND contype = 'u';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE portfolio_cash_forecast DROP CONSTRAINT %I', cname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_cash_forecast_key
  ON portfolio_cash_forecast (company_id, forecast_as_of, period_end, COALESCE(scenario, ''));

-- ============================================================
-- 5. investor_contacts: matching is case-insensitive, the constraint isn't
-- ============================================================
-- The app matches names with toLowerCase() but UNIQUE (name) is case-sensitive,
-- so "John Smith" and "john smith" can both exist and autocomplete resolves
-- to whichever it finds first.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT lower(name) FROM investor_contacts GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'investor_contacts has % case-folded duplicate names — merge them first', n; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS investor_contacts_name_lower_key ON investor_contacts (lower(name));

-- ============================================================
-- 6. Re-running schema.sql doubles every dropdown option
-- ============================================================
-- The list_options seed INSERT has no ON CONFLICT and nothing enforces
-- (list_key, value) uniqueness; ListManager guards duplicates in JS only.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT list_key, lower(value) FROM list_options GROUP BY 1, 2 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN RAISE EXCEPTION 'list_options has % duplicated (list_key, value) pairs — dedupe first', n; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS list_options_key_value_idx ON list_options (list_key, lower(value));

-- ============================================================
-- 7. Enum-bearing TEXT columns on the public share path get CHECKs
-- ============================================================
-- company_enrichment and company_competitors already constrain entity_type;
-- the two tables the public deck route reads do not. portfolio_revenue's
-- period_type is part of a UNIQUE key, so a typo mints a phantom period that
-- lib/revenue.ts silently maps to year-end.

ALTER TABLE company_decks DROP CONSTRAINT IF EXISTS company_decks_entity_type_check;
ALTER TABLE company_decks ADD CONSTRAINT company_decks_entity_type_check
  CHECK (entity_type IN ('deal', 'portfolio'));

ALTER TABLE deck_views DROP CONSTRAINT IF EXISTS deck_views_entity_type_check;
ALTER TABLE deck_views ADD CONSTRAINT deck_views_entity_type_check
  CHECK (entity_type IN ('deal', 'portfolio'));

ALTER TABLE portfolio_revenue DROP CONSTRAINT IF EXISTS portfolio_revenue_period_type_check;
ALTER TABLE portfolio_revenue ADD CONSTRAINT portfolio_revenue_period_type_check
  CHECK (period_type IN ('Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'FY'));

ALTER TABLE portfolio_revenue DROP CONSTRAINT IF EXISTS portfolio_revenue_fiscal_year_check;
ALTER TABLE portfolio_revenue ADD CONSTRAINT portfolio_revenue_fiscal_year_check
  CHECK (fiscal_year BETWEEN 2000 AND 2100);

-- ============================================================
-- 8. Team Members can only ever show one person
-- ============================================================
-- profiles is the sole table with own-row-only RLS; TeamMembers.tsx selects
-- all profiles and renders "{n} people with access", which RLS trims to 1.
-- Every other table already trusts the whole firm (USING (true)).

DROP POLICY IF EXISTS "Auth users can view all profiles" ON profiles;
CREATE POLICY "Auth users can view all profiles" ON profiles
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 9. One-off sweep: share links and enrichment orphaned by deletes
-- ============================================================
-- company_decks.entity_id is polymorphic (no FK), and the delete handlers
-- never clean it up — a deleted company's public deck link keeps serving
-- signed URLs until its 4-week TTL lapses. Same orphaning (data only, no
-- exposure) for company_enrichment and company_competitors.

DELETE FROM company_decks cd WHERE
  (cd.entity_type = 'deal' AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = cd.entity_id))
  OR (cd.entity_type = 'portfolio' AND NOT EXISTS (SELECT 1 FROM portfolio_companies p WHERE p.id = cd.entity_id));

DELETE FROM company_enrichment ce WHERE
  (ce.entity_type = 'deal' AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = ce.entity_id))
  OR (ce.entity_type = 'portfolio' AND NOT EXISTS (SELECT 1 FROM portfolio_companies p WHERE p.id = ce.entity_id));

DELETE FROM company_competitors cc WHERE
  (cc.entity_type = 'deal' AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.id = cc.entity_id))
  OR (cc.entity_type = 'portfolio' AND NOT EXISTS (SELECT 1 FROM portfolio_companies p WHERE p.id = cc.entity_id));
