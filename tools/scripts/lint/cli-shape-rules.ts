/**
 * cli-shape-rules.ts — f00049 S10 / SOLID refactor.
 *
 * Each CLI shape rule is a small strategy implementing
 * `IShapeRule.evaluate(name)`. New rules are added by appending to the
 * list — no edit to the composer (open/closed).
 *
 * SRP — every rule has one concern:
 *   - CamelCaseRule         → flags mid-string uppercase (e.g. `autoWork`)
 *   - FlatLongActionRule    → flags long single-word flat names (`autowork`)
 *   - MissingActionRule     → flags single-token names (only top-level
 *                              exempt commands pass)
 *   - BadNamespaceRule      → flags non-kebab namespace tokens
 *
 * DIP — the composer depends on the `IShapeRule` interface; tests can
 * inject a fake rule without touching the lint engine.
 */

export type ShapeRuleId =
	| 'camelcase-action'
	| 'flat-action'
	| 'missing-action'
	| 'bad-namespace';

export interface IShapeFinding {
	readonly rule: ShapeRuleId;
	readonly action: string;
	readonly namespace: string;
}

export interface IShapeRule {
	readonly id: ShapeRuleId;
	readonly evaluate: (parsed: IParsedName) => IShapeFinding | null;
}

/** A name split into `<namespace> <action...>`. `namespace` may be
 *  empty (single-token, e.g. `version`). `action` is the second token,
 *  or empty when `missing-action` applies. */
export interface IParsedName {
	readonly raw: string;
	readonly tokens: readonly string[];
	readonly namespace: string;
	readonly action: string;
}

const KEBAB_CASE_RE = /^[a-z]+(-[a-z]+)*$/;

/** mid-string uppercase → camelCase drift. */
export const CamelCaseRule: IShapeRule = {
	id: 'camelcase-action',
	evaluate: (parsed) =>
		/[a-z][A-Z]/.test(parsed.action)
			? {
					rule: 'camelcase-action',
					action: parsed.action,
					namespace: parsed.namespace,
				}
			: null,
};

/** long single-word flat names (`autowork`, `statusmarker`). Single-
 *  word names ≤ 8 chars (`status`, `save`, `diff`, `close`) are fine. */
export const FlatLongActionRule: IShapeRule = {
	id: 'flat-action',
	evaluate: (parsed) =>
		/^[a-z]+$/.test(parsed.action) && parsed.action.length > 8
			? {
					rule: 'flat-action',
					action: parsed.action,
					namespace: parsed.namespace,
				}
			: null,
};

/** Names that have only one token (or none). Top-level commands
 *  (`completion`, `version`, `help`) are filtered out by the caller
 *  before this rule sees them. */
export const MissingActionRule: IShapeRule = {
	id: 'missing-action',
	evaluate: (parsed) =>
		parsed.tokens.length < 2 || parsed.action === ''
			? {
					rule: 'missing-action',
					action: parsed.action,
					namespace: parsed.namespace,
				}
			: null,
};

/** Namespaces must be kebab-case. `git`, `audit`, `memory` are flat
 *  lowercase — also allowed by the same regex. */
export const BadNamespaceRule: IShapeRule = {
	id: 'bad-namespace',
	evaluate: (parsed) =>
		parsed.namespace !== '' && !KEBAB_CASE_RE.test(parsed.namespace)
			? {
					rule: 'bad-namespace',
					action: parsed.action,
					namespace: parsed.namespace,
				}
			: null,
};

/** Default rule set, ordered by perceived severity (most actionable first). */
export const DEFAULT_CLI_SHAPE_RULES: readonly IShapeRule[] = [
	CamelCaseRule,
	FlatLongActionRule,
	MissingActionRule,
	BadNamespaceRule,
];

/**
 * Parse a command name (`"git status"`, `"web-fetch"`, `"doctor"`)
 * into its tokens. Whitespace separator; the caller decides whether
 * single-token names are valid (e.g. top-level commands exempt).
 */
export const parseShapeName = (name: string): IParsedName => {
	const tokens = name.split(/\s+/).filter((t) => t.length > 0);
	return {
		raw: name,
		tokens,
		namespace: tokens[0] ?? '',
		action: tokens[1] ?? '',
	};
};
