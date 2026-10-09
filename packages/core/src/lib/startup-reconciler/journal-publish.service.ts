/**
 * journal-publish.service.ts — the coordination journal, written to the
 * ref the next machine reads it from.
 *
 * The write side of `journal-ref.service.ts`. What this machine's state
 * database holds and the ref does not is added to the ref as ONE new
 * commit on top of the old one, so the push is a fast-forward and never
 * rewrites what another machine published. When the push is rejected
 * (another machine got there first) the ref is fetched again, the two
 * sets are merged by event identity, and the push is retried: no event is
 * lost and none is written twice.
 *
 * Nothing here may fail the work that produced an event. Every outcome is
 * an answer; an `unavailable` leaves the events in the database, and the
 * next boot publishes what is still missing.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import {
	JOURNAL_COMMIT_IDENTITY,
	JOURNAL_COMMIT_MESSAGE,
	JOURNAL_FILE,
	JOURNAL_FILE_MODE,
	JOURNAL_PUBLISH_ATTEMPTS,
} from './journal-ref.constant';
import { journalRefName, journalRefReader } from './journal-ref.service';
import { finding } from './finding-catalog';
import {
	runJournalPhase,
	type IJournalPhaseResult,
} from './phases/import-journal';
import type { IStartupFinding, IStartupPhaseResult } from './contracts';
import type {
	IJournalPublication,
	IJournalSourceEvent,
	IStartupGitSeam,
	IStartupJournalSource,
} from './seams.interface';
import type {
	IJournalEventView,
	IStartupJournalPort,
} from './state-ports.interface';

const sortedPayload = (payload: unknown): string =>
	JSON.stringify(
		typeof payload === 'object' && payload !== null
			? Object.fromEntries(
					Object.entries(payload).sort(([a], [b]) =>
						a < b ? -1 : a > b ? 1 : 0,
					),
				)
			: (payload ?? {}),
	);

/**
 * The fields that make two events the same event: the ones the database
 * derives its own event id from, so a key that matches here is an append
 * that is a no-op there.
 */
const eventKey = (event: IJournalSourceEvent): string =>
	JSON.stringify([
		event.eventKind,
		event.repositoryUid ?? null,
		event.workUnitUid ?? null,
		event.generation ?? null,
		event.actorAgentId ?? null,
		event.occurredAt,
		sortedPayload(event.payload),
	]);

/** A stored row as the event that travels: no nulls, no database columns. */
export const toJournalSourceEvent = (
	view: IJournalEventView,
): IJournalSourceEvent => ({
	eventKind: view.eventKind as IJournalSourceEvent['eventKind'],
	...(view.repositoryUid ? { repositoryUid: view.repositoryUid } : {}),
	...(view.workUnitUid ? { workUnitUid: view.workUnitUid } : {}),
	...(view.proposalUid ? { proposalUid: view.proposalUid } : {}),
	...(view.sliceUid ? { sliceUid: view.sliceUid } : {}),
	...(typeof view.generation === 'number'
		? { generation: view.generation }
		: {}),
	...(view.actorAgentId ? { actorAgentId: view.actorAgentId } : {}),
	...(view.machineId ? { machineId: view.machineId } : {}),
	occurredAt: view.occurredAt,
	...(typeof view.payload === 'object' && view.payload !== null
		? { payload: view.payload as Readonly<Record<string, unknown>> }
		: {}),
});

/** Both sets once each, oldest first; ties break on the key so it is stable. */
const mergeByIdentity = (
	published: readonly IJournalSourceEvent[],
	local: readonly IJournalSourceEvent[],
): readonly IJournalSourceEvent[] => {
	const byKey = new Map<string, IJournalSourceEvent>();
	for (const event of [...published, ...local]) {
		if (!byKey.has(eventKey(event))) byKey.set(eventKey(event), event);
	}
	return [...byKey.entries()]
		.sort(([ka, a], [kb, b]) =>
			a.occurredAt !== b.occurredAt
				? a.occurredAt - b.occurredAt
				: ka < kb
					? -1
					: ka > kb
						? 1
						: 0,
		)
		.map(([, event]) => event);
};

const unavailable = (reason: string): IJournalPublication => ({
	kind: 'unavailable',
	reason,
});

/**
 * Writes `text` as the journal's blob and a tree holding only it, and
 * commits that tree on `parent`. Done with plumbing and files so it works
 * through a runner that has no standard input, and without touching the
 * checkout's index or working tree.
 */
