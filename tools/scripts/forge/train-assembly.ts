/**
 * train-assembly.ts — a train is built in a throwaway worktree: the
 * integration tip, then each member merged in order, then the derived
 * files regenerated once when a member conflicted only in them.
 *
 * A conflict in a derived file (a generated catalog, an index, a budget
 * table) is not a decision: the generator is the function from the merged
 * tree to the file, so either side is thrown away by it. Resolving those
 * on each pull request meant bringing it forward on the owner's machine,
 * one at a time, with a local proof each. On the train they are resolved
 * once for all its members, and the train's own full run judges the
 * result. A conflict in any other file still leaves the member out.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	assembleTrain as assembleBatch,
	BATCH_REGENERATION_SUBJECT,
	discardTrain,
} from '@delendai/integration/public';

import { keepOneProposalCopy } from '../proposals/keep-one-proposal-copy';

/** The subject of the commit a train adds when regeneration moved a file. */
export const TRAIN_REGENERATION_SUBJECT = BATCH_REGENERATION_SUBJECT;

/**
 * Link the shared checkout's dependencies into `dir` with the same service
 * a unit worktree uses. A scratch worktree has no `node_modules`, and
 * generators run there cannot load the code: one wrote an empty catalog.
 * The service is async and a train is assembled synchronously, so a child
 * runs it; true when `dir` now has the dependencies.
 *
 * WHY link and not skip the per-merge hook: the merges already run with
 * `core.hooksPath` off, so no hook fires per merge. The one run that needs
 * the code is the single regeneration after all merges.
 */
export const linkDependenciesFrom =
	(from?: string) =>
	(dir: string): boolean => {
		try {
			execFileSync(
				'bun',
				[
					join(
						dirname(fileURLToPath(import.meta.url)),
						'link-train-dependencies.script.ts',
					),
					dir,
					...(from === undefined ? [] : [from]),
				],
				{ stdio: ['ignore', 'ignore', 'pipe'] },
			);
			return true;
		} catch {
			return false;
		}
	};

const linkSharedDependenciesInto = linkDependenciesFrom();

/**
 * The regeneration a train runs once: each of `commands` through `bun` in
 * `dir`, stopping at the first failure. The queue and the rehearsal share
 * it, so the rehearsal regenerates exactly as the live train does.
 */
export const regenerateWith =
	(commands: readonly string[]) =>
	(dir: string): boolean =>
		commands.every((command) => {
			try {
				execFileSync('bun', command.split(' '), {
					cwd: dir,
					stdio: ['ignore', 'ignore', 'pipe'],
					timeout: 600_000,
				});
				return true;
			} catch {
				return false;
			}
		});

/**
 * The generic assembly, with this repository's two defaults: a train keeps
 * one copy of a proposal two branches moved, and links the shared
 * dependencies before the generators read the code.
 */
export const assembleTrain = (
	input: Parameters<typeof assembleBatch>[0],
): ReturnType<typeof assembleBatch> =>
	assembleBatch({
		...input,
		normalize:
			input.normalize ??
			((dir, commit) => {
				keepOneProposalCopy(dir, commit);
			}),
		linkDependencies: input.linkDependencies ?? linkSharedDependenciesInto,
	});

export { discardTrain };
