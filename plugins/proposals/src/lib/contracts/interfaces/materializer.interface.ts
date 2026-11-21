/**
 * materializer.interface.ts — x00510 S3.
 *
 * The READ ≠ WRITE contract for the proposals plugin.
 *
 * Two distinct interfaces, deliberately:
 *
 *   - `IProposalReader` — the read-only surface. Hosts that consume
 *     proposal state go through this. Calling any of its methods
 *     MUST NOT have a side effect on the filesystem, the SQLite DB,
 *     the markdown files, the Git history, or any external system.
 *
 *   - `IProposalMaterializer` — the write surface. ONLY write-capable
 *     tools (`create_proposal`, `proposals_transition`,
 *     `proposals_close_slice`, `proposals_close_plan`,
 *     `proposals_reconcile_folder`, `auto_fix_queue`,
 *     `incident_proposals`) are allowed to depend on it. A read-only
 *     tool that ends up holding a reference to an `IProposalMaterializer`
 *     is a regression — `assertReadOnlyCall` rejects it.
 *
 * The intent is that the type system makes the boundary visible:
 * `proposals_db_status`, `proposals_get`, `proposal_board`,
 * `auto_work`, `proposals_search`, `compact_status` and any other
 * read-only tool consume `IProposalReader`. Only the write-capable
 * tools consume `IProposalMaterializer`.
 *
 * The runtime guard `assertReadOnlyCall()` is a defence-in-depth
 * backstop: even if a host or a subagent sneaks a writer into a read
 * path, the guard fails loudly with `READ_ONLY_VIOLATION`.
 */
import type {
	IProposalKind,
	IProposalStatus,
} from '../constants/proposal-glossary.constant';

/** Error codes surfaced through `IMaterializerOutcome.errorCode`. */
export type TMaterializerErrorCode =
	| 'READ_ONLY_VIOLATION'
	| 'INVALID_TRANSITION'
	| 'REVISION_CONFLICT'
	| 'NOT_FOUND'
	| 'ALREADY_CLOSED'
	| 'QUARANTINED'
	| 'UNKNOWN';

/**
 * Discriminated outcome of every write-capable materializer call.
 *
 * - `materialized`: the entity was created / updated and committed.
 * - `already_applied`: idempotent retry; no mutation needed.
 * - `rejected`: the call refused; no mutation happened. The caller
 *   can inspect `errorCode` and `errorMessage` for the reason.
 *
 * Read-only callers that go through the materializer (which they
 * shouldn't) get `rejected` with `READ_ONLY_VIOLATION`.
 */
export type IMaterializerOutcome =
	| {
			readonly kind: 'materialized';
			readonly uid: string;
			readonly entityKind: IProposalKind | 'plan' | 'slice';
			readonly revision: number;
			readonly previousRevision: number;
			readonly appliedAt: number;
	  }
	| {
			readonly kind: 'already_applied';
			readonly uid: string;
			readonly entityKind: IProposalKind | 'plan' | 'slice';
			readonly revision: number;
			readonly appliedAt: number;
	  }
	| {
			readonly kind: 'rejected';
			readonly errorCode: TMaterializerErrorCode;
			readonly errorMessage: string;
			readonly uid?: string;
	  };

/**
 * Payload of a single materialization. The discriminator is `kind`:
 * - `create` — write a brand new entity.
 * - `transition` — change the status of an existing entity.
 * - `quarantine` — record that an entity could not be parsed.
 * - `close` — convenience wrapper around `transition` to a terminal status.
 */
export type IMaterializerPayload =
	| {
			readonly kind: 'create';
			readonly familyPrefix: string;
			readonly title: string;
			readonly proposalKind: IProposalKind;
			readonly body: string;
			readonly idempotencyKey: string;
	  }
	| {
			readonly kind: 'transition';
			readonly uid: string;
			readonly fromStatus: IProposalStatus;
			readonly toStatus: IProposalStatus;
			readonly expectedRevision: number;
			readonly idempotencyKey: string;
	  }
	| {
			readonly kind: 'close';
			readonly uid: string;
			readonly expectedRevision: number;
			readonly idempotencyKey: string;
	  }
	| {
			readonly kind: 'quarantine';
			readonly sourcePath: string;
			readonly blobSha: string;
			readonly errorCode: string;
			readonly errorMessage: string;
			readonly idempotencyKey: string;
	  };

