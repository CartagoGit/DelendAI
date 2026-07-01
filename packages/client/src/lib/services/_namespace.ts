/**
 * Namespace-prefix helpers shared by the client service layer (f00081).
 *
 * The host namespaces every tool as `<prefix><suffix>`, where the
 * default prefix is `mcp-vertex_`. A deployment started with
 * `--prefix=acme` reports its prefix via
 * `mcp-vertex_overview { compact: true }` (`snap.namespacePrefix`) and the
 * client threads it through to each service constructor.
 *
 * These helpers keep the `prefix ?? DEFAULT_NAMESPACE_PREFIX` semantics
 * in one place so no service hardcodes the literal `mcp-vertex_` namespace
 * in its `request(...)` calls.
 */

/** The host's default tool-name prefix when no `--prefix` is supplied. */
export const DEFAULT_NAMESPACE_PREFIX = 'mcp-vertex_' as const;

/** A resolved, trailing-underscore-terminated namespace prefix. */
export type INamespacePrefix = string;

/**
 * Normalise a raw prefix value into a usable namespace prefix.
 *
 * - `undefined`, `null` or an empty/whitespace string → the default
 *   `mcp-vertex_`.
 * - A value missing the trailing `_` separator gets one appended, so both
 *   `'acme'` and `'acme_'` resolve to `'acme_'`.
 */
export const parsePrefix = (
	raw: string | null | undefined,
): INamespacePrefix => {
	if (raw === null || raw === undefined) return DEFAULT_NAMESPACE_PREFIX;
	const trimmed = raw.trim();
	if (trimmed.length === 0) return DEFAULT_NAMESPACE_PREFIX;
	return trimmed.endsWith('_') ? trimmed : `${trimmed}_`;
};

/**
 * Build a fully-namespaced tool name from a (possibly absent) prefix and a
 * tool suffix (the part after the host namespace, e.g. `overview`,
 * `notification_notify_status`).
 *
 * `formatToolName(undefined, 'overview')` → `'mcp-vertex_overview'`
 * `formatToolName('acme', 'overview')`    → `'acme_overview'`
 */
export const formatToolName = (
	prefix: string | null | undefined,
	suffix: string,
): string => `${parsePrefix(prefix)}${suffix}`;
