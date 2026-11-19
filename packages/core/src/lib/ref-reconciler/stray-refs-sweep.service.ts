/**
 * stray-refs-sweep.service.ts — a ref that is nobody's and carries no
 * work is removed from the clone.
 *
 * `no-stray-refs` names refs outside every namespace a clone is expected
 * to hold. On 2026-10-13 it named twenty-six: local copies of review
 * claims, fetched by hand under a namespace the product never writes.
 * A claim records who holds what and changes no file: a commit with no
 * parent whose tree is a snapshot of the integration branch. A copy of
 * one keeps nothing. Removing a ref is safe exactly
 * when every commit it holds beyond the integration branch is empty, or
 * when the forge already holds its tip — the commit a ref there points
 * at, or one a forge branch contains: twelve such copies of retired
 * units' tips stayed on 2026-10-18 until each was proved by hand.
 * Anything else may be somebody's work and is left, reported, for a
 * person.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IReapedStrayRef } from './stray-refs-sweep.interface';
import { strayRefs } from '../work-units/stray-refs.service';
import { ownedRootsOf } from '../work-units/namespaced-ref.helper';
import { ownedNamespaces } from '../integration/decisions/namespaces.helper';
import {
	integrationBase,
	readGit,
} from '../work-units/work-unit-shared.service';

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

/** How far back the integration branch's trees are read for a snapshot. */
const SNAPSHOT_HISTORY = 5000;

/**
 * The trees of the commits the integration branch reaches, newest first.
 * Every parent, not only the first: a review claim is taken on the
 * reviewer's branch, which reaches the integration branch through a
 * merge, so its tree is never one of the first-parent line's.
 */
const integrationTrees = (root: string, base: string): ReadonlySet<string> =>
	new Set(
		lines(
			readGit(root, [
				'log',
				`--max-count=${String(SNAPSHOT_HISTORY)}`,
				'--format=%T',
				base,
			]),
		),
	);

/**
 * Whether every commit `ref` holds beyond `base` changes no file: a
 * commit whose tree is its parent's, or — for a commit with no parent,
 * which is what a claim is — a tree the integration branch itself had.
 */
export const holdsOnlyEmptyCommits = (
	root: string,
	ref: string,
	base: string,
	trees: () => ReadonlySet<string> = () => integrationTrees(root, base),
): boolean => {
	const beyond = readGit(root, ['rev-list', '--parents', `${base}..${ref}`]);
	if (beyond === undefined) return false;
	const commits = lines(beyond);
	if (commits.length === 0) return true;
	return commits.every((line) => {
		const [commit = '', ...parents] = line.split(' ');
		if (parents.length === 0) {
			return trees().has(
				readGit(root, ['rev-parse', `${commit}^{tree}`]) ?? '',
			);
		}
		// A merge joins histories; whether it carries work is not this
		// rule's to judge, so the ref is left for a person.
		if (parents.length !== 1) return false;
		return (
			readGit(root, ['rev-parse', `${commit}^{tree}`]) ===
			readGit(root, ['rev-parse', `${parents[0] ?? ''}^{tree}`])
		);
	});
};

/**
 * Whether the forge holds `ref`'s tip: as the tip of one of its refs
 * (`forgeTips`, read once), or inside a branch the clone tracks from it.
 */
export const heldByForge = (
	root: string,
	ref: string,
	remote: string,
	forgeTips: () => ReadonlySet<string>,
): boolean => {
	const tip = readGit(root, [
		'rev-parse',
		'-q',
		'--verify',
		`${ref}^{commit}`,
	]);
	if (tip === undefined || tip.length === 0) return false;
	if (forgeTips().has(tip)) return true;
	return (
		lines(
			readGit(root, [
				'for-each-ref',
				'--count=1',
				'--format=%(refname)',
				`--contains=${tip}`,
				`refs/remotes/${remote}/`,
			]),
		).length > 0
	);
};

/** The kept-here ref kinds whose work may already be on the integration branch. */
const KEPT_KINDS = ['stranded', 'rescued'] as const;

/**
 * Whether every commit `ref` holds beyond its merge base has an
 * equivalent patch on `base` (`git cherry` reports only `-`): the work
 * landed under another hash, as a merge or a squash of it.
 */
