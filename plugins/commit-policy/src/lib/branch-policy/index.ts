import { isReleaseBranch } from '../contracts/release-branch';

export const EMERGENCY_BYPASS_CAPABILITY = 'release:emergency-bypass';

export interface IEmergencyBypass {
	readonly reason: string;
	readonly capability: string;
	readonly receipt: string;
}

export interface IReleasePromotionPolicyInput {
	readonly sourceBranch: string;
	readonly targetBranch: string;
	readonly mode?: 'normal' | 'emergency';
	readonly emergency?: IEmergencyBypass | undefined;
}

export interface IReleasePromotionPolicyDecision {
	readonly allowed: true;
	readonly mode: 'normal' | 'emergency';
	readonly sourceBranch: string;
	readonly targetBranch: 'main';
	readonly auditReceipt?: string | undefined;
}

export type ReleasePromotionPolicyErrorCode =
	| 'protected-target'
	| 'release-source-required'
	| 'emergency-reason-required'
	| 'emergency-capability-required'
	| 'emergency-receipt-required';

export class ReleasePromotionPolicyError extends Error {
	readonly code: ReleasePromotionPolicyErrorCode;

	constructor(code: ReleasePromotionPolicyErrorCode, message: string) {
		super(message);
		this.name = 'ReleasePromotionPolicyError';
		this.code = code;
	}
}

export const validateReleasePromotionPolicy = (
	input: IReleasePromotionPolicyInput,
): IReleasePromotionPolicyDecision => {
	if (input.targetBranch !== 'main')
		throw new ReleasePromotionPolicyError(
			'protected-target',
			`release promotion target must be main: ${input.targetBranch}`,
		);
	const mode = input.mode ?? 'normal';
	if (mode === 'normal') {
		if (!isReleaseBranch(input.sourceBranch))
			throw new ReleasePromotionPolicyError(
				'release-source-required',
				`normal promotion requires a release branch: ${input.sourceBranch}`,
			);
		return Object.freeze({
			allowed: true,
			mode,
			sourceBranch: input.sourceBranch,
			targetBranch: 'main',
		});
	}
	const bypass = input.emergency;
	if (bypass === undefined || bypass.reason.trim() === '')
		throw new ReleasePromotionPolicyError(
			'emergency-reason-required',
			'emergency bypass requires a non-empty reason',
		);
	if (bypass.capability !== EMERGENCY_BYPASS_CAPABILITY)
		throw new ReleasePromotionPolicyError(
			'emergency-capability-required',
			`emergency bypass requires capability ${EMERGENCY_BYPASS_CAPABILITY}`,
		);
	if (bypass.receipt.trim() === '')
		throw new ReleasePromotionPolicyError(
			'emergency-receipt-required',
			'emergency bypass requires a receipt',
		);
	return Object.freeze({
		allowed: true,
		mode,
		sourceBranch: input.sourceBranch,
		targetBranch: 'main',
		auditReceipt: bypass.receipt.trim(),
	});
};
