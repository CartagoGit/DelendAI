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
	gitAdd,
	gitCommit,
	gitHeadShortHash,
	type ICommitAndPushResult,
	type IGitRunner,
} from '@mcp-vertex/core/public';

import { appendAuditTrailer, type IAuditAgent } from '../audit/trailer';
import { branchProtectedRefusal, isBranchProtected } from '../contracts/branch';
import type { ICommitPolicyOptions } from '../contracts/options';
import type { IIdentityResolverContext } from '../identity/resolver';
import { resolveAuthor } from '../identity/resolver';
import {
	gitCachedNames,
	gitCurrentBranch,
	gitDirtyFilePaths,
	validateConventionalHeader,
} from './git-extra';
import { withGitWriteLock } from './git-write-lock';

/**
 * Non-slice trigger context. Threshold and interval events carry
 * `files` so the driver stages exactly the paths the trigger saw —
 * x00264 (AUD-CP-006) closes the "predicate ≠ action" gap that
 * previously allowed an implicit `skipAdd: true`.
 */
export interface ITriggerContext {
	readonly kind: 'threshold' | 'interval';
	readonly files: readonly string[];
}

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
	/**
	 * x00264: optional non-slice trigger context. Carries the
	 * exact paths the trigger saw so the driver stages that
	 * same set. Refused as `TRIGGER_HAS_NO_FILES` when the list
	 * is empty (the trigger fired with zero dirty paths).
	 */
	readonly triggerContext?: ITriggerContext | undefined;
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
	readonly workspaceRoot?: string | undefined;
	/** Identity snapshot (host + model) used by the audit trailer. */
	readonly auditAgent: IAuditAgent | null;
}

/**
 * Pure parse of a Conventional-Commit header line — see AUD-CP-001
 * (x00259). Returns a structured view that `buildScopedMessage`
 * can re-emit losslessly, including the original `type`, the
 * optional `scope`, the `!` breaking marker, and the remainder
 * (subject + body + footers).
 */
export interface IParsedHeader {
	readonly type: string;
	readonly scope: string | undefined;
	readonly breaking: boolean;
	/** Subject line minus the `type(scope)?!: ` prefix. */
	readonly subject: string;
	/** Body + footers (everything after the first `\n`). */
	readonly rest: string;
}

const HEADER_TYPE_PATTERN = '[A-Za-z][A-Za-z0-9_.-]*';
const SCOPE_PATTERN = String.raw`\([^)]+\)`;

export const parseHeader = (raw: string): IParsedHeader => {
	const trimmed = raw.trimStart();
	// Match: type(scope)!: subject OR type!: subject OR type: subject
	const re = new RegExp(
		`^(${HEADER_TYPE_PATTERN})(?:(${SCOPE_PATTERN}))?(!)?:\\s*([\\s\\S]*)$`,
	);
	const m = re.exec(trimmed);
	if (m === null) {
		// Not a Conventional-Commit header — return type='' so the
		// caller fails-closed instead of silently mangling the input.
		return {
			type: '',
			scope: undefined,
			breaking: false,
			subject: trimmed,
			rest: '',
		};
	}
	const [, type, scope, bang, rest = ''] = m as unknown as [
		string,
		string,
		string | undefined,
		string | undefined,
		string | undefined,
	];
	// Split the remainder into subject (first line) and rest (body+footers).
	const newlineIdx = rest.indexOf('\n');
	const subject =
		newlineIdx === -1 ? rest : rest.slice(0, newlineIdx).trimEnd();
	const restAfterSubject =
		newlineIdx === -1 ? '' : rest.slice(newlineIdx + 1);
	return {
		type,
		scope: scope !== undefined ? scope.slice(1, -1) : undefined,
		breaking: bang === '!',
		subject,
		rest: restAfterSubject,
	};
};

export const buildScopedMessage = (
	original: string,
	proposalId: string,
	autoScope: boolean,
): string => {
	if (!autoScope) return original;
	// Empty input — caller surfaces a typed refusal upstream; we
	// don't synthesize a header that would commit silently.
	if (original.trim().length === 0) return original;
	const parsed = parseHeader(original);
	const type = parsed.type === '' ? 'feat' : parsed.type;
	const scope = parsed.scope ?? proposalId;
	const bang = parsed.breaking ? '!' : '';
	// subject is the trimmed remainder when the input was bare text
	// (no header was matched); otherwise it is the original subject.
	const subject = parsed.type === '' ? original.trim() : parsed.subject;
	const head =
		parsed.rest.length > 0
			? `${type}(${scope})${bang}: ${subject}\n${parsed.rest}`
			: `${type}(${scope})${bang}: ${subject}`;
	return head;
};

/**
 * Pure commit attempt. The driver never throws — every failure
 * surfaces as a structured `refusal` or as the `reason` field of
 * the underlying `commitAndPush` result.
 */
/**
 * x00263 (AUD-CP-005): normalise a path to its repo-relative
 * POSIX form so the post-stage `git diff --cached --name-only`
 * subset check compares apples to apples regardless of whether
 * the caller passed a workspace-relative or absolute path.
 * Strips a leading `./` and converts `\\` to `/`.
 */
const normalizeRepoPath = (raw: string): string => {
	const replaced = raw.replace(/\\/gu, '/');
	return replaced.startsWith('./') ? replaced.slice(2) : replaced;
};

