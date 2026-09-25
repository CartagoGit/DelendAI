/**
 * review-attribution.ts — who delivered a slice, when no review round
 * recorded it.
 *
 * WHY this exists (x00643): a review round is opened by the implementer's
 * `proposal_review action=submit`. Proposals moved into `review/` by hand,
 * or before rounds existed, never had one, and the reviewer could not
 * open it: submitting under its own name makes it the implementer and
 * bars it from approving. The implementer's session is long gone, so the
 * proposal stayed in `review/` for good.
 *
 * The identity is not lost, though. Work reaches the integration branch
 * through a pull request merged from `<prefix><agent>/<unit>/<topic>`,
 * so the merge that brought the delivering commit in names the agent
 * that wrote it; failing that, a `Co-Authored-By` trailer does. The Git
 * AUTHOR is deliberately not used: in a repository driven by agents it
 * is the machine owner's identity on every commit, and comparing a
 * reviewer against it would pass every time.
 *
 * The reviewer never names the implementer. It names a commit; the name
 * comes from Git, or the review is refused with the datum that is
 * missing.
 */
import {
	readFrontmatterField,
	setFrontmatterBlockField,
} from '../proposals/proposal-frontmatter-writer';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../proposals/frontmatter-parser';
import type { IGitRunner } from '../shared/git-runner';
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';
import { parseReviewState, type IReviewState } from '../swarm/proposal-review';
import { isCommitHash } from '../swarm/slice-shipping-record';

import type {
	IAttributeDeliveryInput,
	IAttributedApproverCheck,
	IReviewAttribution,
	IReviewAttributionResult,
	IWorkRefShape,
} from '../contracts/interfaces/review-attribution.interface';
import { UNRECORDED_IMPLEMENTER } from '../contracts/constants/review-attribution.constant';
import { findWorkRefMention } from './work-ref-mention';

export type {
	IAttributeDeliveryInput,
	IAttributedApproverCheck,
	IReviewAttribution,
	IReviewAttributionResult,
	IWorkRefShape,
} from '../contracts/interfaces/review-attribution.interface';

/** `Claude Opus 5.5 <noreply@…>` → `claude-opus-5-5`. */
export const agentFromTrailer = (trailer: string): string | undefined => {
	const name = trailer.replace(/<[^>]*>/u, '').trim();
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return slug.length > 0 ? slug : undefined;
};

/** Characters of a hash shown to a reader; the full hash is recorded too. */
const SHORT_HASH_LENGTH = 12;

const read = async (
	run: IGitRunner,
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	return result.ok ? result.output : undefined;
};

/**
 * The merge on the integration branch's first-parent line that brought
 * the commit in, or `undefined` when none did (a squash, a rebase, a
 * fast-forward).
 *
 * Containment is monotonic along that line — once a merge has the commit
 * in its history, every later one does too — so the delivering merge is
 * found by bisection rather than by asking about every merge.
 */
const deliveringMerge = async (
	run: IGitRunner,
	commit: string,
	integration: string,
): Promise<string | undefined> => {
	const log = await read(run, [
		'log',
		'--first-parent',
		'--merges',
		'--reverse',
		'--format=%H',
		`${commit}..${integration}`,
	]);
	const merges = (log ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	const contains = async (sha: string): Promise<boolean> =>
		(await run(['merge-base', '--is-ancestor', commit, sha])).ok;
	let low = 0;
	let high = merges.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const merge = merges[middle];
		if (merge !== undefined && (await contains(merge))) high = middle;
		else low = middle + 1;
	}
	return merges[low];
};

/**
 * Who delivered `commit`, from the records Git keeps of units of work:
 * the ref the commit itself names (the engine's trailer), then the ref
 * named by the merge that brought it in, in whatever words the forge
 * used. `undefined` when neither names one of the project's units.
 */
