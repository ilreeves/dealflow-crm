-- ============================================================
-- Change history + undo for the money tables (2026-09-24)
--
-- On 2026-09-22 a round edit on Cryosa re-created its positions and whatever
-- notes they carried were lost, with nothing to restore from. The round
-- editor saves by delete-and-reinsert, a company delete cascades through ten
-- tables, and every write goes straight from the browser to PostgREST — so
-- the only place that sees every change is the database itself.
--
-- audit_log: one row per INSERT / UPDATE / DELETE on the tables below, with
-- the full row before and after, who (auth.uid()) and when. Written only by
-- the trigger; clients can read it, never write it.
--
-- undo_audit_entries(ids): reverses a set of entries (one "edit" in the UI)
-- in ONE transaction. It works from each row's NET state across the set —
-- the row as it was before the first entry and after the last — so the
-- delete-and-reinsert and cascade patterns undo cleanly:
--   1. rows the edit created are deleted          (children first)
--   2. rows the edit deleted are re-inserted      (parents first)
--   3. rows the edit changed are put back
-- Before touching a row it checks the row still looks exactly as the edit
-- left it; if anything changed since, the whole undo is refused rather than
-- overwriting newer work. The undo is itself recorded, so it can be undone.
--
-- Not covered: storage files (a deleted company's documents are removed from
-- storage by the app and can't come back) and tables outside the list.
--
-- Safe to re-run in a fresh Supabase SQL Editor tab.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      UUID NOT NULL,
  -- No FK: the history must outlive the company it describes.
  company_id  UUID,
  action      TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID DEFAULT auth.uid(),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  tx_id       BIGINT NOT NULL DEFAULT txid_current()
);
CREATE INDEX IF NOT EXISTS audit_log_company_idx ON audit_log (company_id, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_row_idx ON audit_log (table_name, row_id, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_recent_idx ON audit_log (id DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can read audit_log" ON audit_log;
CREATE POLICY "Auth users can read audit_log" ON audit_log FOR SELECT TO authenticated USING (true);
-- Read-only to clients: only the SECURITY DEFINER trigger below writes it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM authenticated, anon;

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
  -- A save that changes nothing but the server-stamped updated_at isn't a change.
  IF TG_OP = 'UPDATE' AND (o - 'updated_at') = (n - 'updated_at') THEN
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

-- Trigger name "0_audit" is deliberate: AFTER ROW triggers fire in name
-- order, and Postgres's own cascade triggers are named "RI_ConstraintTrigger…".
-- A leading digit sorts before "R", so a parent's delete is logged BEFORE its
-- children's cascaded deletes — which is what lets undo re-insert parents
-- first and lets holdings find their company.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'portfolio_companies', 'portfolio_fundraise_rounds', 'portfolio_positions',
    'portfolio_valuation_marks', 'portfolio_share_classes', 'portfolio_class_holdings',
    'portfolio_cash', 'portfolio_cash_forecast', 'portfolio_revenue', 'fund_snapshots'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "0_audit" ON %I', t);
    EXECUTE format('CREATE TRIGGER "0_audit" AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row()', t);
  END LOOP;
END $$;

-- Columns of `tbl` that `data` carries (a column dropped since the entry was
-- written is skipped; generated columns can't be written).
CREATE OR REPLACE FUNCTION audit_cols(tbl TEXT, data JSONB)
RETURNS TEXT[]
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(a.attname::text ORDER BY a.attnum), '{}')
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.' || quote_ident(tbl))
     AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
     AND data ? a.attname::text;
$$;

-- Each row's NET state across a set of entries: as it was before the first
-- entry and after the last. NULL before = created by the edit; NULL after =
-- deleted by it.
CREATE OR REPLACE FUNCTION audit_net(entry_ids BIGINT[])
RETURNS TABLE (t_name TEXT, r_id UUID, before_data JSONB, after_data JSONB)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT a.table_name, a.row_id,
         (array_agg(a.old_data ORDER BY a.id))[1],
         (array_agg(a.new_data ORDER BY a.id DESC))[1]
    FROM audit_log a
   WHERE a.id = ANY (entry_ids)
   GROUP BY a.table_name, a.row_id;
$$;

CREATE OR REPLACE FUNCTION undo_audit_entries(entry_ids BIGINT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  -- Parent → child. Deletes run in reverse, re-inserts in this order.
  prio TEXT[] := ARRAY[
    'portfolio_companies', 'portfolio_fundraise_rounds', 'portfolio_share_classes',
    'portfolio_positions', 'portfolio_class_holdings', 'portfolio_valuation_marks',
    'portfolio_cash', 'portfolio_cash_forecast', 'portfolio_revenue', 'fund_snapshots'
  ];
  g RECORD;
  cur JSONB;
  cols TEXT[];
  n_deleted INT := 0; n_restored INT := 0; n_reverted INT := 0;
BEGIN
  IF entry_ids IS NULL OR cardinality(entry_ids) = 0 THEN
    RAISE EXCEPTION 'Nothing to undo.';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_log WHERE id = ANY (entry_ids) AND NOT (table_name = ANY (prio))) THEN
    RAISE EXCEPTION 'Those history entries include a table undo does not cover.';
  END IF;

  -- Every row must still be exactly as the edit left it. Only the fields the
  -- entry recorded are compared, so a column added to the table later can't
  -- make every old entry look "changed since".
  FOR g IN SELECT * FROM audit_net(entry_ids) LOOP
    EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE t.id = $1', g.t_name) INTO cur USING g.r_id;
    IF g.after_data IS NULL AND cur IS NOT NULL THEN
      RAISE EXCEPTION 'A deleted % row has been re-created since — undo the newer change first.', g.t_name;
    ELSIF g.after_data IS NOT NULL AND (
      cur IS NULL OR
      (SELECT coalesce(jsonb_object_agg(k, cur -> k), '{}') FROM jsonb_object_keys(g.after_data) k WHERE k <> 'updated_at')
        <> (g.after_data - 'updated_at')
    ) THEN
      RAISE EXCEPTION 'A % row has changed since this edit — undo the newer change first.', g.t_name;
    END IF;
  END LOOP;

  -- 1. Remove rows the edit created (children first, so FKs are satisfied).
  FOR g IN SELECT * FROM audit_net(entry_ids) WHERE before_data IS NULL AND after_data IS NOT NULL
           ORDER BY array_position(prio, t_name) DESC LOOP
    EXECUTE format('DELETE FROM %I WHERE id = $1', g.t_name) USING g.r_id;
    n_deleted := n_deleted + 1;
  END LOOP;

  -- 2. Re-insert rows the edit deleted (parents first), original ids intact.
  FOR g IN SELECT * FROM audit_net(entry_ids) WHERE before_data IS NOT NULL AND after_data IS NULL
           ORDER BY array_position(prio, t_name) ASC LOOP
    cols := audit_cols(g.t_name, g.before_data);
    EXECUTE format(
      'INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_record(NULL::%I, $1) r',
      g.t_name,
      (SELECT string_agg(format('%I', c), ', ') FROM unnest(cols) c),
      (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(cols) c),
      g.t_name
    ) USING g.before_data;
    n_restored := n_restored + 1;
  END LOOP;

  -- 3. Put changed rows back (updated_at is re-stamped by the server).
  FOR g IN SELECT * FROM audit_net(entry_ids) WHERE before_data IS NOT NULL AND after_data IS NOT NULL
           ORDER BY array_position(prio, t_name) ASC LOOP
    cols := array(SELECT c FROM unnest(audit_cols(g.t_name, g.before_data)) c WHERE c NOT IN ('id', 'updated_at'));
    CONTINUE WHEN cardinality(cols) = 0;
    EXECUTE format(
      'UPDATE %I t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::%I, $1) r) WHERE t.id = $2',
      g.t_name,
      (SELECT string_agg(format('%I', c), ', ') FROM unnest(cols) c),
      (SELECT string_agg(format('r.%I', c), ', ') FROM unnest(cols) c),
      g.t_name
    ) USING g.before_data, g.r_id;
    n_reverted := n_reverted + 1;
  END LOOP;

  RETURN jsonb_build_object('removed', n_deleted, 'restored', n_restored, 'reverted', n_reverted);
END;
$$;

REVOKE ALL ON FUNCTION undo_audit_entries(BIGINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION undo_audit_entries(BIGINT[]) TO authenticated;
REVOKE ALL ON FUNCTION audit_cols(TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION audit_net(BIGINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION audit_net(BIGINT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION audit_cols(TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Verify: 10 triggers, and the log is empty until the next edit.
SELECT count(*) AS audit_triggers FROM pg_trigger WHERE tgname = '0_audit';
