/**
 * publication-target.service.ts — which publication ref a slice's work
 * goes to: its own, or its proposal's.
 *
 * The rule is the policy's (`integration.publication`, applied by
 * `publicationUnitFor` in core). This decides only what the rule needs
 * from the repository, and keeps the answer the same for every slice of
 * one proposal: once a proposal has a pull request for the whole of it,
 * every later slice joins that one; once a slice was published alone, the
 * rest are too. Without that, the first slice of a proposal that grows
 * would open a proposal-wide pull request and a later one would open its
 * own beside it.
 *
 * A proposal's pull request is named from the same template as every
 * work ref, with `all` as the slice, and is found on the remote whatever
 * topic it was given: a different `--topic` must not open a second one.
 */
import { execFileSync } from 'node:child_process';

import { publicationUnitFor } from '../development-policy/publication-unit';
import { resolveWorkRef } from '../wip-engine/ref-name';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { REVIEW_BATCH_ID } from '../development-policy/profiles.constant';

import type {
	IPublicationTarget,
	IPublicationTargetRequest,
} from '../contracts/interfaces/publication-target.interface';
import { WHOLE_PROPOSAL_SLICE } from '../contracts/constants/publication-target.constant';
import { publicationRefFromWorkRef } from './work-publish.service';

export type {
	IPublicationTarget,
	IPublicationTargetRequest,
} from '../contracts/interfaces/publication-target.interface';

const SLICE_MARK = 'zzslicemarkzz';
const TOPIC_MARK = 'zztopicmarkzz';

