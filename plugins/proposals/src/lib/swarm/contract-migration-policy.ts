import {
	CONTRACT_MIGRATION_PHASES,
	type ContractMigrationPhase,
	type IContractMigrationPolicyInput,
	type IContractMigrationPolicyVerdict,
} from '@delendai/core/lib/contracts';

const DUAL_READ_PHASES: ReadonlySet<ContractMigrationPhase> = new Set([
	'producers',
	'regenerate',
	'consumers',
	'verify',
]);

const PHASE_ORDER = new Map<ContractMigrationPhase, number>(
	CONTRACT_MIGRATION_PHASES.map((phase, index) => [phase, index]),
);

const requiredPrerequisitesFor = (
	targetPhase: ContractMigrationPhase,
): readonly ContractMigrationPhase[] =>
	CONTRACT_MIGRATION_PHASES.slice(0, PHASE_ORDER.get(targetPhase) ?? 0);

export const evaluateContractMigrationPolicy = (
	input: IContractMigrationPolicyInput,
): IContractMigrationPolicyVerdict => {
	const completed = new Set(input.completedPhases ?? []);
	const requiredPrerequisites = requiredPrerequisitesFor(input.targetPhase);
	const blockers = requiredPrerequisites
		.filter((phase) => !completed.has(phase))
		.map(
			(phase) =>
				`${input.targetPhase} requires prior ${phase} in EXPAND -> PRODUCERS -> REGENERATE -> CONSUMERS -> VERIFY -> CONTRACT order.`,
		);

	if (input.targetPhase === 'contract' && input.verificationPassed !== true) {
		blockers.push(
			'contract requires successful verify evidence before the legacy surface can be removed.',
		);
	}

	const nextPhase =
		requiredPrerequisites.find((phase) => !completed.has(phase)) ??
		(blockers.length === 0 ? input.targetPhase : null);

	return {
		ok: blockers.length === 0,
		blockers,
		nextPhase,
		requiredPrerequisites,
		dualReadRequired: DUAL_READ_PHASES.has(input.targetPhase),
		verificationRequiredBeforeContract: input.targetPhase === 'contract',
	};
};
