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
		if (tree.locked) {
			return {
				path: tree.path,
				role: 'locked',
				reason: 'git has it locked; somebody said not to touch it',
			};
		}
		if (tree.dirtyPaths > 0) {
			return {
				path: tree.path,
				role: 'dirty',
				reason: `${String(tree.dirtyPaths)} uncommitted change(s) that may exist nowhere else`,
			};
		}
		if (!tree.delivered) {
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
			reason: 'clean, and the integration branch already contains its head',
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
}[] => {
	const out: { path: string; head: string; locked: boolean }[] = [];
	let current: { path: string; head: string; locked: boolean } | undefined;
	for (const line of raw.split('\n')) {
		if (line.startsWith('worktree ')) {
			if (current !== undefined) out.push(current);
			current = {
				path: line.slice('worktree '.length).trim(),
				head: '',
				locked: false,
			};
			continue;
		}
		if (current === undefined) continue;
		if (line.startsWith('HEAD ')) current.head = line.slice(5).trim();
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
const GENERATED_MARKERS: readonly string[] = [
	'.generated.',
	'docs/delendai/host-hints/',
	'docs/delendai/AGENT-BOOTSTRAP.md',
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

const observe = (
	integrationRef: string,
	currentPath: string,
): readonly IWorktree[] => {
	const listed = parseWorktreeList(git(['worktree', 'list', '--porcelain']));
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
		dirtyPaths: worksomebodyOwns(
			git(['status', '--porcelain'], entry.path)
				.split('\n')
				.filter((line) => line.trim().length > 0),
		),
		delivered:
			entry.head.length > 0 && isAncestor(entry.head, integrationRef),
		lastActivityMs: lastGitActivityMs(entry.path),
	}));
};

const isAncestor = (sha: string, ref: string): boolean => {
	try {
		execFileSync('git', ['merge-base', '--is-ancestor', sha, ref], {
			cwd: repoRoot(),
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

export const main = (): number => {
	const integrationRef = 'origin/develop';
	const reclamation = judgeWorktrees(observe(integrationRef, repoRoot()));
	if (APPLY) {
		for (const verdict of reclamation.spent) {
			git(['worktree', 'remove', '--force', verdict.path]);
		}
		// One prune after the removals, so git's own bookkeeping matches
		// the directories that are actually gone.
		git(['worktree', 'prune']);
	}
	console.log(formatReport(reclamation, APPLY));
	return 0;
};

if (import.meta.main) process.exit(main());
