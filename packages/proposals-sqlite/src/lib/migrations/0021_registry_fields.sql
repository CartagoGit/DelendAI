-- 0021 — the proposals table carries every field the registry lists.
--
-- The registry (`index.json`) lists each proposal's track, type and
-- date; the database held neither, so the registry could only be built
-- by scanning the markdown again and never exported from the database
-- (q00022 S4, phase 1). The reconciler already parsed track and type
-- and dropped them before the write.
--
-- Nullable: NULL means the frontmatter does not say. Existing rows are
-- filled by the next reconcile, whose unchanged-row check compares these
-- columns too.
ALTER TABLE proposals ADD COLUMN track TEXT;
ALTER TABLE proposals ADD COLUMN type TEXT;
ALTER TABLE proposals ADD COLUMN proposal_date TEXT;
