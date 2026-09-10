/**
 * state-ports.ts — the operational state database, as narrow ports.
 *
 * WHY ports instead of importing the SQLite repositories: `@delendai/core`
 * must stay runtime-agnostic (the work-model repositories are `bun:sqlite`
 * classes), and — more importantly — a reconciler that reached for a
 * concrete driver could only be tested against a mock of that driver. The
 * ports below are deliberately shaped so the real repositories satisfy
 * them STRUCTURALLY: `WorkUnitsRepo.ensure`, `GenerationsRepo.record`,
 * `ForgeRepo.upsertPullRequest`, `CoordinationJournalRepo.append`,
 * `LeasesRepo.listExpired` and friends already have these signatures.
 * Wiring is then a plain object literal at assembly time, and a spec can
 * bind the same ports to a real temporary SQLite file.
 *
 * Every write reachable from here is keyed on a deterministic identity
 * the work model already defines (`work-model/ids.ts`). That is the whole
 * reason twenty boots produce one row: idempotency is a property of the
 * keys, not of a flag this subsystem remembers to check.
 */

import type { IStartupRepositoryKey } from './seams';

/** Result of `PRAGMA integrity_check` and friends. */
export interface IStateIntegrityResult {
	readonly ok: boolean;
	readonly problems: readonly string[];
}

/** What a migration sweep did. */
export interface IMigrationSweepResult {
	readonly applied: readonly string[];
	/**
	 * Migrations that exist but whose effect on THIS data is not
	 * determined (an ambiguous legacy migration). Never applied.
	 */
	readonly ambiguous: readonly string[];
}

/** Schema, integrity and derived-projection maintenance. */
export interface IStartupSchemaPort {
	integrityCheck(): IStateIntegrityResult;
	currentVersion(): number;
	targetVersion(): number;
	/** Names of migrations not yet applied, in order. */
	pendingMigrations(): readonly string[];
	applyMigrations(): IMigrationSweepResult;
	/**
	 * Derived caches/indexes whose source digest no longer matches. A
	 * warm boot returns an empty list and rebuilds nothing.
	 */
	staleProjections(): readonly string[];
	rebuildProjections(names: readonly string[]): readonly string[];
}

/** A repository row, reduced to what the reconciler reads. */
export interface IRepositoryView {
	readonly id: number;
	readonly integrationBranch: string;
	readonly releaseBranch: string;
}

/** Machine, agent and repository identity. */
export interface IStartupRegistryPort {
	registerRepository(args: {
		readonly forge: string;
		readonly owner: string;
		readonly name: string;
		readonly integrationBranch: string;
		readonly releaseBranch: string;
		readonly now?: number | undefined;
	}): IRepositoryView;
	registerMachine(args: {
		readonly machineId: string;
		readonly hostname: string;
		readonly platform?: string | undefined;
		readonly now?: number | undefined;
	}): { readonly machineId: string };
	registerAgent(args: {
		readonly id: string;
		readonly host: string;
		readonly machineId: string;
		readonly now?: number | undefined;
	}): { readonly id: string };
}

/** A work unit, reduced to what the reconciler reads. */
export interface IWorkUnitView {
	readonly id: number;
	readonly uid: string;
	readonly proposalUid: string;
	readonly sliceUid: string;
	readonly state: string;
	readonly currentGeneration: number;
	readonly currentOwnerAgentId: string | null;
}

export interface IStartupWorkUnitsPort {
	getByUid(uid: string): IWorkUnitView | null;
	ensure(args: {
		readonly repositoryId: number;
		readonly repository: IStartupRepositoryKey;
		readonly proposalUid: string;
		readonly sliceUid: string;
		readonly createdByAgentId: string;
		readonly now?: number | undefined;
	}): IWorkUnitView;
	advanceGeneration(uid: string, generation: number, now: number): void;
	/** Every unit of this repository, so a sweep can enumerate. */
	listForRepository(repositoryId: number): readonly IWorkUnitView[];
	/**
	 * Move abandoned work to RECOVERABLE. Deliberately the only state
	 * transition this subsystem may perform, and it never deletes.
	 */
	markRecoverable(uid: string, now: number): IWorkUnitView | null;
}

