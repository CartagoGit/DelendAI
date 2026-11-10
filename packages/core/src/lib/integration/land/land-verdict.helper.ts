/**
 * land-verdict.helper.ts — what `land` leaves on the forge for a verdict: a
 * label and a comment for the author, and a red batch closed. Each step
 * checks what is already there, so a pass that died between two of them is
 * finished by the next.
 */
import { LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE } from './land.constant';
import type {
	ILandBatchRecord,
	ILandCheck,
	ILandForge,
	ILandPullRequest,
} from './land.interface';

const FAILED = new Set(['failure', 'timed_out']);

/** Label an authored-code conflict for its author, once. */
export const labelNeedsUpdate = async (
	forge: ILandForge,
	pr: ILandPullRequest,
	why: string,
	note: (line: string) => void,
): Promise<void> => {
	if (pr.labels.includes(LAND_LABEL_NEEDS_UPDATE)) return;
	await forge.addLabel(pr.number, LAND_LABEL_NEEDS_UPDATE);
	await forge.comment(
		pr.number,
		`land: this pull request conflicts with the integration branch in authored code (${why}). Update it on your side and push; land picks it up on the next pass.`,
	);
	note(`#${String(pr.number)} needs update: ${why}`);
};

/** Label the culprit with the reason and the run link, then close the batch. */
export const closeRedBatch = async (
	forge: ILandForge,
	batch: ILandPullRequest,
	record: ILandBatchRecord,
	checks: readonly ILandCheck[],
): Promise<void> => {
	const culprit = record.red?.culprit;
	if (culprit !== undefined) {
		const pr = await forge.pullRequest(culprit);
		if (!pr.labels.includes(LAND_LABEL_CULPRIT)) {
			const run = checks.find((c) => FAILED.has(c.conclusion ?? ''));
			await forge.addLabel(culprit, LAND_LABEL_CULPRIT);
			await forge.comment(
				culprit,
				`land: batch #${String(batch.number)} went red and this pull request owns the failure (${run?.name ?? 'a failing check'}). Run: ${run?.url ?? batch.headRef}. Push a fix; it is batched again on a new head.`,
			);
		}
	}
	await forge.closePullRequest(batch.number);
};
