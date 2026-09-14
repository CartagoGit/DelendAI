/**
 * Contract shapes for `./startup-mutex`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `startup-mutex.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `startup-mutex.ts`, so no import site changes.
 */

import type { IStartupClock } from './seams.interface';

export interface IStartupMutexOptions {
	/** Absolute path of the lock file. */
	readonly path: string;
	readonly machineId: string;
	readonly clock: IStartupClock;
	readonly pid?: number | undefined;
	readonly ttlMs?: number | undefined;
}
