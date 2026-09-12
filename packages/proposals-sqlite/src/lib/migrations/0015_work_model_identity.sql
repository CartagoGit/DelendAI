/**
 * 0015_work_model_identity.sql — multi-agent work model, part 1 of 3.
 *
 * The operational state of the shared-checkout / WIP-ref / PR work
 * model described by `IResolvedDevelopmentPolicy` (packages/core,
 * `development-policy.interface.ts`). This first migration lays out
 * the IDENTITY half: who is working (machines, agents), where they
 * are working (repositories), what authorises them to write (leases),
 * and the forge-side facts a candidate is judged by (pull_requests,
 * ci_runs).
 *
 * WHY these tables come first: `work_units`, `generations` and
 * `claims` (0016) all reference them, and SQLite resolves REFERENCES
 * at DML time — but keeping the creation order honest means the
 * schema still reads top-down for a human.
 *
 * WHY this database and not a new one: this file is a MATERIALIZED
 * VIEW, exactly like the proposal projection that already lives here.
 * The physical `.delendai/state/proposals.sqlite` is git-ignored and
 * MUST NEVER be copied between machines. Every row below is either
 * (a) re-derivable from the forge (refs, PRs, checks) or (b) local
 * observation that a fresh machine is allowed to not have. The only
 * durable, non-derivable facts live in `coordination_journal` (0017).
 *
 *   - `repositories` is keyed by (forge, owner, name) so the same
 *     clone opened from two machines resolves to one row.
 *   - `machines.machine_id` is a caller-supplied STABLE id (a host
 *     fingerprint), not an autoincrement, so a machine that rebuilds
 *     its DB from scratch re-derives the same key.
 *   - `leases` are the `sqlite-leases` coordination strategy. A lease
 *     is LIVE when `released_at IS NULL AND expires_at > now`; the
 *     expiry test is pure data, never a background sweeper, so an
 *     expired lease is detectable on a machine that was asleep.
 *   - `pull_requests` and `ci_runs` are pure forge mirrors: unique on
 *     the forge's own identity so re-polling the forge is an upsert,
 *     never a duplicate.
 */

CREATE TABLE IF NOT EXISTS repositories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	forge TEXT NOT NULL CHECK (
		forge IN ('github', 'gitlab', 'gitea', 'local')
	),
	owner TEXT NOT NULL,
	name TEXT NOT NULL,
	integration_branch TEXT NOT NULL,
	release_branch TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (forge, owner, name)
);

CREATE TABLE IF NOT EXISTS machines (
	machine_id TEXT PRIMARY KEY,
	hostname TEXT NOT NULL,
	platform TEXT,
	first_seen INTEGER NOT NULL,
	last_seen INTEGER NOT NULL,
	CHECK (last_seen >= first_seen)
);

CREATE TABLE IF NOT EXISTS agents (
	id TEXT PRIMARY KEY,
	host TEXT NOT NULL,
	model TEXT,
	machine_id TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT,
	state TEXT NOT NULL CHECK (
		state IN ('idle', 'working', 'blocked', 'offline')
	),
	first_seen INTEGER NOT NULL,
	last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_machine ON agents(machine_id);
CREATE INDEX IF NOT EXISTS idx_agents_state ON agents(state);

CREATE TABLE IF NOT EXISTS leases (
	id TEXT PRIMARY KEY,
	owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
	machine_id TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT,
	process_id INTEGER,
	session_id TEXT,
	acquired_at INTEGER NOT NULL,
	heartbeat_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	released_at INTEGER,
	CHECK (expires_at > acquired_at),
	CHECK (heartbeat_at >= acquired_at)
);

CREATE INDEX IF NOT EXISTS idx_leases_owner ON leases(owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_leases_expiry ON leases(expires_at, released_at);

CREATE TABLE IF NOT EXISTS pull_requests (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	number INTEGER NOT NULL CHECK (number > 0),
	head_ref TEXT NOT NULL,
	base_ref TEXT NOT NULL,
	head_sha TEXT NOT NULL,
	state TEXT NOT NULL CHECK (
		state IN ('draft', 'open', 'closed', 'merged')
	),
	merge_sha TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (repository_id, number),
	CHECK (state <> 'merged' OR merge_sha IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_head_sha
	ON pull_requests(repository_id, head_sha);

CREATE TABLE IF NOT EXISTS ci_runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
	candidate_sha TEXT NOT NULL,
	workflow TEXT NOT NULL,
	check_name TEXT NOT NULL,
	external_id TEXT,
	state TEXT NOT NULL CHECK (
		state IN (
			'queued',
			'in_progress',
			'success',
			'failure',
			'cancelled',
			'timed_out',
			'neutral'
		)
	),
	started_at INTEGER,
	completed_at INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE (repository_id, candidate_sha, workflow, check_name)
);

CREATE INDEX IF NOT EXISTS idx_ci_runs_candidate
	ON ci_runs(repository_id, candidate_sha);