/** A checkpoint, reduced to what the reconciler reads. */
export interface IGenerationView {
	readonly id: number;
	readonly workUnitId: number;
	readonly generation: number;
	readonly baseIntegrationSha: string;
	readonly wipRef: string;
	readonly wipHeadSha: string;
	readonly patchDigest: string;
	readonly fileScope: readonly string[];
	/**
	 * Only a merge candidate may carry an integrated SHA (schema 0016
	 * enforces it), so this is read before anything records a merge.
	 */
	readonly checkpointKind: 'durability' | 'merge-candidate';
	readonly candidateState: string;
	readonly authorAgentId: string;
	readonly machineId: string;
	readonly integratedSha: string | null;
}

export interface IStartupGenerationsPort {
	get(workUnitId: number, generation: number): IGenerationView | null;
	listForWorkUnit(workUnitId: number): readonly IGenerationView[];
	record(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly baseIntegrationSha: string;
		readonly wipRef: string;
		readonly wipHeadSha: string;
		readonly patchDigest: string;
		readonly fileScope: readonly string[];
		readonly checkpointKind: 'durability' | 'merge-candidate';
		readonly authorAgentId: string;
		readonly machineId: string;
		readonly now?: number | undefined;
	}): IGenerationView;
	attachPullRequest(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly pullRequestId: number;
		readonly now: number;
	}): IGenerationView | null;
	recordValidation(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly validationState:
			| 'unknown'
			| 'pending'
			| 'green'
			| 'red'
			| 'skipped';
		readonly ciResult?:
			| 'pending'
			| 'success'
			| 'failure'
			| 'cancelled'
			| 'timed_out'
			| 'neutral'
			| undefined;
		readonly now: number;
	}): IGenerationView | null;
	markIntegrated(args: {
		readonly workUnitId: number;
		readonly generation: number;
		readonly integratedSha: string;
		readonly now: number;
	}): { readonly first: boolean };
}

/** Mirrored forge facts. Both writers are upserts on the forge's own key. */
export interface IStartupForgePort {
	upsertPullRequest(args: {
		readonly repositoryId: number;
		readonly number: number;
		readonly headRef: string;
		readonly baseRef: string;
		readonly headSha: string;
		readonly state: 'draft' | 'open' | 'closed' | 'merged';
		readonly mergeSha?: string | undefined;
		readonly now?: number | undefined;
	}): { readonly id: number };
	upsertCiRun(args: {
		readonly repositoryId: number;
		readonly candidateSha: string;
		readonly workflow: string;
		readonly checkName: string;
		readonly externalId?: string | undefined;
		readonly state:
			| 'queued'
			| 'in_progress'
			| 'success'
			| 'failure'
			| 'cancelled'
			| 'timed_out'
			| 'neutral';
		readonly startedAt?: number | undefined;
		readonly completedAt?: number | undefined;
		readonly now?: number | undefined;
	}): { readonly id: number };
}

/** A journal row, reduced to what the reconciler reads. */
export interface IJournalEventView {
	readonly eventKind: string;
	readonly machineId: string | null;
	readonly occurredAt: number;
	readonly payload: unknown;
}

export interface IStartupJournalPort {
	append(args: {
		readonly eventKind:
			| 'owner-changed'
			| 'slice-recovered'
			| 'slice-deprecated'
			| 'semantic-checkpoint'
			| 'recovery-decision'
			| 'migration-applied'
			| 'reconciliation-outcome';
		readonly repositoryUid?: string | undefined;
		readonly workUnitUid?: string | undefined;
		readonly proposalUid?: string | undefined;
		readonly sliceUid?: string | undefined;
		readonly generation?: number | undefined;
		readonly actorAgentId?: string | undefined;
		readonly machineId?: string | undefined;
		readonly occurredAt: number;
		readonly payload?: Readonly<Record<string, unknown>> | undefined;
	}): { readonly appended: boolean };
	listAll(): readonly IJournalEventView[];
}

