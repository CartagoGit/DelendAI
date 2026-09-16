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
	 * Machine-readable predicate used by the architecture report. The
	 * prose above remains the explanation shown to an agent; it is never
	 * parsed as a rule.
	 */
	readonly matcher: ILayerImportMatcher;
	/** True when no lint enforces this rule today. */
	readonly unenforced?: boolean;
}

/** Explicit import predicates supported by the architecture checker. */
export type ILayerImportMatcher =
	| {
			readonly kind: 'node-builtin';
			readonly importKind?: 'any' | 'type-only';
	  }
	| {
			readonly kind: 'module-name';
			/** Exact module names, including their `node:` spelling. */
			readonly names: readonly string[];
			readonly importKind?: 'any' | 'type-only';
	  }
	| {
			readonly kind: 'specifier-prefix';
			readonly prefixes: readonly string[];
			readonly importKind?: 'any' | 'type-only';
	  }
	| {
			readonly kind: 'absolute-specifier';
		}
	| {
			readonly kind: 'core-internal';
			readonly importKind?: 'any' | 'type-only';
		}
	| {
			readonly kind: 'any-of';
			readonly matchers: readonly ILayerImportMatcher[];
		};

export interface ILayerGraph {
	readonly layers: readonly ILayer[];
	readonly rules: readonly ILayerRule[];
}

/** A rule whose enforcer could not be found in `package.json`. */
export interface ILayerGraphGap {
	readonly rule: ILayerRule;
	readonly reason: 'no-such-lint' | 'declared-unenforced';
}
