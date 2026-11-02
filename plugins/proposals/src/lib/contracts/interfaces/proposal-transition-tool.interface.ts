import type { IProposalTransitionArgs } from '../proposal-transition-input.contract';
import type { ILocatedProposal } from '../../proposals/locate';
import type { IReviewIndependence } from './review-independence.interface';
import type { IForceTransitions } from './forced-transition.interface';
import type { IProposalFolderPolicy } from '../proposal-folder-policy';
import type { IProposalStatus } from '../constants/proposal-glossary.constant';
import type { IGitRunner } from '../../shared/git-runner';
import type { IProposalDurationRecorder } from './transition-duration.interface';

export type IProposalTransitionSourceStatus = IProposalStatus | 'pending';

export interface IPeerReviewLogEntry {
	readonly ts: string;
	readonly proposal_id: string;
	readonly slice_id?: string;
	readonly agent?: string;
	readonly verdict?: string;
	readonly note?: string;
}

export interface IPeerReviewGateDeps {
	readonly readPeerReviewLog: (
		logPathAbs: string,
	) => Promise<readonly IPeerReviewLogEntry[]>;
}

export interface IValidateLogEntry {
	readonly timestamp?: string;
	readonly ts?: string;
	readonly result?: string;
	readonly exitCode?: number;
	readonly logPath?: string;
	readonly [key: string]: unknown;
}

export interface IValidateEvidenceDeps {
	readonly readValidateLog: (
		logPathAbs: string,
	) => Promise<readonly IValidateLogEntry[]>;
}

export interface IProposalTransitionToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path to `docs/delendai/proposals/` (the 7 status folders live here). */
	readonly proposalsDirAbs: string;
	readonly workspaceRoot: string;
	/**
	 * f00016 + q00001: absolute path to `<cacheDir>/proposals/index.json`
	 * (the regenerable registry index — see x00052 for the move from
	 * `docs/delendai/proposals/index.json`). Used by the q00001
	 * plan-closure guard to look up child proposal statuses when the
	 * caller transitions a `type: plan` proposal to `done`. Optional —
	 * when absent, the plan-closure guard is skipped (legacy hosts
	 * that have not yet adopted the index file keep working).
	 */
	readonly indexPathAbs?: string;
	/** Injectable for tests; defaults to a real `git mv` in `workspaceRoot`. */
	readonly gitRunner?: IGitRunner;
	/**
	 * Move files without staging them (x00651): set when the project's
	 * work reaches integration through work refs, where the checkout's
	 * index belongs to nobody.
	 */
	readonly indexFreeMoves?: boolean;
	/** Absolute path to the append-only peer-review journal. */
	readonly peerReviewLogPathAbs?: string;
	/**
	 * a00069 S7: when true (default), `review → done` requires at least
	 * one peer `proposal_review { action: "approve" }` recorded in the
	 * doc (reviewer ≠ implementer). Hosts opt out via
	 * `proposals.options.requirePeerReview: false`.
	 */
	readonly requirePeerReview?: boolean;
	/** What makes a reviewer independent (x00718); `model` by default. */
	readonly reviewIndependence?: IReviewIndependence;
	/** Who may pass `force: true`; any caller (`agents`) by default. */
	readonly forceTransitions?: IForceTransitions;
	/**
	 * When true (default), `→ review` and `→ done` require a passing
	 * `bun run validate` from the last 24h, journalled to
	 * `.cache/delendai/results/logs/validate.jsonl`.
	 *
	 * Not every adopter has a validate chain worth blocking on — a docs
	 * repo, a spike, a project whose CI is the real gate. Those hosts set
	 * `proposals.options.requireValidateEvidence: false` rather than
	 * teaching every agent to pass `force: true`, which would disable the
	 * peer-review and slice-completeness gates along with it.
	 */
	readonly requireValidateEvidence?: boolean;
	/** Folder layout policy per proposal status. */
	readonly folderPolicy?: IProposalFolderPolicy;
	readonly peerReviewGateDeps?: IPeerReviewGateDeps;
	readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	readonly proposalLifecycleStateReader?: import('../../tools/authoring-options').IProposalLifecycleStateReader;
	/** Receives how long each closing stretch took; optional and advisory. */
	readonly durationRecorder?: IProposalDurationRecorder;
	/** Injectable clock for the duration stamp; defaults to `Date.now`. */
	readonly now?: () => number;
}

export interface IStoredTransitionMetadata {
	readonly transitionId: string | undefined;
	readonly correlationId: string | undefined;
	readonly idempotencyKey: string | undefined;
	readonly from: string | undefined;
}

export interface IResolvedTransitionMetadata {
	readonly transitionId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string | undefined;
}

// ---------------------------------------------------------------------------
// Step 5 — Apply the transition (file mutation + git mv).
// ---------------------------------------------------------------------------

export interface IApplyArgs {
	readonly id: string;
	readonly from: string;
	readonly to: IProposalStatus;
	readonly reason: string;
	readonly transitionId: string;
	readonly correlationId: string;
	readonly idempotencyKey: string | undefined;
}

/**
 * x00529 S1 — outcome of resolving an occupied transition destination.
 *
 * `winner: 'incoming'` means the file being transitioned is at least as
 * advanced as the copy squatting on the destination: the squatter is
 * deleted and the move proceeds normally.
 *
 * `winner: 'existing'` means the destination copy is strictly MORE
 * advanced (a half-applied transition already wrote it): the source
 * snapshot is deleted and the transition reports the destination as the
 * single surviving truth without rewriting it.
 */
export interface IDestinationCollisionResolution {
	readonly winner: 'incoming' | 'existing';
	readonly note: string;
	readonly removedPath: string;
	readonly keptPath: string;
	readonly existingStatus: string | undefined;
}

/** What the closing peer-review gate of a transition reads. */
export interface IPeerReviewGateInput {
	readonly args: IProposalTransitionArgs;
	readonly found: ILocatedProposal;
	readonly options: IProposalTransitionToolOptions;
	readonly raw: string;
	readonly from: IProposalTransitionSourceStatus;
	readonly finalTo: IProposalStatus;
}
