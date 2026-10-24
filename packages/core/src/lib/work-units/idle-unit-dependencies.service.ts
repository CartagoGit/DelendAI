/**
 * idle-unit-dependencies.service.ts — a kept unit nobody works on gives
 * its dependencies back to the disk.
 *
 * Entering a unit installs the project's dependencies in its worktree,
 * and a unit kept for its proposal's next slice can sit for days: every
 * such worktree held a full `node_modules`, and the cache grew by
 * gigabytes that nothing used. A unit whose owner is gone (abandoned, not
 * merely quiet: the lease heartbeat only moves on delendai's own
 * commands, so an agent working for half an hour in its tree looked idle
 * and had its dependencies removed under a running test suite) and whose
 * worktree nobody has written to within the window loses that folder on
 * `work reap --apply`; entering it again installs it again.
 */
import { access, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { IReleasedDependencies } from '../contracts/interfaces/unit-dependencies.interface';
import type { IUnitStandingEntry } from './unit-lease.interface';

const exists = (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

/** The newest write in a worktree and its top-level entries, dependencies aside. */
const lastWrite = async (worktree: string): Promise<number> => {
	const entries = await readdir(worktree).catch(() => [] as string[]);
	const times = await Promise.all(
		[
			worktree,
			...entries
				.filter((name) => name !== 'node_modules')
				.map((name) => join(worktree, name)),
		].map((path) =>
			stat(path).then(
				(info) => info.mtimeMs / 1000,
				() => 0,
			),
		),
	);
	return Math.max(0, ...times);
};

export const releaseIdleDependencies = async (input: {
	readonly units: readonly Pick<
		IUnitStandingEntry,
		'ref' | 'worktree' | 'standing'
	>[];
	readonly apply: boolean;
	/** Seconds since the epoch. */
	readonly now?: number;
	/** How long a worktree must have gone unwritten. */
	readonly quietSeconds: number;
}): Promise<readonly IReleasedDependencies[]> => {
	const now = input.now ?? Date.now() / 1000;
	const released: IReleasedDependencies[] = [];
	for (const unit of input.units) {
		if (unit.standing !== 'abandoned' || unit.worktree === null) continue;
		if (now - (await lastWrite(unit.worktree)) < input.quietSeconds)
			continue;
		const modules = join(unit.worktree, 'node_modules');
		if (!(await exists(modules))) continue;
		if (input.apply) await rm(modules, { recursive: true, force: true });
		released.push({
			ref: unit.ref,
			worktree: unit.worktree,
			removed: input.apply,
		});
	}
	return released;
};
