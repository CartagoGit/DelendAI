/**
 * attribute.ts — split a fully-qualified MCP tool name into
 * `{plugin, tool}`.
 *
 * The core qualifies every plugin tool as `${corePrefix}_${pluginPrefix}_${toolId}`
 * (see `packages/core/src/lib/cli/assemble.ts`) and every core tool as
 * `${corePrefix}_${toolId}`. Neither `corePrefix` (`mcp-vertex`) nor a
 * plugin prefix contains an underscore, but a `toolId` may (e.g.
 * `usage_report`, `get_validation_matrix`), so the boundary cannot be
 * found by a blind `split('_')`.
 *
 * We resolve the owner deterministically against the live set of loaded
 * plugin prefixes (`ctx.peerPlugins.list()`): the longest peer prefix `P`
 * for which the name starts with `${corePrefix}_${P}_` wins. When no peer
 * matches, the call is a core tool and is attributed to the synthetic
 * `core` plugin.
 */

export const CORE_PLUGIN_KEY = 'core';

/**
 * Derive the host's core namespace prefix from THIS plugin's resolved
 * `ctx.namespacePrefix` (`${corePrefix}_${myPrefix}`). Because a plugin
 * prefix never contains an underscore, everything before the last `_` is
 * the core prefix.
 */
export const deriveCorePrefix = (namespacePrefix: string): string => {
	const idx = namespacePrefix.lastIndexOf('_');
	return idx === -1 ? namespacePrefix : namespacePrefix.slice(0, idx);
};

export interface IToolAttribution {
	readonly plugin: string;
	readonly tool: string;
}

/**
 * Attribute a qualified tool name to its owning plugin + bare tool id.
 * `peerPrefixes` is the live loaded-plugin prefix set; the longest match
 * wins so a prefix that is a substring of another cannot mis-claim a tool.
 */
export const attributeTool = (
	qualifiedName: string,
	corePrefix: string,
	peerPrefixes: readonly string[],
): IToolAttribution => {
	const corePart = `${corePrefix}_`;
	const withoutCore = qualifiedName.startsWith(corePart)
		? qualifiedName.slice(corePart.length)
		: qualifiedName;

	let best: string | null = null;
	for (const prefix of peerPrefixes) {
		if (withoutCore === prefix || withoutCore.startsWith(`${prefix}_`)) {
			if (best === null || prefix.length > best.length) best = prefix;
		}
	}

	if (best === null) {
		// No plugin owns it → a core tool (overview/status/…).
		return { plugin: CORE_PLUGIN_KEY, tool: withoutCore };
	}

	const rest = withoutCore.slice(best.length);
	const tool = rest.startsWith('_') ? rest.slice(1) : rest;
	return { plugin: best, tool: tool === '' ? best : tool };
};
