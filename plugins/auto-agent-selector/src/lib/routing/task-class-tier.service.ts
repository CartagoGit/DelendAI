/**
 * task-class-tier.service.ts — maps a task class onto a provider cost tier
 * from configuration, and checks the model actually used against the one
 * requested.
 *
 * SRP: pure policy. Nothing here forces a single model: the policy is data,
 * the small and mid tiers are open, and the top tier is granted only when
 * the owner authorized it explicitly. A class the policy does not name has
 * no tier (the caller routes by the ranking as before).
 */

type TTier = number;

type TTierPolicy = Readonly<Record<string, TTier>>;

/** The tier a task class needs, or the reason it cannot be granted. */
type TTierDecision =
	| { readonly ok: true; readonly tier: TTier }
	| { readonly ok: false; readonly blocker: string };

const TOP_TIER: TTier = 5;

const defaultPolicy: TTierPolicy = {
	mechanical: 1,
	coding: 3,
	debugging: 3,
	architecture: TOP_TIER,
	blocker: TOP_TIER,
};

/**
 * Resolve the tier for a task class. The top tier needs `ownerAuthorized`;
 * without it the answer is a blocker the owner can lift, never a silent
 * downgrade or an automatic escalation.
 */
export const resolveTaskClassTier = (
	taskClass: string,
	options: {
		readonly policy?: TTierPolicy | undefined;
		readonly ownerAuthorized?: boolean | undefined;
	} = {},
): TTierDecision | undefined => {
	const tier = (options.policy ?? defaultPolicy)[taskClass];
	if (tier === undefined) return undefined;
	if (tier === TOP_TIER && options.ownerAuthorized !== true) {
		return {
			ok: false,
			blocker: `task class "${taskClass}" needs the top tier, which requires explicit owner authorization`,
		};
	}
	return { ok: true, tier };
};

/**
 * The mismatch between the model requested and the one actually used, or
 * undefined when they agree or either side is unknown (a host that exposes
 * no model id cannot be checked, and is not reported as a mismatch).
 */
export const modelMismatch = (
	requested: readonly string[] | undefined,
	used: string | undefined,
): string | undefined => {
	if (
		used === undefined ||
		requested === undefined ||
		requested.length === 0
	) {
		return undefined;
	}
	return requested.includes(used)
		? undefined
		: `requested ${requested.join(' | ')} but ${used} was used`;
};
