/**
 * review-handoff.ts — handing a proposal to review opens its rounds
 * (x00643).
 *
 * Moving a proposal into `review/` used to open nothing: the reviewer
 * arrived to `nothing is in review`, and the implementer who could have
 * opened the rounds had already left. The one moment the implementer is
 * certainly present is the hand-off itself, so that is where the rounds
 * are opened, under the name of the agent making the move.
 *
 * Each slice goes through the same pure `submit` the review tool uses:
 * a slice with no round gets one, a slice whose changes were requested
 * is resubmitted (voiding any approval that predates the rework), and a
 * slice already in review or already approved is left exactly as it is.
 */
import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';
import { basename, dirname } from 'node:path';

import {
	parseReviewState,
	renderReviewLines,
	reviewTransition,
} from '../swarm/proposal-review';
import { parseProposalSlicePlan } from '../swarm/proposal-slice-plan';
import {
	recordReviewSubmitIdentity,
	type IReviewIdentityDeps,
} from './review-identity';

const REVIEW_LINE_RE =
	/^[-*]\s*review-(?:state|implementer|reviewer|log):.*$\n?/gmu;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const sliceBlockRe = (sliceId: string): RegExp =>
	new RegExp(
		`(^### ${escapeRegExp(sliceId)}\\s+—[^\\n]*\\n)([\\s\\S]*?)(?=^### |^## (?!#)|\\n*$(?![\\s\\S]))`,
		'mu',
	);

/** Open a round under `implementer` on every slice that needs one. */
export const openReviewRounds = async (input: {
	readonly docPathAbs: string;
	readonly proposalId: string;
	readonly implementer: string;
	readonly workspaceRoot: string;
	readonly identityDeps?: IReviewIdentityDeps;
}): Promise<readonly string[]> => {
	const opened: string[] = [];
	await withFileMutex(input.docPathAbs, async () => {
		const reader = new SafeWorkspaceReader(dirname(input.docPathAbs));
		let markdown = (await reader.readText(basename(input.docPathAbs)))
			.content;
		const plan = parseProposalSlicePlan(input.proposalId, markdown);
		for (const slice of plan?.slices ?? []) {
			const re = sliceBlockRe(slice.sliceId);
			const match = markdown.match(re);
			if (match === null) continue;
			const body = match[2] ?? '';
			const state = parseReviewState(body);
			if (state.status === 'in_review' || state.status === 'done')
				continue;
			const submitted = reviewTransition(
				state,
				'submit',
				input.implementer,
			);
			if (!submitted.ok || submitted.next === undefined) continue;
			const block = `${body.replace(REVIEW_LINE_RE, '').replace(/\s*$/u, '')}\n${renderReviewLines(submitted.next).join('\n')}\n`;
			markdown = markdown.replace(re, `${match[1]}${block}`);
			opened.push(slice.sliceId);
		}
		if (opened.length > 0)
			await writeFileAtomic(input.docPathAbs, markdown);
	});
	for (const sliceId of opened) {
		await recordReviewSubmitIdentity({
			workspaceRoot: input.workspaceRoot,
			proposalId: input.proposalId,
			sliceId,
			agent: input.implementer,
			...(input.identityDeps === undefined
				? {}
				: { deps: input.identityDeps }),
		});
	}
	return opened;
};
