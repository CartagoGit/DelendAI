CREATE TABLE compile_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	rows_considered INTEGER NOT NULL,
	rows_emitted INTEGER NOT NULL,
	tokens_input INTEGER NOT NULL,
	tokens_output INTEGER NOT NULL,
	cache_hits INTEGER NOT NULL,
	duration_ms INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);