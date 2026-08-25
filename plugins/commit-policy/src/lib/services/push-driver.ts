/**
 * push-driver.ts — pure push engine.
 *
 * Resolves the target remote + branch, applies the protected-branch
 * refusal, applies the force policy, and delegates the actual git
 * call to `gitPush` (from `@mcp-vertex/core/public`).
 */

import {
	gitPush,
	type IGitRunner,
	type IPushForceMode,
} from '@mcp-vertex/core/public';

import type { ICommitPolicyPush, ForceMode } from '../contracts/options';
import { gitCurrentBranch, gitUpstream } from './git-extra';

export interface IPushDriverInput {
	readonly remote?: string;
	readonly branch?: string;
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

	let remote: string | undefined = input.remote ?? policy.remote;
	let branch: string | undefined = input.branch ?? policy.branch;

	if (remote === undefined || branch === undefined) {
		const upstream = await gitUpstream(run);
		if (remote === undefined && upstream !== undefined) {
			remote = upstream.remote;
		}
		if (branch === undefined && upstream !== undefined) {
			branch = upstream.branch;
		}
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
		if (branch === undefined) {
			branch = currentBranch;
		}
	}

	if (remote === undefined) {
		return {
			ok: false,
			refusal:
				'push refused: could not resolve remote (set push.remote or push to a configured remote)',
		};
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
