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
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * One bounded path as it was found: its bytes, and its exact index entry.
 *
 * The index entry is kept as git's own `mode,object` rather than a
 * "was it staged" boolean. A boolean can only restore two of the three
 * states a path can be in: fully staged, fully unstaged, and PARTLY —
 * staged hunks plus further edits in the worktree, which is an ordinary
 * thing to be in the middle of. Restoring that with `git add` promotes
 * the unstaged half, quietly rewriting what the next commit would
 * contain.
 */
interface IPathSnapshot {
	readonly path: string;
	readonly content: Buffer | undefined;
	/** `<mode> <object>` exactly as `ls-files --stage` reported it. */
	readonly indexEntry: string | undefined;
}

/**
 * Read the bounded paths before anything touches them.
 *
 * Deliberately the file's BYTES rather than a git reference: the point is
 * to restore what was there, including changes git has never seen.
 */
const snapshot = (
	root: string,
	paths: readonly string[],
): readonly IPathSnapshot[] => {
	// `ls-files --stage` gives `<mode> <object> <stage>\t<path>` — the
	// index as git holds it, which is the only reading that can be put
	// back exactly.
	const staged = new Map<string, string>();
	for (const line of git(root, ['ls-files', '--stage', '--', ...paths])
		.out.split('\n')
		.map((each) => each.trim())
		.filter((each) => each.length > 0)) {
		const [meta, path] = line.split('\t');
		const parts = meta?.split(/\s+/u) ?? [];
		const mode = parts[0];
		const object = parts[1];
		if (path === undefined || mode === undefined || object === undefined) {
			continue;
		}
		staged.set(path, `${mode} ${object}`);
	}
	return [...staged.keys()].map((path) => {
		const absolute = join(root, path);
		return {
			path,
			content: existsSync(absolute) ? readFileSync(absolute) : undefined,
			indexEntry: staged.get(path),
		};
	});
};

/** Put the paths back exactly as `snapshot` found them. */
const restore = (
	root: string,
	before: readonly IPathSnapshot[],
	changed: readonly string[],
): void => {
	const touched = new Set(changed);
	for (const entry of before) {
		if (!touched.has(entry.path)) continue;
		const absolute = join(root, entry.path);
		if (entry.content === undefined) {
			rmSync(absolute, { force: true });
		} else {
			writeFileSync(absolute, entry.content);
		}
		// And the index back to the entry it held — not `git add`, which
		// would promote whatever the worktree now contains and turn a
		// half-staged file into a fully staged one.
		if (entry.indexEntry === undefined) {
			git(root, ['restore', '--staged', '--', entry.path]);
			continue;
		}
		const [mode, object] = entry.indexEntry.split(' ');
		if (mode === undefined || object === undefined) continue;
		git(root, [
			'update-index',
			'--cacheinfo',
			`${mode},${object},${entry.path}`,
		]);
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
	// What the bounded paths looked like BEFORE any generator ran, so a
	// refusal can restore exactly that.
	//
	// The first version of this rollback ran `git checkout HEAD --`, which
	// restores the paths to the COMMIT — not to the state they were found
	// in. `AGENT-BOOTSTRAP.md` is one of these paths and is mostly written
	// by hand; only its quantitative block is generated. So an agent with
	// unsaved edits in it, on a hydration whose commit the policy refuses,
	// would have had those edits silently replaced by HEAD. A cleanup that
	// can cost unpublished work is the one thing this model must never do.
	const before = snapshot(input.root, input.paths);
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
	if (!committed) {
		// A refusal is the right answer — and it must cost nothing. On the
		// integration branch in the pinned checkout the policy refuses this
		// commit, so `git add` above had already moved the regenerated
		// files into the index, and returning here left them staged: a
		// shared checkout that is dirty after every hydration, carrying a
		// change no agent made and no branch can accept. That is precisely
		// the state the whole work-ref model exists to make impossible.
		//
		// So put the paths back exactly as they were FOUND — from the
		// snapshot taken before the generators ran, not from HEAD. A
		// stale generated file on the integration branch is the status
		// quo and the candidate refresh regenerates it; a dirty shared
		// checkout is a broken invariant; and an edit somebody had not
		// committed yet is neither of those things to throw away.
		restore(input.root, before, changed);
	}
	return { refreshed: true, committed, failed, paths: changed };
};
