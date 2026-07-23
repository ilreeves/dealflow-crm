-- Research identifiers for clinical/scientific enrichment (July 2026)
-- Optional per-company keys that make ClinicalTrials.gov matching reliable when
-- the CRM company name doesn't match the registered trial sponsor (common after
-- asset acquisitions, spinouts, or partner-run trials).
--   drug_names      — comma-separated drug/asset names, searched as trial interventions
--   ct_sponsor_name — exact ClinicalTrials.gov sponsor name, if different from the company name
-- Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS drug_names TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ct_sponsor_name TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS drug_names TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS ct_sponsor_name TEXT;
