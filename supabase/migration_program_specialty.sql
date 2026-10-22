-- Program specialty + program-derived company sectors (October 2026)
--
-- Two category axes, deliberately kept apart:
--   programs.therapeutic_area — the DISEASE (market-map rows group by this)
--   programs.specialty        — the ABMS specialty that treats / buys it, the
--                               same list a company's `sector` uses
-- A company's PRIMARY `sector` stays a manual judgment call. Its
-- `secondary_sectors` become derived: the distinct specialties of its ACTIVE
-- programs, kept in sync by the trigger below. Companies with no programs are
-- never touched by the trigger, so a hand-entered list there survives.
-- Starting guesses for specialty live in lib/specialties.ts.
-- Safe to run in a fresh Supabase SQL Editor tab.

ALTER TABLE programs ADD COLUMN IF NOT EXISTS specialty TEXT;

CREATE OR REPLACE FUNCTION sync_program_sectors()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner RECORD;
BEGIN
  -- A program can move between owners on UPDATE, so refresh both sides.
  FOR owner IN
    SELECT DISTINCT x.cid, x.did FROM (VALUES
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.company_id END, CASE WHEN TG_OP <> 'INSERT' THEN OLD.deal_id END),
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.company_id END, CASE WHEN TG_OP <> 'DELETE' THEN NEW.deal_id END)
    ) AS x(cid, did)
  LOOP
    IF owner.cid IS NOT NULL THEN
      UPDATE portfolio_companies c
         SET secondary_sectors = s.arr
        FROM (SELECT coalesce(array_agg(DISTINCT specialty ORDER BY specialty)
                       FILTER (WHERE status = 'Active' AND specialty IS NOT NULL), '{}') AS arr
                FROM programs WHERE company_id = owner.cid) s
       WHERE c.id = owner.cid AND c.secondary_sectors IS DISTINCT FROM s.arr;
    END IF;
    IF owner.did IS NOT NULL THEN
      UPDATE deals d
         SET secondary_sectors = s.arr
        FROM (SELECT coalesce(array_agg(DISTINCT specialty ORDER BY specialty)
                       FILTER (WHERE status = 'Active' AND specialty IS NOT NULL), '{}') AS arr
                FROM programs WHERE deal_id = owner.did) s
       WHERE d.id = owner.did AND d.secondary_sectors IS DISTINCT FROM s.arr;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_program_sectors ON programs;
CREATE TRIGGER sync_program_sectors
  AFTER INSERT OR UPDATE OR DELETE ON programs
  FOR EACH ROW EXECUTE FUNCTION sync_program_sectors();

-- Change history: a secondary_sectors change is now a side effect of editing
-- programs, not an edit to the company. Logging it would show "Arrivo edited"
-- when nobody touched Arrivo, and undoing it would knock the list out of sync
-- with the programs. Identical to migration_audit_log.sql's audit_row except
-- that one key is ignored when deciding whether an UPDATE changed anything.
CREATE OR REPLACE FUNCTION audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o   JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n   JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  r   JSONB := coalesce(n, o);
  cid UUID;
BEGIN
  -- A save that changes nothing but server-maintained fields isn't a change.
  IF TG_OP = 'UPDATE' AND (o - 'updated_at' - 'secondary_sectors') = (n - 'updated_at' - 'secondary_sectors') THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'portfolio_companies' THEN
    cid := (r->>'id')::uuid;
  ELSIF TG_TABLE_NAME = 'portfolio_class_holdings' THEN
    -- Holdings hang off a share class, not the company. When the class is
    -- being deleted (cascade) it's already gone, so fall back to the class's
    -- own audit entry — logged first, see the trigger names below.
    SELECT company_id INTO cid FROM portfolio_share_classes WHERE id = (r->>'class_id')::uuid;
    IF cid IS NULL THEN
      SELECT a.company_id INTO cid FROM audit_log a
       WHERE a.table_name = 'portfolio_share_classes' AND a.row_id = (r->>'class_id')::uuid
       ORDER BY a.id DESC LIMIT 1;
    END IF;
  ELSIF r ? 'company_id' THEN
    cid := (r->>'company_id')::uuid;
  END IF;

  INSERT INTO audit_log (table_name, row_id, company_id, action, old_data, new_data)
  VALUES (TG_TABLE_NAME, (r->>'id')::uuid, cid, TG_OP, o, n);
  RETURN NULL;
END;
$$;
