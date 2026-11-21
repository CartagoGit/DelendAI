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
import type {
	IMovedProposalPorts,
	IMovedProposalRefresh,
} from './land-moved-proposal.interface';
import { BRING_NOTES } from './land.constant';

/**
 * Whether the forge never built this head: a run left at `action_required`,
 * or an actor whose pushes start no CI pushed it and none of the required
 * checks reported on it (a third-party check does not make it built). A
 * fresh head from a person with no run yet is only waiting.
 */
export const headNotBuilt = (
	pr: ILandPullRequest,
	checks: readonly ILandCheck[],
	unbuiltAuthors: readonly string[],
	required: readonly string[],
): boolean =>
	checks.some((check) => check.conclusion === 'action_required') ||
	(pr.headAuthor !== undefined &&
		unbuiltAuthors.includes(pr.headAuthor) &&
		!required.some((name) => checks.some((check) => check.name === name)));

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
	// Already reopened for this head: nothing more the integrator can do.
	return (await deps.forge.reopenPullRequest(pr.number, pr.headSha))
		? 'reopened'
		: 'current';
};

const BRING_DETAILS: Readonly<Record<ILandBringResult, string>> = {
	brought: 'brought forward, the new head is built',
	reopened: 'the identity reopened it, which starts its CI on this head',
	moved: 'the head moved, the next pass reads it again',
	conflict: 'the tip conflicts with the head',
	current:
		'the head holds the tip and was already reopened: its author is asked',
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

/** A stale head that merges cleanly where no batch can be pushed: brought forward, and why. */
export const staleCleanReason = async (input: {
	readonly deps: ILandDeps;
	readonly pr: ILandPullRequest;
	readonly tip: string;
}): Promise<string> =>
	`stale base, clean merge; ${bringForwardReason(await bringForwardUnbuilt(input))}`;

/** The one comment a publication gets when its moved proposal cannot be refreshed. */
export const movedProposalComment = (
	generation: number,
	paths: readonly string[],
): string =>
	`The integration branch edited ${paths.join(', ')}, which this publication moved, and the edit does not apply on its own. Re-enter the unit with \`work enter --generation ${String(generation)}\`, run \`git merge\` of the integration branch, resolve the proposal file and republish.`;

/**
 * A publication whose only conflict is a proposal file it moved while the
 * tip edited the old copy: the tip's edit is carried onto the moved copy and
 * the old copy removed. Anything else, or an edit that does not apply,
 * changes nothing and asks the author once.
 */
export const refreshMovedProposal = (input: {
	readonly ports: IMovedProposalPorts;
	readonly generation: number;
}): IMovedProposalRefresh => {
	const { ports, generation } = input;
	const ask = (paths: readonly string[]): IMovedProposalRefresh => ({
		kind: 'asked',
		comment: movedProposalComment(generation, paths),
	});
	if (ports.moves.length === 0 || ports.otherConflicts.length > 0)
		return ask([
			...ports.moves.map((move) => move.to),
			...ports.otherConflicts,
		]);
	const writes: { path: string; content: string }[] = [];
	for (const move of ports.moves) {
		const content = ports.mergeText(move.base, move.tip, move.moved);
		if (content === undefined) return ask([move.to]);
		writes.push({ path: move.to, content });
	}
	return {
		kind: 'carried',
		writes,
		removes: ports.moves.map((move) => move.from),
	};
};
