/**
 * push-driver.ts — pure push engine.
 *
 * Resolves the target remote + branch, applies the protected-branch
 * refusal, applies the force policy, and delegates the actual git
 * call to `gitPush` (from `@delendai/core/public`).
 */

import {
	gitPush,
	type IGitRunner,
	type IResolvedDevelopmentPolicy,
	type IPushAuthorization,
	type IPushForceMode,
} from '@delendai/core/public';

import type { ICommitPolicyPush, ForceMode } from '../contracts/options';
import { resolveProtectedBranches } from '../contracts/constants/protected-branches';
import {
	branchProtectedRefusal,
	type CommitPolicyRefusalCode,
	isBranchProtected,
} from '../contracts/branch';
import { gitCurrentBranch, gitUpstream } from './git-extra';

export interface IPushDriverInput {
	readonly remote?: string;
	readonly branch?: string;
	readonly force?: ForceMode;
	/**
	 * Identity of the principal accountable for a plain `--force` push.
	 * Resolved by the caller (the push tool resolves it through the
	 * plugin's own identity resolver) rather than invented here, so the
	 * audit record names a real author instead of a constant.
	 */
	readonly authorizedBy?: string;
}

export type IPushDriverResult =
	| {
			readonly ok: true;
			readonly pushed: boolean;
			readonly remote: string;
			readonly branch: string;
	  }
	| {
			readonly ok: false;
			readonly refusal: string;
			readonly code?: CommitPolicyRefusalCode;
	  };

type IForceAuthorizationResolution =
	| { readonly ok: true; readonly authorization?: IPushAuthorization }
	| { readonly ok: false; readonly refusal: string };

/**
 * Plain `--force` rewrites shared history irreversibly, so `gitPush`
 * refuses it without an explicit `{ by, reason }` sign-off. Both halves
 * must come from real inputs: the reason is declared in config next to
 * the permissive setting (`push.forceReason`), and the identity is
 * resolved by the caller. Refusing here — rather than letting `gitPush`
 * refuse — keeps the message actionable, naming the exact config key
 * that is missing.
 */
const resolveForceAuthorization = (
	forceMode: ForceMode,
	policy: ICommitPolicyPush,
	authorizedBy: string | undefined,
): IForceAuthorizationResolution => {
	if (forceMode !== 'allow') return { ok: true };

	const reason = policy.forceReason?.trim() ?? '';
	if (reason.length === 0) {
		return {
			ok: false,
			refusal:
				'push refused: push.force is "allow" but push.forceReason is not set — state why plain --force is warranted',
		};
	}

	const by = authorizedBy?.trim() ?? '';
	if (by.length === 0) {
		return {
			ok: false,
			refusal:
				'push refused: plain --force needs a resolvable identity to authorize it, but none could be resolved',
		};
	}

	return { ok: true, authorization: { by, reason } };
};

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

/**
 * Refuse a direct push to the integration branch when the resolved
 * development policy says work lands there only through a pull request.
 *
 * WHY this is a runtime refusal and not a lint: it already happened. On
 * 2026-09-09 a background agent on the interval cadence committed an
 * unrelated working-tree edit and pushed it straight to `develop` — no
 * pull request, no CI, no review. The repository DID have a
 * `push-to-develop-discipline` guard, but it is a pre-push HOOK, and a
 * push driven through this plugin never reaches it. The one layer that
 * could have stopped it did not exist: `x00272` had deliberately
 * removed the develop refusal, correctly, for a model in which
 * `develop` was a working branch that operators pushed to directly.
 *
 * WHY it is derived from the policy and not a hard-coded branch name:
 * that earlier model is still legitimate. A project on `shared-direct`
 * has `allowsDirectIntegrationCommit: true` and keeps pushing exactly
 * as before; only a policy that requires a pull request refuses. The
 * branch name comes from `branches.integration`, so a project whose
 * integration branch is `trunk` is protected too, and nothing here has
 * to know what this repository happens to call its branches.
 *
 * `main` keeps its own hard-coded refusal above: that one holds even
 * when no development policy is resolved at all.
 */
const refuseDirectIntegrationPush = (
	branch: string,
	development: IResolvedDevelopmentPolicy | undefined,
): IPushDriverResult | undefined => {
	if (development === undefined) return undefined;
	if (development.persistence.allowsDirectIntegrationCommit) return undefined;
	if (branch !== development.branches.integration) return undefined;
	return {
		ok: false,
		code: 'DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED',
		refusal: `push refused: DIRECT_PUSH_TO_INTEGRATION_NOT_ALLOWED — the resolved development policy integrates through pull requests, so '${branch}' does not accept a direct push. Checkpoint to a work ref and open a pull request instead.`,
	};
};

export const runPushDriver = async (
	input: IPushDriverInput,
	policy: ICommitPolicyPush,
	run: IGitRunner,
	development?: IResolvedDevelopmentPolicy | undefined,
): Promise<IPushDriverResult> => {
	if (!policy.enabled) {
		return {
			ok: false,
			refusal: 'push.enabled is false in plugins.commit-policy.options',
			code: 'PUSH_DISABLED',
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
				code: 'PUSH_TARGET_UNRESOLVED',
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
			code: 'PUSH_REMOTE_UNRESOLVED',
		};
	}

	const effectiveProtectedBranches = resolveProtectedBranches(
		policy.protectedBranches,
	);

	// Hard-coded `main` refusal — must stay AHEAD of the
	// `protectedBranches` override check (enforced by
	// lint:commit-push-strictness): no config override may enable a
	// direct push to the release/publish branch.
	if (branch === 'main') {
		return {
			code: 'DIRECT_PUSH_TO_MAIN_NOT_ALLOWED',
			ok: false,
			refusal:
				"push refused: direct push to 'main' is not allowed; cuts the release/publish path. open a PR from a feature branch (release/* or develop).",
		};
	}

	const integrationRefusal = refuseDirectIntegrationPush(branch, development);
	if (integrationRefusal !== undefined) return integrationRefusal;

	if (
		isBranchProtected(branch, {
			protected: effectiveProtectedBranches,
			protectedPrefixes: policy.protectedPrefixes,
		})
	) {
		return {
			ok: false,
			refusal: branchProtectedRefusal(branch, {
				protected: effectiveProtectedBranches,
				protectedPrefixes: policy.protectedPrefixes,
			}),
			code: 'BRANCH_PROTECTED',
		};
	}

	const forceMode = input.force ?? policy.force;
	const authorization = resolveForceAuthorization(
		forceMode,
		policy,
		input.authorizedBy,
	);
	if (!authorization.ok) {
		return {
			ok: false,
			refusal: authorization.refusal,
			code: 'FORCE_AUTHORIZATION_REQUIRED',
		};
	}

	const result = await gitPush(run, {
		remote,
		// `policy.branch` is the remote destination branch. Use HEAD as the
		// source so an agent worktree can publish to a differently named
		// remote branch without requiring a same-named local branch.
		branch: `HEAD:${branch}`,
		force: forceModeToGitPush(forceMode),
		// Defense in depth: this driver already refused protected branches
		// above, but handing the list to the primitive keeps the guard in
		// place for any future path that reaches `gitPush` differently.
		protectedBranches: effectiveProtectedBranches,
		...(authorization.authorization !== undefined
			? { authorization: authorization.authorization }
			: {}),
	});

	if (!result.ok) {
		return {
			ok: false,
			refusal: `push failed: ${result.reason ?? 'unknown'}`,
			code: 'PUSH_FAILED',
		};
	}
	return { ok: true, pushed: true, remote, branch };
};
