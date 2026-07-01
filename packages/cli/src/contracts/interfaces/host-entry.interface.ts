/**
 * host-entry.interface.ts — f00037 contract surface for
 * `lib/init/host-entry-resolver.service.ts`.
 *
 * The host-entry resolver locates the canonical
 * `host-server.script.ts` entry that the local mcp-vertex build
 * produces (sibling `packages/cli`, `node_modules/@mcp-vertex/cli`,
 * or an explicit `--mcp-vertex-root` override). Its contract surface
 * — the source discriminator, the resolved entry, the file-probe
 * helper — lives here so callers import shapes, not implementation.
 */

export type THostEntrySource =
	| 'flag'
	| 'node_modules'
	| 'sibling'
	| 'npm_dist'
	| 'unresolved';

/** One resolved host entry the caller can spawn or symlink. */
export interface IResolvedHostEntry {
	readonly path: string;
	readonly source: THostEntrySource;
}

/** A filesystem probe the resolver executes to find a host entry. */
export interface IPathProbe {
	readonly path: string;
	readonly exists: boolean;
}