/** The single method that all write-capable tools call. */
export interface IProposalMaterializer {
	readonly materialize: (
		payload: IMaterializerPayload,
	) => Promise<IMaterializerOutcome>;
}

/**
 * The read-only surface. Every read path consumes at most this.
 *
 * Read tools MUST declare `IRProposalReader`-only dependencies in
 * their `register()` handler; if a tool holds an
 * `IProposalMaterializer` in its dependency graph, the runtime guard
 * `assertReadOnlyCall` rejects the tool at registration time.
 */
export interface IProposalReader {
	readonly get: (uid: string) => Promise<IProposalView | undefined>;
	readonly list: (filter?: {
		readonly status?: IProposalStatus;
	}) => Promise<readonly IProposalView[]>;
	readonly search: (query: string) => Promise<readonly IProposalView[]>;
	readonly count: () => Promise<{
		readonly proposals: number;
		readonly plans: number;
		readonly slices: number;
	}>;
	readonly lastSync: () => Promise<{
		readonly at: number | undefined;
		readonly sourceCommit: string | undefined;
	}>;
	readonly suggest: (
		observation: IProposalObservation,
	) => Promise<readonly IProposalCandidate[]>;
}

/**
 * Read-only view of a proposal. Intentionally narrow; a richer view is
 * available through `proposals_get` (which IS a read tool, so it can
 * consume the full reader).
 */
export interface IProposalView {
	readonly uid: string;
	readonly kind: IProposalKind;
	readonly status: IProposalStatus;
	readonly title: string;
	readonly revision: number;
	readonly updatedAt: number;
}

/**
 * An observation emitted by a scanner or reconciler. Observations are
 * pure data; turning one into a real proposal requires an explicit
 * `materialize({ kind: 'create', ... })` call.
 */
export interface IProposalObservation {
	readonly source: 'reconciler' | 'incident' | 'auto-fix' | 'manual';
	readonly ruleId?: string;
	readonly problem: string;
	readonly affectedPaths: readonly string[];
	readonly suggestedKind: IProposalKind;
	readonly suggestedTitle: string;
	readonly sourceCommit?: string;
}

/**
 * A candidate proposal produced from an observation. Still pure data.
 * Only `materialize` actually creates the proposal.
 */
export interface IProposalCandidate {
	readonly observation: IProposalObservation;
	readonly suggestedUid: string;
	readonly confidence: number;
}

/**
 * Runtime guard. Throws when a tool that is supposed to be read-only
 * has been wired with an `IProposalMaterializer`. Use this at the top
 * of every read-only tool's `register()` handler.
 *
 * The error code is `READ_ONLY_VIOLATION` (matches
 * `TMaterializerErrorCode`); the host surfaces it as
 * `DLND-PROP-007`.
 */
export const READ_ONLY_VIOLATION_MESSAGE =
	'This tool is declared read-only but holds an IProposalMaterializer in its dependency graph. ' +
	'Reads MUST NOT call writers. Remove the materializer dependency or declare the tool as write-capable.';

export const assertReadOnlyCall = (
	toolId: string,
	deps: Readonly<Record<string, unknown>>,
): void => {
	// Read-only tools declare their dependencies as `IDbStatusToolOptions`
	// etc. with `materializer?: never`. The static type makes the
	// violation impossible. The runtime guard exists for the cases
	// where a future change forces a materializer past the type
	// checker (e.g. a generic dep bag or a `as unknown as ...` cast).
	// We detect by structural shape: any object that has a `materialize`
	// method is a writer.
	for (const key of Object.keys(deps)) {
		const candidate = deps[key];
		if (
			candidate !== null &&
			typeof candidate === 'object' &&
			typeof (candidate as { materialize?: unknown }).materialize ===
				'function'
		) {
			throw new Error(
				`${READ_ONLY_VIOLATION_MESSAGE} (tool=${toolId}, error=DLND-PROP-007)`,
			);
		}
	}
};
