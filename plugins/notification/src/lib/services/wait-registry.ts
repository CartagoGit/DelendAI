import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type { IRegisteredWait } from '../contracts/interfaces/wait-diagnosis.interface';

/**
 * The wait-for graph, on disk.
 *
 * Deadlock is the one lock failure that no timeout can fix: A holds what
 * B wants and B holds what A wants, so both sides time out, both retry,
 * and the swarm makes no progress for as long as the agents are willing
 * to keep trying. It is also the one failure that is *exactly* decidable
 * — but only if the waits are visible. A lock file records who holds
 * what; nothing recorded who is waiting on what, so the cycle was there
 * and unobservable.
 *
 * This is deliberately the smallest thing that closes that gap: while an
 * agent is parked in `await_lock` it publishes one line saying so, and
 * removes it when the wait ends. Nothing reads it except the timeout
 * diagnosis, and nothing blocks on it.
 *
 * Entries are self-expiring. A registry of waits that could itself leak
 * zombie rows would reproduce the very problem it exists to diagnose, so
 * every row carries the moment it started and readers drop anything
 * older than {@link WAIT_ENTRY_TTL_MS} — comfortably longer than the
 * 120s ceiling `await_lock` enforces on a single wait, so a live wait is
 * never dropped, and far shorter than any window in which a stale row
 * could cause a false deadlock verdict.
 */

/** A wait row, plus when it was registered. */
interface IWaitRow extends IRegisteredWait {
	readonly since: string;
}

interface IWaitFile {
	readonly version: 1;
	readonly waits: readonly IWaitRow[];
}

/**
 * Five minutes: 2.5× the longest wait `await_lock` will ever perform, so
 * no live waiter is ever pruned, and short enough that a row orphaned by
 * a hard kill cannot outlive the claim it referred to.
 */
export const WAIT_ENTRY_TTL_MS = 300_000;

/** Sibling of the lock file, so the two are always read from one place. */
export const deriveWaitRegistryPath = (lockFile: string): string =>
	join(dirname(lockFile), `${basename(lockFile, '.json')}.waits.json`);

const EMPTY: IWaitFile = { version: 1, waits: [] };

const readFile = async (path: string): Promise<IWaitFile> => {
	try {
		const raw = (
			await new SafeWorkspaceReader(dirname(path)).readText(
				basename(path),
			)
		).content;
		const parsed = JSON.parse(raw) as Partial<IWaitFile>;
		return {
			version: 1,
			waits: Array.isArray(parsed.waits) ? parsed.waits : [],
		};
	} catch {
		// Missing or torn → no waits are known. Never throws: a registry
		// that cannot be read must degrade to "no deadlock detected",
		// never to a failed wait.
		return EMPTY;
	}
};

const isLive = (row: IWaitRow, nowMs: number): boolean => {
	const sinceMs = Date.parse(row.since);
	if (!Number.isFinite(sinceMs)) return false;
	return nowMs - sinceMs <= WAIT_ENTRY_TTL_MS;
};

/**
 * The waits that are still live. Expired rows are filtered on read as
 * well as on write, so a reader is correct even when no writer has come
 * along to prune the file.
 */
export const readRegisteredWaits = async (
	lockFile: string,
	nowMs: number = Date.now(),
): Promise<readonly IRegisteredWait[]> => {
	const file = await readFile(deriveWaitRegistryPath(lockFile));
	return file.waits
		.filter((row) => isLive(row, nowMs))
		.map(({ waiter, waitingOnTaskId }) => ({ waiter, waitingOnTaskId }));
};

const rewrite = async (
	lockFile: string,
	mutate: (rows: readonly IWaitRow[]) => readonly IWaitRow[],
	nowMs: number,
): Promise<void> => {
	const path = deriveWaitRegistryPath(lockFile);
	try {
		await withFileMutex(path, async () => {
			const current = await readFile(path);
			const next = mutate(
				current.waits.filter((row) => isLive(row, nowMs)),
			);
			await writeFileAtomic(
				path,
				`${JSON.stringify({ version: 1, waits: next }, null, '\t')}\n`,
			);
		});
	} catch {
		// Best effort by design. Failing to publish a wait costs a
		// deadlock diagnosis; failing the wait itself would cost the
		// agent its next step, which is strictly worse.
	}
};

/** Publish "this agent is parked on this task". */
export const registerWait = async (
	input: {
		readonly lockFile: string;
		readonly waiter: string;
		readonly waitingOnTaskId: string;
	},
	nowMs: number = Date.now(),
): Promise<void> => {
	await rewrite(
		input.lockFile,
		(rows) => [
			// One row per waiter: an agent can only be parked on one wait
			// at a time, so a re-register replaces rather than accumulates.
			...rows.filter((row) => row.waiter !== input.waiter),
			{
				waiter: input.waiter,
				waitingOnTaskId: input.waitingOnTaskId,
				since: new Date(nowMs).toISOString(),
			},
		],
		nowMs,
	);
};

/** Withdraw it. Called however the wait ends, including on abort. */
export const unregisterWait = async (
	input: { readonly lockFile: string; readonly waiter: string },
	nowMs: number = Date.now(),
): Promise<void> => {
	await rewrite(
		input.lockFile,
		(rows) => rows.filter((row) => row.waiter !== input.waiter),
		nowMs,
	);
};
