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
} from '../contracts/interfaces/review-attribution.interface';

export type {
	IAttributeDeliveryInput,
	IAttributedApproverCheck,
	IReviewAttribution,
	IReviewAttributionResult,
} from '../contracts/interfaces/review-attribution.interface';

const MERGE_SUBJECT_RE = /^Merge pull request #\d+ from [^/\s]+\/(\S+)$/u;

/** Segments a publication ref carries after its prefix: agent/unit/topic. */
const AGENT_REF_SEGMENTS = 3;

/**
 * The agent a pull-request merge subject names, or `undefined`.
 *
 * `delendai/pr/claude-opus-5/x00568-S1-g1/topic` names `claude-opus-5`;
 * an older `delendai/pr/x00566-topic` names nobody — guessing an agent
 * out of a topic would be inventing one.
 */
export const agentFromMergeSubject = (
	subject: string,
	publicationRefPrefix: string,
): string | undefined => {
	const ref = MERGE_SUBJECT_RE.exec(subject.trim())?.[1];
	const prefix = publicationRefPrefix.endsWith('/')
		? publicationRefPrefix
		: `${publicationRefPrefix}/`;
	if (ref === undefined || !ref.startsWith(prefix)) return undefined;
	const segments = ref.slice(prefix.length).split('/');
	if (segments.length < AGENT_REF_SEGMENTS) return undefined;
	return segments[0] || undefined;
};

/** `Claude Opus 5.5 <noreply@…>` → `claude-opus-5-5`. */
export const agentFromTrailer = (trailer: string): string | undefined => {
	const name = trailer.replace(/<[^>]*>/u, '').trim();
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
	return slug.length > 0 ? slug : undefined;
};

const read = async (
	run: IGitRunner,
	args: readonly string[],
): Promise<string | undefined> => {
	const result = await run(args);
	return result.ok ? result.output : undefined;
};

/**
 * The merge on the integration branch's first-parent line that brought
 * the commit in.
 *
 * Containment is monotonic along that line — once a merge has the commit
 * in its history, every later one does too — so the delivering merge is
 * found by bisection rather than by asking about every merge.
 */
const deliveringMergeSubject = async (
	run: IGitRunner,
	commit: string,
	integration: string,
): Promise<string | undefined> => {
	const log = await read(run, [
		'log',
		'--first-parent',
		'--merges',
		'--reverse',
		'--format=%H %s',
		`${commit}..${integration}`,
	]);
	const merges = (log ?? '')
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.map((line) => ({
			sha: line.slice(0, line.indexOf(' ')),
			subject: line.slice(line.indexOf(' ') + 1),
		}));
	const contains = async (sha: string): Promise<boolean> =>
		(await run(['merge-base', '--is-ancestor', commit, sha])).ok;
	let low = 0;
	let high = merges.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const merge = merges[middle];
		if (merge !== undefined && (await contains(merge.sha))) high = middle;
		else low = middle + 1;
	}
	return merges[low]?.subject;
};

/** Establish, from Git alone, who delivered the commit a reviewer names. */
export const attributeDelivery = async (
	input: IAttributeDeliveryInput,
): Promise<IReviewAttributionResult> => {
	const hash = input.commitHash.trim();
	if (hash.length === 0) {
		return {
			ok: false,
			reason: 'no delivering commit was named',
			missing: 'commitHash: the commit that delivered this slice',
		};
	}
	if (!isCommitHash(hash)) {
		return {
			ok: false,
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
			reason: `commit ${commit} changes none of the slice's declared files and does not cite ${input.proposalId}`,
			missing: `a commit that delivered ${input.proposalId}: one that changes a declared file of the slice or cites the proposal id`,
		};
	}

	if (input.publicationRefPrefix !== undefined) {
		const subject = await deliveringMergeSubject(
			run,
			commit,
			input.integration,
		);
		const agent =
			subject === undefined
				? undefined
				: agentFromMergeSubject(subject, input.publicationRefPrefix);
		if (agent !== undefined && subject !== undefined) {
			return {
				ok: true,
				attribution: { commit, implementer: agent, source: subject },
			};
		}
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
				source: `Co-Authored-By: ${trailer}`,
			},
		};
	}
	return {
		ok: false,
		reason: `nothing in Git names who delivered ${commit}`,
		missing: `a pull-request merge into ${input.integration} from ${input.publicationRefPrefix ?? '<publication prefix>'}<agent>/<unit>/<topic>, or a Co-Authored-By trailer on ${commit}`,
	};
};

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
	`- review-attribution: ${attribution.implementer} from ${attribution.source} (${attribution.commit}), opened by ${openedBy}`;

/** Reviewer ≠ implementer, against the implementer Git named. */
export const checkAttributedApprover = (
	attribution: IReviewAttribution,
	approver: string,
): IAttributedApproverCheck =>
	attribution.implementer.trim().toLowerCase() ===
	approver.trim().toLowerCase()
		? {
				ok: false,
				reason: 'self-approve',
				nextAction: `Git attributes this delivery to "${attribution.implementer}" (${attribution.source}), so it cannot also approve it. Hand the review to a different agent.`,
			}
		: { ok: true };

/**
 * The frontmatter with `commit` in its `shipped-in` list. An approval's
 * evidence names the commit the reviewer verified; that is exactly the
 * evidence `review → done` asks for, so it is written where that gate
 * reads it instead of being asked for again.
 */
export const withShippedIn = (markdown: string, commit: string): string => {
	const yaml = extractYamlBlock(markdown);
	const raw =
		yaml === null
			? undefined
			: (parseFrontmatterBlock(yaml) as Record<string, unknown>)[
					'shipped-in'
				];
	const listed = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
		.map((value) => String(value).split('#')[0]?.trim() ?? '')
		.filter((value) => value.length > 0);
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
