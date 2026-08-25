/**
 * commit-driver.ts — the pure commit engine.
 *
 * Resolves identity → applies audit trailer → calls
 * `commitAndPush` (from `@mcp-vertex/core/public`). Holds NO
 * knowledge of MCP, tools, or triggers — `commit-tool.ts` and
 * `triggers/*` both consume this surface.
 *
 * Returns an `ICommitDriverResult` that mirrors `ICommitAndPushResult`
 * (committed/pushed/hash) plus a typed `refusal` field that
 * captures the structured refusal reasons the policy layer can
 * generate (commit disabled, identity empty, protected branch, …).
 */

import {
	commitAndPush,
	type ICommitAndPushResult,
	type IGitRunner,
} from '@mcp-vertex/core/public';

import { appendAuditTrailer, type IAuditAgent } from '../audit/trailer';
import type { ICommitPolicyOptions } from '../contracts/options';
import type { IIdentityResolverContext } from '../identity/resolver';
import { resolveAuthor } from '../identity/resolver';
import { gitCurrentBranch } from './git-extra';

/** Inputs the driver consumes. Pure data — no MCP. */
export interface ICommitDriverInput {
	/** Original commit message (Conventional Commit prefix expected). */
	readonly message: string;
	/** Explicit file list to stage. When empty, the driver uses `skipAdd: true`. */
	readonly files?: readonly string[];
	/**
	 * Optional slice context — when present, the driver enforces
	 * `commit.autoScopeFromProposal`, refuses protected branches,
	 * and stamps the conventional-commit scope with `<id>(<scope>)`.
	 */
	readonly sliceContext?:
		| {
				readonly proposalId: string;
				readonly sliceId: string;
				readonly files: readonly string[];
		  }
		| undefined;
}

export interface ICommitDriverResult extends ICommitAndPushResult {
	/** Optional policy refusal — when set, `committed` is false. */
	readonly refusal?: string;
	/** The resolved author at commit time (for audit / output). */
	readonly resolvedAuthor?:
		| {
				readonly displayName: string;
				readonly email: string;
				readonly label: string;
		  }
		| undefined;
}

/**
 * Driver options — what's needed to make a commit. Built once at
 * register time and reused for every commit. The git runner is
 * injected so tests can drive it without spawning a real git.
 */
export interface ICommitDriverOptions {
	readonly run: IGitRunner;
	readonly policy: ICommitPolicyOptions;
	readonly identityCtx: IIdentityResolverContext;
	/** Identity snapshot (host + model) used by the audit trailer. */
	readonly auditAgent: IAuditAgent | null;
}

const buildScopedMessage = (
	original: string,
	proposalId: string,
	autoScope: boolean,
): string => {
	if (!autoScope) return original;
	// If the message already carries a Conventional-Commit scope
	// (e.g. `feat(core): x`) we leave it alone — never double-scope.
	if (/^\w+\([^)]+\)(!)?:/.test(original)) return original;
	// If the message is a bare Conventional Commit (no scope), strip
	// the `type:` prefix and re-wrap it with the proposal id as scope.
	const stripped = original.replace(/^(\w+)(!)?:\s*/, '');
	return `feat(${proposalId}): ${stripped}`;
};

/**
 * Pure commit attempt. The driver never throws — every failure
 * surfaces as a structured `refusal` or as the `reason` field of
 * the underlying `commitAndPush` result.
 */
export const runCommitDriver = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
): Promise<ICommitDriverResult> => {
	if (!options.policy.commit.enabled) {
		return {
			committed: false,
			pushed: false,
			refusal: 'commit.enabled is false in plugins.commit-policy.options',
		};
	}

	const identity = await resolveAuthor(
		options.policy.identity,
		options.identityCtx,
	);
	if (!identity.ok) {
		return {
			committed: false,
			pushed: false,
			refusal: identity.reason,
		};
	}

	const branch = await gitCurrentBranch(options.run);
	if (branch === undefined) {
		// detached HEAD or not a repo — refuse explicitly so the
		// agent knows it has to switch to a branch.
		return {
			committed: false,
			pushed: false,
			refusal:
				'commit refused: HEAD is detached. Check out a branch first.',
		};
	}
	if (
		input.sliceContext !== undefined &&
		options.policy.push.protectedBranches.includes(branch)
	) {
		return {
			committed: false,
			pushed: false,
			refusal: `commit refused: slice would commit onto protected branch "${branch}"`,
		};
	}

	const baseMessage =
		input.sliceContext !== undefined
			? buildScopedMessage(
					input.message,
					input.sliceContext.proposalId,
					options.policy.commit.autoScopeFromProposal,
				)
			: input.message;

	const finalMessage = appendAuditTrailer(
		baseMessage,
		options.policy.audit.trailer,
		options.policy.audit.agentFormat,
		options.auditAgent,
	);

	const files =
		input.files ??
		(options.policy.cadence.sliceScoping && input.sliceContext
			? input.sliceContext.files
			: []);

	const result = await commitAndPush({
		git: options.run,
		message: finalMessage,
		authorFlag: identity.author.authorFlag,
		// When the caller passes files OR a slice context with files,
		// we want the driver to stage them. When neither is present
		// we leave the worktree as-is (the caller already staged,
		// or there is nothing to commit).
		...(files.length > 0 ? { files } : { skipAdd: true }),
	});

	return {
		...result,
		resolvedAuthor: {
			displayName: identity.author.displayName,
			email: identity.author.email,
			label: identity.author.label,
		},
	};
};
