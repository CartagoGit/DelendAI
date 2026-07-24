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
import { dirname, join } from 'node:path';

import type { ILockSnapshotEntry } from '../swarm/proposal-slice-plan';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import type { IGitRunner } from '../shared/git-runner';
import { readJsonOrNull, readTextOrNull } from '../proposals/index-reader';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';

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
	/**
	 * f00091 S2: the non-destructive **branch-integration step**. When
	 * `agentWorktree` is enabled AND the slice was closed on a per-agent
	 * `agent/*` branch, `close_slice` records that branch into the
	 * pending-integration store so `swarm_hygiene` surfaces it as a
	 * rescue candidate. The record is pure bookkeeping — `close_slice`
	 * runs no git write.
	 *
	 * The whole step is gated on `agentWorktreeEnabled`: when it is off
	 * (the default), `close_slice` records nothing and behaviour is
	 * byte-identical to pre-f00091.
	 */
	readonly agentWorktreeEnabled?: boolean;
	/** f00091 S2: absolute path of the pending-integration store. */
	readonly pendingIntegrationPathAbs?: string;
	/**
	 * f00091 S2: read-only git runner used ONLY to resolve the current
	 * branch + worktree path when recording the pending-integration
	 * entry. `close_slice` never mutates through it. Tests inject a stub
	 * that fails the assertion if any write-shaped git verb is invoked.
	 */
	readonly run?: IGitRunner;
}

export type IIndexedDocResolution =
	| {
			readonly ok: true;
			readonly entry: { readonly id: string; readonly file: string };
			readonly docPath: string;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
			readonly nextAction: string;
	  };

/**
 * Resolve a proposalId to its on-disk document through the index,
 * self-healing a stale index ONCE (x00106 S1).
 *
 * Every `proposal_transition` moves the file to another status folder
 * and leaves the index pointing at the old path until the next
 * `sync_proposals`. The indexed-path tools (`close_slice`,
 * `proposal_review`) used to surface that as "proposal file missing",
 * forcing agents into a manual sync + retry. This helper runs that
 * bounded loop internally: lookup → on miss, one `syncProposalRegistry`
 * → retry → structured error if the proposal genuinely doesn't exist.
 */
export const resolveIndexedDoc = async (
	options: Pick<
		IAuthoringToolOptions,
		| 'workspaceRoot'
		| 'proposalsDirAbs'
		| 'indexPathAbs'
		| 'layout'
		| 'extraFolders'
	>,
	proposalId: string,
): Promise<IIndexedDocResolution> => {
	const lookup = async (): Promise<IIndexedDocResolution | null> => {
		const index = await readJsonOrNull<{
			proposals: Array<{ id: string; file: string }>;
		}>(options.indexPathAbs);
		if (index === null) return null;
		const entry = index.proposals.find(
			(p) => p.id === proposalId || p.id.startsWith(`${proposalId}-`),
		);
		if (entry === undefined) return null;
		const docPath = join(
			options.proposalsDirAbs ?? dirname(options.indexPathAbs),
			entry.file,
		);
		// A hit whose file vanished is exactly the stale-index symptom —
		// treat it as a miss so the heal path re-syncs.
		if ((await readTextOrNull(docPath)) === null) return null;
		return { ok: true, entry, docPath };
	};

	const first = await lookup();
	if (first !== null) return first;
	await syncProposalRegistry(
		options.workspaceRoot,
		options.layout,
		options.extraFolders ?? [],
	);
	const second = await lookup();
	if (second !== null) return second;
	return {
		ok: false,
		reason: `proposal "${proposalId}" not in index (checked again after a re-sync)`,
		nextAction: 'Pass an existing proposalId.',
	};
};

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
