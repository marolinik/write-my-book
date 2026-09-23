-- Database-level guards that Prisma's schema cannot express.
-- Applied by scripts/apply-db-guards.ts after every `prisma db push`.
-- Idempotent: safe to run any number of times.

-- The edit log is append-only while its book exists.
--
-- On 2026-09-23 the local database lost 126 edit_actions rows after a
-- Postgres restart; no application code deletes them and the cause was never
-- found. That log is the only record of when a writer decided what, which is
-- what adapting to the writer is built on. A row may leave only with its book
-- (ON DELETE CASCADE). During a cascade the parent book is already gone, so
-- the check below lets it through; any other DELETE is refused.
CREATE OR REPLACE FUNCTION edit_actions_append_only() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM books WHERE id = OLD.book_id) THEN
    RAISE EXCEPTION 'edit_actions is append-only: rows leave only with their book (row %)', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS edit_actions_append_only ON edit_actions;
CREATE TRIGGER edit_actions_append_only
  BEFORE DELETE ON edit_actions
  FOR EACH ROW EXECUTE FUNCTION edit_actions_append_only();

-- TRUNCATE bypasses row triggers, so it is refused outright.
CREATE OR REPLACE FUNCTION edit_actions_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'edit_actions cannot be truncated';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS edit_actions_no_truncate ON edit_actions;
CREATE TRIGGER edit_actions_no_truncate
  BEFORE TRUNCATE ON edit_actions
  FOR EACH STATEMENT EXECUTE FUNCTION edit_actions_no_truncate();
