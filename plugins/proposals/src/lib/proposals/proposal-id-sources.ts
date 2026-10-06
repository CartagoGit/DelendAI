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
import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';

import { PROPOSAL_SCAN_FOLDERS } from '../contracts/constants/proposal-glossary.constant';
import { createGitRunner, type IGitRunner } from '../shared/git-runner';
import type {
	IProposalIdCounters,
	IProposalIdReservation,
	IProposalIdSources,
} from '../contracts/interfaces/proposal-id-sources.interface';
import {
	DEFAULT_ALLOCATOR_FS,
	type IAllocatorFs,
} from './proposal-id-allocator-fs';

export type {
	IProposalIdCounters,
	IProposalIdReservation,
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

/** Where an id is claimed on the remote: one ref per id. */
const RESERVATION_NAMESPACE = 'refs/delendai/ids/';

const RESERVATION_REF = /refs\/delendai\/ids\/([a-z])(\d+)\s*$/u;

/** Folds the output of `ls-remote` over the reservation refs into counters. */
export const countersFromReservations = (
	output: string,
): IProposalIdCounters => {
	const counters: Record<string, number> = {};
	for (const line of output.split('\n')) {
		const match = RESERVATION_REF.exec(line);
		if (match === null) continue;
		const prefix = match[1] ?? '';
		counters[prefix] = Math.max(counters[prefix] ?? 0, Number(match[2]));
	}
	return counters;
};

/**
 * The reservations of `id`'s prefix below it. Only the highest one feeds
 * the counter, so the others keep no id from anybody; left in place, one
 * ref per proposal ever created piled up on the forge.
 */
export const supersededReservations = (
	output: string,
	id: string,
): readonly string[] => {
	const own = /^([a-z])(\d+)$/u.exec(id);
	if (own === null) return [];
	return output.split('\n').flatMap((line) => {
		const match = RESERVATION_REF.exec(line);
		if (match === null || match[1] !== own[1]) return [];
		return Number(match[2]) < Number(own[2])
			? [`${RESERVATION_NAMESPACE}${match[1]}${match[2]}`]
			: [];
	});
};

/** Drop what `id`'s reservation superseded; a failure leaves them, harmless. */
const releaseSuperseded = async (
	git: IGitRunner,
	url: string,
	id: string,
): Promise<void> => {
	const listed = await git(['ls-remote', url, `${RESERVATION_NAMESPACE}*`]);
	if (!listed.ok) return;
	const spent = supersededReservations(listed.output, id);
	if (spent.length === 0) return;
	await git(['send-pack', url, ...spent.map((ref) => `:${ref}`)]);
};

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
					// `--full-tree`: the pathspec is the repository-relative
					// directory, but `ls-tree` reads it relative to the cwd
					// by default. A process running inside the proposals
					// directory (the CLI's server does) matched nothing and
					// never saw an id held on a remote ref, while the same
					// call from the repository root did: two callers, two
					// answers, one id handed out twice.
					const tree = await git([
						'ls-tree',
						'-r',
						'--full-tree',
						'--name-only',
						ref,
						'--',
						proposalsDirRel,
					]);
					if (tree.ok) names.push(...lines(tree.output));
				}
			}
			const merged: Record<string, number> = {
				...countersFromNames(names),
			};
			// Ids other sessions claimed on the remote, whether or not their
			// proposal has reached any ref this clone has fetched.
			const reserved = await git([
				'ls-remote',
				'origin',
				`${RESERVATION_NAMESPACE}*`,
			]);
			if (reserved.ok) {
				for (const [key, value] of Object.entries(
					countersFromReservations(reserved.output),
				)) {
					merged[key] = Math.max(merged[key] ?? 0, value);
				}
			}
			return merged;
		},
		async reserve(id): Promise<IProposalIdReservation> {
			const url = await git(['remote', 'get-url', 'origin']);
			const tree = await git(['rev-parse', 'HEAD^{tree}']);
			if (!url.ok || !tree.ok) return 'unavailable';
			// A commit of its own per reservation: two sessions pushing the
			// SAME object to one ref would both be told "up to date". Unrelated
			// commits cannot fast-forward, so the second push is rejected.
			const commit = await git([
				'-c',
				'user.name=delendai',
				'-c',
				'user.email=delendai@localhost',
				'commit-tree',
				tree.output.trim(),
				'-m',
				`reserve ${id} ${randomUUID()}`,
			]);
			if (!commit.ok) return 'unavailable';
			const ref = `${RESERVATION_NAMESPACE}${id}`;
			// `send-pack`, not `push`: this moves a bookkeeping ref, not work,
			// and `push` would run the whole pre-push gate (about a minute)
			// for a reference that points at nothing anybody reviews.
			const sent = await git([
				'send-pack',
				url.output.trim(),
				`${commit.output.trim()}:${ref}`,
			]);
			if (sent.ok) {
				await releaseSuperseded(git, url.output.trim(), id);
				return 'reserved';
			}
			const held = await git(['ls-remote', url.output.trim(), ref]);
			return held.ok && held.output.trim() !== ''
				? 'taken'
				: 'unavailable';
		},
	};
};
