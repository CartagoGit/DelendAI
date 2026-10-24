-- 0018 — revision step guards on proposals, plans and slices (r00048 S1).
--
-- The three tables have carried `revision INTEGER NOT NULL DEFAULT 0
-- CHECK (revision >= 0)` since 0001, and every UPDATE writes
-- `revision = revision + 1`. Nothing enforced that. The column was a
-- convention, and a convention is exactly what a second connection does
-- not honour: two writers could each read revision N, each write N+1,
-- and both succeed. The later write silently replaced the earlier one,
-- and the revision column recorded a single step for two mutations.
--
-- These triggers make the step itself a database rule. A revision may
-- only ever advance by exactly one. Skipping (N -> N+2), repeating
-- (N -> N), and rewinding (N -> N-1) all abort the statement, whether
-- they come from a repository method, a migration, or somebody typing
-- SQL at the console. That last case is the point: compare-and-swap in
-- application code protects the paths that remember to use it, and this
-- protects the rest.
--
-- WHY a trigger and not just `WHERE revision = ?`: they answer different
-- questions. The CAS predicate in the repositories decides WHOSE write
-- wins when two writers race — the loser sees `changes === 0` and is
-- told the current revision. The trigger decides whether a revision
-- sequence is COHERENT at all, and it holds even for a caller that
-- never went through a repository. Neither subsumes the other.
--
-- WHY `RAISE(ABORT)` rather than a silent correction: rewriting the
-- caller's value would hide the bug that produced it. A statement that
-- tried to move a revision by anything but one is wrong about the state
-- it thinks it is mutating, and it should hear so.

CREATE TRIGGER IF NOT EXISTS proposals_revision_steps_by_one
BEFORE UPDATE OF revision ON proposals
FOR EACH ROW WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(
		ABORT,
		'proposals.revision must advance by exactly one'
	);
END;

CREATE TRIGGER IF NOT EXISTS plans_revision_steps_by_one
BEFORE UPDATE OF revision ON plans
FOR EACH ROW WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(
		ABORT,
		'plans.revision must advance by exactly one'
	);
END;

CREATE TRIGGER IF NOT EXISTS slices_revision_steps_by_one
BEFORE UPDATE OF revision ON slices
FOR EACH ROW WHEN NEW.revision <> OLD.revision + 1
BEGIN
	SELECT RAISE(
		ABORT,
		'slices.revision must advance by exactly one'
	);
END;
