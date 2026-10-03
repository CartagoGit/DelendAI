/**
 * 0007_lifecycle_events_append_only_guards.sql — f00514 S1.
 *
 * The baseline lifecycle_events table already exists. This forward
 * migration hardens it as append-only at the SQL level so accidental
 * UPDATE/DELETE statements abort even if a future caller bypasses the
 * repository contract.
 */

CREATE TRIGGER IF NOT EXISTS lifecycle_events_no_update
BEFORE UPDATE ON lifecycle_events
BEGIN
	SELECT RAISE(ABORT, 'lifecycle_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS lifecycle_events_no_delete
BEFORE DELETE ON lifecycle_events
BEGIN
	SELECT RAISE(ABORT, 'lifecycle_events is append-only');
END;