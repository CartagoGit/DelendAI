/**
 * contract-migration.interface.ts — r00044 S1.
 *
 * Shared, pure contracts for the audit-mandated migration protocol:
 *
 *   EXPAND -> PRODUCERS -> REGENERATE -> CONSUMERS -> VERIFY -> CONTRACT
 *
 * The core owns the vocabulary because multiple plugins can depend on the
 * same migration ordering and the same impact-based isolation signals without
 * re-encoding them.
 */

export const CONTRACT_MIGRATION_PHASES = [
	'expand',
	'producers',
	'regenerate',
	'consumers',
	'verify',
	'contract',
] as const;

export type ContractMigrationPhase = (typeof CONTRACT_MIGRATION_PHASES)[number];

export type ContractMigrationImpact = 'low' | 'medium' | 'high';

export type WorktreeIsolationMode = 'shared-checkout' | 'agent-worktree';

export type WorktreeClaimMode =
	| 'shared-checkout-ok'
	| 'requires-agent-worktree';

export interface IContractMigrationPolicyInput {
	readonly targetPhase: ContractMigrationPhase;
	readonly completedPhases?: readonly ContractMigrationPhase[];
	/**
	 * Required only when attempting the terminal `contract` step.
	 * Mechanical enforcement stays fail-closed: absent/false means the legacy
	 * surface must NOT be contracted yet.
	 */
	readonly verificationPassed?: boolean;
}

export interface IContractMigrationPolicyVerdict {
	readonly ok: boolean;
	readonly blockers: readonly string[];
	readonly nextPhase: ContractMigrationPhase | null;
	readonly requiredPrerequisites: readonly ContractMigrationPhase[];
	readonly dualReadRequired: boolean;
	readonly verificationRequiredBeforeContract: boolean;
}

export interface IWorktreeImpactPolicyInput {
	readonly phase: ContractMigrationPhase;
	readonly touchedPaths: readonly string[];
}

export interface IWorktreeImpactPolicyVerdict {
	readonly impact: ContractMigrationImpact;
	readonly isolation: WorktreeIsolationMode;
	readonly claimMode: WorktreeClaimMode;
	readonly reasons: readonly string[];
	readonly fileCount: number;
	readonly areaCount: number;
	readonly contractTouchCount: number;
}

/** Guidance attached to a proposal slice that participates in migration. */
export interface IContractMigrationSliceGuidance {
	readonly phase: ContractMigrationPhase;
	readonly completedPhases: readonly ContractMigrationPhase[];
	readonly verificationPassed: boolean;
	readonly migrationPolicy: IContractMigrationPolicyVerdict;
	readonly worktreeImpactPolicy: IWorktreeImpactPolicyVerdict;
}
