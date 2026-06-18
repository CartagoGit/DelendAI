/**
 * closed-tasks-log.ts
 *
 * Append-only log of closed tasks, stored at .cache/agent-queue/closed-tasks.json.
 * FIFO eviction at 32 entries (oldest discarded).
 *
 * original cap was 256 entries.
 * cap reduced from 256 to 32 — for enjambres of 2-4 agents the
 * log is only consulted for tail diagnostics, so a 32-entry window
 * (the most recent 32 closed tasks) is more than enough. Smaller cap
 * also keeps the file well under 8 KB so the periodic `report()` can
 * include a digest without scanning the queue itself.
 */

import { readFile } from 'node:fs/promises';

import { quarantineCorruptFile, writeFileAtomic } from '@mcp-vertex/core/public';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Max entries constant
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IClosedTaskRecord {
	readonly taskId: string;
	readonly closedAt: string;
	readonly agentName: string;
	readonly filesOwned: readonly string[];
}

// ---------------------------------------------------------------------------
// Zod schema for validation
// ---------------------------------------------------------------------------

const ClosedTaskRecordSchema = z.object({
	taskId: z.string().min(1),
	closedAt: z.string().min(1),
	agentName: z.string().min(1),
	filesOwned: z.array(z.string()),
});

const ClosedTasksLogSchema = z.array(ClosedTaskRecordSchema);

// ---------------------------------------------------------------------------
// readClosedTasks — returns empty on ENOENT.
//
// This is a diagnostic tail log (digests only), read inside dequeue/report/
// subscribe. Unlike the critical state stores, a corrupt log must NOT block
// coordination: we preserve the bytes (.corrupt-<ts>), warn on stderr, and
// continue with an empty log. "corrupt ≠ silently empty" is still honoured —
// the file is kept, not discarded.
// ---------------------------------------------------------------------------

const quarantineCorruptLog = async (logPath: string, detail: string): Promise<void> => {
	const backup = await quarantineCorruptFile(logPath);
	process.stderr.write(
		`[proposals] closed-tasks log "${logPath}" is corrupt (${detail}); ` +
			`preserved at "${backup ?? '<rename failed>'}", continuing with empty log.\n`
	);
};

export const readClosedTasks = async (
	logPath: string
): Promise<IClosedTaskRecord[]> => {
	let raw: string;
	try {
		raw = await readFile(logPath, 'utf8');
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
	if (!raw.trim()) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		await quarantineCorruptLog(logPath, `invalid JSON: ${String(err)}`);
		return [];
	}
	const result = ClosedTasksLogSchema.safeParse(parsed);
	if (!result.success) {
		await quarantineCorruptLog(logPath, 'schema validation failed');
		return [];
	}
	return result.data as IClosedTaskRecord[];
};

// ---------------------------------------------------------------------------
// appendToClosedTasks — idempotent append with FIFO eviction
// ---------------------------------------------------------------------------

export const appendToClosedTasks = async (
	logPath: string,
	record: IClosedTaskRecord
): Promise<void> => {
	const existing = await readClosedTasks(logPath);

	// Idempotency: skip if same taskId already present
	if (existing.some((r) => r.taskId === record.taskId)) {
		return;
	}

	const updated = [...existing, record];

	// FIFO eviction: keep only the last MAX_ENTRIES
	const trimmed =
		updated.length > MAX_ENTRIES
			? updated.slice(updated.length - MAX_ENTRIES)
			: updated;

	await writeFileAtomic(logPath, JSON.stringify(trimmed, null, 2));
};
