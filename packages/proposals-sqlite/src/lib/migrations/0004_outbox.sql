/**
 * 0004_outbox.sql — q00022 S1 + f00514 S2.
 *
 * The outbox table: every side effect (regenerate legacy JSON index,
 * notify an agent, etc.) writes one row here inside the same
 * transaction as the entity write. The outbox processor
 * (f00514 S3) consumes pending rows asynchronously. The idempotency
 * key is the canonical dedup field — duplicate side-effects are
 * no-ops.
 */

CREATE TABLE IF NOT EXISTS outbox (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	idempotency_key TEXT UNIQUE NOT NULL,
	kind TEXT NOT NULL,
	payload TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending' CHECK (
		status IN ('pending', 'in-flight', 'done', 'failed')
	),
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	next_attempt_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt_at
	ON outbox(next_attempt_at);