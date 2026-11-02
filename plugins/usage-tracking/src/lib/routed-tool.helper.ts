/**
 * routed-tool.helper.ts — a call through the capability router is measured
 * under the tool it reached.
 *
 * `resolve_capability` invokes the tool it resolves and answers with that
 * tool's whole result. Recorded under the router, 848 calls totalling 23 MB
 * (one of 620 KB) read as the router's own cost, and the tools that really
 * return the most, which f00645 exists to find, stayed invisible. The router
 * answers `{ status: "ok", qualifiedName, result }`; the record takes that
 * name. A refused route (`status: "terminal"`) stays the router's.
 */

/** The suffix of the router's registered name, whatever the namespace. */
const ROUTER_SUFFIX = '_resolve_capability';

export const toolReachedBy = (toolName: string, result: unknown): string => {
	if (!toolName.endsWith(ROUTER_SUFFIX)) return toolName;
	if (typeof result !== 'object' || result === null) return toolName;
	const structured = (result as { structuredContent?: unknown })
		.structuredContent;
	if (typeof structured !== 'object' || structured === null) return toolName;
	const { status, qualifiedName } = structured as {
		status?: unknown;
		qualifiedName?: unknown;
	};
	return status === 'ok' &&
		typeof qualifiedName === 'string' &&
		qualifiedName.length > 0
		? qualifiedName
		: toolName;
};
