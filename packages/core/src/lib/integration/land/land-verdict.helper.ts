/**
 * land-verdict.helper.ts — what `land` leaves on the forge for a verdict: a
 * label and a comment for the author, and a red batch closed. Each step
 * checks what is already there, so a pass that died between two of them is
 * finished by the next.
 */
import { LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE } from './land.constant';
import { attributeCulprit } from '../decisions/culprit.helper';
import { batchBody } from './land-batch-record.helper';
import type {
	ILandBatchRecord,
	ILandCheck,
	ILandDeps,
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

/**
 * Write the verdict of a red batch into its record: the culprit when the
 * failing sections and specs name one member, else every suspect.
 */
export const markRedBatch = async (input: {
	readonly deps: ILandDeps;
	readonly batch: ILandPullRequest;
	readonly record: ILandBatchRecord;
	readonly checks: readonly ILandCheck[];
	readonly note: (line: string) => void;
}): Promise<ILandBatchRecord> => {
	const { deps, batch, record, checks, note } = input;
	const { forge, git } = deps;
	const failing = checks.filter((c) => FAILED.has(c.conclusion ?? ''));
	const open: ILandPullRequest[] = [];
	for (const member of record.members) {
		const pr = await forge.pullRequest(member.number);
		if (pr.state === 'open' && pr.headSha === member.sha) open.push(pr);
	}
	const attribution =
		open.length === 1
			? { culprit: open[0]?.number, suspects: [open[0]?.number ?? 0] }
			: attributeCulprit({
					failingZones: new Set(
						failing.flatMap(
							(c) => deps.config.sectionOfCheck(c.name) ?? [],
						),
					),
					failingSpecs: new Set(
						failing.flatMap((c) => c.failingSpecs ?? []),
					),
					members: open.map((pr) => ({
						number: pr.number,
						own: git.footprint(pr),
					})),
				});
	// A failure no check section or spec ties to anyone is every member's.
	const suspects =
		attribution.suspects.length > 0
			? attribution.suspects
			: open.map((pr) => pr.number);
	const red: ILandBatchRecord = {
		...record,
		red: {
			...(attribution.culprit === undefined
				? {}
				: { culprit: attribution.culprit }),
			suspects,
		},
	};
	// The verdict is written first: a pass that dies after it finishes
	// the labelling and the closing from this record.
	await forge.updatePullRequest(batch.number, batchBody(red, new Map()));
	note(
		`batch #${String(batch.number)} is red: ${attribution.culprit === undefined ? `no single owner, suspects ${suspects.join(',')}` : `culprit #${String(attribution.culprit)}`}`,
	);
	return red;
};
