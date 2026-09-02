/**
 * repair-mode.ts — q00013 S4.
 *
 * Settlement drove the round into SETTLING. validate failed. The
 * repair agent's job: turn the failing-files list into a single
 * `repair:` proposal whose `Files:` are exactly those files (and
 * nothing else). Positive ownership applies (f00417); the slice
 * resolver will reject anything that does not resolve canonically.
 *
 * This module does NOT make the proposal; it produces the body
 * text the auto-work pipeline can feed into the standard author
 * tool. The proposal gets `kind: repair` so the workflow treats
 * it with the right conventional commit type.
 */

import type { IProposalKind } from '../contracts/constants/proposal-glossary.constant';

export interface IRepairDraftInput {
	readonly failingFiles: readonly string[];
	readonly lastError: string;
	readonly headSha: string;
	readonly proposer: string;
	readonly agentId: string;
	readonly taskId: string;
	readonly nowIso: string;
}

export interface IRepairDraft {
	readonly id: string;
	readonly kind: IProposalKind;
	readonly title: string;
	readonly bodyMarkdown: string;
}

const shortSha = (sha: string): string => sha.slice(0, 7);

const toMarkdownList = (files: readonly string[]): string =>
	files.map((f) => `- ${f}`).join('\n');

/**
 * Build a repair proposal body that is single-purpose, owned and
 * `Files:`-constrained. The slice resolver's classification pass
 * will keep any path that already looks canonical; non-canonical
 * entries (markdown link, "(or equivalent)", glob) become WARN
 * unresolved entries but never block the commit.
 */
export const buildRepairDraft = (input: IRepairDraftInput): IRepairDraft => {
	const heading = `# Repair — settlement round failed at ${shortSha(input.headSha)}`;
	const summary = `validate failed during settlement at HEAD ${input.headSha}. Failing files: ${input.failingFiles.length}.`;
	const errorBlock = `## Last error\n\n\`\`\`\n${input.lastError.slice(0, 1500)}\n\`\`\``;
	const filesBlock = `## Files\n\n${toMarkdownList(input.failingFiles)}`;
	const audit = `## Audit\n\n- proposer: ${input.proposer}\n- agent: ${input.agentId}\n- task: ${input.taskId}\n- settlement.lastGreenHead: ${shortSha(input.headSha)}\n- detectedAt: ${input.nowIso}`;
	return {
		id: 'pending', // the author tool assigns the next repair id
		kind: 'repair',
		title: `Repair settlement round at ${shortSha(input.headSha)}`,
		bodyMarkdown: [
			heading,
			'',
			summary,
			'',
			errorBlock,
			'',
			filesBlock,
			'',
			audit,
		].join('\n'),
	};
};
