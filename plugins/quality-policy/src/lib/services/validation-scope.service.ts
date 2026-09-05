/**
 * validation-scope.service.ts — f00506 S3.
 *
 * How much to validate, derived from what actually changed.
 *
 * S1 stopped re-proving what was already proved and S2 stopped three
 * agents proving it at once. Both make the same run cheaper. This asks
 * the question underneath: does the run need to be that big at all?
 *
 * The default in most repositories is to run everything, because
 * everything is the only scope nobody has to defend. It is also the one
 * that takes the compute lock for minutes while other agents wait, on
 * every change, including the one-line ones. Narrowing it is worth real
 * time — but only if narrowing is safe, and safety here is not a
 * judgement call.
 *
 * ## Hard boundaries are not negotiable against the graph
 *
 * A change to a public contract, a security path, a release artefact or
 * `main` gets the full suite no matter how small the impact graph says
 * it is. The reason is that the graph describes what it can see, and
 * these are precisely the changes whose blast radius escapes it —
 * a public export is consumed by code that is not in this repository at
 * all, and no local analysis can enumerate those consumers. Treating
 * the graph as authoritative there would be trusting it about the one
 * thing it cannot know.
 *
 * ## Not widening is a decision too, and it needs the same evidence
 *
 * The symmetric rule, and the one that saves the time. When the graph
 * shows that widening the scope adds no covered file, widening buys
 * nothing but minutes — and doing it anyway is not caution, it is
 * ceremony. So the decision records what it chose, why, and what
 * evidence it rested on, in terms an operator can check against the
 * tree afterwards.
 */

export type TValidationScope = 'targeted' | 'affected' | 'full';

/** Where a change lands. Used only for the hard boundaries. */
export type TChangeBoundary =
	| 'public-contract'
	| 'security'
	| 'release'
	| 'main-branch'
	| 'generated-output'
	| 'ordinary';

export interface IImpactGraph {
	/** Files the change touches directly. */
	readonly changedFiles: readonly string[];
	/** Files that import, directly or transitively, from the changed set. */
	readonly dependentFiles: readonly string[];
	/** Workspace packages containing any of the above. */
	readonly affectedPackages: readonly string[];
	/** Specs that cover the changed and dependent files. */
	readonly coveringTests: readonly string[];
	/**
	 * Specs that exist beyond the covering set. Comparing these is what
	 * decides whether widening would actually add coverage.
	 */
	readonly totalTests: number;
	/** True when the graph could not be resolved and is not to be trusted. */
	readonly incomplete?: boolean | undefined;
}

export interface IScopeDecision {
	readonly scope: TValidationScope;
	readonly reason: string;
	/** The boundary that forced this, when one did. */
	readonly forcedBy?: TChangeBoundary | undefined;
	/** Checkable afterwards: what the decision rested on. */
	readonly evidence: {
		readonly changedFiles: number;
		readonly dependentFiles: number;
		readonly affectedPackages: readonly string[];
		readonly coveringTests: number;
		readonly totalTests: number;
	};
}

/** Boundaries whose blast radius the local graph cannot enumerate. */
const FULL_SUITE_BOUNDARIES: ReadonlySet<TChangeBoundary> = new Set([
	'public-contract',
	'security',
	'release',
	'main-branch',
]);

const BOUNDARY_REASON: Readonly<Record<TChangeBoundary, string>> = {
	'public-contract':
		'a public contract changed, and its consumers are outside this repository where no local graph can find them',
	security:
		'a security path changed, where the cost of an unnoticed regression is not proportional to the size of the diff',
	release:
		'a release artefact changed, and it is the one thing that cannot be fixed after the fact',
	'main-branch':
		'the change targets main, which is the release boundary rather than a shared journal',
	'generated-output':
		'generated output changed, so the generators and their consumers both need checking',
	ordinary: 'no hard boundary applies',
};

/** Single package, nothing else depends on it: the narrowest honest scope. */
const isSelfContained = (graph: IImpactGraph): boolean =>
	graph.affectedPackages.length <= 1 && graph.dependentFiles.length === 0;

/**
 * Whether widening from `affected` to `full` would cover anything more.
 *
 * If every spec in the repository is already in the covering set, `full`
 * runs exactly the same tests under a more expensive name.
 */
export const wideningAddsCoverage = (graph: IImpactGraph): boolean =>
	graph.coveringTests.length < graph.totalTests;

export const decideValidationScope = (
	graph: IImpactGraph,
	boundary: TChangeBoundary = 'ordinary',
): IScopeDecision => {
	const evidence = {
		changedFiles: graph.changedFiles.length,
		dependentFiles: graph.dependentFiles.length,
		affectedPackages: [...graph.affectedPackages],
		coveringTests: graph.coveringTests.length,
		totalTests: graph.totalTests,
	};

	if (FULL_SUITE_BOUNDARIES.has(boundary)) {
		return {
			scope: 'full',
			forcedBy: boundary,
			reason: `${BOUNDARY_REASON[boundary]}; the impact graph does not get a vote here`,
			evidence,
		};
	}

	if (graph.incomplete === true) {
		// An unresolved graph is not evidence of a small blast radius. It
		// is the absence of evidence, and the safe reading of absence is
		// the expensive one.
		return {
			scope: 'full',
			reason: 'the impact graph could not be resolved, and an unresolved graph is not evidence that the change is small',
			evidence,
		};
	}

	if (graph.changedFiles.length === 0) {
		return {
			scope: 'targeted',
			reason: 'nothing changed, so there is nothing to re-prove',
			evidence,
		};
	}

	if (boundary === 'generated-output') {
		return {
			scope: 'affected',
			forcedBy: boundary,
			reason: `${BOUNDARY_REASON['generated-output']}, which is wider than the change but narrower than everything`,
			evidence,
		};
	}

	if (isSelfContained(graph)) {
		return {
			scope: 'targeted',
			reason: `the change is confined to ${evidence.affectedPackages[0] ?? 'one package'} with nothing depending on it, so its covering tests are the whole blast radius`,
			evidence,
		};
	}

	if (!wideningAddsCoverage(graph)) {
		// Not caution, ceremony: the same tests under a costlier name.
		return {
			scope: 'affected',
			reason: `the ${graph.coveringTests.length.toString()} covering tests are already every test there is, so widening to the full suite would run the same tests and cost more`,
			evidence,
		};
	}

	return {
		scope: 'affected',
		reason: `${evidence.dependentFiles.toString()} file(s) across ${evidence.affectedPackages.length.toString()} package(s) depend on the change, so its own tests are not the whole blast radius`,
		evidence,
	};
};
