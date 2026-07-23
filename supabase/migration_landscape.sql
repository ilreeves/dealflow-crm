-- Competitive landscape enrichment (July 2026)
-- `indication` lets the enrichment search ClinicalTrials.gov for OTHER sponsors'
-- trials in the same disease area (the competitive field). When left blank, the
-- app derives the indication from the company's own trial conditions.
-- `competitors` / `indication_used` cache the landscape result alongside the
-- existing trials + publications for a company.
-- Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS indication TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS indication TEXT;
ALTER TABLE company_enrichment ADD COLUMN IF NOT EXISTS competitors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE company_enrichment ADD COLUMN IF NOT EXISTS indication_used TEXT;
