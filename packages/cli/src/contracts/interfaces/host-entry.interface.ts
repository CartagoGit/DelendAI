/**
 * host-entry.interface.ts — types for resolving the mcp-vertex host-server
 * entry script (f00088 S2 + f00103 sibling-walk).
 *
 * Per repo convention every interface/type lives under
 * `contracts/interfaces/`. The resolver service
 * (`lib/init/host-entry-resolver.service.ts`) imports these. (Restored
 * here after the f00037 rename dropped the original host-entry interface
 * file — see a6e5bd3a.)
 */

/** How the host-server entry path was resolved. */
export type THostEntrySource =
	| 'flag'
	| 'node_modules'
	| 'npm_dist'
	| 'sibling'
	| 'sibling_alt'
	| 'sibling_nested'
	| 'sibling_walk'
	| 'unresolved';

/** The resolved host-server entry path plus how it was found. */
export interface IResolvedHostEntry {
	readonly path: string;
	readonly source: THostEntrySource;
}

/** A minimal reader interface so tests can inject a fake filesystem. */
export interface IPathProbe {
	exists(path: string): boolean;
	/**
	 * Optional: enumerate immediate children of a directory. Defaults to
	 * the real filesystem when omitted (used only by the upward walk).
	 */
	readDirNames?(path: string): readonly string[];
}
