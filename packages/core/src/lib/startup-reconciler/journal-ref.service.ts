/**
 * journal-ref.service.ts — the coordination journal, read from the ref
 * the project publishes it to.
 *
 * The journal holds what a rebuild cannot re-derive from git or the
 * forge (recoveries, hand-overs, decisions). It ships as
 * `refs/<namespace>/journal` on the integration remote: the one home
 * every project already has and every git host serves, read without the
 * forge's API and recovered by a fresh clone the way retired tips are.
 * The ref's tree holds one file of NDJSON events.
 */
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { namespacedRef } from '../work-units/namespaced-ref.helper';
import {
	JOURNAL_EVENT_KINDS,
	JOURNAL_FALLBACK_NAMESPACE,
	JOURNAL_FILE,
	JOURNAL_REF_LEAF,
} from './journal-ref.constant';
import type {
	IForgeRead,
	IJournalSourceEvent,
	IStartupGitSeam,
	IStartupJournalSource,
} from './seams.interface';

/** `refs/<namespace>/journal`, under a fixed namespace for a project with none. */
export const journalRefName = (namespace: string): string =>
	namespacedRef(
		namespace.length > 0 ? namespace : JOURNAL_FALLBACK_NAMESPACE,
		JOURNAL_REF_LEAF,
	);

type IJournalRead = IForgeRead<readonly IJournalSourceEvent[]>;

const unavailable = (reason: string): IJournalRead => ({
	kind: 'unavailable',
	reason,
});

const isJournalEvent = (value: unknown): value is IJournalSourceEvent =>
	typeof value === 'object' &&
	value !== null &&
	JOURNAL_EVENT_KINDS.has(
		String((value as { eventKind?: unknown }).eventKind),
	) &&
	typeof (value as { occurredAt?: unknown }).occurredAt === 'number';

/**
 * The events of one journal file, oldest first, or the line that is not
 * one. A line that does not parse is corruption, and nothing is imported
 * from a journal that is not what it claims to be.
 */
export const parseJournal = (
	text: string,
): readonly IJournalSourceEvent[] | { readonly badLine: number } => {
	const events: IJournalSourceEvent[] = [];
	const lines = text.split('\n');
	for (const [index, line] of lines.entries()) {
		if (line.trim().length === 0) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			return { badLine: index + 1 };
		}
		if (!isJournalEvent(parsed)) return { badLine: index + 1 };
		events.push(parsed);
	}
	return events.sort((a, b) => a.occurredAt - b.occurredAt);
};

/**
 * Reads `refs/<namespace>/journal` from the integration remote. A remote
 * that has no such ref has an empty journal: nothing was published. A
 * remote that cannot be asked is `unavailable`, from which nothing is
 * concluded.
 */
export const journalRefReader =
	(
		run: IGitRunner,
		integrationRemote: (branch: string) => Promise<string | undefined>,
	) =>
	async (
		namespace: string,
		integrationBranch: string,
		sinceOccurredAt: number | undefined,
	): Promise<IJournalRead> => {
		const remote = await integrationRemote(integrationBranch);
		if (remote === undefined) return { kind: 'payload', payload: [] };
		const ref = journalRefName(namespace);
		const listed = await run(['ls-remote', '--', remote, ref]);
		if (!listed.ok)
			return unavailable(`${remote} could not be asked for ${ref}`);
		if (listed.output.trim().length === 0) {
			return { kind: 'payload', payload: [] };
		}
		const fetched = await run([
			'fetch',
			'-q',
			'--no-write-fetch-head',
			'--',
			remote,
			`+${ref}:${ref}`,
		]);
		if (!fetched.ok)
			return unavailable(`${ref} could not be fetched from ${remote}`);
		const shown = await run(['show', `${ref}:${JOURNAL_FILE}`]);
		if (!shown.ok) return unavailable(`${ref} holds no ${JOURNAL_FILE}`);
		const parsed = parseJournal(shown.output);
		if (!Array.isArray(parsed)) {
			return unavailable(
				`line ${String((parsed as { badLine: number }).badLine)} of ${ref}:${JOURNAL_FILE} is not a journal event`,
			);
		}
		const events = parsed as readonly IJournalSourceEvent[];
		return {
			kind: 'payload',
			payload:
				sinceOccurredAt === undefined
					? events
					: events.filter(
							(event) => event.occurredAt >= sinceOccurredAt,
						),
		};
	};

/**
 * The journal source a reconciliation reads: the one it was given, or
 * the project's journal ref when the git seam can read it.
 */
export const journalSourceFor = (
	input: {
		readonly journalSource?: IStartupJournalSource | undefined;
		readonly git: Pick<IStartupGitSeam, 'readJournal'>;
	},
	branches: {
		readonly namespacePrefix: string;
		readonly integration: string;
	},
): IStartupJournalSource | undefined => {
	if (input.journalSource !== undefined) return input.journalSource;
	const { git } = input;
	if (git.readJournal === undefined) return undefined;
	return {
		read: ({ sinceOccurredAt }) =>
			git.readJournal?.(
				branches.namespacePrefix,
				branches.integration,
				sinceOccurredAt,
			) ?? Promise.resolve({ kind: 'payload', payload: [] }),
	};
};
