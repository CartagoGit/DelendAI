/**
 * f00131 S2.a — pure semver-bump inference from conventional commits.
 *
 * Rules (highest priority first):
 *   1. ANY commit flagged `breaking: true` → `major`.
 *   2. ANY `feat` commit → `minor`.
 *   3. ANY `fix`, `perf`, `revert` commit (and no feat/breaking) → `patch`.
 *   4. Otherwise `none` (docs / chore / style / ci / build / test / other).
 *
 * The result is the **first** applicable rule, not the highest severity:
 * a single breaking commit forces `major`; ten `feat` commits still yield
 * `minor`. Hosts can ignore `none` and re-bump on next release.
 *
 * Pure: the same commit list always produces the same output. No I/O, no
 * git, no spawn.
 */
import type { IConventionalCommit } from '../render';

export type IBumpKind = 'major' | 'minor' | 'patch' | 'none';

export interface IBumpInference {
	readonly kind: IBumpKind;
	/** First matching rule + the matching commit(s) that triggered it. */
	readonly reason: string;
	/** How many commits were considered (the host can sanity-check). */
	readonly considered: number;
}

const FEAT_TYPES: ReadonlySet<string> = new Set(['feat']);
const PATCH_TYPES: ReadonlySet<string> = new Set(['fix', 'perf', 'revert']);

export const inferBump = (
	commits: readonly IConventionalCommit[],
): IBumpInference => {
	const breaking = commits.find((c) => c.breaking === true);
	if (breaking !== undefined) {
		return {
			kind: 'major',
			reason: `breaking change detected in ${breaking.hash} ("${breaking.subject}")`,
			considered: commits.length,
		};
	}
	const feat = commits.find((c) => FEAT_TYPES.has(c.type));
	if (feat !== undefined) {
		return {
			kind: 'minor',
			reason: `feature commit detected in ${feat.hash} ("${feat.subject}")`,
			considered: commits.length,
		};
	}
	const patch = commits.find((c) => PATCH_TYPES.has(c.type));
	if (patch !== undefined) {
		return {
			kind: 'patch',
			reason: `patch commit detected in ${patch.hash} ("${patch.subject}")`,
			considered: commits.length,
		};
	}
	return {
		kind: 'none',
		reason:
			commits.length === 0
				? 'no commits in range'
				: 'no feat / fix / perf / revert / breaking commits in range',
		considered: commits.length,
	};
};
