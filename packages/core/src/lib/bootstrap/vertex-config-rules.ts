// vertex-config-rules: declarative table for "does the project's
// `mcp-vertex.config.json` declare custom plugin / validation
// config?".
//
// SOLID — Open/Closed. The previous `detectCustomVertexConfig`
// was an inline JSON parse in `analyze-project.ts` that hard-coded
// two paths (`plugins` keys, `validationMatrix.scopes` keys).
// Adding a new shape (e.g. `tools.<id>.options`) meant editing
// that body. The table form lets you add a new shape by
// appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// "vertex-config has custom bits" detection policy. The matcher
// is pure pipeline. The JSON is parsed once and the matcher
// traverses the parsed object via a tiny JSONPath helper so
// the table only declares **which path to look at and what
// counts as "non-empty"** — not how to parse JSON.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list.

/**
 * Tiny JSONPath helper for object navigation. Supports the subset
 * the table needs: `.foo.bar.baz`. Each segment must be a
 * property name; array indices / filters are out of scope (we
 * only need plain object navigation). Returns `undefined` when any
 * segment is missing or the value is not a plain object.
 */
const getByPath = (root: unknown, path: string): unknown => {
	let current: unknown = root;
	for (const segment of path.split('.')) {
		if (
			current === null ||
			typeof current !== 'object' ||
			Array.isArray(current)
		) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
		if (current === undefined) return undefined;
	}
	return current;
};

/**
 * A value is a "non-empty plain object" when it is a non-array
 * object with at least one own key. The original code used
 * `Object.keys(...).length > 0` after null/array guards — that's
 * what this helper captures, with a single call site.
 */
const isNonEmptyPlainObject = (value: unknown): boolean =>
	value !== null &&
	typeof value === 'object' &&
	!Array.isArray(value) &&
	Object.keys(value as Record<string, unknown>).length > 0;

export type IVertexConfigEvidence = {
	readonly kind: 'json-path-non-empty-object';
	readonly path: string;
};

export interface IVertexConfigRule {
	readonly id: string;
	readonly priority: number;
	readonly evidence: IVertexConfigEvidence;
}

export const DEFAULT_VERTEX_CONFIG_RULES: readonly IVertexConfigRule[] = [
	{
		id: 'plugins',
		priority: 100,
		evidence: { kind: 'json-path-non-empty-object', path: 'plugins' },
	},
	{
		id: 'validation-matrix-scopes',
		priority: 90,
		evidence: {
			kind: 'json-path-non-empty-object',
			path: 'validationMatrix.scopes',
		},
	},
];

const matches = (
	parsed: Record<string, unknown>,
	rule: IVertexConfigRule,
): boolean => {
	if (rule.evidence.kind !== 'json-path-non-empty-object') return false;
	const value = getByPath(parsed, rule.evidence.path);
	return isNonEmptyPlainObject(value);
};

export const matchVertexConfig = (
	parsed: Record<string, unknown> | null,
	rules: readonly IVertexConfigRule[] = DEFAULT_VERTEX_CONFIG_RULES,
): readonly string[] => {
	if (parsed === null) return [];
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const hits: string[] = [];
	for (const rule of sorted) {
		if (matches(parsed, rule)) hits.push(rule.id);
	}
	return hits;
};

/**
 * Convenience: parse the raw `mcp-vertex.config.json` and run
 * the rule table against it. Returns an empty list on parse
 * error (the file may be absent, malformed, or just empty).
 */
export const matchVertexConfigFromRaw = (
	raw: string | undefined,
	rules: readonly IVertexConfigRule[] = DEFAULT_VERTEX_CONFIG_RULES,
): readonly string[] => {
	if (raw === undefined) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return [];
	}
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed)
	) {
		return [];
	}
	return matchVertexConfig(parsed as Record<string, unknown>, rules);
};
