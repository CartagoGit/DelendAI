/**
 * state-port.ts — the seam onto the operational work model.
 *
 * WHY a port instead of a direct dependency: `@delendai/core` does not
 * and must not depend on `@delendai/proposals-sqlite` — the dependency
 * runs the other way. So the engine states what it needs from the state
 * model as an interface, and the sqlite work model (work units,
 * generations, PRs, CI runs, journal) satisfies it from outside. A spec
 * then drives the whole cycle against an in-memory implementation with
 * exactly the same semantics.
 *
 * Every operation here is IDEMPOTENT BY IDENTITY, mirroring the work
 * model's own guarantees, because that is what makes running the cycle
 * twice safe:
 *
 *  - `ensureGeneration` upserts on `(workUnitUid, generation)` — the
 *    spec's `(repository, proposal, slice, generation)` checkpoint id.
 *  - `attachPullRequest` reports `attached: false` when the generation
 *    already carries that pull request, so no second PR is opened and no
 *    second journal event is emitted.
 *  - `markIntegrated` is single-winner: `first` is true for exactly one
 *    caller, ever, which is what the merge journal event is gated on.
 *  - `appendJournalEvent` is a no-op for an event already present, since
 *    the event id is derived from its own content.
 *
 * Operations are async even though a SQLite implementation is
 * synchronous: the port must also be satisfiable by a remote or batched
 * store without changing every caller.
 */

/** Identity of one checkpoint inside a work unit. */
export interface IGenerationKey {
	readonly workUnitUid: string;
	readonly generation: number;
}

/** The generation fields this engine reads and writes. */
export interface IGenerationState {
	readonly workUnitUid: string;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly checkpointKind: 'durability' | 'merge-candidate';
	readonly candidateState:
		| 'draft'
		| 'proposed'
		| 'integrating'
		| 'integrated'
		| 'superseded'
		| 'abandoned';
	readonly validationState:
		| 'unknown'
		| 'pending'
		| 'green'
		| 'red'
		| 'skipped';
	readonly pullRequestNumber: number | null;
	readonly integratedSha: string | null;
}

/** Arguments to the generation upsert. */
export interface IEnsureGenerationArgs {
	readonly workUnitUid: string;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
	readonly checkpointKind: 'durability' | 'merge-candidate';
	readonly authorAgentId: string;
	readonly machineId: string;
	readonly now: number;
}

/** Mirror of a forge pull request, keyed on `(repository, number)`. */
export interface IUpsertPullRequestArgs {
	readonly repositoryUid: string;
	readonly number: number;
	readonly headRef: string;
	readonly baseRef: string;
	readonly headSha: string;
	readonly state: 'draft' | 'open' | 'closed' | 'merged';
	readonly mergeSha?: string;
	readonly now: number;
}

/** Mirror of one check run, keyed on `(repository, sha, workflow, name)`. */
export interface IUpsertCiRunArgs {
	readonly repositoryUid: string;
	readonly candidateSha: string;
	readonly workflow: string;
	readonly checkName: string;
	readonly state:
		| 'queued'
		| 'in_progress'
		| 'success'
		| 'failure'
		| 'cancelled'
		| 'timed_out'
		| 'neutral';
	readonly now: number;
}

/** A coordination journal append. Idempotent on derived event identity. */
export interface IJournalEventArgs {
	readonly eventKind:
		| 'semantic-checkpoint'
		| 'recovery-decision'
		| 'slice-recovered'
		| 'reconciliation-outcome';
	readonly repositoryUid: string;
	readonly workUnitUid: string;
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly generation: number;
	readonly actorAgentId: string;
	readonly machineId: string;
	readonly occurredAt: number;
	readonly payload: Readonly<Record<string, unknown>>;
}

/** What the state model must offer the integration engine. */
export interface IIntegrationStatePort {
	ensureGeneration(args: IEnsureGenerationArgs): Promise<IGenerationState>;
	getGeneration(key: IGenerationKey): Promise<IGenerationState | undefined>;
	upsertPullRequest(args: IUpsertPullRequestArgs): Promise<void>;
	upsertCiRun(args: IUpsertCiRunArgs): Promise<void>;
	/** False when this generation already carried this pull request. */
	attachPullRequest(
		args: IGenerationKey & {
			readonly pullRequestNumber: number;
			readonly now: number;
		},
	): Promise<{ readonly attached: boolean }>;
	recordValidation(
		args: IGenerationKey & {
			readonly validationState: IGenerationState['validationState'];
			readonly now: number;
		},
	): Promise<void>;
	/** `first` is true for exactly one caller, ever. */
	markIntegrated(
		args: IGenerationKey & {
			readonly integratedSha: string;
			readonly now: number;
		},
	): Promise<{ readonly first: boolean }>;
	appendJournalEvent(
		args: IJournalEventArgs,
	): Promise<{ readonly appended: boolean }>;
}
