CREATE TABLE summary_cache (
	content_hash TEXT PRIMARY KEY,
	summary TEXT NOT NULL,
	summary_model TEXT NOT NULL,
	summary_prompt_version TEXT NOT NULL,
	created_at INTEGER NOT NULL
);