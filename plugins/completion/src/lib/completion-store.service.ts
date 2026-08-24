import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

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

/** taskId → filesystem-safe file name; empty/unsafe ids collapse to `task.json`. */
export const recordFileName = (taskId: string): string =>
	`${taskId.replace(FILE_UNSAFE, '-').replace(/^-+|-+$/g, '') || 'task'}.json`;

export const recordPath = (recordsDir: string, taskId: string): string =>
	join(recordsDir, recordFileName(taskId));

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
): ICompletionStore => ({
	async upsert(record) {
		const path = recordPath(recordsDir, record.taskId);
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
		const records: ICompletionRecord[] = [];
		for (const entry of entries) {
			if (!entry.endsWith('.json')) continue;
			try {
				const parsed: unknown = JSON.parse(
					await readFile(join(recordsDir, entry), 'utf8'),
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
			// A missing record is a successful no-op (cleared: false); any
			// other failure (permissions, I/O) propagates so the caller can
			// surface a structured error instead of silently claiming false.
			if ((error as { code?: string }).code === 'ENOENT') return false;
			throw error;
		}
	},
});
