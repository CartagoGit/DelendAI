/**
 * work-dirty-paths.service.ts — which edits in the shared checkout are
 * held by a work ref, and which exist only in the working tree.
 *
 * WHY this exists: the WIP engine checkpoints a slice when a claimed
 * slice event reaches it. An agent that edits without claiming — or
 * whose session ends before its checkpoint — leaves work that no ref
 * holds, and `work status` used to answer only with a count of dirty
 * paths, which reads the same whether the work is safe or not.
 *
 * "Held" means held byte for byte: a ref that carries an OLDER version
 * of the file does not make the edits made since then durable, so a
 * path counts only when some ref's tip has exactly the working-tree
 * content (or, for a deletion, lacks the path).
 */
import type {
	IDirtyPathsReport,
	IDurabilityRef,
	IReadGit,
} from '../contracts/interfaces/work-dirty-paths.interface';
import {
	parseWorktreeStatus,
	WORKTREE_STATUS_ARGS,
	worktreeStatusPaths,
} from '../shared/worktree-status.helper';

export type {
	IDirtyPathsReport,
	IDurabilityRef,
	IReadGit,
} from '../contracts/interfaces/work-dirty-paths.interface';

/** The blob a path has in the working tree, or `null` when it is gone. */
const workingTreeBlob = (git: IReadGit, path: string): string | null =>
	git(['hash-object', '--', path])?.trim() || null;

/** The blob a path has at a commit, or `null` when it is absent there. */
const blobAt = (git: IReadGit, tip: string, path: string): string | null =>
	git(['rev-parse', '--verify', '--quiet', `${tip}:${path}`])?.trim() || null;

const heldBy = (git: IReadGit, path: string, ref: IDurabilityRef): boolean =>
	ref.paths.includes(path) &&
	blobAt(git, ref.tip, path) === workingTreeBlob(git, path);

/** Split the dirty paths into those some work ref holds and those none does. */
export const reportDirtyPaths = (input: {
	readonly git: IReadGit;
	readonly refs: readonly IDurabilityRef[];
}): IDirtyPathsReport => {
	const dirty = worktreeStatusPaths(
		parseWorktreeStatus(input.git(WORKTREE_STATUS_ARGS) ?? ''),
	);
	const undurable = dirty.filter(
		(path) => !input.refs.some((ref) => heldBy(input.git, path, ref)),
	);
	return { dirty, undurable };
};
