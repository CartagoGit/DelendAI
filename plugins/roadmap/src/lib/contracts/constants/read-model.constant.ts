/**
 * What a horizon's readiness can be. `unknown` is its own answer: nothing
 * failed, and something still has no evidence.
 */
export const ROADMAP_READINESS_STATUSES = [
	'ready',
	'not-ready',
	'unknown',
] as const;

/**
 * What to do with a promised entry that was not delivered when its
 * version is promoted: hold the promotion, or let it go and say which
 * entries are left to defer.
 */
export const ROADMAP_DEFERRAL_POLICIES = ['block', 'report'] as const;

/** The deferral policy of a project that declares none. */
export const DEFAULT_DEFERRAL_POLICY = 'block';
