/**
 * worktree-husks.service.ts — a directory beside the units that is no
 * unit is removed, and what it held is kept first.
 *
 * Removing a worktree removes what git put there. Whatever writes into
 * that path afterwards — a validation still running, a server whose
 * working directory it was — brings the directory back, with a cache in
 * it and nothing git lists: no worktree, no branch, no ref. Nobody is
 * told, and the folder of units fills with the remains of finished ones.
 * One of them held a whole checkout an agent had made inside another
 * unit's cache, its link to the repository long gone.
 *
 * A husk cannot hold a commit: commits live in the repository. It can
 * hold files nobody committed. So before a husk goes, every checkout in
 * it is read as git would read it, with the repository's own ignore
 * rules; a tree no commit here has is committed and kept on the forge
 * with the retired work, and only then is the directory removed.
 */
import { execFileSync } from 'node:child_process';
import { readdir, rm, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import type {
	IHusk,
	IReapedHusk,
} from '../contracts/interfaces/worktree-husks.interface';
import {
	DEFAULT_UNITS_DIRECTORY,
	EMPTY_TREE,
	HUSK_SEARCH_DEPTH,
} from './units-directory.constant';
import { readGit } from './work-unit-shared.service';
import { namespacedRef } from './namespaced-ref.helper';

const SKIPPED = new Set(['node_modules', '.git']);

const registeredWorktrees = (root: string): readonly string[] =>
	(readGit(root, ['worktree', 'list', '--porcelain']) ?? '')
		.split('\n')
		.filter((line) => line.startsWith('worktree '))
		.map((line) => resolve(line.slice('worktree '.length)));

const directoriesIn = async (path: string): Promise<readonly string[]> => {
	try {
		return (await readdir(path, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
};

const writtenAt = async (path: string): Promise<number> => {
	try {
		return Math.floor((await stat(path)).mtimeMs / 1000);
	} catch {
		return 0;
	}
};

/** The newest write among a directory, its children and theirs. */
const lastWrite = async (path: string): Promise<number> => {
	const children = (await directoriesIn(path)).map((name) =>
		join(path, name),
	);
	const grandchildren = (
		await Promise.all(
			children.map(async (child) =>
				(await directoriesIn(child)).map((name) => join(child, name)),
			),
		)
	).flat();
	return Math.max(
		...(await Promise.all(
			[path, ...children, ...grandchildren].map(writtenAt),
		)),
	);
};

/**
 * The directories of the units' folder git has no worktree for. `now` is
 * seconds since the epoch.
 */
export const huskDirectories = async (input: {
	readonly root: string;
	readonly now: number;
	readonly unitsDirectory?: string | undefined;
}): Promise<readonly IHusk[]> => {
	const folder = resolve(
		input.root,
		input.unitsDirectory ?? DEFAULT_UNITS_DIRECTORY,
	);
	const registered = registeredWorktrees(input.root);
	const husks: IHusk[] = [];
	for (const name of await directoriesIn(folder)) {
		const path = join(folder, name);
		// A unit, or a folder a unit lives under.
		if (
			registered.some(
				(worktree) =>
					worktree === path || worktree.startsWith(`${path}/`),
			)
		)
			continue;
		husks.push({
			name,
			path,
			quietSeconds: Math.max(0, input.now - (await lastWrite(path))),
		});
	}
	return husks;
};

/** The invariant: only a husk nobody is writing to any more counts. */
export const husksInvariant = (
	husks: readonly IHusk[],
	windowSeconds: number,
): IInvariantResult => {
	const left = husks.filter((husk) => husk.quietSeconds > windowSeconds);
	return {
		scope: 'checkout',
		id: 'no-husk-directories',
		claim: 'every directory beside the units is a unit',
		holds: left.length === 0,
		observed:
			left.length === 0
				? 'none'
				: `${String(left.length)}: ${left
						.slice(0, 3)
						.map((husk) => husk.name)
						.join(', ')}`,
		remedy: '`delendai work reap --apply` keeps on the forge whatever they hold that no commit has, then removes them',
	};
};

/** The husk itself and every checkout left inside it, outermost first. */
const checkoutsIn = async (husk: string): Promise<readonly string[]> => {
	const found: string[] = [husk];
	const walk = async (path: string, depth: number): Promise<void> => {
		if (depth > HUSK_SEARCH_DEPTH) return;
		for (const name of await directoriesIn(path)) {
			if (SKIPPED.has(name)) continue;
			const child = join(path, name);
			try {
				if ((await stat(join(child, '.git'))).isFile())
					found.push(child);
			} catch {
				// No link to a repository: an ordinary directory.
			}
			await walk(child, depth + 1);
		}
	};
	await walk(husk, 1);
	return found;
};

const gitIn = (
	cwd: string,
	env: Readonly<Record<string, string>>,
	args: readonly string[],
): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			env: { ...process.env, ...env },
			stdio: ['ignore', 'pipe', 'ignore'],
			maxBuffer: 64 * 1024 * 1024,
		}).trim();
	} catch {
		return undefined;
	}
};