const attributeFromWorkRefs = async (
	run: IGitRunner,
	commit: string,
	commitMessage: string,
	integration: string,
	shape: IWorkRefShape,
): Promise<IReviewAttribution | undefined> => {
	const own = findWorkRefMention(commitMessage, shape);
	if (own !== undefined) {
		return {
			commit,
			implementer: own.agent,
			recorded: true,
			source: `commit ${commit.slice(0, SHORT_HASH_LENGTH)} names ${own.ref}`,
		};
	}
	const merge = await deliveringMerge(run, commit, integration);
	if (merge === undefined) return undefined;
	const mergeMessage = await read(run, ['show', '-s', '--format=%B', merge]);
	const named =
		mergeMessage === undefined
			? undefined
			: findWorkRefMention(mergeMessage, shape);
	if (named === undefined) return undefined;
	const subject = mergeMessage?.split('\n')[0]?.trim() ?? merge;
	return {
		commit,
		implementer: named.agent,
		recorded: true,
		source: `${subject} (${named.ref})`,
	};
};

/** Establish, from Git alone, who delivered the commit a reviewer names. */
export const attributeDelivery = async (
	input: IAttributeDeliveryInput,
): Promise<IReviewAttributionResult> => {
	const hash = input.commitHash.trim();
	if (hash.length === 0) {
		return {
			ok: false,
			kind: 'unusable',
			reason: 'no delivering commit was named',
			missing: 'commitHash: the commit that delivered this slice',
		};
	}
	if (!isCommitHash(hash)) {
		return {
			ok: false,
			kind: 'unusable',
			reason: `"${hash}" is not a commit hash`,
			missing:
				'the hash (short or full) of the commit that delivered this slice',
		};
	}
	const { run } = input;
	const commit = (
		await read(run, ['rev-parse', '--verify', `${hash}^{commit}`])
	)?.trim();
	if (commit === undefined || commit.length === 0) {
		return {
			ok: false,
			kind: 'unusable',
			reason: `commit ${hash} does not exist in this clone`,
			missing: `commit ${hash} (fetch it, or name the commit that is on ${input.integration})`,
		};
	}
	const [paths, message, trailers] = await Promise.all([
		read(run, [
			'diff-tree',
			'--root',
			'--no-commit-id',
			'--name-only',
			'-r',
			commit,
		]),
		read(run, ['show', '-s', '--format=%B', commit]),
		read(run, [
			'show',
			'-s',
			'--format=%(trailers:key=Co-Authored-By,valueonly,separator=%x0A)',
			commit,
		]),
	]);
	const changed = new Set(
		(paths ?? '').split('\n').map((path) => path.trim()),
	);
	const touchesSlice = input.declaredFiles.some((file) => changed.has(file));
	const citesProposal = (message ?? '')
		.toLowerCase()
		.includes(input.proposalId.toLowerCase());
	if (!touchesSlice && !citesProposal) {
		return {
			ok: false,
			kind: 'unrelated',
			reason: `commit ${commit} changes none of the slice's declared files and does not cite ${input.proposalId}`,
			missing: `a commit that delivered ${input.proposalId}: one that changes a declared file of the slice or cites the proposal id`,
		};
	}

	if (input.refShape !== undefined) {
		const fromRefs = await attributeFromWorkRefs(
			run,
			commit,
			message ?? '',
			input.integration,
			input.refShape,
		);
		if (fromRefs !== undefined) return { ok: true, attribution: fromRefs };
	}
	const trailer = (trailers ?? '')
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	const fromTrailer =
		trailer === undefined ? undefined : agentFromTrailer(trailer);
	if (fromTrailer !== undefined && trailer !== undefined) {
		return {
			ok: true,
			attribution: {
				commit,
				implementer: fromTrailer,
				recorded: true,
				source: `Co-Authored-By: ${trailer}`,
			},
		};
	}
	// Nothing names the author. The review still goes ahead — a delivery
	// nobody signed must not stay in review for ever — under the
	// reserved unrecorded name, and the slice records that independence
	// could not be verified.
	return {
		ok: true,
		attribution: unrecordedAttribution(
			commit,
			`nothing in Git names who delivered ${commit}: no work ref of this project in its message or in the merge that brought it into ${input.integration}, and no Co-Authored-By trailer`,
		),
	};
};

/** A delivery whose implementer no record names. */
export const unrecordedAttribution = (
	commit: string,
	source: string,
): IReviewAttribution => ({
	commit,
	implementer: UNRECORDED_IMPLEMENTER,
	source,
	recorded: false,
});