const commitJournal = async (
	run: IGitRunner,
	text: string,
	parent: string | undefined,
): Promise<string | undefined> => {
	const scratch = await mkdtemp(join(tmpdir(), 'delendai-journal-'));
	try {
		const blobFile = join(scratch, JOURNAL_FILE);
		await writeFile(blobFile, text, 'utf8');
		const blob = await run(['hash-object', '-w', '--', blobFile]);
		if (!blob.ok) return undefined;
		const blobSha = blob.output.trim();
		const treeFile = join(scratch, 'tree');
		await writeFile(
			treeFile,
			Buffer.concat([
				Buffer.from(`${JOURNAL_FILE_MODE} ${JOURNAL_FILE}\0`, 'utf8'),
				Buffer.from(blobSha, 'hex'),
			]),
		);
		const tree = await run([
			'hash-object',
			'-w',
			'-t',
			'tree',
			'--',
			treeFile,
		]);
		if (!tree.ok) return undefined;
		const commit = await run([
			...JOURNAL_COMMIT_IDENTITY,
			'commit-tree',
			tree.output.trim(),
			...(parent === undefined ? [] : ['-p', parent]),
			'-m',
			JOURNAL_COMMIT_MESSAGE,
		]);
		return commit.ok ? commit.output.trim() : undefined;
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
};

/**
 * The publisher the startup git seam exposes. `local` is every event the
 * state database holds; the ref ends up holding those and whatever it
 * already held.
 */
export const journalRefPublisher =
	(
		run: IGitRunner,
		integrationRemote: (branch: string) => Promise<string | undefined>,
	) =>
	async (
		namespace: string,
		integrationBranch: string,
		local: readonly IJournalSourceEvent[],
	): Promise<IJournalPublication> => {
		const remote = await integrationRemote(integrationBranch);
		if (remote === undefined) return { kind: 'unchanged' };
		const ref = journalRefName(namespace);
		const read = journalRefReader(run, integrationRemote);
		let reason = `${ref} was rejected on every attempt`;
		for (
			let attempt = 0;
			attempt < JOURNAL_PUBLISH_ATTEMPTS;
			attempt += 1
		) {
			const published = await read(
				namespace,
				integrationBranch,
				undefined,
			);
			if (published.kind !== 'payload') {
				return unavailable(
					published.kind === 'unavailable'
						? published.reason
						: `${ref} could not be read`,
				);
			}
			const merged = mergeByIdentity(published.payload, local);
			const added = merged.length - published.payload.length;
			if (added === 0) return { kind: 'unchanged' };
			const parent = await run([
				'rev-parse',
				'--verify',
				'-q',
				`${ref}^{commit}`,
			]);
			const commit = await commitJournal(
				run,
				`${merged.map((event) => JSON.stringify(event)).join('\n')}\n`,
				parent.ok && parent.output.trim().length > 0
					? parent.output.trim()
					: undefined,
			);
			if (commit === undefined)
				return unavailable('the journal commit could not be written');
			const pushed = await run([
				'push',
				'-q',
				'--',
				remote,
				`${commit}:${ref}`,
			]);
			if (pushed.ok) {
				await run(['update-ref', ref, commit]);
				return { kind: 'published', added };
			}
			reason = pushed.reason ?? reason;
		}
		return unavailable(reason);
	};

/**
 * The boot's publication step: whatever the database holds that the ref
 * does not goes out, and the outcome is a finding. A failure is a note,
 * never a blocker: the work that produced the events is done and the next
 * boot publishes what is pending.
 */
export const publishPendingJournal = async (input: {
	readonly git: Pick<IStartupGitSeam, 'publishJournal'>;
	readonly journal: Pick<IStartupJournalPort, 'listAll'>;
	readonly branches: {
		readonly namespacePrefix: string;
		readonly integration: string;
	};
}): Promise<readonly IStartupFinding[]> => {
	if (input.git.publishJournal === undefined) return [];
	let outcome: IJournalPublication;
	try {
		outcome = await input.git.publishJournal(
			input.branches.namespacePrefix,
			input.branches.integration,
			input.journal.listAll().map(toJournalSourceEvent),
		);
	} catch (error) {
		outcome = unavailable(
			error instanceof Error ? error.message : String(error),
		);
	}
	if (outcome.kind === 'unchanged') return [];
	if (outcome.kind === 'published') {
		return [
			finding({
				code: 'journal.published',
				phase: 'journal',
				kind: 'repaired',
				subject: 'coordination-journal',
				message: `Published ${String(outcome.added)} coordination event(s) to the journal ref.`,
			}),
		];
	}
	return [
		finding({
			code: 'journal.publication-failed',
			phase: 'journal',
			kind: 'note',
			subject: 'coordination-journal',
			message: `The coordination journal was not published (${outcome.reason}); the next boot tries again.`,
		}),
	];
};

/**
 * The import half of the journal phase as a boot runs it: replay what the
 * source holds that the database lacks, asking only for what happened
 * after the newest event the database already has.
 */
export const runJournalStep = (input: {
	readonly source: IStartupJournalSource | undefined;
	readonly ports: Parameters<typeof runJournalPhase>[0]['ports'];
	readonly mode: 'full' | 'incremental';
}): Promise<IJournalPhaseResult> => {
	const newestKnownEvent = input.ports.journal
		.listAll()
		.reduce((max, event) => Math.max(max, event.occurredAt), 0);
	return runJournalPhase({
		source: input.source,
		ports: input.ports,
		mode: input.mode,
		since: newestKnownEvent > 0 ? newestKnownEvent : undefined,
	});
};

/**
 * The journal phase's result once publication has run. It runs last in a
 * boot, after the outcome event is appended, so that event goes out too;
 * a failure is a note on the phase.
 */
export const finishJournal = async (
	input: Parameters<typeof publishPendingJournal>[0] & {
		readonly imported: IJournalPhaseResult;
		readonly ran: boolean;
	},
): Promise<IStartupPhaseResult> => ({
	phase: 'journal',
	ran: input.ran,
	counters: input.imported.counters,
	findings: [
		...input.imported.findings,
		...(await publishPendingJournal(input)),
	],
});
