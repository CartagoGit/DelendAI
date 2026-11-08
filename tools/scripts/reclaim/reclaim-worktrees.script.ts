#!/usr/bin/env bun

/**
 * reclaim-worktrees — clear the desks nobody is sitting at.
 *
 * THE COMPLAINT this answers, in the user's words: *"aunque el develop
 * se hidrate no limpia las ramas en local que ya desaparecieron en el
 * origen"*. The remote-tracking refs DO get pruned (`fetch.prune`, set
 * by `clone-hygiene`) and the local branches DO get reaped
 * (`reclaim-local`). What nothing looked at was the **worktrees**:
 * every isolated checkout an agent creates to do one slice of work in.
 *
 * Measured on this clone when it was written: **34 worktrees, 32 of them
 * at commits the integration branch already contains.** Each one is a
 * full copy of the repository. They are not refs, so no prune reaches
 * them; they are not branches, so `reclaim-local` does not see them;
 * and the branch each was made for was deleted on the forge weeks of
 * work ago.
 *
 * WHAT IT REFUSES TO TOUCH, which matters more than what it removes:
 *
 *   - The MAIN checkout. It owns the repository and it is what the
 *     human is looking at.
 *   - Any worktree git has LOCKED. A lock is somebody saying, in git's
 *     own vocabulary, do not touch this.
 *   - Any worktree with uncommitted changes — staged, unstaged or
 *     untracked. They may exist nowhere else, and a worktree is
 *     precisely where half-finished work lives.
 *   - Any worktree whose head the integration branch does NOT contain.
 *     That is unpublished work by definition.
 *   - Any worktree git touched recently. Clean and delivered does not
 *     mean empty: an agent between a push and its next edit owns a desk
 *     that looks exactly like a spent one, and removing it pulls the
 *     directory out from under a running process.
 *
 * It removes exactly one thing: a clean worktree whose every commit is
 * already in the integration branch — so nothing it held is lost, by
 * construction, because the branch has it.
 *
 * Run without `--apply` it changes nothing and prints the same verdicts.
 */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

import { declaredIntegrationRef } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

import type {
	IWorktree,
	IWorktreeJudgement,
	IWorktreeReclamation,
	IWorktreeVerdict,
} from './reclaim-worktrees.interface';

export type {
	IWorktree,
	IWorktreeJudgement,
	IWorktreeReclamation,
	IWorktreeRole,
	IWorktreeVerdict,
} from './reclaim-worktrees.interface';

const APPLY = process.argv.includes('--apply');

const git = (args: readonly string[], cwd = repoRoot()): string => {
	try {
		return execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		});
	} catch {
		return '';
	}
};

/**
 * Like `git`, but a failure is `undefined`, never an empty answer: a
 * caller that deletes on the strength of what it read must be able to
 * tell "nothing there" from "could not read".
 */
const gitRead = (args: readonly string[], cwd: string): string | undefined => {
	try {
		return execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
			timeout: 60_000,
		});
	} catch {
		return undefined;
	}
};

/** Uncommitted work in a worktree, or `null` when git could not say. */
export const readDirtyPaths = (worktreePath: string): number | null => {
	// `--no-optional-locks`: a read must not refresh the index whose mtime
	// says when git last worked here, or the dry run leaves the worktree
	// looking busy to the run that applies.
	const status = gitRead(
		['--no-optional-locks', 'status', '--porcelain'],
		worktreePath,
	);
	if (status === undefined) return null;
	return worksomebodyOwns(
		status.split('\n').filter((line) => line.trim().length > 0),
	);
};

/**
 * Judge every worktree. Pure over its input, so the rule can be pinned
 * by cases instead of by staging thirty checkouts.
 */
export const DEFAULT_ACTIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

