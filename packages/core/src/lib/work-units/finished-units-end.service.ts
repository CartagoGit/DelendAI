/**
 * finished-units-end.service.ts — a unit whose work landed ends by
 * itself, in every project, on every forge.
 *
 * What ended a finished unit was a script of delendai's own repository,
 * run only where that script exists. In a project that uses delendai the
 * reviewer, auditor and verifier units of one review stayed for good —
 * worktree, local branch and the forge's copy — although the integration
 * branch held every tip. The host server holding the maintenance lease
 * runs this pass instead, wherever it runs.
 *
 * A unit ends only when all of these hold:
 *
 * - every copy of it (local and remote, work ref and publication head)
 *   is held by the integration branch: by ancestry, or — when its
 *   publication was rewritten before it merged — by a merge that names
 *   the publication AND content the integration branch already has;
 * - nobody is on it: no live owner holds it, and no fresh heartbeat,
 *   running session, proof in flight or process inside its worktree says
 *   otherwise (read with its standing, and again before each removal);
 * - its worktree holds no edit of its own, and it is not the shared
 *   checkout.
 *
 * Each tip is kept under `refs/<namespace>/retired/`, here and pushed to
 * the forge as `work retire` keeps it, before any ref is deleted, and every deletion is compare-and-swap at the tip judged, so a
 * copy somebody moved since is not the unit that was judged. Only refs
 * under the work and publication prefixes are read: a person's branches
 * are never seen. Everything is plain git, so a GitLab project or one
 * with no forge CLI ends its units the same way.
 */
import { shortName } from '../development-policy/git-guard-namespaces';
import { mergeSubjectsReader } from '../startup-reconciler/merge-subjects.service';
import { mergedPublicationPredicate } from '../startup-reconciler/phases/merged-publications.helper';
import type {
	IEndFinishedUnitsInput,
	IEndedUnit,
	IKeptUnitReason,
} from './finished-units-end.interface';
import { carriesNothingBeyond } from './landed-work.service';
import { namespacedRef } from './namespaced-ref.helper';
import {
	dropForgeCopy,
	removeUnitCheckout,
	worktreeOfRef,
} from './unit-removal.service';
import { readUnitStandings } from './unit-standings.service';
import { inspectWorktree } from './unit-worktree-state.service';
import {
	integrationBase,
	integrationRemote,
	mainWorktreeOf,
	readGit,
} from './work-unit-shared.service';

export type {
	IEndFinishedUnitsInput,
	IEndedUnit,
	IEndedUnitOutcome,
	IKeptUnitReason,
} from './finished-units-end.interface';

/** Standings whose owner is still at it. */
const HELD = new Set(['live', 'waiting']);

/** How far back the integration branch's own line is read. */
const LINE_READ = 5000;

/** One copy of a unit's ref: a branch here, or the remote's. */
interface ICopy {
	/** The branch name, as `refs/heads/` or the remote spells it. */
	readonly branch: string;
	readonly remote: boolean;
	readonly sha: string;
}

const commitOf = (root: string, ref: string): string | undefined => {
	const sha = readGit(root, ['rev-parse', '-q', '--verify', ref]);
	return sha !== undefined && sha.length > 0 ? sha : undefined;
};

/**
 * Whether the integration branch holds what `sha` changed: every file it
 * touched since it left `base` reads the same in `base`. The evidence a
 * merge naming the publication needs before a rewritten tip may go.
 */
const contentHeld = (root: string, sha: string, base: string): boolean => {
	const from = readGit(root, ['merge-base', base, sha]);
	if (from === undefined) return false;
	const touched = readGit(root, ['diff', '--name-only', from, sha]);
	if (touched === undefined) return false;
	if (touched.length === 0) return true;
	return (
		readGit(root, [
			'diff',
			'--quiet',
			sha,
			base,
			'--',
			...touched.split('\n'),
		]) !== undefined
	);
};

