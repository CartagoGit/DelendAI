/**
 * The layer graph: which part of this repository may import which.
 *
 * Every edge here is DERIVED from a lint that already enforces it. The
 * graph is a reading of the rules, not a second opinion: when it and a
 * lint disagree, the disagreement is a gap to report, never a rule to
 * invent. That is why each rule carries the id of its enforcer — a
 * declaration nothing checks is a comment, and this repository has
 * enough of those.
 */

/** A named region of the repository, identified by path prefix. */
export interface ILayer {
	/** Stable identifier used by edges and reports. */
	readonly id: string;
	/** Repo-relative path prefixes that belong to this layer. */
	readonly prefixes: readonly string[];
	/** What the layer is for, in one line. */
	readonly summary: string;
}

/**
 * One import rule, and the lint that makes it true.
 *
 * `enforcedBy` is the `lint:*` script name. `unenforced` marks a rule
 * that is real but that nothing checks yet: it is reported as a gap
 * rather than quietly presented as a guarantee.
 */
export interface ILayerRule {
	/** Layer the importing file belongs to. */
	readonly from: string;
	/** What it may not import, described in the lint's own terms. */
	readonly forbids: string;
	/** `lint:*` script that fails when this rule is broken. */
	readonly enforcedBy: string;
	/** Why the rule exists, for the agent that just tripped it. */
	readonly because: string;
	/**
	 * The detector that reproduces the enforcing lint, used by the
	 * architecture report. Each lint has its own scope, comment handling
	 * and matching, so a generic predicate could not agree with all of
	 * them; a detector ports one lint and a parity spec holds it to that
	 * lint's own finder. The prose above is never parsed.
	 */
	readonly detector: IImportDetectorId;
	/** True when no lint enforces this rule today. */
	readonly unenforced?: boolean;
}

/** One detector per enforcing lint, named after the lint script. */
export type IImportDetectorId =
	| 'no-node-imports-in-contracts'
	| 'no-node-imports-in-state'
	| 'no-core-public-types-in-client'
	| 'no-internal-core-imports'
	| 'no-absolute-local-imports';

/** A forbidden import a detector found. */
export interface IImportHit {
	readonly line: number;
	readonly specifier: string;
}

/** Reproduces one lint: which files it reads, and what it flags in them. */
export interface IImportDetector {
	readonly id: IImportDetectorId;
	/** Whether the lint reads this repo-relative path at all. */
	inScope(relPath: string): boolean;
	/** The lint's findings in one file's text. */
	detect(text: string): readonly IImportHit[];
}

export interface ILayerGraph {
	readonly layers: readonly ILayer[];
	readonly rules: readonly ILayerRule[];
}

/** A rule whose enforcer could not be found in `package.json`. */
export interface ILayerGraphGap {
	readonly rule: ILayerRule;
	readonly reason: 'no-such-lint' | 'declared-unenforced';
}
