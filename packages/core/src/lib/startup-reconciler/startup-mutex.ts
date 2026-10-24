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
 * WHY the lock can be taken over: the holder can be killed between
 * creating the file and releasing it, and a workspace that can never
 * boot again because of a crashed predecessor is worse than the race.
 * A holder on this machine is abandoned when its process is gone, never
 * because it is slow; one on another machine, which cannot be asked,
 * when its lock outlives the TTL. A holder releases only its own lock.
 */

import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { IStartupMutex, IMutexOutcome } from './seams.interface';

import type { IStartupMutexOptions } from './startup-mutex.interface';
import { STARTUP_LOCK_TTL_MS } from './startup-mutex.constant';

export type { IStartupMutexOptions } from './startup-mutex.interface';
export { STARTUP_LOCK_TTL_MS } from './startup-mutex.constant';

interface ILockPayload {
	readonly pid: number;
	readonly machineId: string;
	readonly acquiredAt: number;
	/** Drawn by the holder: what it releases is only ever its own lock. */
	readonly token?: string;
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
			...(typeof record.token === 'string'
				? { token: record.token }
				: {}),
		};
	} catch {
		return undefined;
	}
};

/** Whether `pid` is a live process here; signal 0 only probes. */
const processIsAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: it exists, it just is not ours to signal.
		return (error as { readonly code?: string }).code === 'EPERM';
	}
};

/** A filesystem mutex around the whole reconciliation. */
export const createStartupMutex = (
	options: IStartupMutexOptions,
): IStartupMutex => {
	const ttlMs = options.ttlMs ?? STARTUP_LOCK_TTL_MS;
	const isAlive = options.isAlive ?? processIsAlive;
	const pid = options.pid ?? process.pid;
	const token = randomUUID();

	const write = async (): Promise<void> => {
		await mkdir(dirname(options.path), { recursive: true });
		const handle = await open(options.path, 'wx');
		try {
			await handle.writeFile(
				JSON.stringify({
					pid,
					machineId: options.machineId,
					acquiredAt: options.clock.now(),
					token,
				} satisfies ILockPayload),
				'utf8',
			);
		} finally {
			await handle.close();
		}
	};

	// Only while it is still ours: a lock taken over since belongs to its
	// new holder, and removing it let a third start run beside it.
	const release = async (): Promise<void> => {
		if ((await readLock(options.path))?.token === token) {
			await rm(options.path, { force: true });
		}
	};

	// Move the abandoned lock aside and remove it only if it is the one
	// judged abandoned; one written in between is put back.
	const removeAbandoned = async (judged: string): Promise<boolean> => {
		const aside = `${options.path}.${token}`;
		try {
			await rename(options.path, aside);
		} catch {
			return true;
		}
		const moved = await readFile(aside, 'utf8').catch(() => undefined);
		if (moved === judged) {
			await rm(aside, { force: true });
			return true;
		}
		await link(aside, options.path).catch(() => undefined);
		await rm(aside, { force: true });
		return false;
	};

	return {
		acquire: async (): Promise<IMutexOutcome> => {
			try {
				await write();
				return { kind: 'acquired', release };
			} catch {
				const judged = await readFile(options.path, 'utf8').catch(
					() => undefined,
				);
				const held = await readLock(options.path);
				const age =
					held === undefined
						? Number.POSITIVE_INFINITY
						: options.clock.now() - held.acquiredAt;
				// On this machine the process answers: a holder whose
				// process is gone left the lock behind (killed mid-boot by
				// an editor restart), and one whose process lives holds it,
				// however long it takes. Only another machine's holder,
				// which cannot be asked, is judged by the TTL.
				const here =
					held !== undefined && held.machineId === options.machineId;
				const abandoned = here ? !isAlive(held.pid) : age > ttlMs;
				if (!abandoned) {
					return {
						kind: 'busy',
						holder:
							held === undefined
								? 'unknown'
								: `${held.machineId}#${String(held.pid)}`,
					};
				}
				// Abandoned: take it over, and say who we took it from.
				if (judged !== undefined && !(await removeAbandoned(judged))) {
					return { kind: 'busy', holder: 'unknown' };
				}
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
