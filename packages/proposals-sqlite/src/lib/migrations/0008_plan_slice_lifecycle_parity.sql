/**
 * 0008_plan_slice_lifecycle_parity.sql — r00051 S1.
 *
 * Plans and slices need explicit lifecycle state parity with proposals.
 * This forward migration adds `status` to both tables and enforces the
 * minimum closed_at parity invariant at the SQL level.
 */

ALTER TABLE plans ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK (
	status IN (
		'draft',
		'ready',
		'in-progress',
		'review',
		'blocked',
		'paused',
		'done',
		'retired',
		'superseded',
		'quarantined'
	)
);

ALTER TABLE slices ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK (
	status IN (
		'draft',
		'ready',
		'in-progress',
		'review',
		'blocked',
		'paused',
		'done',
		'retired',
		'superseded',
		'quarantined'
	)
);

CREATE TRIGGER IF NOT EXISTS plans_closed_at_matches_status_insert
BEFORE INSERT ON plans
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'plans.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS plans_closed_at_matches_status_update
BEFORE UPDATE ON plans
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'plans.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS slices_closed_at_matches_status_insert
BEFORE INSERT ON slices
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'slices.closed_at must match terminal status');
END;

CREATE TRIGGER IF NOT EXISTS slices_closed_at_matches_status_update
BEFORE UPDATE ON slices
WHEN (
	(NEW.status IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NULL)
	OR
	(NEW.status NOT IN ('done', 'retired', 'superseded', 'quarantined') AND NEW.closed_at IS NOT NULL)
)
BEGIN
	SELECT RAISE(ABORT, 'slices.closed_at must match terminal status');
END;