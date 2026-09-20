/**
 * generated-refresh.service.ts — after a merge, the generated files are
 * recomputed from the tree that actually landed.
 *
 * WHY this is separate from the merge driver: git calls a merge driver
 * per conflicted FILE, while the merge is still in progress and the tree
 * is incomplete. A generator run there produces a file computed from half
 * a tree — no conflict, but a count that is subtly wrong, which
 * `check:generated` then fails on. The driver's job is to end the
 * conflict; this one's job is to make the result true, and it can only
 * run once the merge is finished.
 *
 * WHY it writes a commit instead of leaving the worktree dirty: a merge
 * that silently leaves modified files behind is how an unrelated change
 * gets swept into somebody else's next commit. The refresh is its own
 * commit, touching only the generated paths, and it is a no-op when the
 * generators produce what is already there.
 */
import { execFileSync } from 'node:child_process';

import { GENERATED_REFRESH_COMMANDS } from '../contracts/constants/generated-refresh.constant';
import type { IGeneratedRefreshReport } from '../contracts/interfaces/generated-refresh.interface';

export type { IGeneratedRefreshReport } from '../contracts/interfaces/generated-refresh.interface';
export { GENERATED_REFRESH_COMMANDS } from '../contracts/constants/generated-refresh.constant';

/**
 * Git hands a hook its own `GIT_DIR`, `GIT_INDEX_FILE` and friends, and
 * they describe the operation in progress, not the repository. A nested
 * `git commit` that inherits them writes through the merge's index and
 * fails — which is exactly why this refresh silently committed nothing
 * the first time it ran for real. Every nested command therefore starts
 * from a clean environment.
 */
const INHERITED_GIT_VARS = [
	'GIT_DIR',
	'GIT_WORK_TREE',
	'GIT_INDEX_FILE',
	'GIT_PREFIX',
	'GIT_OBJECT_DIRECTORY',
	'GIT_ALTERNATE_OBJECT_DIRECTORIES',
	'GIT_COMMON_DIR',
] as const;

const cleanEnvironment = (): NodeJS.ProcessEnv => {
	const environment = { ...process.env };
	for (const name of INHERITED_GIT_VARS) delete environment[name];
	return environment;
};

const git = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly out: string } => {
	try {
		return {
			ok: true,
			out: execFileSync('git', args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				env: cleanEnvironment(),
			}).trim(),
		};
	} catch {
		return { ok: false, out: '' };
	}
};

/**
 * Re-run the generators and commit whatever they changed.
 *
 * `paths` bounds the commit: anything the generators touch outside them
 * is left alone rather than swept in, because a refresh that can commit
 * arbitrary files is a refresh that can commit somebody else's work.
 */
export const refreshGeneratedAfterMerge = (input: {
	readonly root: string;
	readonly paths: readonly string[];
	readonly run?: (command: string, cwd: string) => boolean;
}): IGeneratedRefreshReport => {
	const run =
		input.run ??
		((command: string, cwd: string): boolean => {
			try {
				execFileSync('bun', ['run', command], {
					cwd,
					stdio: ['ignore', 'ignore', 'pipe'],
					env: cleanEnvironment(),
				});
				return true;
			} catch {
				return false;
			}
		});
	const failed: string[] = [];
	for (const command of GENERATED_REFRESH_COMMANDS) {
		if (!run(command, input.root)) failed.push(command);
	}
	// `git diff --name-only HEAD` over the bounded paths, NOT `status
	// --porcelain`: the porcelain's fixed-width status columns have to be
	// sliced off by position, and slicing one column too many silently
	// produced `ocs/delendai/…` — a path git then refused to stage, so the
	// refresh reported "nothing to commit" while the file sat dirty.
	const dirty = git(input.root, [
		'diff',
		'--name-only',
		'HEAD',
		'--',
		...input.paths,
	]);
	if (!dirty.ok) {
		return { refreshed: false, committed: false, failed, paths: [] };
	}
	const changed = dirty.out
		.split('\n')
		.map((line) => line.trim())
		.filter((path) => path.length > 0);
	if (changed.length === 0) {
		return { refreshed: true, committed: false, failed, paths: [] };
	}
	const staged = git(input.root, ['add', '--', ...changed]);
	// `git commit` with no paths commits the WHOLE index, so anything an
	// agent had already staged would be swept into this commit. Naming
	// the paths keeps the promise this service makes: it commits what the
	// generators produced, and nothing else.
	const committed =
		staged.ok &&
		// No `--no-verify`: this commit goes through the same hooks as any
		// other. In an agent's worktree, on its work ref, the policy
		// allows it; anywhere the policy refuses it, the refusal is the
		// right answer and `committed: false` says so.
		git(input.root, [
			'commit',
			'-m',
			'chore(generated): recompute after a merge',
			'--',
			...changed,
		]).ok;
	return { refreshed: true, committed, failed, paths: changed };
};
