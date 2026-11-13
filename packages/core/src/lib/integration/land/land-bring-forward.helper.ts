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
	ILandCheck,
	ILandDeps,
	ILandForward,
	ILandPullRequest,
} from './land.interface';

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
 * integrator may push, otherwise `skipped` and left to its author. A
 * cross-repository head is never touched.
 */
export const bringForwardUnbuilt = async (input: {
	readonly deps: ILandDeps;
	readonly pr: ILandPullRequest;
	readonly tip: string;
}): Promise<ILandForward | 'skipped'> => {
	const { deps, pr, tip } = input;
	if (pr.crossRepository === true || deps.bringForward === undefined)
		return 'skipped';
	return deps.bringForward(pr, tip);
};