export const judgeWorktrees = (
	worktrees: readonly IWorktree[],
	judgement: IWorktreeJudgement = {
		now: Date.now(),
		activeWindowMs: DEFAULT_ACTIVE_WINDOW_MS,
	},
): IWorktreeReclamation => {
	const verdicts: IWorktreeVerdict[] = worktrees.map((tree) => {
		if (tree.isMain) {
			return {
				path: tree.path,
				role: 'main',
				reason: 'the checkout that owns the repository',
			};
		}
		if (tree.isCurrent) {
			return {
				path: tree.path,
				role: 'current',
				reason: 'the worktree this process is running from',
			};
		}
		if (tree.runtime) {
			return {
				path: tree.path,
				role: 'runtime',
				reason: 'a runtime tree other projects run their server from',
			};
		}
		if (tree.proofHolder === 'live') {
			return {
				path: tree.path,
				role: 'proving',
				reason: 'a live process is proving a commit here',
			};
		}
		if (tree.locked) {
			return {
				path: tree.path,
				role: 'locked',
				reason: 'git has it locked; somebody said not to touch it',
			};
		}
		if (tree.dirtyPaths === null) {
			return {
				path: tree.path,
				role: 'unknown',
				reason: 'git could not say whether it holds uncommitted work; kept, not assumed clean',
			};
		}
		if (tree.proofHolder === 'dead') {
			// A proof checks out a commit that exists elsewhere and nobody
			// edits it: once its process is gone, a clean one holds nothing.
			return tree.dirtyPaths > 0
				? {
						path: tree.path,
						role: 'dirty',
						reason: `${String(tree.dirtyPaths)} uncommitted change(s) in a proof whose process is gone`,
					}
				: {
						path: tree.path,
						role: 'spent',
						reason: 'a proof whose process is gone, and it is clean',
					};
		}
		// An abandoned merge: its changes are only the merge's own, and both
		// sides are already on the forge.
		const abandonedMerge =
			tree.mergeHead?.onRemote === true && tree.headOnRemote;
		if (tree.dirtyPaths > 0 && !abandonedMerge) {
			return {
				path: tree.path,
				role: 'dirty',
				reason: `${String(tree.dirtyPaths)} uncommitted change(s) that may exist nowhere else`,
			};
		}
		// Detached, so no branch of its own to lose, and on the forge.
		const onRemoteOnly = tree.detached && tree.headOnRemote;
		if (!tree.delivered && !onRemoteOnly && !abandonedMerge) {
			return {
				path: tree.path,
				role: 'undelivered',
				reason: 'its head is not in the integration branch: unpublished work',
			};
		}
		const idleMs = judgement.now - tree.lastActivityMs;
		if (tree.lastActivityMs > 0 && idleMs < judgement.activeWindowMs) {
			return {
				path: tree.path,
				role: 'active',
				reason: `git worked here ${String(Math.max(0, Math.round(idleMs / 60000)))} minute(s) ago; somebody is probably sitting at it`,
			};
		}
		return {
			path: tree.path,
			role: 'spent',
			reason: abandonedMerge
				? 'an abandoned merge: its head and its MERGE_HEAD are both on the remote'
				: tree.delivered
					? 'clean, and the integration branch already contains its head'
					: 'clean and detached, and a remote ref contains its head',
		};
	});
	return {
		verdicts,
		spent: verdicts.filter((verdict) => verdict.role === 'spent'),
	};
};

/** `git worktree list --porcelain`, as records. */
export const parseWorktreeList = (
	raw: string,
): readonly {
	readonly path: string;
	readonly head: string;
	readonly locked: boolean;
	readonly detached: boolean;
}[] => {
	const out: {
		path: string;
		head: string;
		locked: boolean;
		detached: boolean;
	}[] = [];
	let current:
		| { path: string; head: string; locked: boolean; detached: boolean }
		| undefined;
	for (const line of raw.split('\n')) {
		if (line.startsWith('worktree ')) {
			if (current !== undefined) out.push(current);
			current = {
				path: line.slice('worktree '.length).trim(),
				head: '',
				locked: false,
				detached: false,
			};
			continue;
		}
		if (current === undefined) continue;
		if (line.startsWith('HEAD ')) current.head = line.slice(5).trim();
		if (line === 'detached') current.detached = true;
		if (line === 'locked' || line.startsWith('locked ')) {
			current.locked = true;
		}
	}
	if (current !== undefined) out.push(current);
	return out;
};

/**
 * A generated artifact is never anybody's work.
 *
 * The same markers `verify-checkout` uses, and the same reason: a file
 * this repository regenerates can be rewritten by any command that
 * happens to run, and it then sits in a worktree looking exactly like an
 * edit. Counting it as work keeps a spent desk forever over a timestamp.
 */
// The bootstrap is not here: it is written by hand (a hook only refreshes
// a few counts in it), and an edit to it in a spent desk is somebody's
// work. Listed, its uncommitted edits were discarded with the desk.
const GENERATED_MARKERS: readonly string[] = [
	'.generated.',
	'docs/delendai/host-hints/',
	'/dist/',
];

/**
 * When git last touched this worktree, from its own bookkeeping.
 *
 * `git worktree list --porcelain` does not report it, so it is read off
 * the files git itself writes: the per-worktree index (every checkout,
 * add, status and commit rewrites it) and HEAD. Unreadable — a pruned
 * gitdir, a permission — answers 0, which reads as "cannot tell" and
 * leaves the desk to the content rules above rather than inventing a
 * timestamp.
 */
export const lastGitActivityMs = (worktreePath: string): number => {
	const gitDir = git(
		['rev-parse', '--absolute-git-dir'],
		worktreePath,
	).trim();
	if (gitDir.length === 0) return 0;
	const mtime = (file: string): number => {
		try {
			return statSync(`${gitDir}/${file}`).mtimeMs;
		} catch {
			return 0;
		}
	};
	return Math.max(mtime('index'), mtime('HEAD'));
};

/** `git status --porcelain` path, minus its two status columns. */
export const pathOfStatusLine = (line: string): string =>
	line.slice(3).split(' -> ').pop()?.trim() ?? '';

export const worksomebodyOwns = (statusLines: readonly string[]): number =>
	statusLines
		.map(pathOfStatusLine)
		.filter((path) => path.length > 0)
		.filter(
			(path) =>
				!GENERATED_MARKERS.some((marker) => path.includes(marker)),
		).length;

