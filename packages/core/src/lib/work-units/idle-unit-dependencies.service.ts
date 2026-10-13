/**
 * idle-unit-dependencies.service.ts — a kept unit nobody works on gives
 * its dependencies back to the disk.
 *
 * Entering a unit installs the project's dependencies in its worktree,
 * and a unit kept for its proposal's next slice can sit for days: every
 * such worktree held a full `node_modules`, and the cache grew by
 * gigabytes that nothing used. A unit whose owner is no longer live
 * loses that folder on `work reap --apply`; entering it again installs
 * it again, so the unit's work is untouched.
 */
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { IReleasedDependencies } from '../contracts/interfaces/unit-dependencies.interface';
import type { IUnitStandingEntry } from './unit-lease.interface';

const exists = (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

export const releaseIdleDependencies = async (input: {
	readonly units: readonly Pick<
		IUnitStandingEntry,
		'ref' | 'worktree' | 'standing'
	>[];
	readonly apply: boolean;
}): Promise<readonly IReleasedDependencies[]> => {
	const released: IReleasedDependencies[] = [];
	for (const unit of input.units) {
		if (unit.standing === 'live' || unit.worktree === null) continue;
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
