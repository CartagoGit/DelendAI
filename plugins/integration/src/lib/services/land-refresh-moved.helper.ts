/**
 * land-refresh-moved.helper.ts — the git side of refreshing a publication
 * that moved a file (a proposal going from in-progress/ to review/) while the
 * integration branch edited its old copy.
 *
 * Git is read and written in a throwaway worktree of the head, pushed
 * without force as the identity; the decision (carry the edit, or ask the
 * author once) is the core's `refreshMovedProposal`.
 */
// effect-boundary-authorized: the integrator's git adapter; a moved file is merged by git in a throwaway worktree
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import {
	refreshMovedProposal,
	type ILandRefreshMoved,
	type IMovedProposalConflict,
} from '@delendai/core/cli';

import { BATCH_COMMIT_IDENTITY as IDENTITY } from '../contracts/constants/integration-pass.constant';

import { landGitArgs } from './land-git-process.helper';
import { identityFetchEnv, pushAsIdentity } from './land-identity-push.helper';
import { discardTrain, runGit } from './land-train-assembly.helper';

/** Git's stdout in `cwd`, byte for byte (a file's content keeps its last newline). */
/** Similarity git needs to call a rewritten file a rename. */
const RENAME_SIMILARITY = '--find-renames=30%';

const read = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', landGitArgs(args), {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

/** A throwaway directory, made and removed the way the train's scratch is. */
const scratchDir = (): string =>
	execFileSync('mktemp', ['-d', '-t', 'delendai-moved.XXXXXX'], {
		encoding: 'utf8',
	}).trim();

const removeDir = (dir: string): void => {
	try {
		execFileSync('rm', ['-rf', '--', dir]);
	} catch {
		// Nothing more to remove.
	}
};

/** `content` through the stdin of `command`, its stdout back. */
const pipe = (
	command: string,
	args: readonly string[],
	content: string,
	cwd?: string,
): string =>
	execFileSync(command, [...args], {
		cwd,
		input: content,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

const attempt = (cwd: string, args: readonly string[]): boolean => {
	try {
		runGit(cwd, args);
		return true;
	} catch {
		return false;
	}
};

const lines = (text: string): string[][] =>
	text
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => line.split('\t'));

const basename = (path: string): string =>
	path.slice(path.lastIndexOf('/') + 1);

/** The paths the head moved (renamed, or deleted and added under the same name) that the tip edited. */
const movesOf = (
	root: string,
	base: string,
	tip: string,
	head: string,
): readonly IMovedProposalConflict[] => {
	const edited = new Set(
		lines(read(root, ['diff', '--name-status', '--no-renames', base, tip]))
			.filter(([status]) => status === 'M')
			.map(([, path]) => path ?? ''),
	);
	const changes = lines(
		read(root, [
			'diff',
			'--name-status',
			'-M',
			RENAME_SIMILARITY,
			base,
			head,
		]),
	);
	const added = changes
		.filter(([status]) => status === 'A')
		.map(([, path]) => path ?? '');
	const pairs: { from: string; to: string }[] = [];
	for (const [status, from = '', to = ''] of changes) {
		if (status?.startsWith('R') === true && edited.has(from))
			pairs.push({ from, to });
		else if (status === 'D' && edited.has(from)) {
			const same = added.filter(
				(path) => basename(path) === basename(from),
			);
			if (same.length === 1) pairs.push({ from, to: same[0] ?? '' });
		}
	}
	return pairs.map(({ from, to }) => ({
		from,
		to,
		base: read(root, ['show', `${base}:${from}`]),
		tip: read(root, ['show', `${tip}:${from}`]),
		moved: read(root, ['show', `${head}:${to}`]),
	}));
};

/** The tip's edit applied to the moved copy by a three-way text merge; undefined when it conflicts. */
const mergeText = (
	root: string,
	base: string,
	tip: string,
	moved: string,
): string | undefined => {
	const dir = scratchDir();
	try {
		for (const [name, content] of [
			['moved', moved],
			['base', base],
			['tip', tip],
		] as const)
			pipe('tee', [join(dir, name)], content);
		return read(root, [
			'merge-file',
			'-p',
			join(dir, 'moved'),
			join(dir, 'base'),
			join(dir, 'tip'),
		]);
	} catch {
		return undefined;
	} finally {
		removeDir(dir);
	}
};

/** The paths the trial merge left unmerged. */
const unmerged = (dir: string): readonly string[] =>
	read(dir, ['diff', '--name-only', '--diff-filter=U'])
		.split('\n')
		.filter((path) => path.length > 0);

/** `ILandDeps.refreshMoved` on a real clone, pushing as the identity `token`. */
export const createRefreshMoved =
	(input: {
		readonly root: string;
		readonly remote: string;
		readonly token: string;
	}): ILandRefreshMoved =>
	async (pr, tip) => {
		const { root, remote, token } = input;
		try {
			const env = identityFetchEnv(token);
			runGit(root, ['fetch', '-q', '--', remote, pr.headSha], env);
			runGit(root, ['fetch', '-q', '--', remote, tip], env);
		} catch {
			return { kind: 'moved' };
		}
		let moves: readonly IMovedProposalConflict[];
		try {
			const base = runGit(root, ['merge-base', pr.headSha, tip]);
			moves = movesOf(root, base, tip, pr.headSha);
		} catch {
			return { kind: 'none' };
		}
		if (moves.length === 0) return { kind: 'none' };
		const scratch = scratchDir();
		try {
			if (
				!attempt(root, [
					'worktree',
					'add',
					'--quiet',
					'--detach',
					scratch,
					pr.headSha,
				])
			)
				return { kind: 'moved' };
			// The trial: git merges what it can; the moved files are settled below.
			attempt(scratch, [
				...IDENTITY,
				'merge',
				'--no-commit',
				'--no-ff',
				tip,
			]);
			// No merge under way: the tip is not in the scratch tree, nothing to carry.
			if (
				!attempt(scratch, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
			)
				return { kind: 'none' };
			const others = unmerged(scratch).filter(
				(path) =>
					!moves.some(
						(move) => move.from === path || move.to === path,
					),
			);
			const refresh = refreshMovedProposal({
				ports: {
					moves,
					otherConflicts: others,
					mergeText: (base, edited, moved) =>
						mergeText(root, base, edited, moved),
				},
			});
			if (refresh.kind === 'asked')
				return { kind: 'asked', comment: refresh.comment };
			for (const { path, content } of refresh.writes) {
				execFileSync('mkdir', [
					'-p',
					'--',
					dirname(join(scratch, path)),
				]);
				pipe('tee', [join(scratch, path)], content);
				attempt(scratch, ['add', '--', path]);
			}
			for (const path of refresh.removes)
				attempt(scratch, [
					'update-index',
					'--force-remove',
					'--',
					path,
				]);
			if (
				!attempt(scratch, [
					...IDENTITY,
					'commit',
					'-q',
					'-m',
					`Merge pull request #${String(pr.number)} from ${pr.headRef}`,
					'-m',
					'The integration branch edited a file this pull request moved: its edit is carried onto the moved copy.',
				])
			)
				return { kind: 'moved' };
			return pushAsIdentity({
				cwd: scratch,
				remote,
				refspec: `HEAD:refs/heads/${pr.headRef}`,
				token,
			}) === undefined
				? { kind: 'brought' }
				: { kind: 'moved' };
		} finally {
			attempt(scratch, ['merge', '--abort']);
			discardTrain(root, scratch);
		}
	};
