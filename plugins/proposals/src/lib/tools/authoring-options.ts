/**
 * authoring-options.ts — shared options + helpers for the four
 * authoring tools (`create_proposal`, `close_slice`, `review`,
 * `proposal_board`).
 *
 * Extracted from `authoring.tool.ts` so:
 *   - **SRP**: data declarations (the options interface + small
 *     helpers) live in one file; the four tool bodies live in
 *     `authoring.tool.ts` (and will be split further per tool once
 *     the per-tool shape stabilises).
 *   - **ISP**: callers that only need the options surface import
 *     from here; the public barrel re-exports the type so existing
 *     imports keep working.
 *   - **OCP**: a future fifth authoring tool adds one factory to
 *     `authoring.tool.ts`; the options + helpers are reused without
 *     re-declaration.
 */
import type { ILockSnapshotEntry } from '../swarm/proposal-slice-plan';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import { readJsonOrNull } from '../proposals/index-reader';

export interface IAuthoringToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	/** Absolute proposals dir + index + lock. */
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
	readonly lockPathAbs: string;
	/** f00016 S13: absolute path of the per-kind id counter file. */
	readonly counterPathAbs: string;
	/**
	 * Workspace-relative layout (proposals dir + index) the post-create
	 * sync uses, so a relocated store stays coherent. Defaults to
	 * `DEFAULT_PATH_LAYOUT` inside the engine when omitted.
	 */
	readonly layout?: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	>;
	/**
	 * Host-specific proposal subfolders (relative to proposalsDir) the
	 * post-mutation sync should also scan, e.g. `['paused/demos']`.
	 */
	readonly extraFolders?: readonly string[];
	/**
	 * Peer-review gate (default: true). When on, `close_slice` refuses
	 * to mark a slice `done` unless the slice has gone through the
	 * `proposal_review` loop and reached `review-state: done`. A
	 * reviewer must differ from the implementer AND from the previous
	 * reviewer across rounds, so every fix gets a fresh pair of eyes
	 * until a reviewer has no objection (x00056).
	 *
	 * Hosts opt out by setting `proposals.options.requirePeerReview:
	 * false` in mcp-vertex.config.json. The default-on mirrors the
	 * plan-of-plans policy (`closureGate.requirePeerReview: true`),
	 * extending the same gate to every slice of every proposal kind.
	 */
	readonly requirePeerReview?: boolean;
}

/** Async file helper (H2): never block the event loop on a tool call.
 *  Reads the lock file and returns the in-flight entries. */
export const readActiveLocks = async (
	lockPath: string,
): Promise<readonly ILockSnapshotEntry[]> => {
	const lock = await readJsonOrNull<{
		in_flight?: Array<{ task_id?: string; agent?: string }>;
	}>(lockPath);
	if (lock === null) return [];
	return (lock.in_flight ?? [])
		.filter((e) => typeof e.task_id === 'string')
		.map((e) => ({ taskId: e.task_id ?? '', agent: e.agent ?? 'unknown' }));
};
