/**
 * index-reader-location.ts
 *
 * Where a proposal-index read finds its SQLite projection: the workspace
 * the index belongs to, and the database inside it.
 */

import { basename, dirname, isAbsolute, join, sep } from 'node:path';

import { PROPOSAL_INDEX_DB_PATH_ENV_VAR } from '../contracts/constants/proposal-index-source.constant';
import type { IProposalIndexReadOptions } from './index-reader';
import { DEFAULT_PATH_LAYOUT } from '../contracts/constants/default-path-layout.constant';

/**
 * The workspace this read belongs to, taken from the index path the
 * caller already resolved.
 *
 * WHY not the process working directory, which is what this used to fall back to: an
 * MCP server's working directory is wherever the host happened to launch
 * it, which in a multi-project setup is frequently another project
 * entirely — and resolving the proposals database from it would read,
 * and eventually write, somebody else's repository. The index path has
 * none of that ambiguity: every caller gets it from its own resolved
 * layout, so it names the workspace being read rather than the process's
 * accident.
 *
 * The derivation is only trusted when it round-trips: the index must sit
 * at `<root>/.cache/delendai/proposals/`, the canonical sibling of the
 * state directory `resolveProposalsDbPaths` owns. Any other layout
 * returns `null` — "the SQL source cannot serve" — because a wrong root
 * here is the same wrong-repository bug under a different name.
 */
const workspaceRootFromIndexPath = (
	indexPathAbs: string,
	stateDir: (root: string) => string,
): string | null => {
	const proposalsCacheDir = dirname(indexPathAbs);
	if (basename(proposalsCacheDir) !== 'proposals') return null;
	const cacheDir = dirname(proposalsCacheDir);
	const root = dirname(dirname(cacheDir));
	return dirname(stateDir(root)) === cacheDir ? root : null;
};

/**
 * Index files the plugin placed where the host's layout put them, each
 * with the workspace it belongs to. A host may move the cache
 * (`--cacheDir`), and the index moves with it while the database stays at
 * its canonical place, so the canonical derivation below cannot see the
 * root of a relocated index. The plugin knows both when it lays out its
 * paths, and says so once.
 */
const declaredIndexFiles = new Map<
	string,
	{ readonly workspaceRoot: string; readonly proposalsDir?: string }
>();

/**
 * Record where this workspace keeps its proposal index, and the folder
 * its proposals are written in when the layout names one. A relative
 * `indexFile` is the layout's own path, valid in any checkout of the
 * workspace (a unit of work's worktree included); an absolute one names
 * this checkout only.
 */
export const declareProposalIndexFile = (
	indexFile: string,
	workspaceRoot: string,
	proposalsDir?: string,
): void => {
	declaredIndexFiles.set(indexFile, {
		workspaceRoot,
		...(proposalsDir === undefined ? {} : { proposalsDir }),
	});
};

/** The layout declared for `indexPathAbs` and the root it implies, if any. */
const declaredLayoutOf = (
	indexPathAbs: string,
): { readonly root: string; readonly proposalsDir?: string } | null => {
	for (const [indexFile, declared] of declaredIndexFiles) {
		const proposalsDir =
			declared.proposalsDir === undefined
				? {}
				: { proposalsDir: declared.proposalsDir };
		if (isAbsolute(indexFile)) {
			if (indexFile === indexPathAbs)
				return { root: declared.workspaceRoot, ...proposalsDir };
			continue;
		}
		const suffix = `${sep}${join(indexFile)}`;
		if (indexPathAbs.endsWith(suffix)) {
			return {
				root: indexPathAbs.slice(0, -suffix.length),
				...proposalsDir,
			};
		}
	}
	return null;
};

/**
 * The folder the proposals of the workspace at `root` are written in:
 * the caller's own word, else the one the plugin declared for this index
 * from the project's configuration, else the default layout. A project
 * that keeps its proposals elsewhere is rebuilt from where they are.
 */
export const resolveProposalsDirAbs = (
	indexPathAbs: string,
	root: string,
	options?: IProposalIndexReadOptions,
): string => {
	if (options?.proposalsDirAbs !== undefined) return options.proposalsDirAbs;
	const declared = declaredLayoutOf(indexPathAbs)?.proposalsDir;
	if (declared === undefined)
		return join(root, DEFAULT_PATH_LAYOUT.proposalsDir);
	return isAbsolute(declared) ? declared : join(root, declared);
};

/**
 * The workspace a read belongs to: an explicit `workspaceRoot` is the
 * caller's own word and wins; otherwise the root is derived from
 * `indexPathAbs` and verified against the canonical layout, or against
 * the layout the plugin declared for a relocated cache. `null` when none
 * names one. An explicit `databasePath` does not answer this —
 * the database and the workspace are independent facts.
 */
export const resolveWorkspaceRoot = async (
	indexPathAbs: string,
	options?: IProposalIndexReadOptions,
): Promise<string | null> => {
	const declared = options?.workspaceRoot;
	if (declared !== undefined && declared.length > 0) return declared;
	let canonical: string | null = null;
	try {
		const { resolveProposalsDbPaths } = await import(
			'@delendai/proposals-sqlite'
		);
		canonical = workspaceRootFromIndexPath(
			indexPathAbs,
			(candidate) => resolveProposalsDbPaths(candidate).stateDir,
		);
	} catch {
		// The canonical layout cannot be checked here; a declared one is
		// a matter of paths alone.
	}
	return canonical ?? declaredLayoutOf(indexPathAbs)?.root ?? null;
};

/**
 * Canonical database path for this read. Never hand-built: the
 * `.cache/delendai/state/proposals.sqlite` layout belongs to
 * `resolveProposalsDbPaths`, imported dynamically so that a JSON-source
 * read never loads `bun:sqlite`.
 *
 * On a runtime without `bun:sqlite` (a plain Node host, vitest) the
 * import fails and this returns `null` — which the caller reads as
 * "the SQL source cannot serve" and falls back to JSON. That is the
 * correct answer there: without `bun:sqlite` there is no SQL source.
 */
export const resolveDatabasePath = async (
	indexPathAbs: string,
	options?: IProposalIndexReadOptions,
): Promise<string | null> => {
	if (options?.databasePath !== undefined) return options.databasePath;
	const fromEnv = (options?.env ?? process.env)[
		PROPOSAL_INDEX_DB_PATH_ENV_VAR
	];
	if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
	const root = await resolveWorkspaceRoot(indexPathAbs, options);
	if (root === null) return null;
	try {
		const { resolveProposalsDbPaths } = await import(
			'@delendai/proposals-sqlite'
		);
		return resolveProposalsDbPaths(root).databasePath;
	} catch {
		return null;
	}
};