/**
 * The tree git would make of a directory, under the repository's ignore
 * rules and without the checkouts `inside` it; `undefined` when git
 * could not read it.
 */
const treeOf = async (
	root: string,
	directory: string,
	inside: readonly string[],
): Promise<string | undefined> => {
	const common = readGit(root, ['rev-parse', '--git-common-dir']);
	if (common === undefined) return undefined;
	// An index of its own, beside the repository's: the checkout's is
	// gone with its link, and the shared one is not ours to rewrite.
	const gitDirectory = resolve(root, common);
	const index = join(gitDirectory, `husk-index-${String(process.pid)}`);
	const env = {
		GIT_DIR: gitDirectory,
		GIT_WORK_TREE: directory,
		GIT_INDEX_FILE: index,
	};
	const rules = ['-c', `core.excludesFile=${join(root, '.gitignore')}`];
	try {
		// A checkout inside this one is read on its own. One under an
		// ignored path is left out already, and naming it would be an
		// error to git.
		const apart = inside
			.map((each) => relative(directory, each))
			.filter(
				(path) =>
					gitIn(directory, env, [
						...rules,
						'check-ignore',
						'--quiet',
						path,
					]) === undefined,
			);
		const added = gitIn(directory, env, [
			...rules,
			'add',
			'--all',
			'.',
			...apart.map((path) => `:(exclude)${path}`),
		]);
		if (added === undefined) return undefined;
		return gitIn(directory, env, ['write-tree']);
	} finally {
		await rm(index, { force: true });
		await rm(`${index}.lock`, { force: true });
	}
};

const knownTrees = (root: string): ReadonlySet<string> =>
	new Set(
		(gitIn(root, {}, ['log', '--all', '--format=%T']) ?? '').split('\n'),
	);

/**
 * Remove the husks nobody writes to any more. A checkout in one whose
 * files are in no commit is committed and pushed to
 * `refs/<namespace>/retired/husk/<name>` first, one ref each; a husk whose files could
 * not be read or kept stays, and says why.
 */
export const reapHusks = async (input: {
	readonly root: string;
	readonly remote: string;
	readonly namespace: string;
	readonly windowSeconds: number;
	readonly apply: boolean;
	readonly now: number;
	readonly unitsDirectory?: string | undefined;
}): Promise<readonly IReapedHusk[]> => {
	const { root, remote } = input;
	const husks = (await huskDirectories(input)).filter(
		(husk) => husk.quietSeconds > input.windowSeconds,
	);
	if (husks.length === 0) return [];
	const known = knownTrees(root);
	const reaped: IReapedHusk[] = [];
	for (const husk of husks) {
		const base = { name: husk.name, path: husk.path };
		const keep: { readonly ref: string; readonly commit: string }[] = [];
		let unreadable: string | undefined;
		const checkouts = await checkoutsIn(husk.path);
		for (const checkout of checkouts) {
			const tree = await treeOf(
				root,
				checkout,
				checkouts.filter((each) => each.startsWith(`${checkout}/`)),
			);
			if (tree === undefined) {
				unreadable = relative(husk.path, checkout) || husk.name;
				break;
			}
			if (tree === EMPTY_TREE || known.has(tree)) continue;
			const commit = gitIn(root, {}, [
				'commit-tree',
				tree,
				'-m',
				`files left in ${relative(root, checkout)} with no unit`,
			]);
			if (commit === undefined) {
				unreadable = relative(husk.path, checkout) || husk.name;
				break;
			}
			const name =
				checkout === husk.path
					? husk.name
					: // Not a path under the husk's own name: a ref cannot be
						// both a ref and the folder of another.
						`${husk.name}--${basename(checkout)}`;
			keep.push({
				ref: namespacedRef(input.namespace, 'retired', 'husk', name),
				commit,
			});
		}
		const keptAt = keep.map((each) => each.ref);
		if (unreadable !== undefined) {
			reaped.push({
				...base,
				outcome: 'kept',
				keptAt: [],
				reason: `git could not read ${unreadable}`,
			});
			continue;
		}
		if (!input.apply) {
			reaped.push({ ...base, outcome: 'would-remove', keptAt });
			continue;
		}
		const pushed =
			keep.length === 0 ||
			readGit(root, [
				'push',
				'--quiet',
				remote,
				...keep.map((each) => `${each.commit}:${each.ref}`),
			]) !== undefined;
		if (!pushed) {
			reaped.push({
				...base,
				outcome: 'kept',
				keptAt: [],
				reason: `\`${remote}\` did not accept its files`,
			});
			continue;
		}
		await rm(husk.path, { recursive: true, force: true });
		reaped.push({ ...base, outcome: 'removed', keptAt });
	}
	return reaped;
};
