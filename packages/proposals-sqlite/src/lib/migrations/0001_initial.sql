/**
 * 0001_initial.sql — q00022 S1.
 *
 * The first migration of the proposals operational DB. Lays out the
 * core tables for proposals, plans, slices, and the
 * `schema_migrations` ledger itself. Foreign keys and CHECK
 * constraints are intentionally explicit:
 *
 *   - `proposals.status` is restricted to the lifecycle states
 *     defined by `IProposalStatus` (r00047). The DB refuses any
 *     value not in the list, even if a future writer forgets the
 *     type system.
 *   - `plans.proposal_id REFERENCES proposals(id) ON DELETE RESTRICT`
 *     makes "plan without proposal" impossible.
 *   - `slices.plan_id REFERENCES plans(id) ON DELETE RESTRICT` makes
 *     "slice without plan" impossible.
 *   - `schema_migrations.version` is the canonical ordering key; the
 *     `checksum` column guards against an applied migration file
 *     being edited afterwards.
 */

CREATE TABLE IF NOT EXISTS schema_migrations (
	version INTEGER PRIMARY KEY,
	name TEXT NOT NULL,
	checksum TEXT NOT NULL,
	applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT UNIQUE NOT NULL,
	slug TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (
		kind IN (
			'feat',
			'breaking',
			'fix',
			'refactor',
			'perf',
			'audit',
			'chore',
			'docs',
			'test',
			'spike',
			'plan',
			'resume',
			'legacy'
		)
	),
	status TEXT NOT NULL CHECK (
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
	),
	title TEXT NOT NULL,
	source_path TEXT,
	source_blob_sha TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	content_hash TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_kind ON proposals(kind);

CREATE TABLE IF NOT EXISTS plans (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT UNIQUE NOT NULL,
	proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE RESTRICT,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	source_path TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_plans_proposal_id ON plans(proposal_id);

CREATE TABLE IF NOT EXISTS slices (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uid TEXT UNIQUE NOT NULL,
	plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
	slug TEXT NOT NULL,
	title TEXT NOT NULL,
	source_path TEXT,
	revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_slices_plan_id ON slices(plan_id);