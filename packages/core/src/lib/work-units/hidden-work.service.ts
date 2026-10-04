/**
 * hidden-work.service.ts — work nobody can see is named.
 *
 * What a person watching a swarm sees is branches on the forge. Work that
 * is somewhere else is, to that person, lost: a stash, a commit made in a
 * unit and never pushed, a file edited in a worktree and never committed.
 * After one run the clone held a thousand commits no ref reached and a
 * dozen pieces of work, weeks old, that had never arrived anywhere; the
 * only way to find them was to ask git for its unreachable objects.
 *
 * Work is committed in its unit and the unit is on the forge, or it is
 * not work. These three checks name what is neither.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import { HOOK_GIT_ENVIRONMENT } from '../contracts/constants/hook-git-environment.constant';
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import { REGENERABLE_PATH_PATTERNS } from './unit-lease.constant';
import { leaseWindowSeconds } from './unit-verdict.service';

const git = (cwd: string, args: readonly string[]): string => {
	const environment = { ...process.env };
	for (const name of HOOK_GIT_ENVIRONMENT) delete environment[name];
	try {
		return execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			env: environment,
		}).trim();
	} catch {
		return '';
	}
};

const lines = (out: string): readonly string[] =>
	out.split('\n').filter((line) => line.length > 0);

/** The unit worktrees of this clone: their branch and where they are. */
const unitWorktrees = (
	root: string,
	workPrefix: string,
): readonly { readonly ref: string; readonly path: string }[] =>
	git(root, ['worktree', 'list', '--porcelain'])
		.split('\n\n')
		.flatMap((block) => {
			const path = /^worktree (?<path>.+)$/mu.exec(block)?.groups?.path;
			const ref = /^branch refs\/heads\/(?<ref>.+)$/mu.exec(block)?.groups
				?.ref;
			return path !== undefined &&
				ref !== undefined &&
				ref.startsWith(workPrefix)
				? [{ ref, path }]
				: [];
		});

/** The paths a worktree changed that no generator rebuilds. */
const realEdits = (path: string): readonly string[] =>
	lines(git(path, ['status', '--porcelain=v1', '--untracked-files=all']))
		.map((line) => line.slice(3))
		.filter(
			(file) =>
				!REGENERABLE_PATH_PATTERNS.some((pattern) =>
					pattern.test(file),
				),
		);

/**
 * The three invariants of hidden work, read from the clone. `now` is
 * seconds since the epoch; the clock, unless a test says otherwise.
 */
export const hiddenWorkInvariants = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly workPrefix: string;
	readonly publicationPrefix: string;
	readonly leaseTtlMinutes: number;
	readonly now?: number | undefined;
}): readonly IInvariantResult[] => {
	const { root, remote } = input;
	const now = input.now ?? Math.floor(Date.now() / 1000);
	const window = leaseWindowSeconds(input.leaseTtlMinutes);
	const units = unitWorktrees(root, input.workPrefix);

	const stashes = lines(git(root, ['stash', 'list']));

	// A commit made a moment ago is on its way: only one that stayed here
	// longer than a silent unit is given counts as never pushed.
	const settled = (cwd: string): boolean => {
		const tipAt = Number(git(cwd, ['log', '-1', '--format=%ct']));
		return Number.isFinite(tipAt) && now - tipAt > window;
	};

	const unpushed = units.filter(({ ref, path }) => {
		if (!settled(path)) return false;
		const ahead = git(root, [
			'rev-list',
			'--count',
			`${remote}/${input.integration}..refs/heads/${ref}`,
		]);
		if (ahead === '' || ahead === '0') return false;
		const unit = ref.slice(input.workPrefix.length);
		// On the forge under either of its names, at least as far as here.
		return ![ref, `${input.publicationPrefix}${unit}`].some(
			(branch) =>
				git(root, [
					'rev-list',
					'--count',
					`refs/remotes/${remote}/${branch}..refs/heads/${ref}`,
				]) === '0',
		);
	});

	const uncommitted = units.flatMap(({ ref, path }) => {
		const edits = realEdits(path);
		if (edits.length === 0) return [];
		// Somebody working right now has changes in its tree: that is work
		// in hand, not work left behind. The files say when: the unit's
		// last commit may be days older than an edit made a minute ago.
		const touchedAt = Math.max(
			0,
			...edits.map((file) => {
				try {
					return Math.floor(
						statSync(join(path, file)).mtimeMs / 1000,
					);
				} catch {
					// Deleted and not committed: dated by the unit's tip.
					return (
						Number(git(path, ['log', '-1', '--format=%ct'])) || 0
					);
				}
			}),
		);
		return now - touchedAt > window ? [{ ref, edits: edits.length }] : [];
	});

	return [
		{
			scope: 'checkout',
			id: 'no-stashed-work',
			claim: 'no work sits in a stash',
			holds: stashes.length === 0,
			observed:
				stashes.length === 0
					? 'none'
					: `${String(stashes.length)}: ${stashes.slice(0, 2).join('; ')}`,
			remedy: 'apply it in the unit it belongs to and commit it there (`git stash apply`), or drop it if it is not work (`git stash drop`): a stash is seen by nobody and pushed nowhere',
		},
		{
			scope: 'checkout',
			id: 'units-are-on-the-forge',
			claim: 'every unit’s commits are on the forge',
			holds: unpushed.length === 0,
			observed:
				unpushed.length === 0
					? 'all pushed'
					: `${String(unpushed.length)} only here: ${unpushed
							.slice(0, 3)
							.map((unit) => unit.ref)
							.join(', ')}`,
			remedy: `push the unit (\`git push ${remote} <ref>\` from its worktree), or publish it (\`delendai work publish\`): a commit that is only on this machine is lost with it`,
		},
		{
			scope: 'checkout',
			id: 'units-are-committed',
			claim: 'no unit left changes it never committed',
			holds: uncommitted.length === 0,
			observed:
				uncommitted.length === 0
					? 'none left behind'
					: uncommitted
							.slice(0, 3)
							.map(
								(unit) =>
									`${unit.ref} (${String(unit.edits)} path(s))`,
							)
							.join(', '),
			remedy: 'commit them in the unit if they are work, restore them if they are not (`git restore`, `git clean`); a unit nobody will finish is retired, which keeps what was not committed (`delendai work retire --ref=<ref> --reason=<why>`)',
		},
	];
};
