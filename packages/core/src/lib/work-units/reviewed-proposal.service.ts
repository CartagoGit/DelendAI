/**
 * reviewed-proposal.service.ts — who reviews a proposal does not write it.
 *
 * A reviewer asked for changes on a proposal and then entered an
 * `implement` unit on it and made them. The next verdict on that work was
 * its own: the independence a review exists for was gone, and nothing on
 * the way in had asked who the agent already was to that proposal.
 *
 * The answer is in the document. Every slice a reviewer claimed or judged
 * carries its name, and the document on the integration branch is the one
 * every agent sees. The refusal is for the slice it judged: an agent that
 * reviewed a co-author's slice still finishes its own.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { readWorkspaceDocsDir } from './development-policy.service';
import { derivedTopic } from './unit-topic.service';
import { integrationBase, readGit, refused } from './work-unit-shared.service';

/** The line a slice carries for the agent that claimed or judged it. */
const REVIEWER_LINE = /^\s*-\s*review-reviewer:\s*(?<agent>\S+)\s*$/u;

/** The letters and digits of an identity, in one case. */
const lettersOf = (agent: string): string =>
	agent.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');

/** The agents named as reviewer anywhere in a proposal document. */
export const reviewersIn = (document: string): readonly string[] => [
	...new Set(
		document
			.split('\n')
			.map((line) => REVIEWER_LINE.exec(line)?.groups?.agent)
			.filter((agent): agent is string => agent !== undefined),
	),
];

/**
 * The spelling under which `agent` reviews this proposal, or `undefined`
 * when it does not. Compared by letters and digits: a reviewer that signs
 * `MiniMax-M3` is the implementer that signs `minimax-m3`.
 */
export const reviewerNamed = (
	document: string,
	agent: string,
): string | undefined => {
	const letters = lettersOf(agent);
	return reviewersIn(document).find(
		(reviewer) => lettersOf(reviewer) === letters,
	);
};

/** A slice heading, `### S3 — …`, and the id it names. */
const SLICE_HEADING = /^###\s+(?<slice>\S+)/u;

/**
 * The part of a proposal document that belongs to `slice`: from its
 * heading to the next heading of the same or a higher level. A slice the
 * document does not have, and the whole proposal (`all`, or no slice),
 * answer with the whole document.
 */
export const sliceSectionOf = (
	document: string,
	slice: string | undefined,
): string => {
	if (slice === undefined || slice === 'all') return document;
	const lines = document.split('\n');
	const start = lines.findIndex(
		(line) => SLICE_HEADING.exec(line)?.groups?.slice === slice,
	);
	if (start === -1) return document;
	const after = lines
		.slice(start + 1)
		.findIndex((line) => /^#{1,3}\s/u.test(line));
	return lines
		.slice(start, after === -1 ? undefined : start + 1 + after)
		.join('\n');
};

/** What a reviewer entering an implementation of its own review is told. */
export const describeReviewedProposal = (
	proposal: string,
	reviewer: string,
): string =>
	`\`${reviewer}\` is a reviewer of ${proposal}: the changes it asked for are another agent's to make, or the next verdict on them is its own. Record the verdict (request_changes names what is missing) and take other work; the implementer, or any agent that has not reviewed ${proposal}, makes the change.`;

/** Where a proposal's document is on the integration branch, if it has one. */
export const integratedDocumentPathOf = (input: {
	readonly root: string;
	readonly base: string;
	readonly docsDir: string;
	readonly proposal: string;
}): string | undefined =>
	(
		readGit(input.root, [
			'ls-tree',
			'-r',
			'--name-only',
			input.base,
			'--',
			input.docsDir,
		]) ?? ''
	)
		.split('\n')
		.find((file) =>
			(file.split('/').at(-1) ?? '').startsWith(`${input.proposal}-`),
		);

/**
 * The proposal's document as the integration branch has it, or `undefined`
 * when the branch has none: a proposal not yet written has no reviewer.
 */
export const integratedDocumentOf = (input: {
	readonly root: string;
	readonly base: string;
	readonly docsDir: string;
	readonly proposal: string;
}): string | undefined => {
	const path = integratedDocumentPathOf(input);
	return path === undefined
		? undefined
		: readGit(input.root, ['show', `${input.base}:${path}`]);
};

/**
 * The refusal an agent gets for implementing a proposal it reviews, or
 * `undefined`: any other kind of unit, and any other agent, goes in.
 */
export const reviewedByEntrant = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	args: readonly string[],
	agent: string,
	proposal: string,
): Promise<IWorkUnitResult | undefined> => {
	if ((scalarArg(args, 'kind') ?? 'implement') !== 'implement') {
		return undefined;
	}
	const base = integrationBase(root, policy);
	if (base === undefined) return undefined;
	const document = integratedDocumentOf({
		root,
		base,
		docsDir: await readWorkspaceDocsDir(root),
		proposal,
	});
	// Independence is per slice, the way the verdict enforces it: the
	// reviewer of S1 may not write S1, and may still finish the slice it
	// implemented itself. Entering the whole proposal answers for all.
	const reviewer =
		document === undefined
			? undefined
			: reviewerNamed(
					sliceSectionOf(document, scalarArg(args, 'slice')),
					agent,
				);
	return reviewer === undefined
		? undefined
		: refused(
				`${proposal} is under this agent's review: a reviewer does not implement what it reviews.`,
				describeReviewedProposal(proposal, reviewer),
			);
};

/**
 * The topic of a unit about to be created with none given: derived from
 * what the unit is, never the same word for every unit.
 */
export const topicForNewUnit = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	args: readonly string[],
	proposal: string,
): Promise<string> => {
	const base = integrationBase(root, policy);
	return derivedTopic({
		kind: scalarArg(args, 'kind') ?? 'implement',
		proposal,
		documentPath:
			base === undefined
				? undefined
				: integratedDocumentPathOf({
						root,
						base,
						docsDir: await readWorkspaceDocsDir(root),
						proposal,
					}),
	});
};
