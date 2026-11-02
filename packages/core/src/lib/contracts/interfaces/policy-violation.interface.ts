/**
 * policy-violation.interface.ts — what `validateDevelopmentPolicy`
 * reports when a policy cannot be honoured.
 *
 * Split out of `development-policy.interface.ts` (SRP ceiling): the
 * shapes of a policy and the shape of a complaint about one are two
 * jobs. Re-exported from the parent so no import site changes.
 */

/** A rejected policy combination: startup fails closed rather than improvise. */
export interface IDevelopmentPolicyViolation {
	/** Stable id so tests and docs can reference a rule without prose. */
	readonly rule: string;
	/** Dotted path of the offending axis, e.g. `coordination.strategy`. */
	readonly path: string;
	/** What is wrong, in one sentence. */
	readonly message: string;
	/** The concrete change that resolves it. */
	readonly remedy: string;
	readonly severity?: 'warning'; // absent: the violation stops startup
}
