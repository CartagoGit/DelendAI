/**
 * file-lock-contentions.ts — r00042 S3.
 *
 * Moved out of `file-lock-table.ts` verbatim to bring it under the
 * 600-line ceiling this proposal sets. Declarations relocated, never
 * rewritten.
 */
import type {
	IFileLockContention,
	IFileLockTableDeps,
} from './file-lock-table';
import { readDocument } from './file-lock-document';
import {
	LocksFileCorruptError,
	defaultReadTable,
	defaultWriteTable,
	getNow,
	getTablePath,
	isMissingFileErrno,
} from './file-lock-table';
import { dirname, join } from 'node:path';
import { CONTENTION_HISTORY_WINDOW_MS } from '../contracts/constants/agent-lock-engine.constant';

export const getContentionPath = (
	deps: { readonly tablePath?: string } = {},
): string => {
	const base = getTablePath(deps);
	return join(dirname(base), 'file-lock-contentions.json');
};

export const readContentions = async (
	deps: IFileLockTableDeps,
): Promise<readonly IFileLockContention[]> => {
	const contentionPath = getContentionPath(deps);
	try {
		const raw = await (deps.readTable ?? defaultReadTable)(contentionPath);
		if (raw.length > 0) {
			const parsed = JSON.parse(raw) as unknown;
			if (Array.isArray(parsed)) {
				const nowMs = new Date(getNow(deps)).getTime();
				return pruneContentions(
					parsed as readonly IFileLockContention[],
					Number.isNaN(nowMs) ? Date.now() : nowMs,
				);
			}
		}
	} catch (err) {
		if (err instanceof SyntaxError) {
			// x00154 S5 — surface corrupt contention file as a structured
			// log-warning and fall back to the lock-table's
			// contentionHistory. We do NOT rethrow: callers (listers,
			// resolve-time sweepers) must continue to function when the
			// contention file is bad, mirroring today's behaviour.
			const wrapped = new LocksFileCorruptError(contentionPath, err);
			if (deps.emitLog) {
				await deps.emitLog({
					kind: 'log-warning',
					summary: `Locks contention file is corrupt: ${contentionPath}`,
					file: contentionPath,
					meta: { errorName: err.name, errorMessage: err.message },
				});
			}
			void wrapped; // surfaced via the typed export for callers/tests.
		} else if (!isMissingFileErrno(err)) {
			throw err;
		}
		// Missing file (ENOENT/ENOTDIR) → silent fallback, current
		// behaviour. Falls through to `readDocument` below.
	}
	const current = await readDocument(deps);
	const nowMs = new Date(getNow(deps)).getTime();
	return pruneContentions(
		current.contentionHistory,
		Number.isNaN(nowMs) ? Date.now() : nowMs,
	);
};

export const writeContentions = async (
	records: readonly IFileLockContention[],
	deps: Pick<IFileLockTableDeps, 'tablePath' | 'writeTableAtomic'>,
): Promise<void> => {
	const path = getContentionPath(deps);
	const writer = deps.writeTableAtomic ?? defaultWriteTable;
	await writer(path, JSON.stringify(records, null, 2));
};

export const pruneContentions = (
	records: readonly IFileLockContention[],
	nowMs: number,
): readonly IFileLockContention[] =>
	records.filter((r) => {
		const activityAt = r.resolvedAt ?? r.lastSeenAt;
		const activityMs = new Date(activityAt).getTime();
		if (Number.isNaN(activityMs)) return true;
		return nowMs - activityMs <= CONTENTION_HISTORY_WINDOW_MS;
	});
