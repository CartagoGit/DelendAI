/**
import type { IPathProbe, THostEntrySource } from '../../contracts/interfaces/host-entry.interface';
 * host-entry-resolver.ts — f00088 S2 + f00103 sibling-walk.
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
 *   6. `<workspace>/../propios/mcp-vertex/...` and a one-level
 *      upward walk that probes every sibling directory which
 *      contains `tools/scripts/host/host-server.script.ts` (last
 *      resort — recovers the operator's common
 *      `~/proyectos/propios/mcp-vertex` layout even when the
 *      consumer lives at `~/proyectos/<consumer>/`).
 *
 * Returns the resolved path + a `source` tag (for diagnostics and
 * for the operator's `--json` output). When none of the candidates
 * exist, throws a typed error listing every attempt so the CLI can
 * surface a clear "did you forget `bun install`?" hint.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';



/** A minimal reader interface so tests can inject a fake filesystem. */


const realProbe: IPathProbe = {
	exists: (path) => existsSync(path),
	readDirNames: (path) => {
		try {
			return readdirSync(path);
		} catch {
			return [];
		}
	},
};

const HOST_SCRIPT_REL = 'tools/scripts/host/host-server.script.ts';
const NPM_DIST_REL = 'dist/host/host-server.js';

const upwardSiblingWalk = (
	probe: IPathProbe,
	workspace: string,
): string | null => {
	// Walk up at most 2 levels above the workspace. At the FIRST
	// hop (the parent of the workspace) we probe one level deeper
	// to recover layouts like `<parent>/propios/mcp-vertex/`,
	// `<parent>/worktrees/mcp-vertex/`, and symlinks. The second
	// hop only checks direct children (the common dev workflow is
	// `<consumer>/../mcp-vertex/`, which is already covered by the
	// explicit candidate list above).
	//
	// The walk is bounded so `/tmp/` (thousands of entries) does
	// not blow up the call latency on a CI scratch dir.
	const reader = probe.readDirNames?.bind(probe) ?? realProbe.readDirNames;

	const probeAt = (dir: string, depth: number): string | null => {
		const queue: Array<{ dir: string; depth: number }> = [
			{ dir, depth: 0 },
		];
		const seen = new Set<string>();
		while (queue.length > 0) {
			const head = queue.shift();
			if (head === undefined) break;
			if (seen.has(head.dir)) continue;
			seen.add(head.dir);
			const names = reader?.(head.dir) ?? [];
			for (const name of names) {
				if (!name.includes('mcp-vertex')) continue;
				const candidate = join(head.dir, name, HOST_SCRIPT_REL);
				if (probe.exists(candidate)) return candidate;
			}
			if (head.depth < depth) {
				for (const name of names) {
					queue.push({
						dir: join(head.dir, name),
						depth: head.depth + 1,
					});
				}
			}
		}
		return null;
	};

	const parent = resolve(workspace, '..');
	const firstHop = probeAt(parent, 2);
	if (firstHop !== null) return firstHop;

	const grandParent = dirname(parent);
	if (grandParent === parent) return null; // filesystem root
	return probeAt(grandParent, 1);
};

/**
 * Probe every candidate location in priority order. The first
 * existing file wins. The function is pure with respect to the
 * `probe` (default: real filesystem) so tests can stub it.
 */
export const resolveHostEntryPath = (
	workspace: string,
	options: {
		readonly explicitRoot?: string;
		readonly probe?: IPathProbe;
	} = {},
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
			path: join(
				workspace,
				`node_modules/@mcp-vertex/core/${HOST_SCRIPT_REL}`,
			),
			source: 'node_modules',
		},
		{
			path: join(
				workspace,
				`node_modules/@mcp-vertex/core/${NPM_DIST_REL}`,
			),
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
		{
			path: resolve(
				workspace,
				`../propios/mcp-vertex/${HOST_SCRIPT_REL}`,
			),
			source: 'sibling_nested',
		},
	];

	for (const candidate of candidates) {
		if (probe.exists(candidate.path)) {
			return { path: candidate.path, source: candidate.source };
		}
	}

	// Last-resort: an upward walk that probes every directory whose
	// name contains `mcp-vertex`. Catches `propios/mcp-vertex`,
	// `worktrees/mcp-vertex`, symlinks, and other irregular
	// layouts — but only after the explicit candidate list above
	// has been exhausted (so the common cases remain O(1)).
	const walked = upwardSiblingWalk(probe, workspace);
	if (walked !== null) {
		return { path: walked, source: 'sibling_walk' };
	}

	// Surface a typed error with every attempted path so the CLI
	// can show the operator what was probed.
	const attempted = options.explicitRoot
		? [options.explicitRoot, ...candidates.map((c) => c.path)]
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
