/**
 * land-authored-conflict.helper.ts — a head that conflicts with the tip in
 * files its author changed: first the integrator tries the one conflict it
 * can settle itself (a proposal file the head moved while the tip edited
 * the old copy), else the author is asked, once per head.
 */
import { conflictReason } from './land-labels.helper';
import type { ILandDeps, ILandPullRequest } from './land.interface';

/** Settle the authored conflict of `pr`: refresh a moved proposal, else ask for an update. */
export const settleAuthored = async (input: {
	readonly deps: ILandDeps;
	readonly pr: ILandPullRequest;
	readonly tip: string;
	readonly report: {
		readonly why: (number: number, reason: string) => void;
		readonly needsUpdate: (pr: ILandPullRequest, reason: string) => void;
	};
}): Promise<void> => {
	const { deps, pr, tip, report } = input;
	const refreshed =
		pr.crossRepository === true || deps.refreshMoved === undefined
			? undefined
			: await deps.refreshMoved(pr, tip);
	if (refreshed?.kind === 'brought') {
		report.why(
			pr.number,
			'a moved proposal refreshed with the tip, pushed: the forge builds the new head',
		);
		return;
	}
	if (refreshed?.kind === 'moved') {
		report.why(
			pr.number,
			'the head moved while it was refreshed: read again',
		);
		return;
	}
	const reason =
		refreshed?.kind === 'asked'
			? refreshed.comment
			: conflictReason(deps.git, pr, tip);
	report.why(pr.number, `needs update: ${reason}`);
	report.needsUpdate(pr, reason);
};
