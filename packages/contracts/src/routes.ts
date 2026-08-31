/**
 * routes.ts — types describing the URL-style routing of MCP
 * resources.
 *
 * r00029 (Track C / §10): pure types only.
 */

import type { NonEmptyString, PluginId } from './primitives';

/** Canonical MCP resource URI scheme. */
export type ResourceUriScheme = 'mcp-vertex' | 'mcp' | 'https' | 'file';

/** A parsed MCP resource URI. */
export interface IResourceRoute {
	readonly scheme: ResourceUriScheme;
	readonly plugin: PluginId;
	readonly resource: NonEmptyString;
	readonly fragment?: string;
}

/** A route table keyed by plugin id. */
export interface IRouteTable {
	readonly routes: readonly IResourceRoute[];
}