/**
 * A verdict on this slice needs a round opened from Git: the proposal
 * was handed to review, and no round was ever opened for the slice.
 */
export const needsAttributedRound = (
	state: IReviewState,
	proposalMarkdown: string,
): boolean =>
	state.status === 'none' &&
	readFrontmatterField(proposalMarkdown, 'status')?.toLowerCase() ===
		'review';

/** The round the implementer never opened, opened under the name Git gives. */
export const openAttributedRound = (
	state: IReviewState,
	attribution: IReviewAttribution,
): IReviewState => ({
	...state,
	status: 'in_review',
	implementer: attribution.implementer,
	reviewer: null,
});

/** The line that records how an attributed round was opened. */
export const renderAttributionLine = (
	attribution: IReviewAttribution,
	openedBy: string,
): string =>
	attribution.recorded
		? `- review-attribution: ${attribution.implementer} from ${attribution.source} (${attribution.commit}), opened by ${openedBy}`
		: `- review-attribution: ${UNRECORDED_IMPLEMENTER} — ${attribution.source}; independence could not be verified, opened by ${openedBy}`;

/**
 * Reviewer ≠ implementer, against the implementer Git named. With no
 * name there is nobody to compare against, so only the reserved
 * unrecorded name itself is refused.
 */
export const checkAttributedApprover = (
	attribution: IReviewAttribution,
	approver: string,
): IAttributedApproverCheck => {
	const who = approver.trim().toLowerCase();
	if (!attribution.recorded) {
		return who === UNRECORDED_IMPLEMENTER
			? {
					ok: false,
					reason: 'self-approve',
					nextAction: `"${UNRECORDED_IMPLEMENTER}" is reserved for deliveries nobody signed; review under your own agent name.`,
				}
			: { ok: true };
	}
	return attribution.implementer.trim().toLowerCase() === who
		? {
				ok: false,
				reason: 'self-approve',
				nextAction: `Git attributes this delivery to "${attribution.implementer}" (${attribution.source}), so it cannot also approve it. Hand the review to a different agent.`,
			}
		: { ok: true };
};

/** The commits a proposal's frontmatter lists as having shipped it. */
export const listShippedIn = (markdown: string): readonly string[] => {
	const yaml = extractYamlBlock(markdown);
	const raw =
		yaml === null
			? undefined
			: (parseFrontmatterBlock(yaml) as Record<string, unknown>)[
					'shipped-in'
				];
	return (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
		.map((value) => String(value).split('#')[0]?.trim() ?? '')
		.filter((value) => value.length > 0);
};

/**
 * The frontmatter with `commit` in its `shipped-in` list. An approval's
 * evidence names the commit the reviewer verified; that is exactly the
 * evidence `review → done` asks for, so it is written where that gate
 * reads it instead of being asked for again.
 */
export const withShippedIn = (markdown: string, commit: string): string => {
	const listed = listShippedIn(markdown);
	const wanted = commit.trim().toLowerCase();
	const present = listed.some((value) => {
		const known = value.toLowerCase();
		return known.startsWith(wanted) || wanted.startsWith(known);
	});
	if (present) return markdown;
	return setFrontmatterBlockField(
		markdown,
		'shipped-in',
		[...listed, commit.trim()].map((value) => `- ${value}`),
	);
};

/**
 * Every slice is done AND carries a completed review. A proposal whose
 * other slices were only hand-marked `done` is not closed by approving
 * one of them.
 */
export const everySliceReviewed = (
	proposalId: string,
	markdown: string,
): boolean => {
	const plan = parseProposalSlicePlan(proposalId, markdown);
	if (plan === null || plan.slices.length === 0) return false;
	const body = markdown.replace(/^---[\s\S]*?---\s*/u, '');
	const blocks = body.split(/^### /mu).slice(1);
	return plan.slices.every((slice) => {
		if (slice.status !== 'done') return false;
		const id = slice.sliceId.toLowerCase();
		const block = blocks.find((candidate) => {
			const heading = candidate.split('\n')[0]?.toLowerCase() ?? '';
			return heading.startsWith(`${id} `) || heading.startsWith(`${id}—`);
		});
		return block !== undefined && parseReviewState(block).status === 'done';
	});
};
