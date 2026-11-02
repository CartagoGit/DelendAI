// The cache layout epoch per lifecycle scope. Created if missing on every
// open, so it needs no `user_version` bump: the epoch is its own axis and
// this table only ever grows rows.
export const CREATE_LIFECYCLE_META_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS lifecycle_meta (
	scope TEXT PRIMARY KEY,
	applied_epoch INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
`;
