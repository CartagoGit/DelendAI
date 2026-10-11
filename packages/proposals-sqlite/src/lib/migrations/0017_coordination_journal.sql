/**
 * 0017_coordination_journal.sql — multi-agent work model, part 3 of 3.
 *
 * The one table in the work model that is NOT derivable from the
 * forge, and therefore the one that has to be durable.
 *
 * Everything in 0015/0016 can be rebuilt on a fresh machine by walking
 * GitHub: refs give work units and generations, PRs give candidates,
 * checks give CI results, merge commits give integrated SHAs. What
 * GitHub cannot tell you is the SEMANTICS around those facts — why a
 * slice changed hands, that a deprecated ref was deprecated on purpose
 * rather than abandoned, which recovery decision a reconciler took, or
 * that a given checkpoint was a meaningful boundary rather than a
 * 15-minute timer firing. Those events are appended here.
 *
 * Design rules, and why:
 *   - `event_id` is a DETERMINISTIC id computed by the writer from the
 *     event's own content (see `work-model/ids.ts`). It is UNIQUE, so
 *     replaying the same journal — during a rebuild, or because two
 *     machines both exported it — inserts each event exactly once.
 *     Idempotency is a property of the schema, not of the caller.
 *   - The subject is recorded as TEXT uids (`work_unit_uid`,
 *     `proposal_uid`, `slice_uid`, `actor_agent_id`, `machine_id`) with
 *     NO foreign keys. The journal must be replayable into an EMPTY
 *     database, before any of the rows it talks about exist; an FK
 *     would make the durable log depend on the derived tables it is
 *     supposed to reseed.
 *   - Append-only is enforced by triggers, following the
 *     `lifecycle_events_no_update` / `_no_delete` precedent from
 *     0007. A repository contract can be bypassed; an ABORT cannot.
 *     There is deliberately NO exception path: correcting a journal
 *     entry means appending a correcting event.
 */

CREATE TABLE IF NOT EXISTS coordination_journal (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	event_id TEXT NOT NULL UNIQUE,
	event_kind TEXT NOT NULL CHECK (
		event_kind IN (
			'owner-changed',
			'slice-recovered',
			'slice-deprecated',
			'semantic-checkpoint',
			'recovery-decision',
			'migration-applied',
			'reconciliation-outcome'
		)
	),
	repository_uid TEXT,
	work_unit_uid TEXT,
	proposal_uid TEXT,
	slice_uid TEXT,
	generation INTEGER CHECK (generation IS NULL OR generation >= 1),
	actor_agent_id TEXT,
	machine_id TEXT,
	occurred_at INTEGER NOT NULL,
	recorded_at INTEGER NOT NULL,
	payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json))
);

CREATE INDEX IF NOT EXISTS idx_coordination_journal_subject
	ON coordination_journal(work_unit_uid, occurred_at, id);
CREATE INDEX IF NOT EXISTS idx_coordination_journal_kind
	ON coordination_journal(event_kind, occurred_at);
CREATE INDEX IF NOT EXISTS idx_coordination_journal_slice
	ON coordination_journal(proposal_uid, slice_uid, occurred_at);

CREATE TRIGGER IF NOT EXISTS coordination_journal_no_update
BEFORE UPDATE ON coordination_journal
BEGIN
	SELECT RAISE(ABORT, 'coordination_journal is append-only');
END;

CREATE TRIGGER IF NOT EXISTS coordination_journal_no_delete
BEFORE DELETE ON coordination_journal
BEGIN
	SELECT RAISE(ABORT, 'coordination_journal is append-only');
END;
