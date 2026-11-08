/**
 * declared-branches.ts — what the workspace's development policy
 * declares, for the scripts that act on it.
 *
 * One reader for every script, so none of them hard-codes `develop` or
 * `main`, none re-derives the policy by hand, and none invents a default
 * for a question the policy already answers. It resolves through core, so
 * a job that runs one of its callers needs `bun install` —
 * `lint:workflow-runner-bootstrap` enforces that.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseJsonc } from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from './repo-root';

type IDeclaredPolicy = ReturnType<typeof resolveDevelopmentPolicy>;

const declaredPolicy = (root: string): IDeclaredPolicy => {
	const file = join(root, 'delendai.config.json');
	// No config file declares nothing: the policy defaults answer, as they
	// do for every other reader of the policy.
	const { value, errors } = parseJsonc(
		existsSync(file) ? readFileSync(file, 'utf8') : '{}',
	);
	const [first] = errors;
	if (first !== undefined) {
		throw new Error(
			`delendai.config.json is not valid JSONC: ${first.line}:${first.column} ${first.message}`,
		);
	}
	const config = value as { readonly development?: Record<string, unknown> };
	return resolveDevelopmentPolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
	});
};

export const declaredBranches = (
	root: string = repoRoot(),
): IDeclaredPolicy['branches'] => declaredPolicy(root).branches;

/** The remote-tracking ref of the integration branch the policy declares. */
export const declaredIntegrationRef = (
	root: string = repoRoot(),
	remote = 'origin',
): string => `${remote}/${declaredBranches(root).integration}`;

/**
 * How this project lands a pull request: squash, merge or rebase.
 *
 * Read rather than assumed, because a literal `--merge` is right only for
 * projects shaped like this one. `worktree-pr` — the profile recommended
 * for a swarm — declares `squash`, and arming its candidates the wrong way
 * either lands them a way nobody chose or is refused by a forge that
 * allows only the declared method, leaving a candidate unarmed with
 * nothing to explain it.
 */
export const declaredMergeMethod = (
	root: string = repoRoot(),
): IDeclaredPolicy['integration']['mergeMethod'] =>
	declaredPolicy(root).integration.mergeMethod;

/** The `gh pr merge` flag for a declared method. */
export const mergeFlagFor = (
	method: IDeclaredPolicy['integration']['mergeMethod'],
): string => `--${method}`;

/** How long a unit's lease runs, in minutes, as the policy declares it. */
export const declaredLeaseTtlMinutes = (root: string = repoRoot()): number =>
	declaredPolicy(root).coordination.leaseTtlMinutes;