export const patchesLanded = (
	root: string,
	ref: string,
	base: string,
): boolean => {
	const cherry = readGit(root, ['cherry', base, ref]);
	return (
		cherry !== undefined &&
		lines(cherry).every((line) => line.startsWith('-'))
	);
};

/** What a kept ref still holds that `base` lacks: its age and files. */
const describeKept = (
	root: string,
	ref: string,
	base: string,
	now: number,
): Pick<IReapedStrayRef, 'ageSeconds' | 'files'> => {
	const stamp = Number(readGit(root, ['log', '-1', '--format=%ct', ref]));
	return {
		ageSeconds: Number.isFinite(stamp) ? Math.max(0, now - stamp) : 0,
		files: lines(
			readGit(root, ['diff', '--name-only', `${base}...${ref}`]),
		),
	};
};

/**
 * The stranded and rescued refs a clone keeps: removed when they hold no
 * work or every patch is on `base`; otherwise listed with age and files.
 */
const reapKeptRefs = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly base: string;
	readonly apply: boolean;
	readonly now: number;
	readonly trees: () => ReadonlySet<string>;
}): readonly IReapedStrayRef[] => {
	const { root, base, apply } = input;
	const kept = lines(
		readGit(root, [
			'for-each-ref',
			'--format=%(refname)',
			// Every owned namespace's kept refs (f00808).
			...KEPT_KINDS.flatMap((kind) =>
				ownedRootsOf(input.policy.branches, kind).map(
					(root) => `${root}/`,
				),
			),
		]),
	);
	return kept.map((ref): IReapedStrayRef => {
		const reason = holdsOnlyEmptyCommits(root, ref, base, input.trees)
			? 'no-work'
			: patchesLanded(root, ref, base)
				? 'patch-landed'
				: undefined;
		if (reason === undefined)
			return {
				ref,
				outcome: 'kept',
				...describeKept(root, ref, base, input.now),
			};
		if (!apply) return { ref, outcome: 'would-remove', reason };
		return readGit(root, ['update-ref', '-d', ref]) === undefined
			? { ref, outcome: 'kept' }
			: { ref, outcome: 'removed', reason };
	});
};

export const reapStrayRefs = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly apply: boolean;
	/** The forge to ask; absent, only refs that hold no work may go. */
	readonly remote?: string;
	readonly now?: number;
}): readonly IReapedStrayRef[] => {
	const { root, policy, apply, remote } = input;
	const base = integrationBase(root, policy);
	if (base === undefined) return [];
	const stray = strayRefs({
		refs: lines(readGit(root, ['for-each-ref', '--format=%(refname)'])),
		remotes: lines(readGit(root, ['remote'])),
		namespace: ownedNamespaces(policy.branches),
	});
	let cached: ReadonlySet<string> | undefined;
	const trees = (): ReadonlySet<string> => {
		cached ??= integrationTrees(root, base);
		return cached;
	};
	let listed: ReadonlySet<string> | undefined;
	const forgeTips = (): ReadonlySet<string> => {
		listed ??= new Set(
			lines(
				remote === undefined
					? undefined
					: readGit(root, ['ls-remote', '--', remote]),
			).map((line) => line.split('\t')[0] ?? ''),
		);
		return listed;
	};
	const keptRefs = reapKeptRefs({
		root,
		policy,
		base,
		apply,
		now: input.now ?? Math.floor(Date.now() / 1000),
		trees,
	});
	return [
		...stray.map((ref): IReapedStrayRef => {
			const reason = holdsOnlyEmptyCommits(root, ref, base, trees)
				? 'no-work'
				: remote !== undefined &&
						heldByForge(root, ref, remote, forgeTips)
					? 'on-the-forge'
					: undefined;
			if (reason === undefined) return { ref, outcome: 'kept' };
			if (!apply) return { ref, outcome: 'would-remove', reason };
			return readGit(root, ['update-ref', '-d', ref]) === undefined
				? { ref, outcome: 'kept' }
				: { ref, outcome: 'removed', reason };
		}),
		...keptRefs,
	];
};
