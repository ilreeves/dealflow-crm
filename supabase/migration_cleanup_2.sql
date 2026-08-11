-- Cleanup migration #2 (August 2026 backlog sweep)
--
-- REVIEW BEFORE RUNNING, then run the whole file in the Supabase SQL Editor.
-- Guards abort with a message (rolling back the whole batch) rather than
-- silently constraining live data that would violate a rule.

-- ============================================================
-- 1. Drop the dead non_con_deck_* columns (superseded by company_decks)
-- ============================================================
-- No code reads or writes these eight columns; company_decks + DecksSection
-- replaced them and schema.sql backfilled the rows. The guard proves the
-- backfill really happened before anything is dropped.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM deals d
  WHERE d.non_con_deck_path IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM company_decks cd WHERE cd.entity_type = 'deal' AND cd.entity_id = d.id);
  IF n > 0 THEN RAISE EXCEPTION '% deals still have an unmigrated non_con deck — run the company_decks backfill first', n; END IF;
  SELECT count(*) INTO n FROM portfolio_companies p
  WHERE p.non_con_deck_path IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM company_decks cd WHERE cd.entity_type = 'portfolio' AND cd.entity_id = p.id);
  IF n > 0 THEN RAISE EXCEPTION '% portfolio companies still have an unmigrated non_con deck — run the company_decks backfill first', n; END IF;
END $$;

DROP INDEX IF EXISTS deals_deck_token_key;
DROP INDEX IF EXISTS portfolio_deck_token_key;
ALTER TABLE deals
  DROP COLUMN IF EXISTS non_con_deck_path,
  DROP COLUMN IF EXISTS non_con_deck_name,
  DROP COLUMN IF EXISTS non_con_deck_token,
  DROP COLUMN IF EXISTS non_con_deck_shared_at;
ALTER TABLE portfolio_companies
  DROP COLUMN IF EXISTS non_con_deck_path,
  DROP COLUMN IF EXISTS non_con_deck_name,
  DROP COLUMN IF EXISTS non_con_deck_token,
  DROP COLUMN IF EXISTS non_con_deck_shared_at;

-- ============================================================
-- 2. Drop the dead auto-landscape columns on company_enrichment
-- ============================================================
-- Written by nothing, read by nothing — the manually curated
-- company_competitors table replaced the auto-generated landscape.

ALTER TABLE company_enrichment
  DROP COLUMN IF EXISTS competitors,
  DROP COLUMN IF EXISTS indication_used;

-- ============================================================
-- 3. portfolio_revenue.period_end becomes NOT NULL
-- ============================================================
-- The app always derives it from (period_type, fiscal_year) on save, and two
-- indexes plus both page queries order by it — a NULL sorts unpredictably.
-- Backfill uses the same mapping as REVENUE_PERIOD_END in lib/types.ts.

UPDATE portfolio_revenue SET period_end = (fiscal_year || '-' || CASE period_type
  WHEN 'Q1' THEN '03-31' WHEN 'Q2' THEN '06-30' WHEN 'Q3' THEN '09-30' WHEN 'Q4' THEN '12-31'
  WHEN 'H1' THEN '06-30' WHEN 'H2' THEN '12-31' ELSE '12-31' END)::date
WHERE period_end IS NULL;

ALTER TABLE portfolio_revenue ALTER COLUMN period_end SET NOT NULL;

-- ============================================================
-- 4. CHECK constraints for the remaining app-side enums
-- ============================================================
-- Each guard lists any value that would violate the constraint so a typo'd
-- legacy row gets FIXED rather than the constraint skipped.

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT stage, ', ') INTO bad FROM deals
  WHERE stage NOT IN ('Passed', 'Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet', 'Invested');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'deals.stage has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM portfolio_companies
  WHERE status IS NOT NULL AND status NOT IN ('Active', 'Legacy', 'Exited');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_companies.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM catalysts
  WHERE status IS NOT NULL AND status NOT IN ('Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'catalysts.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM deal_investor_intros
  WHERE status IS NOT NULL AND status NOT IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'deal_investor_intros.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM portfolio_investor_intros
  WHERE status IS NOT NULL AND status NOT IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_investor_intros.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT field_type, ', ') INTO bad FROM custom_field_definitions
  WHERE field_type NOT IN ('text', 'number', 'date', 'select', 'boolean');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'custom_field_definitions.field_type has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT projected_source, ', ') INTO bad FROM portfolio_revenue
  WHERE projected_source IS NOT NULL
    AND projected_source NOT IN ('Company plan', 'Board deck', 'Management update', 'Investor update', 'Solas estimate');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_revenue.projected_source has out-of-enum values (including any resurrected ''Reforecast''): %', bad; END IF;

  SELECT string_agg(DISTINCT security_type, ', ') INTO bad FROM portfolio_fundraise_rounds
  WHERE security_type IS NOT NULL AND security_type NOT IN ('Priced equity', 'SAFE', 'Convertible note');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_fundraise_rounds.security_type has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT security_type, ', ') INTO bad FROM deal_fundraise_rounds
  WHERE security_type IS NOT NULL AND security_type NOT IN ('Priced equity', 'SAFE', 'Convertible note');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'deal_fundraise_rounds.security_type has out-of-enum values: %', bad; END IF;
END $$;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('Passed', 'Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet', 'Invested'));

ALTER TABLE portfolio_companies DROP CONSTRAINT IF EXISTS portfolio_companies_status_check;
ALTER TABLE portfolio_companies ADD CONSTRAINT portfolio_companies_status_check
  CHECK (status IN ('Active', 'Legacy', 'Exited'));

ALTER TABLE catalysts DROP CONSTRAINT IF EXISTS catalysts_status_check;
ALTER TABLE catalysts ADD CONSTRAINT catalysts_status_check
  CHECK (status IN ('Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated'));

ALTER TABLE deal_investor_intros DROP CONSTRAINT IF EXISTS deal_investor_intros_status_check;
ALTER TABLE deal_investor_intros ADD CONSTRAINT deal_investor_intros_status_check
  CHECK (status IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested'));

ALTER TABLE portfolio_investor_intros DROP CONSTRAINT IF EXISTS portfolio_investor_intros_status_check;
ALTER TABLE portfolio_investor_intros ADD CONSTRAINT portfolio_investor_intros_status_check
  CHECK (status IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested'));

ALTER TABLE custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_field_type_check;
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_field_type_check
  CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean'));

-- 'Reforecast' was deliberately retired by migration_revenue_revised.sql; this
-- makes that guarantee structural instead of conventional.
ALTER TABLE portfolio_revenue DROP CONSTRAINT IF EXISTS portfolio_revenue_projected_source_check;
ALTER TABLE portfolio_revenue ADD CONSTRAINT portfolio_revenue_projected_source_check
  CHECK (projected_source IN ('Company plan', 'Board deck', 'Management update', 'Investor update', 'Solas estimate'));

ALTER TABLE portfolio_fundraise_rounds DROP CONSTRAINT IF EXISTS portfolio_fundraise_rounds_security_type_check;
ALTER TABLE portfolio_fundraise_rounds ADD CONSTRAINT portfolio_fundraise_rounds_security_type_check
  CHECK (security_type IN ('Priced equity', 'SAFE', 'Convertible note'));

ALTER TABLE deal_fundraise_rounds DROP CONSTRAINT IF EXISTS deal_fundraise_rounds_security_type_check;
ALTER TABLE deal_fundraise_rounds ADD CONSTRAINT deal_fundraise_rounds_security_type_check
  CHECK (security_type IN ('Priced equity', 'SAFE', 'Convertible note'));
