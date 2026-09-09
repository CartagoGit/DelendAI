/**
 * import-journal.ts — phase 6: replay the one input a rebuild cannot
 * re-derive.
 *
 * Git can prove that a ref moved; the forge can prove that a pull request
 * merged. Neither can say WHY a slice changed hands, that a ref was
 * deprecated deliberately rather than abandoned, or which recovery
 * decision a previous reconciler took. Those semantics live in the
 * durable coordination journal, and a machine that starts with an empty
 * database has to replay it or it will re-derive facts while losing their
 * meaning.
 *
 * WHY replaying is safe to do on every single boot: the journal's event
 * id is derived from the event's own content, and the column is UNIQUE,
 * so an append that has been seen is a no-op. Twenty boots therefore
 * import the same events once. The counter distinguishes `imported` from
 * `skipped`, which is exactly the assertion the idempotency test makes.
 */

import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type { IStartupJournalSource } from '../seams';
import type { IStartupStatePorts } from '../state-ports';

/** What phase 6 produced. */
export interface IJournalPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly journalEventsImported: number;
		readonly journalEventsSkipped: number;
	};
}

export const runJournalPhase = async (input: {
	readonly source: IStartupJournalSource | undefined;
	readonly ports: IStartupStatePorts;
	readonly mode: 'full' | 'incremental';
	readonly since: number | undefined;
}): Promise<IJournalPhaseResult> => {
	if (input.source === undefined) {
		return {
			findings: [],
			counters: { journalEventsImported: 0, journalEventsSkipped: 0 },
		};
	}

	// A cold machine must replay everything; a warm one asks only for
	// what happened after the newest event it already holds.
	const read = await input.source.read(
		input.mode === 'incremental' && input.since !== undefined
			? { sinceOccurredAt: input.since }
			: {},
	);
	if (read.kind === 'unavailable') {
		return {
			findings: [
				finding({
					code: 'forge.unavailable',
					phase: 'journal',
					kind: 'blocker',
					subject: 'coordination-journal',
					message: `The durable coordination journal could not be read: ${read.reason}.`,
				}),
			],
			counters: { journalEventsImported: 0, journalEventsSkipped: 0 },
		};
	}
	if (read.kind === 'not-modified') {
		return {
			findings: [],
			counters: { journalEventsImported: 0, journalEventsSkipped: 0 },
		};
	}

	let imported = 0;
	let skipped = 0;
	for (const event of read.payload) {
		const outcome = input.ports.journal.append({
			eventKind: event.eventKind,
			...(event.repositoryUid === undefined
				? {}
				: { repositoryUid: event.repositoryUid }),
			...(event.workUnitUid === undefined
				? {}
				: { workUnitUid: event.workUnitUid }),
			...(event.proposalUid === undefined
				? {}
				: { proposalUid: event.proposalUid }),
			...(event.sliceUid === undefined
				? {}
				: { sliceUid: event.sliceUid }),
			...(event.generation === undefined
				? {}
				: { generation: event.generation }),
			...(event.actorAgentId === undefined
				? {}
				: { actorAgentId: event.actorAgentId }),
			...(event.machineId === undefined
				? {}
				: { machineId: event.machineId }),
			occurredAt: event.occurredAt,
			...(event.payload === undefined ? {} : { payload: event.payload }),
		});
		if (outcome.appended) imported += 1;
		else skipped += 1;
	}

	return {
		findings:
			imported > 0
				? [
						finding({
							code: 'journal.event-imported',
							phase: 'journal',
							kind: 'repaired',
							subject: 'coordination-journal',
							message: `Replayed ${String(imported)} coordination event(s); ${String(skipped)} were already present.`,
						}),
					]
				: [],
		counters: {
			journalEventsImported: imported,
			journalEventsSkipped: skipped,
		},
	};
};