const runCommitDriverUnlocked = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
): Promise<ICommitDriverResult> => {
	const scopeSliceCommit =
		options.policy.cadence.sliceScoping &&
		options.policy.cadence.allowForeignChanges !== true;
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
	// x00267 (AUD-CP-009): branch protection is unified across
	// every commit path — manual, slice, threshold, interval.
	// The previous behaviour gated the check on `sliceContext`
	// which let threshold / interval commits bypass the
	// `develop` / `main` policy entirely. The same list feeds
	// the push scheduler (x00266).
	if (
		isBranchProtected(branch, {
			protected: options.policy.push.protectedBranches,
			protectedPrefixes: options.policy.push.protectedPrefixes,
		})
	) {
		return {
			committed: false,
			pushed: false,
			refusal: branchProtectedRefusal(branch ?? '(detached)', {
				protected: options.policy.push.protectedBranches,
				protectedPrefixes: options.policy.push.protectedPrefixes,
			}),
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

	// x00265 (AUD-CP-007): when requireConventional is on, validate
	// the header before passing the message to git. The previous
	// behaviour let agents commit `"hola"`, `"updated stuff"`, `"WIP"`
	// and break the repo's traceability. Refusal codes are specific
	// so the caller can correct the input. f00182 will lift this
	// into the engine layer.
	if (options.policy.commit.requireConventional) {
		const verdict = validateConventionalHeader(baseMessage);
		if (verdict.status !== 'OK') {
			return {
				committed: false,
				pushed: false,
				refusal: `NON_CONVENTIONAL_MESSAGE: ${verdict.status}`,
			};
		}
	}

	const finalMessage = appendAuditTrailer(
		baseMessage,
		options.policy.audit.trailer,
		options.policy.audit.agentFormat,
		options.auditAgent,
	);

	const files =
		input.files ??
		(input.triggerContext !== undefined
			? input.triggerContext.files
			: input.sliceContext !== undefined
				? scopeSliceCommit
					? input.sliceContext.files
					: await gitDirtyFilePaths(options.run)
				: []);

	// x00263 (AUD-CP-005): when sliceScoping is on and the slice
	// declared no files, refuse rather than fall back to
	// `skipAdd: true`. The previous behaviour allowed an empty
	// list to "stage whatever the worktree had", which is the
	// root cause of the cross-agent contamination finding.
	if (
		input.sliceContext !== undefined &&
		scopeSliceCommit &&
		files.length === 0
	) {
		return {
			committed: false,
			pushed: false,
			refusal: `SLICE_HAS_NO_FILES: ${input.sliceContext.proposalId}-${input.sliceContext.sliceId}`,
		};
	}
	if (
		input.sliceContext !== undefined &&
		!options.policy.cadence.sliceScoping &&
		files.length === 0
	) {
		return {
			committed: false,
			pushed: false,
			refusal: `WORKSPACE_HAS_NO_FILES: ${input.sliceContext.proposalId}-${input.sliceContext.sliceId}`,
		};
	}

	// x00264 (AUD-CP-006): a non-slice trigger fired with zero
	// dirty paths. Same fail-closed semantics as the slice case
	// — an implicit `skipAdd: true` would let the driver commit
	// whatever happened to be staged, which has nothing to do
	// with the predicate that fired.
	if (input.triggerContext !== undefined && files.length === 0) {
		return {
			committed: false,
			pushed: false,
			refusal: `TRIGGER_HAS_NO_FILES: ${input.triggerContext.kind} fired with zero dirty paths`,
		};
	}

	if (files.length > 0) {
		const addResult = await gitAdd(options.run, files);
		if (!addResult.ok) {
			return {
				committed: false,
				pushed: false,
				refusal: `git add failed: ${addResult.reason ?? 'unknown'}`,
			};
		}
	}

	// x00263 / x00264: validate the complete index after staging but
	// before committing. Checking after `git commit` is too late because
	// a successful commit clears the index and hides staged extras.
	if (
		files.length > 0 &&
		(input.triggerContext !== undefined ||
			(scopeSliceCommit && input.sliceContext !== undefined))
	) {
		const cached = await gitCachedNames(options.run);
		const expected = new Set(files.map(normalizeRepoPath));
		const extras = cached.filter(
			(name) => !expected.has(normalizeRepoPath(name)),
		);
		if (extras.length > 0) {
			return {
				committed: false,
				pushed: false,
				refusal: `CROSS_AGENT_CONTAMINATION: staged extras not in trigger files=${extras.join(',')}`,
			};
		}
	}

	const commitResult = await gitCommit(options.run, finalMessage, {
		authorFlag: identity.author.authorFlag,
	});
	if (!commitResult.ok) {
		const reason = commitResult.reason ?? 'unknown';
		const alreadyClean = /nothing to commit|no changes added/u.test(reason);
		return {
			committed: false,
			pushed: false,
			refusal: alreadyClean
				? 'nothing to commit (worktree already clean)'
				: `git commit failed: ${reason}`,
		};
	}

	const hash = await gitHeadShortHash(options.run);
	const result: ICommitAndPushResult = {
		committed: true,
		pushed: false,
		...(hash !== undefined ? { hash } : {}),
	};

	return {
		...result,
		resolvedAuthor: {
			displayName: identity.author.displayName,
			email: identity.author.email,
			label: identity.author.label,
		},
	};
};

export const runCommitDriver = async (
	input: ICommitDriverInput,
	options: ICommitDriverOptions,
): Promise<ICommitDriverResult> =>
	withGitWriteLock(options.workspaceRoot, () =>
		runCommitDriverUnlocked(input, options),
	);
