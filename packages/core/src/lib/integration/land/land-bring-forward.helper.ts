/**
 * land-bring-forward.helper.ts — a head the forge did not build is brought
 * forward once, by the integrator, and a derived-file conflict is resolved
 * by two jobs: a tokenless one that merges and regenerates, a second one
 * that holds the token and only pushes what the first built.
 *
 * The two phases are plain functions over ports, so the jobs that run them
 * and the specs share one decision: nothing outside the project's derived
 * paths ever reaches the branch, and a head that moved is never overwritten.
 */
import type {
	IDerivedPreparation,
	IDerivedPreparePorts,
	IDerivedPush,
	IDerivedPushPorts,
	ILandBringResult,
	ILandCheck,
	ILandDeps,
	ILandPullRequest,
} from './land.interface';
import { BRING_NOTES } from './land.constant';

/**
 * Whether the forge never built this head: a run left at `action_required`,
 * or no run at all on a head an actor pushed whose pushes start none. A
 * fresh head from a person with no run yet is only waiting.
 */
export const headNotBuilt = (
	pr: ILandPullRequest,
	checks: readonly ILandCheck[],
	unbuiltAuthors: readonly string[],
): boolean =>
	checks.some((check) => check.conclusion === 'action_required') ||
	(checks.length === 0 &&
		pr.headAuthor !== undefined &&
		unbuiltAuthors.includes(pr.headAuthor));

/** The changed paths a derived resolution may not touch. */
export const outsideDerived = (
	changed: readonly string[],
	derivedPaths: readonly string[],
): readonly string[] =>
	changed.filter(
		(path) =>
			!derivedPaths.some(
				(derived) =>
					path === derived ||
					(derived.endsWith('/') && path.startsWith(derived)),
			),
	);

/** First job: merge, regenerate, and refuse any change outside `derived.paths`. */
export const prepareDerived = (input: {
	readonly ports: IDerivedPreparePorts;
	readonly derivedPaths: readonly string[];
	readonly base: string;
}): IDerivedPreparation => {
	const { ports, derivedPaths, base } = input;
	if (ports.merge() === 'conflict') return { kind: 'conflict' };
	if (!ports.regenerate())
		return { kind: 'failed', reason: 'the derived command failed' };
	const { sha, changed } = ports.result();
	// `changed` is what the regeneration commit changed over the merge.
	const outside = outsideDerived(changed, derivedPaths);
	return outside.length > 0
		? { kind: 'refused', outside }
		: { kind: 'ready', sha, base };
};

/** Second job: push what was prepared, nothing if the head moved or the paths are wrong. */
export const pushDerived = (input: {
	readonly ports: IDerivedPushPorts;
	readonly prepared: Extract<IDerivedPreparation, { kind: 'ready' }>;
	readonly expectedHead: string;
	readonly derivedPaths: readonly string[];
}): IDerivedPush => {
	const { ports, prepared, expectedHead, derivedPaths } = input;
	if (ports.headNow() !== expectedHead) return 'head-moved';
	if (outsideDerived(ports.changedBy(prepared.sha), derivedPaths).length > 0)
		return 'refused';
	return ports.push(prepared.sha) ? 'pushed' : 'declined';
};

/**
 * One pass's handling of a head nobody built: brought forward when the
 * integrator may push; when the head already holds the tip, the pull
 * request is reopened by the integrator (once per head) so the forge builds
 * it as it is; otherwise `skipped` and left to its author. A
 * cross-repository head is never touched.
 */
export const bringForwardUnbuilt = async (input: {
	readonly deps: ILandDeps;
	readonly pr: ILandPullRequest;
	readonly tip: string;
}): Promise<ILandBringResult> => {
	const { deps, pr, tip } = input;
	if (pr.crossRepository === true || deps.bringForward === undefined)
		return 'skipped';
	const forward = await deps.bringForward(pr, tip);
	if (forward !== 'current') return forward;
	return (await deps.forge.reopenPullRequest(pr.number, pr.headSha))
		? 'reopened'
		: 'skipped';
};

const BRING_DETAILS: Readonly<Record<ILandBringResult, string>> = {
	brought: 'brought forward, the new head is built',
	reopened: 'the identity reopened it, which starts its CI on this head',
	moved: 'the head moved, the next pass reads it again',
	conflict: 'the tip conflicts with the head',
	skipped: 'nothing was done to it',
};

/** What the pass log says of a head nobody built: the bring-forward result and what it means. */
export const bringForwardReason = (result: ILandBringResult): string =>
	`bring-forward ${result}: ${BRING_DETAILS[result]}`;

/** A head nobody built: bring it forward or reopen it, log the result, and ask its author when nothing built it. */
export const settleUnbuilt = async (input: {
	readonly deps: ILandDeps;
	readonly pr: ILandPullRequest;
	readonly tip: string;
	readonly waits: string;
	readonly report: {
		readonly why: (number: number, reason: string) => void;
		readonly note: (line: string) => void;
		readonly needsUpdate: (pr: ILandPullRequest, reason: string) => void;
	};
}): Promise<void> => {
	const { pr, waits, report } = input;
	const result = await bringForwardUnbuilt(input);
	report.why(pr.number, `${waits}; ${bringForwardReason(result)}`);
	if (result === 'brought' || result === 'reopened')
		report.note(`#${String(pr.number)} ${BRING_NOTES[result]}`);
	else if (pr.crossRepository === true)
		report.why(
			pr.number,
			'a cross-repository head is never built or pushed by the integrator',
		);
	else report.needsUpdate(pr, waits);
};
