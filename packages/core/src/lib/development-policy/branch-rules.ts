/**
 * branch-rules.ts — how each branch of a project takes in work.
 *
 * A project declares rules in `development.branches.rules`. The
 * integration and release branches that no rule covers keep what the
 * profile does today, so a project that declares nothing behaves as its
 * profile does. Everything that asks "how does this branch take in work"
 * asks here, so the answer lives in one place.
 */
import {
	BRANCH_TAKE_IN_MODES,
	type IBranchRule,
	type IBranchTakeIn,
} from '../contracts/interfaces/branch-rule.interface';

const globToRegExp = (glob: string): RegExp =>
	new RegExp(
		`^${glob
			.replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&')
			.replaceAll('**', '\u0000')
			.replaceAll('*', '[^/]*')
			.replaceAll('\u0000', '.*')}$`,
		'u',
	);

interface IRuleDetail {
	readonly takesIn?: unknown;
	readonly promotedFrom?: unknown;
	readonly follows?: unknown;
}

const optionalName = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * Reads the declared `rules` map. A shorthand string is the mode alone;
 * anything unrecognised is carried through (as an empty mode) so
 * validation names the key back instead of the resolver throwing.
 */
export const declaredBranchRules = (
	declared: Readonly<Record<string, unknown>> | undefined,
): readonly IBranchRule[] | undefined => {
	if (declared === undefined) return undefined;
	return Object.entries(declared).map(([pattern, value]): IBranchRule => {
		const detail: IRuleDetail =
			typeof value === 'object' && value !== null ? value : {};
		const mode = typeof value === 'string' ? value : detail.takesIn;
		const promotedFrom = optionalName(detail.promotedFrom);
		const follows = optionalName(detail.follows);
		return {
			pattern,
			takesIn: (typeof mode === 'string' ? mode : '') as IBranchTakeIn,
			...(promotedFrom === undefined ? {} : { promotedFrom }),
			...(follows === undefined ? {} : { follows }),
		};
	});
};

/** The rule that governs `branch`: an exact name first, then the first glob. */
export const branchRuleFor = (
	rules: readonly IBranchRule[],
	branch: string,
): IBranchRule | undefined =>
	rules.find((rule) => rule.pattern === branch) ??
	rules.find(
		(rule) =>
			rule.pattern.includes('*') &&
			globToRegExp(rule.pattern).test(branch),
	);

/** How a branch takes in work when nothing is declared: the profile's way. */
const profileTakeIn = (requiresPullRequest: boolean): IBranchTakeIn =>
	requiresPullRequest ? 'pull-request' : 'merge';

/**
 * The declared rules, plus the profile's default for the integration and
 * release branches that no declared rule covers.
 */
export const withDefaultBranchRules = (
	branches: { readonly integration: string; readonly release: string },
	declared: readonly IBranchRule[],
	requiresPullRequest: boolean,
): readonly IBranchRule[] => {
	const defaults = [
		...new Set([branches.integration, branches.release].filter(Boolean)),
	]
		.filter((branch) => branchRuleFor(declared, branch) === undefined)
		.map(
			(pattern): IBranchRule => ({
				pattern,
				takesIn: profileTakeIn(requiresPullRequest),
			}),
		);
	return [...defaults, ...declared];
};

/** Position in `BRANCH_TAKE_IN_MODES`; `-1` for an unrecognised mode. */
export const takeInStrictness = (mode: string): number =>
	(BRANCH_TAKE_IN_MODES as readonly string[]).indexOf(mode);
