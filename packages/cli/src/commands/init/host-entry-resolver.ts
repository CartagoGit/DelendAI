/**
 * host-entry-resolver.ts — f00088 S2.
 *
 * Resolve the absolute path to the mcp-vertex host-server entry
 * script (`tools/scripts/host/host-server.script.ts`) for the
 * consumer's environment. Replaces the previous hardcoded
 * `/home/cartago/_proyectos/propios/mcp-vertex/tools/scripts/...`
 * that shipped in every generated `.vscode/mcp.json`.
 *
 * Resolution order (first hit wins):
 *
 *   1. `--mcp-vertex-root=<abs>` flag → operator's explicit override
 *   2. `<workspace>/node_modules/@mcp-vertex/core/tools/scripts/host/host-server.script.ts`
 *   3. `<workspace>/node_modules/@mcp-vertex/core/dist/host/host-server.js`
 *   4. `<workspace>/../mcp-vertex/tools/scripts/host/host-server.script.ts`
 *      (sibling checkout — common dev workflow)
 *   5. `<workspace>/../mcp-vertex-core/tools/scripts/host/host-server.script.ts`
 *      (alternate sibling name)
 *
 * Returns the resolved path + a `source` tag (for diagnostics and
 * for the operator's `--json` output). When none of the candidates
 * exist, throws a typed error listing every attempt so the CLI can
 * surface a clear "did you forget `bun install`?" hint.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

export type THostEntrySource =
	| 'flag'
	| 'node_modules'
	| 'npm_dist'
	| 'sibling'
	| 'sibling_alt'
	| 'unresolved';

export interface IResolvedHostEntry {
	readonly path: string;
	readonly source: THostEntrySource;
}

/** A minimal reader interface so tests can inject a fake filesystem. */
export interface IPathProbe {
	exists(path: string): boolean;
}

const realProbe: IPathProbe = {
	exists: (path) => existsSync(path),
};

const HOST_SCRIPT_REL = 'tools/scripts/host/host-server.script.ts';
const NPM_DIST_REL = 'dist/host/host-server.js';

/**
 * Probe every candidate location in priority order. The first
 * existing file wins. The function is pure with respect to the
 * `probe` (default: real filesystem) so tests can stub it.
 */
export const resolveHostEntryPath = (
	workspace: string,
	options: { readonly explicitRoot?: string; readonly probe?: IPathProbe } = {},
): IResolvedHostEntry => {
	const probe = options.probe ?? realProbe;

	// 1. Explicit override — operator-driven, highest trust.
	if (options.explicitRoot !== undefined && options.explicitRoot.length > 0) {
		const candidate = isAbsolute(options.explicitRoot)
			? options.explicitRoot
			: resolve(workspace, options.explicitRoot);
		if (probe.exists(candidate)) {
			return { path: candidate, source: 'flag' };
		}
		// Explicit override wins on trust but still requires the file
		// to exist; fall through to the other branches so the typed
		// error lists every attempt.
	}

	const candidates: ReadonlyArray<{
		path: string;
		source: Exclude<THostEntrySource, 'flag' | 'unresolved'>;
	}> = [
		{
			path: join(workspace, `node_modules/@mcp-vertex/core/${HOST_SCRIPT_REL}`),
			source: 'node_modules',
		},
		{
			path: join(workspace, `node_modules/@mcp-vertex/core/${NPM_DIST_REL}`),
			source: 'npm_dist',
		},
		{
			path: resolve(workspace, `../mcp-vertex/${HOST_SCRIPT_REL}`),
			source: 'sibling',
		},
		{
			path: resolve(workspace, `../mcp-vertex-core/${HOST_SCRIPT_REL}`),
			source: 'sibling_alt',
		},
	];

	for (const candidate of candidates) {
		if (probe.exists(candidate.path)) {
			return { path: candidate.path, source: candidate.source };
		}
	}

	// Last-ditch: surface a typed error with every attempted path.
	const attempted = options.explicitRoot
		? [
				options.explicitRoot,
				...candidates.map((c) => c.path),
			]
		: candidates.map((c) => c.path);
	throw new HostEntryNotFoundError(workspace, attempted);
};

export class HostEntryNotFoundError extends Error {
	readonly workspace: string;
	readonly attempted: readonly string[];

	constructor(workspace: string, attempted: readonly string[]) {
		const hint =
			'\nHint: install @mcp-vertex/core in this workspace (bun add @mcp-vertex/core),\n' +
			'      or pass --mcp-vertex-root=<abs/path/to/mcp-vertex> to point at a local checkout,\n' +
			'      or check out mcp-vertex as a sibling of this workspace (../mcp-vertex/).';
		super(
			`could not locate the mcp-vertex host entry script for ${workspace}.\n` +
				`Tried:\n${attempted.map((p) => `  - ${p}`).join('\n')}` +
				hint,
		);
		this.name = 'HostEntryNotFoundError';
		this.workspace = workspace;
		this.attempted = attempted;
	}
}