/** A lease, reduced to what the reconciler reads. */
export interface ILeaseView {
	readonly id: string;
	readonly ownerAgentId: string;
	readonly machineId: string;
	readonly expiresAt: number;
}

export interface IStartupLeasesPort {
	listLive(now: number): readonly ILeaseView[];
	listExpired(now: number): readonly ILeaseView[];
	expire(id: string, now: number): { readonly kind: string };
}

/** A claim, reduced to what the reconciler reads. */
export interface IClaimView {
	readonly path: string;
	readonly ownerAgentId: string;
	readonly leaseId: string;
	readonly workUnitId: number;
}

export interface IStartupClaimsPort {
	listActive(repositoryId: number): readonly IClaimView[];
	releaseClaimsOfExpiredLeases(now: number): number;
}

/** The audit trail of the sweep itself. */
export interface IStartupReconciliationPort {
	start(args: {
		readonly machineId: string;
		readonly repositoryId?: number | undefined;
		readonly startedAt: number;
	}): { readonly id: number };
	complete(args: {
		readonly id: number;
		readonly status: 'ok' | 'degraded' | 'failed';
		readonly completedAt: number;
		readonly refsDiscovered?: number | undefined;
		readonly workUnitsRepaired?: number | undefined;
		readonly generationsRepaired?: number | undefined;
		readonly claimsReleased?: number | undefined;
		readonly anomalies?: readonly unknown[] | undefined;
		readonly error?: string | undefined;
	}): unknown;
}

/** Everything the reconciler may touch in the state database. */
export interface IStartupStatePorts {
	readonly schema: IStartupSchemaPort;
	readonly registry: IStartupRegistryPort;
	readonly workUnits: IStartupWorkUnitsPort;
	readonly generations: IStartupGenerationsPort;
	readonly forge: IStartupForgePort;
	readonly journal: IStartupJournalPort;
	readonly leases: IStartupLeasesPort;
	readonly claims: IStartupClaimsPort;
	readonly reconciliation: IStartupReconciliationPort;
}

/**
 * How the state database presented itself at boot. `absent` is a
 * first-class answer, not an exception: a machine that has just cloned
 * the repository HAS no database, and "unable to open database file" is
 * the wrong way to report the normal case.
 */
export type IStateDatabaseProbe =
	| { readonly kind: 'absent'; readonly path: string }
	| { readonly kind: 'present'; readonly path: string }
	| {
			readonly kind: 'unreadable';
			readonly path: string;
			readonly reason: string;
	  };

/**
 * Opening the state database. Split from the ports so the "no database
 * yet" diagnosis happens BEFORE anything tries to open a file.
 */
export interface IStateDatabaseSeam {
	probe(): IStateDatabaseProbe;
	/** Open (creating when permitted). Never throws for `absent`. */
	open(options: { readonly allowCreate: boolean }):
		| { readonly kind: 'opened'; readonly ports: IStartupStatePorts }
		| { readonly kind: 'absent' }
		| { readonly kind: 'unreadable'; readonly reason: string }
		/**
		 * The host has no adapter to open a database WITH. This says
		 * nothing about the file, which may be perfectly healthy — it is
		 * a gap in the caller, not a defect in the data.
		 *
		 * Kept distinct from `unreadable` because conflating them is a
		 * real hazard, not a wording preference: an unbound adapter was
		 * reporting `state-database.corrupt` against a healthy database
		 * and generating a repair task whose candidate action was
		 * "rebuild a fresh database". Acting on that advice would have
		 * destroyed good state to fix a problem that did not exist.
		 * Unverifiable blocks READY and generates NO repair work.
		 */
		| { readonly kind: 'unverifiable'; readonly reason: string };
}