export const observe = (
	integrationRef: string,
	currentPath: string,
	root: string = repoRoot(),
): readonly IWorktree[] => {
	const listed = parseWorktreeList(
		git(['worktree', 'list', '--porcelain'], root),
	);
	// EVERY worktree's activity is read BEFORE ANY worktree's status.
	//
	// `git status` rewrites the index it read when the index looks older
	// than the file it compared against. The activity is the mtime of that
	// very index, so a status read refreshes it and the worktree reads as
	// active -- "git worked here 0 minute(s) ago" -- however long ago it
	// was really left alone. The reaper then never judges anything spent,
	// so a finished unit's worktree, branch and disk pile up for ever.
	//
	// Reading one worktree's status before another worktree's activity is
	// measured is the same defect one step to the side: the second
	// worktree's index was already refreshed by the first one's status.
	// So the two passes are separate, and the first one touches nothing
	// but mtimes.
	const activity = new Map(
		listed.map((entry) => [entry.path, lastGitActivityMs(entry.path)]),
	);
	return listed.map((entry, index) => ({
		path: entry.path,
		head: entry.head,
		// Git lists the main checkout first, and that is the only thing
		// this relies on: deriving it from a path comparison against the
		// repository root marks the CURRENT worktree as main when the
		// reaper runs from inside one, which is a different fact.
		isMain: index === 0,
		isCurrent: entry.path === currentPath,
		locked: entry.locked,
		detached: entry.detached,
		headOnRemote: entry.head.length > 0 && onRemote(entry.head, root),
		...mergeHeadOf(entry.path, root),
		runtime: isRuntimeTree(entry.path),
		proofHolder: proofHolderOf(entry.path),
		dirtyPaths: readDirtyPaths(entry.path),
		delivered:
			entry.head.length > 0 &&
			isAncestor(entry.head, integrationRef, root),
		lastActivityMs: activity.get(entry.path) ?? 0,
	}));
};

/** A remote-tracking ref contains `sha`: it is on the forge. */
const onRemote = (sha: string, root: string): boolean =>
	(
		gitRead(
			[
				'for-each-ref',
				'--count=1',
				'--format=%(refname)',
				'--contains',
				sha,
				'refs/remotes',
			],
			root,
		) ?? ''
	).trim().length > 0;

/** The in-progress merge of a worktree, when it has one. */
const mergeHeadOf = (
	worktreePath: string,
	root: string,
): { readonly mergeHead?: { readonly onRemote: boolean } } => {
	const sha = (
		gitRead(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], worktreePath) ??
		''
	).trim();
	return sha.length === 0
		? {}
		: { mergeHead: { onRemote: onRemote(sha, root) } };
};

/** `<root>/.cache/delendai/branch-runtime/<label>`: a runtime tree. */
export const isRuntimeTree = (worktreePath: string): boolean =>
	/\/\.cache\/delendai\/branch-runtime\/[^/]+\/?$/u.test(worktreePath);

/**
 * The pid in a proof worktree's name (`<tip>-<pid>-<ms>` under
 * `.git/delendai-prove/`), or `null` for any other path.
 */
export const proofPidOf = (worktreePath: string): number | null => {
	const match = /\/\.git\/delendai-prove\/[0-9a-f]+-(\d+)-\d+\/?$/u.exec(
		worktreePath,
	);
	return match?.[1] === undefined ? null : Number(match[1]);
};

const processAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: it exists and is somebody else's.
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const proofHolderOf = (worktreePath: string): 'live' | 'dead' | null => {
	const pid = proofPidOf(worktreePath);
	if (pid === null) return null;
	return processAlive(pid) ? 'live' : 'dead';
};

const isAncestor = (sha: string, ref: string, root: string): boolean => {
	try {
		execFileSync('git', ['merge-base', '--is-ancestor', sha, ref], {
			cwd: root,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
};

export const formatReport = (
	reclamation: IWorktreeReclamation,
	apply: boolean,
): string => {
	const lines: string[] = [];
	for (const verdict of reclamation.verdicts) {
		lines.push(`  ${verdict.role.padEnd(12)} ${verdict.path}`);
	}
	if (reclamation.spent.length === 0) {
		lines.push('', 'reclaim-worktrees: nothing to reclaim.');
		return lines.join('\n');
	}
	lines.push(
		'',
		apply
			? `reclaim-worktrees: removed ${String(reclamation.spent.length)} spent worktree(s).`
			: `reclaim-worktrees: ${String(reclamation.spent.length)} spent worktree(s) — pass --apply to remove them.`,
	);
	return lines.join('\n');
};

export const main = (
	root: string = repoRoot(),
	apply: boolean = APPLY,
	/** The ref a worktree must be merged into; the policy's integration branch. */
	integrationRef: string = declaredIntegrationRef(root),
): number => {
	const reclamation = judgeWorktrees(observe(integrationRef, root, root));
	if (apply) {
		for (const verdict of reclamation.spent) {
			git(['worktree', 'remove', '--force', verdict.path], root);
		}
		// One prune after the removals, so git's own bookkeeping matches
		// the directories that are actually gone.
		git(['worktree', 'prune'], root);
	}
	console.log(formatReport(reclamation, apply));
	return 0;
};

if (import.meta.main) process.exit(main());
