/**
 * Slice acceptance evidence (f00156 S7).
 *
 * Timestamps only — a later revision may swap in content hashes.
 */
export interface ISliceAcceptanceEvidence {
	readonly lastMeaningfulChangeAt: string;
	readonly validatedAt?: string;
	readonly validationCommand?: string;
	readonly validationPassed?: boolean;
	readonly acceptanceSatisfied?: boolean;
	readonly requiresValidation?: boolean;
	readonly sliceId: string;
	readonly gitTreeHash: string;
}

export const validationPredatesChange = (
	evidence: ISliceAcceptanceEvidence,
): boolean => {
	if (evidence.validatedAt === undefined) return true;
	return (
		Date.parse(evidence.validatedAt) <
		Date.parse(evidence.lastMeaningfulChangeAt)
	);
};

export const isAcceptanceStale = (
	evidence: ISliceAcceptanceEvidence,
): boolean => {
	if (evidence.requiresValidation !== true) return false;
	if (evidence.acceptanceSatisfied === true) {
		return validationPredatesChange(evidence);
	}
	if (evidence.validationPassed === true) {
		return validationPredatesChange(evidence);
	}
	return true;
};
