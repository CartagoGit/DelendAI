import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
	realpathContained,
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

/**
 * A durable declaration that an agent finished its ORIGINAL task, reviewed
 * it thoroughly, and will take no further action unless the human explicitly
 * asks. Stored as one JSON file per `taskId` under the plugin's records dir
 * so `<prefix>_status` can list who is done after a restart.
 */
export interface ICompletionRecord {
	readonly taskId: string;
	readonly agent: string;
	readonly summary: string;
	readonly reviewEvidence: string;
	readonly ts: string;
}

export interface ICompletionStore {
	upsert(record: ICompletionRecord): Promise<ICompletionRecord>;
	list(
		filter?: Readonly<{ taskId?: string; agent?: string }>,
	): Promise<readonly ICompletionRecord[]>;
	remove(taskId: string): Promise<boolean>;
}

const FILE_UNSAFE = /[^a-zA-Z0-9._-]/g;

/**
 * Strip one repeated character off both ends.
 *
 * A scan rather than `/^-+|-+$/g`, whose `-+$` alternative restarts at
 * every position of a long run of dashes — which is what the
 * replacement above produces from a task id made of punctuation
 * (`js/polynomial-redos`). The id comes from whoever called the tool.
 */
const trimChar = (value: string, char: string): string => {
	let start = 0;
	let end = value.length;
	while (start < end && value[start] === char) start += 1;
	while (end > start && value[end - 1] === char) end -= 1;
	return value.slice(start, end);
};

const sanitisedTaskId = (taskId: string): string =>
	trimChar(taskId.replace(FILE_UNSAFE, '-'), '-') || 'task';

const taskIdHash = (taskId: string): string =>
	createHash('sha256').update(taskId).digest('hex').slice(0, 12);

const legacyRecordFileName = (taskId: string): string =>
	`${sanitisedTaskId(taskId)}.json`;

/** taskId → stable, filesystem-safe file name with collision-resistant identity. */
export const recordFileName = (taskId: string): string =>
	`${sanitisedTaskId(taskId)}-${taskIdHash(taskId)}.json`;

export const recordPath = (recordsDir: string, taskId: string): string =>
	join(recordsDir, recordFileName(taskId));

const legacyRecordPath = (recordsDir: string, taskId: string): string =>
	join(recordsDir, legacyRecordFileName(taskId));

const readRecord = async (path: string): Promise<ICompletionRecord | null> => {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

const isRecord = (value: unknown): value is ICompletionRecord => {
	if (typeof value !== 'object' || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.taskId === 'string' &&
		typeof r.agent === 'string' &&
		typeof r.summary === 'string' &&
		typeof r.reviewEvidence === 'string' &&
		typeof r.ts === 'string'
	);
};

/**
 * Pure over the injected records dir; async I/O only. Reads tolerate
 * missing dirs and corrupt/partial files (skip, never throw) so a crash
 * mid-write can never poison the whole idle list.
 */
export const createCompletionStore = (
	recordsDir: string,
	containmentRoot: string = recordsDir,
): ICompletionStore => ({
	async upsert(record) {
		const path = recordPath(recordsDir, record.taskId);
		// PHYSICAL containment at the point of the write. The
		// file name is already sanitised, so no LEXICAL traversal can
		// escape — but a symlink still names another tree, and only
		// realpath can see that. Rooted at `containmentRoot` rather than
		// at `recordsDir`, because realpath-ing a symlinked records dir
		// would make the escape destination its own root and the check
		// vacuous; the host passes the workspace root. With the default,
		// the guard still catches a record file that is itself a symlink
		// pointing out. `upsert` has no outcome union, and the caller
		// wraps it in try/catch and turns a throw into a toolError with
		// guidance, which is the refusal surface we want.
		if (!(await realpathContained(path, [containmentRoot]))) {
			throw new Error(
				`completion: refusing to write a record outside the records dir: ${recordFileName(record.taskId)}`,
			);
		}
		await withFileMutex(path, async () => {
			await writeFileAtomic(path, `${JSON.stringify(record)}\n`);
		});
		return record;
	},

	async list(filter) {
		let entries: string[];
		try {
			entries = await readdir(recordsDir);
		} catch {
			return [];
		}
		const reader = new SafeWorkspaceReader(recordsDir);
		const records: ICompletionRecord[] = [];
		for (const entry of entries) {
			if (!entry.endsWith('.json')) continue;
			try {
				const parsed: unknown = JSON.parse(
					(await reader.readText(entry)).content,
				);
				if (!isRecord(parsed)) continue;
				if (
					filter?.taskId !== undefined &&
					parsed.taskId !== filter.taskId
				)
					continue;
				if (
					filter?.agent !== undefined &&
					parsed.agent !== filter.agent
				)
					continue;
				records.push(parsed);
			} catch {
				// corrupt or partially-written record: skip, never throw
			}
		}
		records.sort((a, b) => b.ts.localeCompare(a.ts));
		return records;
	},

	async remove(taskId) {
		const path = recordPath(recordsDir, taskId);
		try {
			await rm(path);
			return true;
		} catch (error) {
			if ((error as { code?: string }).code !== 'ENOENT') throw error;
			const legacyPath = legacyRecordPath(recordsDir, taskId);
			const legacyRecord = await readRecord(legacyPath);
			if (legacyRecord?.taskId !== taskId) return false;
			await rm(legacyPath);
			return true;
		}
	},
});
