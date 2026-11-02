import type {
	IExecuteOptions,
	ITransactionExpectedState,
	ITransactionPlan,
	ITransactionReceipt,
	ITransactionResult,
} from './types';

/**
 * Deterministic fingerprint of an `ITransactionApproval`. Used by the
 * executor to refuse a replay whose approval does not match the one
 * stored alongside the original receipt — without leaking the raw
 * approver identity into the error envelope.
 */
export const approvalFingerprint = (
	approval: IExecuteOptions<unknown>['approval'],
): string | undefined => {
	if (approval === undefined) return undefined;
	const granted = approval.granted === true ? '1' : '0';
	const approver = approval.approver ?? '';
	const receipt = approval.receipt ?? '';
	const capabilities = [...(approval.capabilities ?? [])]
		.sort((left, right) => left.localeCompare(right))
		.join(',');
	return `${granted}|${approver}|${receipt}|${capabilities}`;
};

/**
 * Whether the supplied approval grant already satisfies every
 * capability the plan requires. Pure: returns `true` when the plan
 * does not require approval.
 */
export const isApprovalSatisfied = <T>(
	plan: ITransactionPlan<T>,
	options: IExecuteOptions<T>,
): boolean => {
	if (!plan.meta.capabilityGrant.approvalRequired) return true;
	if (options.approval?.granted !== true) return false;
	const granted = new Set(options.approval.capabilities ?? []);
	return plan.meta.capabilityGrant.permissions.every((permission) =>
		granted.has(permission),
	);
};

/**
 * Stable JSON form of an expected state. Two states compare equal
 * iff their JSON forms match, so ordering of value keys or trailing
 * whitespace do not produce false mismatches.
 */
export const normalizeExpectedState = (
	state: ITransactionExpectedState | undefined,
): string => {
	if (state === undefined) return 'null';
	const values = Object.entries(state.values ?? {}).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	return JSON.stringify({
		revision: state.revision?.trim() || null,
		values,
	});
};

/**
 * Build a frozen replay envelope when an idempotency key matches a
 * stored receipt. The new envelope reuses the stored success/failure
 * payload (values, compensations, error) and stamps the receipt as
 * `'replayed'` with the original approval context attached.
 */
export const buildReplayedReceipt = <T>(input: {
	readonly plan: ITransactionPlan<T>;
	readonly options: IExecuteOptions<T>;
	readonly existing: ITransactionResult<unknown>;
}): ITransactionResult<T> => {
	const existing = input.existing;
	const approval: Pick<
		ITransactionReceipt,
		'approved' | 'approver' | 'approvalReceipt' | 'grantedCapabilities'
	> = {
		approved: existing.receipt.approved,
		...(existing.receipt.approver !== undefined
			? { approver: existing.receipt.approver }
			: {}),
		...(existing.receipt.approvalReceipt !== undefined
			? { approvalReceipt: existing.receipt.approvalReceipt }
			: {}),
		grantedCapabilities: Object.freeze([
			...existing.receipt.grantedCapabilities,
		]),
	};
	return Object.freeze({
		ok: existing.ok,
		values: existing.values as readonly T[],
		compensations: existing.compensations,
		risk: existing.risk,
		dryRun: existing.dryRun,
		executedSteps: existing.executedSteps,
		totalSteps: existing.totalSteps,
		receipt: {
			stage: 'replayed' as const,
			planFingerprint: input.plan.meta.fingerprint,
			approvalRequired: input.plan.meta.capabilityGrant.approvalRequired,
			approved: approval.approved,
			...(approval.approver !== undefined
				? { approver: approval.approver }
				: {}),
			...(approval.approvalReceipt !== undefined
				? { approvalReceipt: approval.approvalReceipt }
				: {}),
			requiredCapabilities: input.plan.meta.capabilityGrant.permissions,
			grantedCapabilities: approval.grantedCapabilities,
			replayed: true,
			executedSteps: existing.executedSteps,
			totalSteps: input.plan.steps.length,
		},
		...(existing.error !== undefined ? { error: existing.error } : {}),
		executedStepNames: existing.executedStepNames,
	});
};
