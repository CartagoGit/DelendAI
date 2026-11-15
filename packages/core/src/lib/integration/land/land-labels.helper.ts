/**
 * land-labels.helper.ts — what `land` leaves as labels, reconciled once a
 * pass, after every pull request was judged.
 *
 * A label is a verdict that holds while its reason holds for the current
 * head. A pass therefore judges first, collecting the labels each pull
 * request WANTS, then applies the difference to what the forge shows:
 * nothing is removed before judging, so a label never flips off and on
 * within or across passes. A label goes only in the pass that judges the
 * new head clear. The author is told once per head and reason.
 */
import { LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE } from './land.constant';
import type { ILandForge, ILandPullRequest } from './land.interface';

/** The labels the integrator owns: only these are ever removed. */
const OWNED_LABELS = [LAND_LABEL_CULPRIT, LAND_LABEL_NEEDS_UPDATE] as const;

/** What the author is told when its pull request conflicts in authored code. */
export const needsUpdateComment = (why: string): string =>
	`land: this pull request cannot land as it is (${why}). Update it on your side and push; land picks it up on the next pass.`;

const markerOf = (label: string, headSha: string): string =>
	`<!-- land:${label}@${headSha} -->`;

/** Apply the difference between the wanted and the present labels of `pr`. */
export const reconcileLabels = async (input: {
	readonly forge: ILandForge;
	readonly pr: ILandPullRequest;
	/** Each wanted label with the comment that explains it (none: already said). */
	readonly wanted: ReadonlyMap<string, string | undefined>;
	readonly note: (line: string) => void;
}): Promise<void> => {
	const { forge, pr, wanted, note } = input;
	const { number, headSha } = pr;
	for (const [label, comment] of wanted) {
		if (!pr.labels.includes(label)) {
			await forge.addLabel(number, label);
			note(`#${String(number)} labelled ${label}`);
		}
		if (comment === undefined) continue;
		const marker = markerOf(label, headSha);
		const said = (await forge.comments(number)).some((text) =>
			text.includes(marker),
		);
		if (!said) await forge.comment(number, `${comment}\n${marker}`);
	}
	for (const label of OWNED_LABELS) {
		if (pr.labels.includes(label) && !wanted.has(label)) {
			await forge.removeLabel(number, label);
			note(`#${String(number)} is clear of ${label}`);
		}
	}
};
