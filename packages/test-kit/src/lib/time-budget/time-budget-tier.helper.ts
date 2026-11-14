/**
 * time-budget-tier.helper.ts — which tier a spec file is in, and how loaded
 * the machine running a shard is. It imports only constants, so the shared
 * vitest config (loaded without a bundler) and the lint can read it too.
 */
import {
	LOAD_FACTOR_MAX,
	LOAD_FACTOR_MIN,
} from '../../contracts/constants/time-budget.constant';

/** A spec in the e2e tier: named `*.e2e.spec.ts`, or under a `tests/e2e/` directory. */
export const isE2eSpec = (path: string): boolean =>
	/\.e2e\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path) ||
	/(?:^|\/)tests\/e2e\//u.test(path);

/**
 * How much slower than the reference this shard ran the fixed benchmark,
 * clamped to 1..4: a faster machine does not shrink a budget, and a
 * machine more than four times slower is a fault, not load. An unusable
 * measurement or reference is no load.
 */
export const loadFactorOf = (benchMs: number, referenceMs: number): number => {
	if (!(benchMs > 0) || !(referenceMs > 0)) return LOAD_FACTOR_MIN;
	return Math.min(
		LOAD_FACTOR_MAX,
		Math.max(LOAD_FACTOR_MIN, benchMs / referenceMs),
	);
};

/** The load factor an env value carries; 1 when it is absent or unusable. */
export const loadFactorFromEnv = (value: string | undefined): number => {
	const factor = Number(value);
	return Number.isFinite(factor) && factor >= LOAD_FACTOR_MIN
		? Math.min(LOAD_FACTOR_MAX, factor)
		: LOAD_FACTOR_MIN;
};
