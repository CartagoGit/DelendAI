/**
 * land-batch-draft.helper.ts — what an open batch does when a member turned
 * draft: before any member merged it is closed and rebuilt without it; once
 * one merged it finishes as opened.
 */
import type { ILandForge, ILandPullRequest } from './land.interface';

/** The verdict on an open batch's draft members: none, rebuild, or finish. */
const draftVerdict = (input: {
	readonly batch: number;
	readonly open: readonly ILandPullRequest[];
	readonly started: boolean;
}): { readonly action: 'none' | 'close' | 'finish'; readonly line: string } => {
	const names = input.open
		.filter((pr) => pr.draft)
		.map((pr) => `#${String(pr.number)}`);
	if (names.length === 0) return { action: 'none', line: '' };
	const head = `batch #${String(input.batch)} has a draft member (${names.join(', ')})`;
	return input.started
		? {
				action: 'finish',
				line: `${head} but a member already merged: the batch finishes as opened`,
			}
		: {
				action: 'close',
				line: `${head}: closed, rebuilt below without it`,
			};
};

/** Judge the draft members of an open batch, noting the verdict; true when the batch was closed. */
export const settleDrafts = async (input: {
	readonly forge: Pick<ILandForge, 'closePullRequest'>;
	readonly batch: ILandPullRequest;
	readonly open: readonly { readonly pr: ILandPullRequest }[];
	readonly started: boolean;
	readonly note: (line: string) => void;
}): Promise<boolean> => {
	const { forge, batch, open, started, note } = input;
	const verdict = draftVerdict({
		batch: batch.number,
		open: open.map(({ pr }) => pr),
		started,
	});
	if (verdict.action === 'none') return false;
	note(verdict.line);
	if (verdict.action !== 'close') return false;
	await forge.closePullRequest(batch.number);
	return true;
};
