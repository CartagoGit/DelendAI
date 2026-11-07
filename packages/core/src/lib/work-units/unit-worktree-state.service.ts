/**
 * unit-worktree-state.service.ts — what a unit's worktree holds that git
 * does not, split into what a generator can rebuild and what somebody
 * typed.
 *
 * Removing a worktree loses its uncommitted edits, so a reaper needs to
 * know whether anything it would lose is real. `gen:all` and `bun install`
 * leave a merged unit dirty with files that are regenerated on demand; those
 * must not keep the unit alive forever.
 */
import { REGENERABLE_PATH_PATTERNS } from './unit-lease.constant';
import type { IWorktreeState } from './unit-lease.interface';
import { readWorktreeChanges } from '../shared/worktree-status.helper';

export const isRegenerablePath = (path: string): boolean =>
	REGENERABLE_PATH_PATTERNS.some((pattern) => pattern.test(path));

export const inspectWorktree = (path: string): IWorktreeState => {
	const paths = readWorktreeChanges(path) ?? [];
	return {
		edited: paths.filter((entry) => !isRegenerablePath(entry)),
		regenerable: paths.filter(isRegenerablePath),
	};
};
