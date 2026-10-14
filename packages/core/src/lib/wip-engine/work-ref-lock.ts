/**
 * work-ref-lock.ts — one writer of a work ref's remote copy at a time.
 *
 * Two writers race for it. Publishing a unit pushes its publication ref,
 * removes the worktree, then deletes the work ref on the remote and
 * locally. The host's checkout publisher pushes every checked-out work
 * ref on a cadence, by commit id. Both push through the pre-push hook,
 * which takes tens of seconds, so a cadence push that looked before the
 * publication existed landed after the publication had deleted the work
 * ref: the ref came back, and every pull request's ref-lifecycle check
 * and the integration branch's certification went red over a copy of
 * work that was already proposed.
 *
 * Neither side can see the other's push in flight, so neither can check
 * its way out of the race; they have to exclude each other. The lock
 * lives in the git common directory because the writers are separate
 * processes working from separate worktrees of one clone.
 */

import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { createStartupMutex } from '../startup-reconciler/startup-mutex';
import {
	WORK_REF_LOCK_DIRECTORY,
	WORK_REF_LOCK_TTL_MS,
} from './work-ref-lock.constant';
import type {
	IWorkRefLockOptions,
	IWorkRefLockOutcome,
} from './work-ref-lock.interface';

export {
	WORK_REF_LOCK_DIRECTORY,
	WORK_REF_LOCK_TTL_MS,
} from './work-ref-lock.constant';
export type {
	IWorkRefLockOptions,
	IWorkRefLockOutcome,
} from './work-ref-lock.interface';

/**
 * The lock file for a work ref. `refs/heads/x` and `x` are one ref, so
 * both spellings map to one file; the name is hashed because a ref holds
 * slashes a file name cannot.
 */
export const workRefLockPath = (gitCommonDir: string, ref: string): string => {
	const short = ref.replace(/^refs\/heads\//u, '');
	const digest = createHash('sha256').update(short).digest('hex');
	return join(
		gitCommonDir,
		WORK_REF_LOCK_DIRECTORY,
		`${digest.slice(0, 32)}.lock`,
	);
};

/** Try once to hold a work ref; `busy` names who holds it. */
export const holdWorkRef = (
	options: IWorkRefLockOptions,
): Promise<IWorkRefLockOutcome> =>
	createStartupMutex({
		path: workRefLockPath(options.gitCommonDir, options.ref),
		machineId: options.machineId ?? hostname(),
		clock: { now: options.now ?? Date.now },
		pid: options.pid,
		ttlMs: options.ttlMs ?? WORK_REF_LOCK_TTL_MS,
	}).acquire();
