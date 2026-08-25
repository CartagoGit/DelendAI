/**
 * push-driver.ts — pure push engine.
 *
 * Resolves the target remote + branch, applies the protected-branch
 * refusal, applies the force policy, and delegates the actual git
 * call to `gitPush` (from `@mcp-vertex/core/public`).
 *
 * The driver NEVER decides whether to push automatically — that is
 * `ICommitPolicyPush.onCommit` + the trigger layer's job. The
 * driver only does what its caller asked.
 */

import {
	gitPush,
	type IGitRunner,
	type IPushForceMode,
} from '@mcp-vertex/core/public';

import type { ICommitPolicyPush, ForceMode } from '../contracts/options';
import { gitCurrentBranch, gitUpstream } from './git-extra';

export interface IPushDriverInput {
	/** Optional override (the trigger / tool layer may already know). */
	readonly remote?: string;
	readonly branch?: string;
	/**
	 * Force override (`'with-lease'` | `'allow'` | `'never'`).
	 * Default: the policy `push.force`. Use this to bypass for an
	 * individual push without rewriting the global config.
	 */
	readonly force?: ForceMode;
}

export type IPushDriverResult =
	| {
			readonly ok: true;
			readonly pushed: boolean;
			readonly remote: string;
			readonly branch: string;
	  }
	| { readonly ok: false; readonly refusal: string };

/** Map plugin's `ForceMode` (`never` | `with-lease` | `allow`) to gitPush's enum. */
const forceModeToGitPush = (mode: ForceMode): IPushForceMode => {
	switch (mode) {
		case 'never':
			return 'false';
		case 'with-lease':
			return 'with-lease';
		case 'allow':
			return 'true';
	}
};

export const runPushDriver = async (
	input: IPushDriverInput,
	policy: ICommitPolicyPush,
	run: IGitRunner,
): Promise<IPushDriverResult> => {
	if (!policy.enabled) {
		return {
			ok: false,
			refusal: 'push.enabled is false in plugins.commit-policy.options',
		};
	}

	let remote = input.remote ?? policy.remote;
	let branch = input.branch ?? policy.branch;

	if (remote === undefined || branch === undefined) {
		const upstream = await gitUpstream(run);
		if (remote === undefined && upstream !== undefined)
			remote = upstream.remote;
		if (branch === undefined && upstream !== undefined)
			branch = upstream.branch;
	}

	if (remote === undefined || branch === undefined) {
		const currentBranch = await gitCurrentBranch(run);
		if (currentBranch === undefined) {
			return {
				ok: false,
				refusal:
					'push refused: could not resolve remote/branch (no upstream, no current branch)',
			};
		}
		if (branch === undefined) branch = currentBranch;
	}

	if (policy.protectedBranches.includes(branch)) {
		return {
			ok: false,
			refusal: `push refused: "${branch}" is in protectedBranches`,
		};
	}

	const forceMode = input.force ?? policy.force;
	const result = await gitPush(run, {
		remote,
		branch,
		force: forceModeToGitPush(forceMode),
	});

	if (!result.ok) {
		return {
			ok: false,
			refusal: `push failed: ${result.reason ?? 'unknown'}`,
		};
	}
	return { ok: true, pushed: true, remote, branch };
};
