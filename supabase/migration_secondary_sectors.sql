-- Additional sectors (October 2026)
-- A company can span specialties — Arrivo is Psychiatry & Neurology (SP-624)
-- AND Gastroenterology (RABI-767). `sector` stays the PRIMARY (deck emails,
-- card subtitles, anywhere one label is needed); `secondary_sectors` holds the
-- rest, and the Analytics sector breakdowns count a company under each.
-- Same ABMS list as `sector`. Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS secondary_sectors TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS secondary_sectors TEXT[] NOT NULL DEFAULT '{}';