/** The unit names under `prefix` this clone sees, here or on `remote`. */
const unitsUnder = (
	root: string,
	remote: string,
	prefix: string,
): ReadonlySet<string> => {
	if (prefix.length === 0) return new Set();
	const listed = readGit(root, [
		'for-each-ref',
		'--format=%(refname)',
		`refs/heads/${prefix}**`,
		`refs/remotes/${remote}/${prefix}**`,
	]);
	return new Set(
		(listed ?? '')
			.split('\n')
			.map((name) =>
				name
					.replace(/^refs\/heads\//u, '')
					.replace(/^refs\/remotes\/[^/]+\//u, ''),
			)
			.filter((name) => name.startsWith(prefix))
			.map((name) => name.slice(prefix.length))
			.filter((unit) => unit.length > 0),
	);
};

/** Every copy of `branch` this clone knows: its own, and `remote`'s. */
const copiesOf = (
	root: string,
	remote: string,
	branch: string,
): readonly ICopy[] => {
	const copies: ICopy[] = [];
	const local = commitOf(root, `refs/heads/${branch}`);
	if (local !== undefined) copies.push({ branch, remote: false, sha: local });
	const forge = commitOf(root, `refs/remotes/${remote}/${branch}`);
	if (forge !== undefined) copies.push({ branch, remote: true, sha: forge });
	return copies;
};

/**
 * Keeps `sha` under the unit's retired name, here and on `forge`, as
 * `work retire` does: a tip kept on one machine is lost with it. A name
 * taken by another tip, here or there, gets the commit appended. Create
 * only, on both sides: an existing retired ref is never moved. Answers
 * the name only once every side holds the tip; `forge` is undefined only
 * for a clone with no remote at all.
 */
const keepTip = (
	root: string,
	forge: string | undefined,
	namespace: string,
	unit: string,
	sha: string,
): string | undefined => {
	const plain = namespacedRef(namespace, 'retired', unit);
	for (const ref of [plain, `${plain}-${sha.slice(0, 12)}`]) {
		const here = commitOf(root, ref);
		if (here !== undefined && here !== sha) continue;
		const listed =
			forge === undefined
				? ''
				: readGit(root, ['ls-remote', '--', forge, ref]);
		// A forge that cannot be read keeps nothing: nothing is deleted.
		if (listed === undefined) return undefined;
		const there = listed.split('\t')[0] ?? '';
		if (there.length > 0 && there !== sha) continue;
		if (
			here === undefined &&
			readGit(root, ['update-ref', ref, sha, '']) === undefined
		)
			return undefined;
		if (forge !== undefined && there !== sha) {
			const pushed = readGit(root, [
				'push',
				'--quiet',
				`--force-with-lease=${ref}:`,
				forge,
				`${sha}:${ref}`,
			]);
			if (pushed === undefined) return undefined;
		}
		return ref;
	}
	return undefined;
};

export const endFinishedUnits = async (
	input: IEndFinishedUnitsInput,
): Promise<readonly IEndedUnit[]> => {
	const { policy, apply } = input;
	const root = mainWorktreeOf(input.root);
	const base = integrationBase(root, policy);
	const work = shortName(policy.branches.workRefPrefix);
	const publication = shortName(policy.branches.publicationRefPrefix);
	if (base === undefined || work.length === 0) return [];
	const remote = integrationRemote(root, policy);
	const forge =
		readGit(root, ['remote', 'get-url', remote]) === undefined
			? undefined
			: remote;
	const subjects = await mergeSubjectsReader(async (args) => {
		const output = readGit(root, args);
		return { ok: output !== undefined, output: output ?? '' };
	})(base);
	const namedByMerge = mergedPublicationPredicate(subjects, policy.branches);
	const landed = (copy: ICopy, workBranch: string): boolean =>
		readGit(root, ['merge-base', '--is-ancestor', copy.sha, base]) !==
			undefined ||
		carriesNothingBeyond(root, copy.sha, base) ||
		(namedByMerge(workBranch) && contentHeld(root, copy.sha, base));
	const standings = new Map(
		(
			await readUnitStandings({
				root,
				policy,
				...(input.now === undefined ? {} : { now: input.now }),
			})
		).map((entry) => [entry.ref, entry.standing]),
	);
	// The integration branch's own commits: a unit whose tip is one of
	// them never carried a commit of its own.
	const line = new Set(
		(
			readGit(root, [
				'rev-list',
				'--first-parent',
				`--max-count=${String(LINE_READ)}`,
				base,
			]) ?? ''
		)
			.split('\n')
			.filter((sha) => sha.length > 0),
	);
	const units = new Set([
		...unitsUnder(root, remote, work),
		...unitsUnder(root, remote, publication),
	]);
	const results: IEndedUnit[] = [];
	for (const unit of [...units].sort()) {
		const workBranch = `${work}${unit}`;
		const copies = [
			...copiesOf(root, remote, workBranch),
			...(publication.length > 0
				? copiesOf(root, remote, `${publication}${unit}`)
				: []),
		];
		const worktree = worktreeOfRef(root, workBranch) ?? null;
		const judged = {
			unit,
			refs: copies.map((copy) =>
				copy.remote ? `${remote}/${copy.branch}` : copy.branch,
			),
			worktree,
		};
		const kept = (
			reason: IKeptUnitReason,
			edited: readonly string[] = [],
		): IEndedUnit => ({
			...judged,
			outcome: 'kept',
			reason,
			edited,
			retiredRefs: [],
		});
		if (!copies.every((copy) => landed(copy, workBranch))) {
			results.push(kept('holds-work'));
			continue;
		}
		const standing = standings.get(workBranch);
		if (HELD.has(standing ?? '')) {
			results.push(kept('live'));
			continue;
		}
		const unstarted = copies.every(
			(copy) => copy.branch !== workBranch || line.has(copy.sha),
		);
		if (unstarted && standing !== undefined && standing !== 'abandoned') {
			results.push(kept('unstarted'));
			continue;
		}
		if (worktree === root) {
			results.push(kept('shared-checkout'));
			continue;
		}
		const edited =
			worktree === null ? [] : inspectWorktree(worktree).edited;
		if (edited.length > 0) {
			results.push(kept('edited', edited));
			continue;
		}
		if (!apply) {
			results.push({
				...judged,
				outcome: 'would-end',
				edited: [],
				retiredRefs: [],
			});
			continue;
		}
		const retiredRefs: string[] = [];
		for (const sha of new Set(copies.map((copy) => copy.sha))) {
			const ref = keepTip(
				root,
				forge,
				policy.branches.namespacePrefix,
				unit,
				sha,
			);
			if (ref !== undefined && !retiredRefs.includes(ref))
				retiredRefs.push(ref);
		}
		// Nothing is deleted whose tip is not kept.
		if (retiredRefs.length < new Set(copies.map((c) => c.sha)).size) {
			results.push(kept('refused'));
			continue;
		}
		// The local branch is the first copy: one found alive when it was
		// to go keeps every other copy too.
		let removedAll = true;
		for (const copy of copies) {
			if (!removedAll) break;
			const removed = copy.remote
				? dropForgeCopy(root, remote, copy.branch, copy.sha)
				: copy.branch === workBranch
					? (
							await removeUnitCheckout(root, copy.branch, {
								policy,
								tip: copy.sha,
								now: input.now,
							})
						).deletedBranch
					: readGit(root, [
							'update-ref',
							'-d',
							`refs/heads/${copy.branch}`,
							copy.sha,
						]) !== undefined;
			removedAll &&= removed;
		}
		results.push(
			removedAll
				? { ...judged, outcome: 'ended', edited: [], retiredRefs }
				: { ...kept('refused'), retiredRefs },
		);
	}
	return results;
};
