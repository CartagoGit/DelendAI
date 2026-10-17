/**
 * invocation-journal.service.ts — every hop's start and end, durably.
 *
 * Without it, a server that dies mid-invocation leaves nothing behind:
 * the next start cannot tell a hop that finished from one that never
 * did, and a caller asking what became of its work gets no answer. Each
 * hop appends `running` before its process starts and its end after;
 * at start, a `running` hop of a process that is gone becomes
 * `interrupted`, so nothing unfinished reads as done. The journal
 * records what the provider's process did, never that the task is
 * complete: postconditions are the principal's to check.
 */
import { redactSecrets } from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';

import type {
	IInvocationJournal,
	IInvocationJournalEntry,
} from '../contracts/interfaces/invocation-journal.interface';
import { readCacheFile } from './read-cache-file.helper';

const parsedEntries = (raw: string): IInvocationJournalEntry[] =>
	raw.split('\n').flatMap((line) => {
		if (line.trim().length === 0) return [];
		try {
			return [JSON.parse(line) as IInvocationJournalEntry];
		} catch {
			return [];
		}
	});

/** Every entry, oldest first; a missing journal is empty. */
export const readJournal = async (
	path: string,
): Promise<IInvocationJournalEntry[]> =>
	parsedEntries((await readCacheFile(path)) ?? '');

/** Each invocation's latest entry. */
export const latestByInvocation = (
	entries: readonly IInvocationJournalEntry[],
): Map<string, IInvocationJournalEntry> => {
	const latest = new Map<string, IInvocationJournalEntry>();
	for (const entry of entries) latest.set(entry.invocationId, entry);
	return latest;
};

export const invocationJournalAt =
	(path: string, now: () => Date = () => new Date()): IInvocationJournal =>
	async (entry) => {
		const line = redactSecrets(
			JSON.stringify({
				...entry,
				at: now().toISOString(),
				pid: process.pid,
			}),
		).text;
		// Read and rewritten whole under the mutex: the journal is compacted
		// at start, so this stays small, and every write is atomic.
		await withFileMutex(path, async () => {
			const before = (await readCacheFile(path)) ?? '';
			await writeFileAtomic(path, `${before}${line}\n`);
		}).catch(() => undefined);
	};

/** Invocations the journal remembers once it is rewritten at start. */
const KEPT_INVOCATIONS = 500;

const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

/**
 * At start: a hop still `running` whose process is gone ends as
 * `interrupted`. Returns how many were.
 */
export const interruptOrphans = async (
	path: string,
	isAlive: (pid: number) => boolean = alive,
	now: () => Date = () => new Date(),
): Promise<number> =>
	withFileMutex(path, async () => {
		const entries = await readJournal(path);
		const latest = [...latestByInvocation(entries).values()];
		const orphans = latest.filter(
			(entry) =>
				entry.state === 'running' &&
				entry.pid !== process.pid &&
				!isAlive(entry.pid),
		);
		if (orphans.length === 0 && latest.length <= KEPT_INVOCATIONS) return 0;
		const ended = orphans.map((entry) => ({
			...entry,
			state: 'interrupted' as const,
			at: now().toISOString(),
			pid: process.pid,
			detail: `the process that ran it (${String(entry.pid)}) ended before it did`,
		}));
		// Rewritten at start only: each invocation's latest entry, the most
		// recent ones, so the journal never grows without bound.
		const endedIds = new Set(ended.map((entry) => entry.invocationId));
		const kept = [
			...latest.filter((entry) => !endedIds.has(entry.invocationId)),
			...ended,
		]
			.sort((a, b) => a.at.localeCompare(b.at))
			.slice(-KEPT_INVOCATIONS);
		await writeFileAtomic(
			path,
			`${kept.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
		);
		return ended.length;
	}).catch(() => 0);