const git = (cwd: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

const escapeRegExp = (text: string): string =>
	text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * A pattern matching the publication refs of one proposal by one agent,
 * whatever their topic, and — unless `slice` is given — whatever their
 * slice. Built from the template itself, so it holds for any shape a
 * project declares.
 */
export const publicationPattern = (
	policy: IResolvedDevelopmentPolicy,
	unit: {
		readonly agent: string;
		readonly proposal: string;
		readonly generation: number;
		readonly slice?: string;
		readonly kind?: string | undefined;
	},
): RegExp | undefined => {
	const marked = publicationRefFromWorkRef(
		policy,
		resolveWorkRef(policy.branches.workRefTemplate, {
			agent: unit.agent,
			kind: unit.kind,
			proposal: unit.proposal,
			slice: unit.slice ?? SLICE_MARK,
			generation: unit.generation,
			topic: TOPIC_MARK,
		}),
	);
	if (marked === undefined) return undefined;
	const source = escapeRegExp(marked)
		.replace(SLICE_MARK, '([^/]+?)')
		.replace(TOPIC_MARK, '[^/]+');
	return new RegExp(`^${source}$`, 'u');
};

/** Publication refs on the remote, fully qualified. */
const remotePublications = (
	root: string,
	remote: string,
	policy: IResolvedDevelopmentPolicy,
): readonly string[] => {
	const prefix = policy.branches.publicationRefPrefix
		.replace(/^refs\//u, '')
		.replace(/^heads\//u, '');
	// `--` first: a remote named like an option is never read as one.
	const listed = git(root, [
		'ls-remote',
		'--heads',
		'--',
		remote,
		`refs/heads/${prefix}*`,
	]);
	return (listed ?? '')
		.split('\n')
		.map((line) => line.split(/\s+/u)[1] ?? '')
		.filter((ref) => ref.length > 0);
};

/**
 * How many slices the proposal declares, read from the tree of `ref` — the
 * work being published. A proposal written in that work exists nowhere
 * else yet: reading the checkout's HEAD instead found nothing for every
 * new proposal and published it alone "because its size is unknown".
 */
/** Where `proposal`'s document lives in the tree of `ref`, if anywhere. */
const proposalFileAt = (
	root: string,
	proposal: string,
	ref: string,
): string | undefined =>
	(git(root, ['ls-tree', '-r', '--name-only', ref]) ?? '')
		.split('\n')
		.find(
			(file) =>
				file.includes('/proposals/') &&
				(file.split('/').pop() ?? '').startsWith(`${proposal}-`) &&
				file.endsWith('.md'),
		);

/**
 * Whether the work being published still has its proposal in progress.
 * A proposal keeps one work branch while it is in progress and publishes
 * its slices from it; the publication that moves it on (to review) is
 * the one that ends the branch.
 */
export const proposalStillInProgress = (
	root: string,
	proposal: string,
	ref: string,
): boolean =>
	proposalFileAt(root, proposal, ref)?.includes('/proposals/in-progress/') ===
	true;

/**
 * What publishing leaves undone for a proposal that is not yet in review.
 *
 * A proposal created or implemented in a unit exists only on the unit's
 * ref until the publication lands, and the publication ends the unit: its
 * worktree and work ref go with it. The hand-off to review is a move of
 * the proposal's document, so it is made in the unit, before the last
 * publish, and lands with the work. `undefined` when the document is
 * already in review or closed, or the unit carries none.
 */
export const proposalHandoffNote = (
	root: string,
	proposal: string,
	ref: string,
): { readonly status: string; readonly nextAction: string } | undefined => {
	const file = proposalFileAt(root, proposal, ref);
	const status = /\/proposals\/([^/]+)\//u.exec(file ?? '')?.[1];
	if (status === undefined || status === 'review' || status === 'done') {
		return undefined;
	}
	return {
		status,
		nextAction: `${proposal} is \`${status}\` in this publication. If this work completes it, hand it to review from the unit BEFORE publishing, so the move lands with the work: \`proposal_transition\` with to=review and your agent (the tool finds the unit on its own). Once published the unit is gone and the proposal exists only on the pull request.`,
	};
};

export const proposalSliceCount = (
	root: string,
	proposal: string,
	ref = 'HEAD',
): number | undefined => {
	const file = proposalFileAt(root, proposal, ref);
	if (file === undefined) return undefined;
	const text = git(root, ['show', `${ref}:${file}`]);
	if (text === undefined) return undefined;
	return text.split('\n').filter((line) => /^###\s+S\d/u.test(line)).length;
};

/** Lines the work ref changes against the integration commit. */
export const changedLines = (root: string, base: string, ref: string): number =>
	(git(root, ['diff', '--numstat', base, ref]) ?? '')
		.split('\n')
		.map((line) => line.split('\t'))
		.reduce(
			(sum, [added, removed]) =>
				sum + (Number(added) || 0) + (Number(removed) || 0),
			0,
		);

export const choosePublicationTarget = (
	request: IPublicationTargetRequest,
): IPublicationTarget | { readonly refusal: string } => {
	const { root, policy, remote, agent, proposal, generation } = request;
	const own = publicationRefFromWorkRef(policy, request.workRef);
	if (own === undefined) {
		return {
			refusal: `\`${request.workRef}\` is not under this policy's work-ref prefix.`,
		};
	}
	const pattern = publicationPattern(policy, {
		agent,
		proposal,
		generation,
		kind: request.kind,
	});
	const published = pattern
		? remotePublications(root, remote, policy).filter((ref) =>
				pattern.test(ref),
			)
		: [];
	const sliceOf = (ref: string): string | undefined =>
		pattern?.exec(ref)?.[1];
	const whole = published.find(
		(ref) => sliceOf(ref) === WHOLE_PROPOSAL_SLICE,
	);
	if (whole !== undefined) {
		return {
			unit: 'proposal',
			publicationRef: whole,
			reason: `${proposal} already has a pull request for the whole proposal; this slice joins it`,
		};
	}
	// A slice published alone stays where it is. Deciding again by size
	// could name the whole proposal this time (the work grew, or merged
	// the integration branch in), and open a second pull request beside
	// the first for the same work.
	if (published.includes(own)) {
		return {
			unit: 'slice',
			publicationRef: own,
			reason: `${proposal} ${request.slice} already has its own pull request; this publication updates it`,
		};
	}
	const alone = published.find(
		(ref) => sliceOf(ref) !== WHOLE_PROPOSAL_SLICE,
	);
	if (alone !== undefined && alone !== own) {
		return {
			unit: 'slice',
			publicationRef: own,
			reason: `${proposal} was already published slice by slice; this slice is too`,
		};
	}
	if (proposal === REVIEW_BATCH_ID) {
		return {
			unit: 'slice',
			publicationRef: own,
			reason: 'a review batch is published whole, as one pull request for every proposal it reviewed',
		};
	}
	const sliceCount = proposalSliceCount(root, proposal, request.workRef);
	if (sliceCount === undefined) {
		return {
			unit: 'slice',
			publicationRef: own,
			reason: `the file of ${proposal} was not found, so its size is unknown; this slice is published alone`,
		};
	}
	const decided = publicationUnitFor(
		{
			proposalId: proposal,
			sliceCount,
			changedLines: changedLines(root, request.base, request.workRef),
		},
		policy.integration.publication,
	);
	if (decided.unit === 'slice') {
		return { unit: 'slice', publicationRef: own, reason: decided.reason };
	}
	const wholeRef = publicationRefFromWorkRef(
		policy,
		resolveWorkRef(policy.branches.workRefTemplate, {
			agent,
			kind: request.kind,
			proposal,
			slice: WHOLE_PROPOSAL_SLICE,
			generation,
			...(request.topic === undefined ? {} : { topic: request.topic }),
		}),
	);
	return wholeRef === undefined
		? { unit: 'slice', publicationRef: own, reason: decided.reason }
		: {
				unit: 'proposal',
				publicationRef: wholeRef,
				reason: decided.reason,
			};
};
