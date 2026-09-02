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

import type { ICommitAuthorResolution } from '@mcp-vertex/core/public';

import type { ILockSnapshotEntry } from '../swarm/proposal-slice-plan';
import type { IHostPathLayout } from '../contracts/interfaces/swarm-path-layout.interface';
import type { IGitRunner } from '../shared/git-runner';
import type { IAgentNamesToolOptions } from './agent-names.tool';
import { readJsonOrNull, readTextOrNull } from '../proposals/index-reader';
import { syncProposalRegistry } from '../proposals/sync-proposal-registry';
import type { IProposalFolderPolicy } from '../contracts/proposal-folder-policy';

export interface ICloseSliceValidationDecision {
	readonly mode: 'scoped' | 'full' | 'blocked';
	readonly resolvedScopes: readonly string[];
	readonly snapshotId: string;
	readonly reason: string;
	/**
	 * The resolver's own account of what is wrong, and the call that
	 * addresses it. Present on `blocked` only. Without these the caller
	 * got one abstract sentence naming no file, no actor and no tool,
	 * and had nothing to act on.
	 */
	readonly blockingReasons?: readonly string[];
	readonly nextAction?: string;
}

export interface IAuthoringPersistConfig {
	readonly mode: 'none' | 'commit' | 'commit-and-push';
	readonly messageTemplate?: string;
	readonly pushTarget?: string;
	readonly protectedBranches?: readonly string[];
	readonly allowForeignChanges?: boolean;
}

export interface IAuthoringToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	/** Absolute proposals dir + index + lock. */
	readonly proposalsDirAbs: string;
	readonly indexPathAbs: string;
	readonly lockPathAbs: string;
	/** x00322: registry used to invalidate delegated leases on completion. */
	readonly agentNames?: IAgentNamesToolOptions;
	/** Append-only peer-review journal used by proposal_review + done gate. */
	readonly peerReviewLogPathAbs?: string;
	/** a00074 S2: per-submit caller identity journal for same-process review detection. */
	readonly reviewIdentityDeps?: import('../services/review-identity').IReviewIdentityDeps;
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
	/** Folder layout policy per proposal status. */
	readonly folderPolicy?: IProposalFolderPolicy;
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
	 * When true (default), `close_slice` refuses to mark a slice done
	 * without a passing `bun run validate` from the last 24h, journalled
	 * to `.cache/mcp-vertex/results/logs/validate.jsonl`.
	 *
	 * Not every adopter has a validate chain worth blocking on — a docs
	 * repo, a spike, a project whose CI is the real gate. Those hosts set
	 * `proposals.options.requireValidateEvidence: false` rather than
	 * teaching every agent to pass `force: true`, which would disable the
	 * peer-review and quality gates along with it.
	 */
	readonly requireValidateEvidence?: boolean;
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
	/**
	 * a00069 S5: host validation command (default `bun run validate` from
	 * `proposals.options.validationCommand`). When a slice's gate/acceptance
	 * demands it, `close_slice` runs this before flipping status. Tests
	 * inject `runValidation` instead so the suite never shells out.
	 */
	readonly validationCommand?: string;
	/**
	 * a00069 S5: injectable validation runner. Production path shells out
	 * to `validationCommand`; tests pass a stub that returns ok/fail.
	 */
	readonly runValidation?: () => Promise<{
		readonly ok: boolean;
		readonly output: string;
		readonly exitCode: number;
	}>;
	/**
	 * a00072 S3.c: optional quality probe. When present, `close_slice`
	 * runs the probe before flipping the slice to `done`. A result whose
	 * `worst` is `critical` or `high` is treated as a blocker (the slice
	 * is not flipped and the tool returns `ok:false` with
	 * `blockerType: 'quality-failed'`). The probe is opt-in: hosts that
	 * do not wire the quality plugin fall back to the existing
	 * validation-only path.
	 */
	readonly runQuality?: (input?: {
		readonly skipWhenValidateEvidenceFresh?: boolean;
		readonly scopes?: readonly string[];
		readonly mode?: 'scoped' | 'full';
	}) => Promise<{
		readonly ok: boolean;
		readonly severity: 'ok' | 'error';
		readonly findings: readonly string[];
		readonly summary?: {
			readonly ok: boolean;
			readonly scopes: number;
		};
	}>;
	/** f00386: resolve the validation mode for the current slice. */
	readonly resolveValidationDecision?: (input: {
		readonly operation: 'close';
		readonly ownedFiles: readonly string[];
		readonly proposalId: string;
		readonly sliceId: string;
	}) => Promise<ICloseSliceValidationDecision>;
	/** x00298 S3: configured persistence for close_slice. */
	readonly persist?: IAuthoringPersistConfig;
	/** Host-resolved author passed to the persistence Git engine. */
	readonly commitAuthor?: ICommitAuthorResolution | undefined;
	/** Host effect gateway for close_slice commit/push operations. */
	readonly persistGit?: IGitRunner | undefined;
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
		| 'folderPolicy'
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
		undefined,
		options.folderPolicy,
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
