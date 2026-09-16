/**
 * proposal-id-sources.ts — where else a proposal id can already be taken.
 *
 * The allocator used to know two things: the counter file in this
 * checkout's `.cache/`, and the proposals in this checkout's tree. Both
 * are PER CHECKOUT. Two agents working in two worktrees of one clone
 * each had their own counter and could not see each other's new files,
 * and neither could see a proposal that so far exists only on another
 * agent's pull-request branch. So both were handed the same id — the
 * collision the in-checkout mutex was written to prevent, one level up.
 *
 * This module answers the two questions the allocator could not:
 *
 *   - `sharedCounterPath` — a counter every worktree of the clone shares,
 *     under the git common directory, so one mutex serialises all of
 *     them instead of one per checkout.
 *   - `elsewhere` — the highest id per prefix in every OTHER worktree of
 *     the clone (untracked files included: that is where another agent's
 *     unpublished proposal lives) and on every remote-tracking ref (where
 *     a published but unmerged proposal lives).
 *
 * It only reads. Nothing here writes, moves or deletes a proposal — in
 * particular not the ones another agent is still writing.
 *
 * Outside a git repository both answers degrade to "nothing known", so
 * the allocator behaves exactly as it did before.
 */
import { join, relative } from 'node:path';

import { PROPOSAL_SCAN_FOLDERS } from '../contracts/constants/proposal-glossary.constant';
import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import type {
	IProposalIdCounters,
	IProposalIdSources,
} from '../contracts/interfaces/proposal-id-sources.interface';
import {
	DEFAULT_ALLOCATOR_FS,
	type IAllocatorFs,
} from './proposal-id-allocator-fs';

export type {
	IProposalIdCounters,
	IProposalIdSources,
} from '../contracts/interfaces/proposal-id-sources.interface';

const PROPOSAL_FILE = /^([a-z])(\d+)-[^/]*\.md$/;

/** Folds file names (or paths) into the highest id per prefix. */
export const countersFromNames = (
	names: Iterable<string>,
): IProposalIdCounters => {
	const counters: Record<string, number> = {};
	for (const name of names) {
		const base = name.slice(name.lastIndexOf('/') + 1);
		const match = PROPOSAL_FILE.exec(base);
		if (match === null) continue;
		const prefix = match[1] ?? '';
		const n = Number(match[2]);
		if (!Number.isFinite(n)) continue;
		counters[prefix] = Math.max(counters[prefix] ?? 0, n);
	}
	return counters;
};

/** The `worktree <path>` lines of `git worktree list --porcelain`. */
export const worktreePathsFrom = (porcelain: string): readonly string[] =>
	porcelain
		.split('\n')
		.filter((line) => line.startsWith('worktree '))
		.map((line) => line.slice('worktree '.length).trim())
		.filter((path) => path !== '');

const lines = (output: string): readonly string[] =>
	output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');

export const createGitProposalIdSources = (
	proposalsDirAbs: string,
	deps: { readonly git?: IGitRunner; readonly fs?: IAllocatorFs } = {},
): IProposalIdSources => {
	const git = deps.git ?? createGitRunner(proposalsDirAbs);
	const fs = deps.fs ?? DEFAULT_ALLOCATOR_FS;
	return {
		async sharedCounterPath() {
			const common = await git([
				'rev-parse',
				'--path-format=absolute',
				'--git-common-dir',
			]);
			if (!common.ok) return null;
			const dir = common.output.trim();
			return dir === ''
				? null
				: join(dir, 'delendai', 'proposal-id-counters.json');
		},
		async elsewhere() {
			const top = await git(['rev-parse', '--show-toplevel']);
			if (!top.ok) return {};
			const proposalsDirRel = relative(
				top.output.trim(),
				proposalsDirAbs,
			);
			const names: string[] = [];

			const worktrees = await git(['worktree', 'list', '--porcelain']);
			if (worktrees.ok) {
				for (const worktree of worktreePathsFrom(worktrees.output)) {
					for (const folder of PROPOSAL_SCAN_FOLDERS) {
						const dirAbs = join(worktree, proposalsDirRel, folder);
						for (const entry of await fs.list(dirAbs)) {
							if (entry.isFile) names.push(entry.name);
						}
					}
				}
			}

			const refs = await git([
				'for-each-ref',
				'--format=%(refname)',
				'refs/remotes',
			]);
			if (refs.ok) {
				for (const ref of lines(refs.output)) {
					const tree = await git([
						'ls-tree',
						'-r',
						'--name-only',
						ref,
						'--',
						proposalsDirRel,
					]);
					if (tree.ok) names.push(...lines(tree.output));
				}
			}
			return countersFromNames(names);
		},
	};
};
