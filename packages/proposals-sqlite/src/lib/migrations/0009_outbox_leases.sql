/**
 * 0009_outbox_leases.sql — f00514 S2.
 *
 * Adds lease metadata so a crashed processor cannot strand an outbox
 * row in `in-flight` forever. A later processor tick may reclaim any
 * row whose lease has expired.
 */

ALTER TABLE outbox ADD COLUMN lease_owner TEXT;

ALTER TABLE outbox ADD COLUMN lease_expires_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_outbox_lease_recovery
	ON outbox(status, lease_expires_at, next_attempt_at);