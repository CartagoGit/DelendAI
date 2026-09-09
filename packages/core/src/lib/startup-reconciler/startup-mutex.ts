/**
 * startup-mutex.ts — one reconciliation per workspace at a time.
 *
 * WHY a file and not an in-process flag: the racing starts are separate
 * PROCESSES. An editor that relaunches the MCP while the old one is still
 * booting, a terminal session started next to the IDE, a watchdog restart
 * — each is its own runtime, and an in-memory guard sees none of them.
 * Two simultaneous reconciliations would fetch, rebuild and reap against
 * the same database at once, which is exactly how a "harmless" repair
 * turns into two of everything.
 *
 * WHY `wx` and not "check then write": `open(..., 'wx')` is the only
 * atomic create-or-fail primitive available on every platform this runs
 * on. The loser learns it lost from the syscall, not from a stale read.
 *
 * WHY the lock expires: the holder can be killed between creating the
 * file and releasing it, and a workspace that can never boot again
 * because of a crashed predecessor is worse than the race. A lock older
 * than its TTL is treated as abandoned and taken over.
 */

import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { IStartupClock, IStartupMutex, TMutexOutcome } from './seams';

/** How long a lock file is honoured before it is considered abandoned. */
export const STARTUP_LOCK_TTL_MS = 120_000;

interface ILockPayload {
	readonly pid: number;
	readonly machineId: string;
	readonly acquiredAt: number;
}

const readLock = async (path: string): Promise<ILockPayload | undefined> => {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		const record: Partial<ILockPayload> = parsed;
		if (
			typeof record.pid !== 'number' ||
			typeof record.machineId !== 'string' ||
			typeof record.acquiredAt !== 'number'
		) {
			return undefined;
		}
		return {
			pid: record.pid,
			machineId: record.machineId,
			acquiredAt: record.acquiredAt,
		};
	} catch {
		return undefined;
	}
};

export interface IStartupMutexOptions {
	/** Absolute path of the lock file. */
	readonly path: string;
	readonly machineId: string;
	readonly clock: IStartupClock;
	readonly pid?: number | undefined;
	readonly ttlMs?: number | undefined;
}

/** A filesystem mutex around the whole reconciliation. */
export const createStartupMutex = (
	options: IStartupMutexOptions,
): IStartupMutex => {
	const ttlMs = options.ttlMs ?? STARTUP_LOCK_TTL_MS;
	const pid = options.pid ?? process.pid;

	const write = async (): Promise<void> => {
		await mkdir(dirname(options.path), { recursive: true });
		const handle = await open(options.path, 'wx');
		try {
			await handle.writeFile(
				JSON.stringify({
					pid,
					machineId: options.machineId,
					acquiredAt: options.clock.now(),
				} satisfies ILockPayload),
				'utf8',
			);
		} finally {
			await handle.close();
		}
	};

	const release = async (): Promise<void> => {
		await rm(options.path, { force: true });
	};

	return {
		acquire: async (): Promise<TMutexOutcome> => {
			try {
				await write();
				return { kind: 'acquired', release };
			} catch {
				const held = await readLock(options.path);
				const age =
					held === undefined
						? Number.POSITIVE_INFINITY
						: options.clock.now() - held.acquiredAt;
				if (age <= ttlMs) {
					return {
						kind: 'busy',
						holder:
							held === undefined
								? 'unknown'
								: `${held.machineId}#${String(held.pid)}`,
					};
				}
				// Abandoned: take it over, and say who we took it from.
				await release();
				try {
					await write();
					return { kind: 'acquired', release };
				} catch {
					return { kind: 'busy', holder: 'unknown' };
				}
			}
		},
	};
};
