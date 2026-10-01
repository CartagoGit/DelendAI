/**
 * journal-repo.ts — the durable, append-only coordination journal.
 *
 * WHY this is the only table that must survive: the rest of the work
 * model is a materialized view of GitHub. GitHub can tell you that a
 * ref moved, that a PR merged, that a check went green. It cannot tell
 * you WHY a slice changed hands, that a ref was deprecated on purpose
 * rather than abandoned, which recovery decision a reconciler took, or
 * that a checkpoint marked a real boundary rather than a timer firing.
 * Those events are appended here and nowhere else.
 *
 * WHY the append is idempotent without any caller discipline: the
 * event id is derived from the event's own content (`ids.ts`) and the
 * column is UNIQUE, so `ON CONFLICT DO NOTHING` makes a replay a
 * no-op. That is what lets a journal be exported, shipped, and
 * replayed into a fresh database — the transport the DB FILE must
 * never be.
 *
 * WHY UPDATE and DELETE are impossible: migration 0017 installs ABORT
 * triggers, following the `lifecycle_events` precedent. There is no
 * correction path by design; a mistaken entry is corrected by
 * appending a correcting event, so the history of what was believed
 * when stays intact.
 */
import type { Database } from 'bun:sqlite';

import { journalEventId } from './ids';

import type {
	ICoordinationEventKind,
	ICoordinationEventRecord,
	IAppendCoordinationEventArgs,
	IAppendCoordinationEventOutcome,
} from './journal-repo.interface';

export type {
	ICoordinationEventKind,
	ICoordinationEventRecord,
	IAppendCoordinationEventArgs,
	IAppendCoordinationEventOutcome,
} from './journal-repo.interface';

interface IJournalRow {
	readonly id: number;
	readonly event_id: string;
	readonly event_kind: ICoordinationEventKind;
	readonly repository_uid: string | null;
	readonly work_unit_uid: string | null;
	readonly proposal_uid: string | null;
	readonly slice_uid: string | null;
	readonly generation: number | null;
	readonly actor_agent_id: string | null;
	readonly machine_id: string | null;
	readonly occurred_at: number;
	readonly recorded_at: number;
	readonly payload_json: string;
}

const JOURNAL_COLUMNS = `id, event_id, event_kind, repository_uid,
	work_unit_uid, proposal_uid, slice_uid, generation, actor_agent_id,
	machine_id, occurred_at, recorded_at, payload_json`;

/**
 * Canonical JSON: keys sorted, so two writers describing the same
 * event produce byte-identical payloads and therefore the same
 * deterministic event id.
 */
const canonicalPayload = (
	payload: Readonly<Record<string, unknown>> | undefined,
): string =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(payload ?? {}).sort(([a], [b]) =>
				a < b ? -1 : a > b ? 1 : 0,
			),
		),
	);

const parsePayload = (json: string): unknown => JSON.parse(json);

const mapRow = (row: IJournalRow): ICoordinationEventRecord => ({
	id: row.id,
	eventId: row.event_id,
	eventKind: row.event_kind,
	repositoryUid: row.repository_uid,
	workUnitUid: row.work_unit_uid,
	proposalUid: row.proposal_uid,
	sliceUid: row.slice_uid,
	generation: row.generation,
	actorAgentId: row.actor_agent_id,
	machineId: row.machine_id,
	occurredAt: row.occurred_at,
	recordedAt: row.recorded_at,
	payload: parsePayload(row.payload_json),
});

export class CoordinationJournalRepo {
	constructor(private readonly db: Database) {}

	/** Append-once. Replaying the same event is a no-op, not a duplicate. */
	append(
		args: IAppendCoordinationEventArgs,
	): IAppendCoordinationEventOutcome {
		const payloadJson = canonicalPayload(args.payload);
		const eventId = journalEventId({
			eventKind: args.eventKind,
			repositoryUid: args.repositoryUid,
			workUnitUid: args.workUnitUid,
			generation: args.generation,
			actorAgentId: args.actorAgentId,
			occurredAt: args.occurredAt,
			payloadJson,
		});
		const changes = this.db
			.prepare(
				`INSERT INTO coordination_journal (
					event_id, event_kind, repository_uid, work_unit_uid,
					proposal_uid, slice_uid, generation, actor_agent_id,
					machine_id, occurred_at, recorded_at, payload_json
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (event_id) DO NOTHING`,
			)
			.run(
				eventId,
				args.eventKind,
				args.repositoryUid ?? null,
				args.workUnitUid ?? null,
				args.proposalUid ?? null,
				args.sliceUid ?? null,
				args.generation ?? null,
				args.actorAgentId ?? null,
				args.machineId ?? null,
				args.occurredAt,
				args.recordedAt ?? Date.now(),
				payloadJson,
			).changes;
		const event = this.getByEventId(eventId);
		if (!event)
			throw new Error('coordination_journal insert did not persist');
		return { appended: changes === 1, event };
	}

	getByEventId(eventId: string): ICoordinationEventRecord | null {
		const row = this.db
			.query<IJournalRow, [string]>(
				`SELECT ${JOURNAL_COLUMNS} FROM coordination_journal
				 WHERE event_id = ?`,
			)
			.get(eventId);
		return row ? mapRow(row) : null;
	}

	/** Every event for one work unit, in the order it happened. */
	listForWorkUnit(uid: string): readonly ICoordinationEventRecord[] {
		return this.db
			.query<IJournalRow, [string]>(
				`SELECT ${JOURNAL_COLUMNS} FROM coordination_journal
				 WHERE work_unit_uid = ?
				 ORDER BY occurred_at ASC, id ASC`,
			)
			.all(uid)
			.map(mapRow);
	}

	/**
	 * The whole journal, oldest first. This is the export a fresh
	 * machine replays to recover the semantics the forge cannot supply.
	 */
	listAll(): readonly ICoordinationEventRecord[] {
		return this.db
			.query<IJournalRow, []>(
				`SELECT ${JOURNAL_COLUMNS} FROM coordination_journal
				 ORDER BY occurred_at ASC, id ASC`,
			)
			.all()
			.map(mapRow);
	}
}
