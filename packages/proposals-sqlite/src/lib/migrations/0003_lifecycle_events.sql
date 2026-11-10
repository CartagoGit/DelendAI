/**
 * 0003_lifecycle_events.sql — q00022 S1 + f00514 S1.
 *
 * Append-only lifecycle log. Every transition (proposal, plan, slice)
 * writes one row inside the same transaction as the entity update.
 * The table is append-only at the schema level: there are no UPDATE
 * or DELETE triggers, and the repository layer never issues those
 * statements. The audit invariant #13 ("todo cambio lifecycle deja
 * evento") is satisfied by this table existing.
 */

CREATE TABLE IF NOT EXISTS lifecycle_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	entity_type TEXT NOT NULL CHECK (
		entity_type IN ('proposal', 'plan', 'slice')
	),
	entity_uid TEXT NOT NULL,
	entity_revision INTEGER NOT NULL,
	from_status TEXT,
	to_status TEXT NOT NULL,
	actor TEXT NOT NULL,
	source TEXT NOT NULL,
	occurred_at INTEGER NOT NULL,
	metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_entity
	ON lifecycle_events(entity_type, entity_uid);
CREATE INDEX IF NOT EXISTS idx_lifecycle_occurred_at
	ON lifecycle_events(occurred_at);