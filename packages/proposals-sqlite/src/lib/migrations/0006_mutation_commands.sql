/**
 * 0006_mutation_commands.sql — r00050 S1.
 *
 * Command receipts for lifecycle/idempotent writes live here, not in
 * `lifecycle_events`. The unique key is `(command_name,
 * idempotency_key)`. A repeated request with the same fingerprint can
 * replay the stored outcome; a repeated key with a different
 * fingerprint is an explicit conflict.
 */

CREATE TABLE IF NOT EXISTS mutation_commands (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	command_name TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	request_fingerprint TEXT NOT NULL,
	entity_type TEXT NOT NULL CHECK (
		entity_type IN ('proposal', 'plan', 'slice')
	),
	entity_uid TEXT NOT NULL,
	revision_before INTEGER,
	revision_after INTEGER,
	outcome_kind TEXT,
	response_json TEXT,
	status TEXT NOT NULL DEFAULT 'started' CHECK (
		status IN ('started', 'completed', 'failed')
	),
	actor TEXT,
	source TEXT,
	created_at INTEGER NOT NULL,
	completed_at INTEGER,
	UNIQUE(command_name, idempotency_key)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_mutation_commands_entity
	ON mutation_commands(entity_type, entity_uid, created_at);

CREATE INDEX IF NOT EXISTS idx_mutation_commands_status
	ON mutation_commands(status, created_at);