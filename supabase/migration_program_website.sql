-- Competitor websites (October 2026)
-- External (competitor) programs carry their company's website so the map can
-- link straight to it — Solas's own programs link to the CRM record instead,
-- so this stays NULL for them. A competitor with no findable website was
-- dropped from the map rather than kept unlinked.
-- Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE programs ADD COLUMN IF NOT EXISTS website TEXT;
