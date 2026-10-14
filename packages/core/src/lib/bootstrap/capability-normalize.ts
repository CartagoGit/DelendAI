// capability-normalize: pure id-shape transformations.
//
// SOLID — Single Responsibility. This module owns ONE thing: turning
// a free-form tool name (kebab, snake, namespaced, mixed) into a
// canonical, comparable form. It does not know about the blueprint,
// about existing tools, or about classification buckets. Every other
// file in the capability-diff pipeline imports these helpers instead
// of re-implementing the regexes.

/** Canonical form: snake_case, lowercased, namespace stripped. */
export type ICanonicalToolId = string;

/**
 * Strip a `<prefix>_` namespace when present. Pure, allocation-free
 * for the common "no prefix" path.
 */
export const stripNamespacePrefix = (
	raw: string,
	prefix: string | undefined,
): string => {
	if (prefix === undefined) return raw;
	const head = `${prefix}_`;
	return raw.startsWith(head) ? raw.slice(head.length) : raw;
};

/** Convert a free-form name to snake_case. */
export const toSnakeCase = (raw: string): string =>
	raw
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

/**
 * Canonicalise a raw tool name: strip the namespace, then snake_case.
 * This is the SINGLE source of truth for what "match" means in the
 * capability-diff pipeline.
 */
export const canonicalToolId = (
	raw: string,
	prefix: string | undefined,
): ICanonicalToolId => toSnakeCase(stripNamespacePrefix(raw, prefix));
