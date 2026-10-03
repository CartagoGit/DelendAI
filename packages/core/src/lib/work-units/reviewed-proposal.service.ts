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
 * every agent sees.
 */
import { readGit } from './work-unit-shared.service';

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

/** What a reviewer entering an implementation of its own review is told. */
export const describeReviewedProposal = (
	proposal: string,
	reviewer: string,
): string =>
	`\`${reviewer}\` is a reviewer of ${proposal}: the changes it asked for are another agent's to make, or the next verdict on them is its own. Record the verdict (request_changes names what is missing) and take other work; the implementer, or any agent that has not reviewed ${proposal}, makes the change.`;

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
	const path = (
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
	return path === undefined
		? undefined
		: readGit(input.root, ['show', `${input.base}:${path}`]);
};
